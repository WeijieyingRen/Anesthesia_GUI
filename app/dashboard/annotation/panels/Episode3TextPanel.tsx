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

const ABNORMAL_REASONING_TEMPLATE = `1. Etiology reasoning:
What were the most likely trigger, etiology, or mechanism of this episode? Please provide up to three hypotheses and assign a confidence percentage to each hypothesis.

Hypothesis 1:
Hypothesis 2:
Hypothesis 3:

2. Relevant intervention selection:
Which medications, fluids, gas or ventilation changes, positioning changes, surgical events, or other interventions were clinically relevant to this episode? Which nearby interventions were likely unrelated? Please briefly explain why.

Relevant interventions:
Unrelated or less relevant interventions:

3. Alternative intervention:
Based on your clinical practice, was there a reasonable alternative intervention that could have been considered? If yes, please describe it. If no, please state that no clear alternative intervention was needed.

4. Preventive intervention / preventive attempt:
Before this episode occurred, were any preventive interventions attempted? If yes, please describe them and explain why the abnormality may still have occurred despite these preventive measures. If no clear preventive intervention was observed, please state that.
`;

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
  const freeText = freeTextMap[eventId] ?? ABNORMAL_REASONING_TEMPLATE;

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

    setFreeTextMap((prev) => {
      if (prev[eventId] !== undefined) return prev;

      return {
        ...prev,
        [eventId]: ABNORMAL_REASONING_TEMPLATE,
      };
    });
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

    if (!currentText) {
      const message = "Please provide a free-text annotation before saving.";
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
          participantInfo?.doctorId ?? localStorage.getItem("doctorId") ?? ""
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
        task: "abnormal_event_reasoning",

        submittedAt,
        clickedAt: submittedAt,

        answers: {
          task: "abnormal_event_reasoning",

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
              "Describe the selected abnormal event and the related clinical reasoning in one free-text response. Please organize your response using the four sections below.",
            requestedElements: [
              "1. Etiology reasoning: What were the most likely trigger, etiology, or mechanism of this episode? Please provide up to three hypotheses and assign a confidence percentage to each hypothesis.",
              "2. Relevant intervention selection: Which medications, fluids, gas or ventilation changes, positioning changes, surgical events, or other interventions were clinically relevant to this episode? Which nearby interventions were likely unrelated? Please briefly explain why.",
              "3. Alternative intervention: Based on your clinical practice, was there a reasonable alternative intervention that could have been considered? If yes, please describe it. If no, please state that no clear alternative intervention was needed.",
              "4. Preventive intervention / preventive attempt: Before this episode occurred, were any preventive interventions attempted? If yes, please describe them and explain why the abnormality may still have occurred despite these preventive measures. If no clear preventive intervention was observed, please state that.",
            ],
          },

          abnormalEventReasoning: currentText,
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
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
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
        <div className="mb-2 font-semibold text-blue-950">
          Please organize your response using the following sections:
        </div>
        <ol className="ml-5 list-decimal space-y-1">
          <li>
            <strong>Etiology reasoning:</strong> What were the most likely
            trigger, etiology, or mechanism of this episode? Please provide up
            to three hypotheses and assign a confidence percentage to each
            hypothesis.
          </li>
          <li>
            <strong>Relevant intervention selection:</strong> Which medications,
            fluids, gas or ventilation changes, positioning changes, surgical
            events, or other interventions were clinically relevant to this
            episode? Which nearby interventions were likely unrelated? Please
            briefly explain why.
          </li>
          <li>
            <strong>Alternative intervention:</strong> Based on your clinical
            practice, was there a reasonable alternative intervention that could
            have been considered?
          </li>
          <li>
            <strong>Preventive intervention / preventive attempt:</strong>{" "}
            Before this episode occurred, were any preventive interventions
            attempted? If yes, please describe them and explain why the
            abnormality may still have occurred despite these preventive
            measures.
          </li>
        </ol>
      </InstructionPanel>

      <textarea
        value={freeText}
        onChange={(e) => setCurrentFreeText(e.target.value)}
        className="min-h-[360px] w-full rounded-xl border border-gray-300 p-4 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        placeholder="Write abnormal event reasoning here..."
      />

      <div className="mt-5 flex w-full flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={recording ? stopVoiceNote : startVoiceNote}
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
            setCurrentFreeText(ABNORMAL_REASONING_TEMPLATE);
            stopVoiceNote();
            setError(null);
            setSaveStatus("idle");
            setSaveMessage("");
          }}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !freeText.trim()}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
            saving || !freeText.trim()
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