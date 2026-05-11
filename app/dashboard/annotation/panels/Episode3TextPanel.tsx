"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { submitAnnotation } from "@/lib/submit";

type EpisodeButtonItem = {
  id: string;
  label: string;
  vital: string;
  startMin: number;
  endMin: number;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

const NORMAL_EPISODE_OPTIONS = [
  { value: "", label: "Select a normal / expected episode..." },
  { value: "induction", label: "Induction" },
  { value: "intubation", label: "Intubation" },
  { value: "positioning", label: "Positioning" },
  { value: "procedure_start", label: "Procedure Start" },
  { value: "maintenance", label: "Anesthesia Maintenance" },
  { value: "emergence", label: "Emergence" },
  { value: "extubation", label: "Extubation" },
  { value: "other", label: "Other" },
] as const;

function formatClockTime(offsetMin?: number | null, timeZero?: string | null) {
  if (!Number.isFinite(offsetMin) || !timeZero) return "-";

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return "-";

  const dt = new Date(base.getTime() + Number(offsetMin) * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function InstructionPanel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "blue" | "emerald";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
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
    <div className={`overflow-hidden rounded-xl border ${styles.shell}`}>
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
}: Props) {
  const eventId = useMemo(() => {
    return String(selectedEvent?.id ?? activeEpisodeId ?? "unknown_event");
  }, [selectedEvent, activeEpisodeId]);

  const [freeTextMap, setFreeTextMap] = useState<Record<string, string>>({});
  const freeText = freeTextMap[eventId] ?? "";

  const [normalEpisodeType, setNormalEpisodeType] = useState("");
  const [normalEpisodeOther, setNormalEpisodeOther] = useState("");
  const [normalReasoning, setNormalReasoning] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setError(null);

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    setRecording(false);
  }, [eventId]);

  function setCurrentFreeText(nextText: string) {
    setFreeTextMap((prev) => ({
      ...prev,
      [eventId]: nextText,
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  async function startVoiceNote() {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        alert("Speech recognition is not supported. Please use Chrome or Edge.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
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
            const current = prev[eventId] ?? "";
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
        setError("Speech recognition error. Please try again or type directly.");
        setSaveStatus("error");
        setSaveMessage("Speech recognition failed.");
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);

        if (finalTranscript.trim()) {
          setFreeTextMap((prev) => {
            const marker = "\n\n[Voice note in progress]\n";
            const current = prev[eventId] ?? "";

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
      setRecording(true);
      setError(null);
    } catch (e: any) {
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
      setRecording(false);
    }
  }

  async function handleSave() {
    const currentText = freeText.trim();
    const normalEventLabel =
      normalEpisodeType === "other"
        ? normalEpisodeOther.trim()
        : NORMAL_EPISODE_OPTIONS.find((option) => option.value === normalEpisodeType)
            ?.label ?? "";
    const currentNormalReasoning = normalReasoning.trim();

    if (!currentText) {
      const message = "Please provide a free-text annotation before saving.";
      setError(message);
      setSaveStatus("error");
      setSaveMessage(message);
      return;
    }

    if (!normalEpisodeType || !normalEventLabel) {
      const message = "Please select one normal / expected episode before saving.";
      setError(message);
      setSaveStatus("error");
      setSaveMessage(message);
      return;
    }

    if (normalEpisodeType === "other" && !normalEpisodeOther.trim()) {
      const message = "Please specify the normal / expected episode.";
      setError(message);
      setSaveStatus("error");
      setSaveMessage(message);
      return;
    }

    if (!currentNormalReasoning) {
      const message = "Please provide normal episode reasoning before saving.";
      setError(message);
      setSaveStatus("error");
      setSaveMessage(message);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSaveStatus("saving");
      setSaveMessage("Saving annotation...");

      const submittedAt = new Date().toISOString();

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
          participantInfo?.doctorId ??
            localStorage.getItem("doctorId") ??
            ""
        ).trim() || null;

      const resolvedPatientId =
        patientId ?? patientFolder ?? "unknown_patient";

      const resolvedPatientFolder =
        patientFolder ?? patientId ?? "unknown_patient";

      await submitAnnotation({
        doctorId,
        accessCode,
        patientId: resolvedPatientId,
        patientFolder: resolvedPatientFolder,

        caseId,
        eventId: selectedEvent?.id ?? eventId,
        episodeId: selectedEvent?.id ?? eventId,

        panel: "abnormality_reasoning",
        action: "submit",
        task: "abnormal_and_normal_episode_reasoning",

        submittedAt,
        clickedAt: submittedAt,

        answers: {
          task: "abnormal_and_normal_episode_reasoning",

          episodeNumber,
          episodeLabel:
            selectedEvent?.episodeLabel ?? selectedEvent?.title ?? null,

          vital: selectedEvent?.vital ?? null,
          startMin: selectedEvent?.startMin ?? null,
          endMin: selectedEvent?.endMin ?? null,
          y1: selectedEvent?.y1 ?? null,
          y2: selectedEvent?.y2 ?? null,
          anesthesiaStart,

          abnormalEventPrompt: {
            instruction:
              "Describe the selected abnormal event and related clinical reasoning in one free-text response.",
            requestedElements: [
              "What happened during this abnormal event?",
              "What was the likely trigger, etiology, or mechanism?",
              "Which medications, fluids, gas or ventilation changes, positioning changes, surgical events, or other interventions were clinically relevant?",
              "How did the patient respond after the intervention?",
              "Was the management appropriate in this context?",
              "Was there a reasonable alternative intervention?",
              "If uncertain, describe the uncertainty or competing explanations.",
            ],
          },

          abnormalEventReasoning: currentText,
          normalEpisodeReasoning: {
            selectedEpisodeType: normalEpisodeType,
            selectedEpisodeLabel: normalEventLabel,
            otherEpisodeLabel:
              normalEpisodeType === "other" ? normalEpisodeOther.trim() : null,
            instruction:
              "Describe a normal or expected episode and explain why the selected segment is clinically meaningful but not an abnormal event.",
            requestedElements: [
              "What normal or expected episode did you select?",
              "What happened during that segment?",
              "Why is this segment clinically meaningful?",
              "Why should it be interpreted as expected or non-abnormal in context?",
              "Which medications, airway events, gas/ventilation changes, surgical events, or workflow context support that interpretation?",
            ],
            freeText: currentNormalReasoning,
          },
        },
      });

      setSaveStatus("success");
      setSaveMessage("Saved successfully.");
      onSaveAndNextStep();
    } catch (e: any) {
      console.error("Failed to save merged episode reasoning:", e);
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
          className="flex w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          <span className="text-lg leading-none">←</span>
          <span>Back to episode selection</span>
        </button>
      )}

      {episodeList.length > 0 && (
        <div className="mb-5 bg-gray-50 p-4">
          <div className="mb-3 text-sm font-bold text-gray-900">
            Selected episodes for annotation
          </div>

          <div className="flex flex-wrap gap-2">
  {episodeList.map((episode, index) => {
    const isActive = episode.id === activeEpisodeId;
    const saved = Boolean(completedMap?.[episode.id]?.detect);

    return (
      <button
        key={episode.id}
        type="button"
        onClick={() => onSelectEpisode?.(episode.id)}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
          isActive
            ? "border-blue-600 bg-blue-50 text-blue-800 shadow-sm"
            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        Episode {index + 1}
        {saved && (
          <span className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
            Saved
          </span>
        )}
      </button>
    );
  })}
</div>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900">
          Abnormal Event Reasoning
        </h3>

      </div>

      <InstructionPanel title="Abnormal event instruction" tone="blue">
        <div className="mb-2 font-semibold text-blue-950">Please include:</div>
        <ul className="ml-5 list-disc space-y-1">
          <li>What happened during this abnormal event?</li>
          <li>What was the likely trigger, etiology, or mechanism?</li>
          <li>
            Which medications, fluids, gas/ventilation changes, surgical events,
            position changes, or other interventions were clinically relevant?
          </li>
          <li>How did the patient respond after the intervention?</li>
          <li>Was the management appropriate in this context?</li>
          <li>Was there a reasonable alternative intervention?</li>
          <li>
            If uncertain, briefly describe the uncertainty or competing
            explanations.
          </li>
        </ul>
      </InstructionPanel>

      <textarea
        value={freeText}
        onChange={(e) => setCurrentFreeText(e.target.value)}
        className="min-h-[320px] w-full rounded-xl border border-gray-300 p-4 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        placeholder="Example: The patient developed hypotension shortly after induction. The likely mechanism was vasodilation from anesthetic agents, possibly compounded by relative hypovolemia. Phenylephrine boluses were clinically relevant and produced a transient MAP increase, but the effect was not sustained..."
      />

      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={startVoiceNote}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Start Abnormal Event Voice Note
          </button>
        ) : (
          <button
            type="button"
            onClick={stopVoiceNote}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
          >
            Stop Voice Note
          </button>
        )}
        <span className="text-xs text-gray-500">
          Voice text will be inserted into the abnormal event reasoning box.
        </span>
      </div>

      <div className="mt-8 space-y-4 border-t pt-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            Normal Episode Reasoning
          </h3>
        </div>

        <InstructionPanel title="Normal episode instruction" tone="emerald">
          <div className="mb-2 font-semibold text-emerald-950">
            Please include:
          </div>
          <ul className="ml-5 list-disc space-y-1">
            <li>Select one clinically interesting but expected segment, such as intubation.</li>
            <li>Describe what happened during the selected segment.</li>
            <li>Explain why it is clinically meaningful.</li>
            <li>Explain why it should be interpreted as expected or non-abnormal in context.</li>
            <li>
              Mention relevant medications, airway events, gas/ventilation changes,
              surgical events, or workflow context.
            </li>
          </ul>
        </InstructionPanel>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              Interesting normal / expected episode
            </label>
            <select
              value={normalEpisodeType}
              onChange={(e) => {
                setNormalEpisodeType(e.target.value);
                setSaveStatus("idle");
                setSaveMessage("");
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              {NORMAL_EPISODE_OPTIONS.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {normalEpisodeType === "other" && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Other episode name
              </label>
              <input
                type="text"
                value={normalEpisodeOther}
                onChange={(e) => {
                  setNormalEpisodeOther(e.target.value);
                  setSaveStatus("idle");
                  setSaveMessage("");
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Specify the normal / expected episode"
              />
            </div>
          )}
        </div>

        <textarea
          value={normalReasoning}
          onChange={(e) => {
            setNormalReasoning(e.target.value);
            setSaveStatus("idle");
            setSaveMessage("");
          }}
          className="min-h-[220px] w-full rounded-xl border border-gray-300 p-4 text-sm leading-6 text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          placeholder="Example: Intubation was associated with expected airway manipulation and transient physiologic changes. The pattern was clinically meaningful but consistent with routine induction/intubation rather than a separate abnormal episode..."
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setCurrentFreeText("");
              setNormalEpisodeType("");
              setNormalEpisodeOther("");
              setNormalReasoning("");
              setError(null);
              setSaveStatus("idle");
              setSaveMessage("");
            }}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset This Episode
          </button>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !freeText.trim() || !normalReasoning.trim()}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
              saving || !freeText.trim() || !normalReasoning.trim()
                ? "cursor-not-allowed bg-blue-300"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? "Saving..." : "Save Reasoning"}
          </button>

          {saveStatus !== "idle" && saveMessage && (
            <div
              className={`text-sm font-medium ${
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
        </div>
      </div>
    </div>
  );
}
