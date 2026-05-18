"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { submitAnnotation } from "@/lib/submit";
import { getSpeechRecognitionLanguage } from "@/lib/speech-language";

type EpisodeButtonItem = {
  id: string;
  episodeIndex?: number;
  label: string;
  vital: string;
  selected?: boolean;
  startMin: number;
  endMin: number;
  y1?: number;
  y2?: number;
  createdAtUtc?: string;
  updatedAtUtc?: string;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

const ABNORMAL_REASONING_TEMPLATE = ``;

const EXAMPLE_OBSERVATION_SUMMARY = `From 11:15 to 11:32, the patient developed hypotension shortly after induction, likely due to anesthetic-induced vasodilation. The blood pressure ranged from 80-100s/40s-50s, with MAPs 55-65. The blood pressure nadir was 82/41 at 11:29. The hypotension appeared clinically meaningful because the blood pressure dropped below a clinically acceptable range after induction and required vasopressor support. The provider gave a phenylephrine bolus at 11:29, after which the blood pressure improved adequately, suggesting an appropriate response to treatment. No clear preventive intervention was given, and this may represent a common post-induction hemodynamic response. Management was appropriate in this context; another vasopressor such as ephedrine could also have been reasonable depending on the heart rate and overall physiology, however the heart rate was normal (80s) throughout the episode so phenylephrine was likely the more reasonable choice.`;

function roundSec(ms: number) {
  return Number((ms / 1000).toFixed(3));
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function getLocalTimestamp() {
  const date = new Date();
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMin);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMinutes = String(absOffset % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);

  return `${local}${sign}${offsetHours}:${offsetMinutes}`;
}

function toLocalTimestamp(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMin);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMinutes = String(absOffset % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);

  return `${local}${sign}${offsetHours}:${offsetMinutes}`;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addMinutesToAnesthesiaStart(
  offsetMin: unknown,
  anesthesiaStart?: string | null
) {
  const offset = toFiniteNumber(offsetMin);
  if (offset === null || !anesthesiaStart) return null;

  const base = new Date(anesthesiaStart);
  if (Number.isNaN(base.getTime())) return null;

  return new Date(base.getTime() + offset * 60000);
}

function formatHHmm(date: Date | null, zone: "local" | "utc") {
  if (!date) return null;

  const hours =
    zone === "utc" ? date.getUTCHours() : date.getHours();
  const minutes =
    zone === "utc" ? date.getUTCMinutes() : date.getMinutes();

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildEpisodeTimingFields(
  episode: Partial<EpisodeButtonItem> | null | undefined,
  anesthesiaStart?: string | null
) {
  const startMinute = toFiniteNumber(episode?.startMin);
  const endMinute = toFiniteNumber(episode?.endMin);
  const startDate = addMinutesToAnesthesiaStart(startMinute, anesthesiaStart);
  const endDate = addMinutesToAnesthesiaStart(endMinute, anesthesiaStart);

  return {
    startMin: formatHHmm(startDate, "local"),
    endMin: formatHHmm(endDate, "local"),
  };
}

function draftKey(patientId: string | undefined, caseId: string, eventId: string) {
  return `annotationDraft:abnormality_reasoning:${patientId ?? "unknown_patient"}:${caseId}:${eventId}`;
}

function revisionKey(patientId: string | undefined, caseId: string) {
  return `annotationRevision:abnormality_reasoning:${patientId ?? "unknown_patient"}:${caseId}`;
}

function nextRevisionNumber(patientId: string | undefined, caseId: string) {
  try {
    const key = revisionKey(patientId, caseId);
    const next = Number(localStorage.getItem(key) ?? "0") + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return null;
  }
}

const ABNORMAL_EVENT_PROMPT = {
  instruction:
    "The goal here is to learn the clinically grounded temporal reasoning chain among: precursor events, the selected abnormal episode, downstream patient responses or consequences, and any preventive or alternative management considerations.",
  requestedElements: [
    "1. Selected Abnormal Episode: Describe what happened during the selected episode, including timing, key abnormal pattern, raw data, clinical significance, and uncertainty.",
    "2. Precursor Events: Describe any preceding events, physiologic trends, medications, anesthetic changes, or surgical context that may have contributed to the abnormal episode. If none are apparent, state that no clear precursor is identified.",
    "3. Downstream Response and Management Evaluation: Describe what happened after the episode, including related interventions, patient response, improvement, worsening, return to baseline, or no clear downstream consequence. Briefly comment on whether the observed management appeared appropriate in this context.",
    "4. Preventability / Alternative Management: If clinically relevant, briefly comment on whether any preventive measure, earlier intervention, or alternative management could have been considered. If no clear preventive or alternative action was needed, state that.",
  ],
};

function InstructionPanel({
  title,
  tone,
  children,
  defaultOpen = false,
}: {
  title: string;
  tone: "blue" | "emerald";
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const styles =
    tone === "blue"
      ? {
          shell: "border-blue-100 bg-blue-50 text-blue-900",
          header: "border-blue-100 bg-blue-100 text-blue-950",
          icon: "text-blue-700",
        }
      : {
          shell: "border-emerald-100 bg-emerald-50 text-emerald-900",
          header: "border-emerald-100 bg-emerald-100 text-emerald-950",
          icon: "text-emerald-700",
        };

  return (
    <div className={`mb-4 overflow-hidden rounded-xl border ${styles.shell}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left text-sm font-semibold ${styles.header}`}
      >
        <span className={`text-xl font-bold leading-none ${styles.icon}`}>
          {open ? "▾" : "▸"}
        </span>
        <span>{title}</span>
      </button>

      {open && <div className="p-4 text-sm leading-6">{children}</div>}
    </div>
  );
}

type Props = {
  caseId: string;
  selectedEvent: any;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;
  anesthesiaStart?: string | null;
  onSaveAndNextStep: () => void;
  onBackToEpisodeSelection?: () => void;

  episodeList?: EpisodeButtonItem[];
  activeEpisodeId?: string | null;
  completedMap?: Record<
    string,
    { detect?: boolean; mechanism?: boolean; fluidEval?: boolean } | undefined
  >;
  onSelectEpisode?: (episodeId: string) => void;
  readOnly?: boolean;
};

export default function Episode3TextPanel({
  caseId,
  selectedEvent,
  patientId,
  patientFolder,
  episodeNumber,
  anesthesiaStart,
  onSaveAndNextStep,
  onBackToEpisodeSelection,
  episodeList = [],
  activeEpisodeId = null,
  completedMap = {},
  onSelectEpisode,
  readOnly = false,
}: Props) {
  const eventId = useMemo(() => {
    return String(selectedEvent?.id ?? activeEpisodeId ?? "unknown_event");
  }, [selectedEvent, activeEpisodeId]);

  const [freeTextMap, setFreeTextMap] = useState<Record<string, string>>({});
  const freeText = freeTextMap[eventId] ?? ABNORMAL_REASONING_TEMPLATE;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const openedAtUtcRef = useRef<string | null>(null);
  const openedAtLocalRef = useRef<string | null>(null);
  const openedAtMsRef = useRef<number | null>(null);
  const voiceStartedAtMsRef = useRef<number | null>(null);
  const voiceDurationMsRef = useRef<number>(0);
  const typingStartedAtMsRef = useRef<number | null>(null);
  const typingDurationMsRef = useRef<number>(0);

  useEffect(() => {
    const nowUtc = new Date().toISOString();

    openedAtUtcRef.current = nowUtc;
    openedAtLocalRef.current = getLocalTimestamp();
    openedAtMsRef.current = performance.now();
    voiceStartedAtMsRef.current = null;
    voiceDurationMsRef.current = 0;
    typingStartedAtMsRef.current = null;
    typingDurationMsRef.current = 0;

    setError(null);

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    setRecording(false);

    setFreeTextMap((prev) => {
      if (prev[eventId] !== undefined) return prev;
      let savedDraft = "";

      try {
        savedDraft = localStorage.getItem(draftKey(patientId, caseId, eventId)) ?? "";
      } catch {
        savedDraft = "";
      }

      return {
        ...prev,
        [eventId]: savedDraft || ABNORMAL_REASONING_TEMPLATE,
      };
    });
  }, [caseId, eventId, patientId]);

  function setCurrentFreeText(nextText: string) {
    setFreeTextMap((prev) => ({
      ...prev,
      [eventId]: nextText,
    }));
    try {
      localStorage.setItem(draftKey(patientId, caseId, eventId), nextText);
    } catch {
      // ignore
    }
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function finalizeVoiceDuration() {
    if (voiceStartedAtMsRef.current === null) return;

    voiceDurationMsRef.current += performance.now() - voiceStartedAtMsRef.current;
    voiceStartedAtMsRef.current = null;
  }

  function startTypingTimer() {
    if (typingStartedAtMsRef.current !== null) return;
    typingStartedAtMsRef.current = performance.now();
  }

  function finalizeTypingDuration() {
    if (typingStartedAtMsRef.current === null) return;

    typingDurationMsRef.current +=
      performance.now() - typingStartedAtMsRef.current;
    typingStartedAtMsRef.current = null;
  }

  async function startVoiceNote() {
    if (readOnly) return;
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        alert("Speech recognition is not supported. Please use Chrome or Edge.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = getSpeechRecognitionLanguage();
      recognition.interimResults = true;
      recognition.continuous = true;

      let finalTranscript = "";

      recognition.onresult = (event: any) => {
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0].transcript;

          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const combined = `${finalTranscript} ${interimTranscript}`.trim();

        if (combined) {
          setFreeTextMap((prev) => {
            const marker = "\n\n[Voice note in progress]\n";
            const current = prev[eventId] ?? ABNORMAL_REASONING_TEMPLATE;
            const base = current.includes(marker)
              ? current.split(marker)[0].trim()
              : current.trim();

            return {
              ...prev,
              [eventId]: `${base}${marker}${combined}`.trim(),
            };
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event);
        finalizeVoiceDuration();
        setError("Speech recognition error. Please try again or type directly.");
        setSaveStatus("error");
        setSaveMessage("Speech recognition failed.");
        setRecording(false);
      };

      recognition.onend = () => {
        finalizeVoiceDuration();
        setRecording(false);

        if (finalTranscript.trim()) {
          setFreeTextMap((prev) => {
            const marker = "\n\n[Voice note in progress]\n";
            const current = prev[eventId] ?? ABNORMAL_REASONING_TEMPLATE;

            if (current.includes(marker)) {
              const base = current.split(marker)[0].trim();

              return {
                ...prev,
                [eventId]: `${base}\n\n${finalTranscript.trim()}`.trim(),
              };
            }

            return prev;
          });
        }
      };

      recognitionRef.current = recognition;
      recognition.start();

      voiceStartedAtMsRef.current = performance.now();
      setRecording(true);
      setError(null);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch (e: any) {
      finalizeVoiceDuration();
      console.error("Failed to start voice note:", e);
      setError(e?.message ?? "Failed to start voice note.");
      setSaveStatus("error");
      setSaveMessage(e?.message ?? "Failed to start voice note.");
      setRecording(false);
    }
  }

  function stopVoiceNote() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    } finally {
      finalizeVoiceDuration();
      setRecording(false);
    }
  }

  async function handleSave() {
    if (readOnly) {
      setSaveStatus("error");
      setSaveMessage("This submitted case is locked for review.");
      return;
    }

    const currentText = freeText.trim();

    if (!currentText) {
      const message = "Please provide a free-text annotation before saving.";
      setError(message);
      setSaveStatus("error");
      setSaveMessage(message);
      return;
    }

    try {
      stopVoiceNote();
      finalizeTypingDuration();

      setSaving(true);
      setError(null);
      setSaveStatus("saving");
      setSaveMessage(
        "Saving to cloud storage... Please wait and do not close the page."
      );

      const submittedAtUtc = new Date().toISOString();
      const submittedAtLocal = getLocalTimestamp();
      const openedAtUtc = openedAtUtcRef.current;
      const openedAtLocal = openedAtLocalRef.current;
      const responseTimeSec =
        openedAtMsRef.current === null
          ? null
          : Number(((performance.now() - openedAtMsRef.current) / 1000).toFixed(3));

      const voiceRecordingDurationSec = roundSec(voiceDurationMsRef.current);
      const typingDurationSec = roundSec(typingDurationMsRef.current);

      let participantInfo: any = {};
      try {
        const raw = localStorage.getItem("participantInfo");
        participantInfo = raw ? JSON.parse(raw) : {};
      } catch {
        participantInfo = {};
      }

      const accessCode =
        String(
          participantInfo?.accessCode ??
            localStorage.getItem("doctorAccessCode") ??
            ""
        ).trim() || null;

      const doctorId =
        String(
          participantInfo?.doctorId ?? localStorage.getItem("doctorId") ?? ""
        ).trim() || null;
      const doctorName = String(participantInfo?.name ?? "").trim() || null;

      const resolvedPatientId = patientId ?? patientFolder ?? "unknown_patient";
      const resolvedPatientFolder =
        patientFolder ?? patientId ?? "unknown_patient";
      const selectedEpisodes = episodeList.map((episode) => ({
        episodeIndex: episode.episodeIndex ?? null,
        selected: Boolean(episode.selected),
        ...buildEpisodeTimingFields(episode, anesthesiaStart),
        y1: episode.y1 ?? null,
        y2: episode.y2 ?? null,
        createdAtUtc: episode.createdAtUtc ?? null,
        createdAtLocal: toLocalTimestamp(episode.createdAtUtc),
        updatedAtUtc: episode.updatedAtUtc ?? null,
        updatedAtLocal: toLocalTimestamp(episode.updatedAtUtc),
      }));
      const activeEpisodeForSave =
        episodeList.find((episode) => episode.id === activeEpisodeId) ??
        selectedEvent ??
        null;
      const annotatedEpisodeBase =
        episodeList.find((episode) => episode.id === activeEpisodeId) ??
        activeEpisodeForSave;
      const revisionNumber = nextRevisionNumber(resolvedPatientId, caseId);

      await submitAnnotation({
        doctorId,
        accessCode,
        patientId: resolvedPatientId,
        patientFolder: resolvedPatientFolder,

        caseId,

        panel: "abnormality_reasoning",
        participantInfo: {
          name: doctorName ?? undefined,
          email: participantInfo?.email ?? undefined,
          doctorId: doctorId ?? undefined,
          accessCode: accessCode ?? undefined,
        },

        submittedAt: submittedAtUtc,
        submittedAtLocal,
        clickedAt: submittedAtUtc,
        pageOpenedAt: openedAtUtc,
        pageOpenedAtLocal: openedAtLocal,
        totalDurationSec: responseTimeSec,
        typingDurationSec,
        voiceDurationSec: voiceRecordingDurationSec,
        localTimezone: getBrowserTimezone(),
        revisionNumber,

        answers: {
          selectedEpisodes,
          annotatedEpisode: {
            episodeIndex: annotatedEpisodeBase?.episodeIndex ?? null,
            selected: true,
            ...buildEpisodeTimingFields(activeEpisodeForSave, anesthesiaStart),
            y1: activeEpisodeForSave?.y1 ?? null,
            y2: activeEpisodeForSave?.y2 ?? null,
            createdAtUtc: activeEpisodeForSave?.createdAtUtc ?? null,
            createdAtLocal: toLocalTimestamp(activeEpisodeForSave?.createdAtUtc),
            updatedAtUtc: activeEpisodeForSave?.updatedAtUtc ?? null,
            updatedAtLocal: toLocalTimestamp(activeEpisodeForSave?.updatedAtUtc),
          },
          abnormalityReasoningText: currentText,
        },
      });

      try {
        localStorage.setItem(draftKey(patientId, caseId, eventId), currentText);
        localStorage.setItem(
          `annotationResult:abnormality_reasoning:${resolvedPatientId}:${caseId}`,
          JSON.stringify({
            selectedEpisodes,
            annotatedEpisode: {
              episodeIndex: annotatedEpisodeBase?.episodeIndex ?? null,
              selected: true,
              ...buildEpisodeTimingFields(activeEpisodeForSave, anesthesiaStart),
              y1: activeEpisodeForSave?.y1 ?? null,
              y2: activeEpisodeForSave?.y2 ?? null,
              createdAtUtc: activeEpisodeForSave?.createdAtUtc ?? null,
              createdAtLocal: toLocalTimestamp(activeEpisodeForSave?.createdAtUtc),
              updatedAtUtc: activeEpisodeForSave?.updatedAtUtc ?? null,
              updatedAtLocal: toLocalTimestamp(activeEpisodeForSave?.updatedAtUtc),
            },
            abnormalityReasoningText: currentText,
            revisionNumber,
          })
        );
      } catch {
        // ignore
      }

      setSaveStatus("success");
      setSaveMessage("Abnormality reasoning saved successfully to cloud storage.");
      onSaveAndNextStep();
    } catch (e: any) {
      console.error("Failed to save abnormality reasoning:", e);
      const message = e?.message ?? "Failed to save annotation.";
      setError(message);
      setSaveStatus("error");
      setSaveMessage(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {onBackToEpisodeSelection && (
        <button
          type="button"
          onClick={onBackToEpisodeSelection}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          <span className="text-lg leading-none">←</span>
          <span>Back to episode selection</span>
        </button>
      )}

      <InstructionPanel
        title="Annotation Instructions"
        tone="blue"
        defaultOpen={false}
      >
        <div className="space-y-4 text-sm leading-6 text-blue-900">
          <p className="font-semibold text-blue-950">
            The goal here is to learn more about abnormal episodes (preceding
            events, mechanism, and downstream consequences) and their management
            (including why medications were given and any alternative
            interventions). Please include these checklist items in your
            response:
          </p>

          <div>
            <p className="font-semibold text-blue-950">
              1. Selected Abnormal Episode
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              2. Precursor Events (Etiology Reasoning)
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              3. Response and Management Evaluation
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              4. Preventability / Alternative Management
            </p>
          </div>
        </div>
      </InstructionPanel>

      <InstructionPanel title="Example" tone="blue" defaultOpen={false}>
        <p className="whitespace-pre-line rounded-lg border border-blue-100 bg-white p-3 text-gray-800">
          {EXAMPLE_OBSERVATION_SUMMARY}
        </p>
      </InstructionPanel>

      <InstructionPanel
        title="FAQ / Common Questions"
        tone="blue"
        defaultOpen={false}
      >
        <div className="space-y-4 text-sm leading-6 text-blue-900">
          <div>
            <p className="font-semibold text-blue-950">
              1. What should I include in my response?
            </p>

            <div className="mt-2 space-y-3">
              <div>
                <p className="font-semibold text-blue-950">
                  Selected Abnormal Episode
                </p>
                <p>
                  Describe what happened during the selected episode, including
                  the timing, key abnormal pattern, raw data, clinical
                  significance, and any uncertainty.
                </p>
              </div>

              <div>
                <p className="font-semibold text-blue-950">
                  Precursor Events (Etiology Reasoning)
                </p>
                <p>
                  Describe any preceding events, physiologic trends,
                  medications, anesthetic changes, or surgical context that may
                  have contributed to the abnormal episode. If none are
                  apparent, state that no clear precursor is identified.
                </p>
              </div>

              <div>
                <p className="font-semibold text-blue-950">
                  Response and Management Evaluation
                </p>
                <p>
                  Describe what happened after the episode, including related
                  interventions, patient response, improvement, worsening,
                  return to baseline, or no clear downstream consequence.
                  Briefly comment on whether the observed management appeared
                  appropriate in this context.
                </p>
              </div>

              <div>
                <p className="font-semibold text-blue-950">
                  Preventability / Alternative Management
                </p>
                <p>
                  If clinically relevant, briefly comment on whether any
                  preventive measure, earlier intervention, or alternative
                  management could have been considered. If no clear preventive
                  or alternative action was needed, you may state that.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              2. Do I need to separate precursor, abnormal episode, and
              downstream response explicitly?
            </p>
            <p>
              Not necessarily. You may write a short integrated summary.
              However, the summary should make clear what happened before the
              episode, what defines the selected abnormal episode, and how the
              patient responded afterward.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              3. What if there is no clear precursor event?
            </p>
            <p>
              It is fine to state that no obvious precursor is identified. For
              example, the episode may appear to be directly related to
              induction, anesthetic depth, surgical stimulation, medication
              effect, or another nearby event.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              4. What if there is no clear downstream consequence?
            </p>
            <p>
              Please state that no clear downstream consequence is seen, or
              briefly describe that the patient returned toward baseline,
              remained stable, or responded appropriately to management.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              5. Do I need to identify a preventive intervention?
            </p>
            <p>
              No. Many abnormal episodes may not have an obvious preventive
              measure. If prevention is not clinically relevant or not apparent
              from the data, you can leave this part blank or state that no clear
              preventive measure is identified.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              6. What if I am unsure about the cause?
            </p>
            <p>
              Please describe your uncertainty rather than forcing one
              explanation. You may mention several possible explanations and
              indicate which one seems most likely based on timing, physiology,
              medications, surgical context, or patient response.
            </p>
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              7. How detailed should my answer be?
            </p>
            <p>
              A concise clinical explanation is enough. In most cases, five to
              six sentences or a short dictated paragraph is sufficient, as long
              as it explains the temporal relationship before, during, and after
              the selected episode.
            </p>
          </div>
        </div>
      </InstructionPanel>

      <textarea
        value={freeText}
        onFocus={startTypingTimer}
        onBlur={finalizeTypingDuration}
        onChange={(e) => {
          if (readOnly) return;
          startTypingTimer();
          setCurrentFreeText(e.target.value);
        }}
        disabled={readOnly || saving}
        className="min-h-[360px] w-full rounded-xl border border-gray-300 p-4 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        placeholder="write or dictate your response here..."
      />

      <div className="mt-5 flex w-full flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={recording ? stopVoiceNote : startVoiceNote}
          disabled={readOnly || saving}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
            recording
              ? "bg-red-500 hover:bg-red-600"
              : "bg-orange-500 hover:bg-orange-600"
          }`}
        >
          {recording ? "Stop Recording" : "Start Recording"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (readOnly) return;
            setCurrentFreeText(ABNORMAL_REASONING_TEMPLATE);
            stopVoiceNote();
            setError(null);
            setSaveStatus("idle");
            setSaveMessage("");

            openedAtUtcRef.current = new Date().toISOString();
            openedAtLocalRef.current = getLocalTimestamp();
            openedAtMsRef.current = performance.now();
            voiceStartedAtMsRef.current = null;
            voiceDurationMsRef.current = 0;
            typingStartedAtMsRef.current = null;
            typingDurationMsRef.current = 0;
          }}
          disabled={readOnly || saving}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={readOnly || saving || !freeText.trim()}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
            readOnly || saving || !freeText.trim()
              ? "cursor-not-allowed bg-blue-300"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {saving ? "Saving..." : "Save and Next"}
        </button>

        {saveStatus !== "idle" && saveMessage && (
          <div
            className={`ml-2 text-sm font-medium ${
              saveStatus === "success"
                ? "text-green-700"
                : saveStatus === "error"
                ? "text-red-700"
                : "text-gray-500"
            }`}
          >
            {saveMessage}
          </div>
        )}

        {error && saveStatus === "error" && !saveMessage && (
          <div className="ml-2 text-sm font-medium text-red-700">{error}</div>
        )}
      </div>
    </div>
  );
}
