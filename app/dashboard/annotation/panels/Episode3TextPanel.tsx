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

type Props = {
  caseId: string;
  selectedEvent: any;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;
  anesthesiaStart?: string | null;
  onSaveAndNextStep: () => void;

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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Please provide a free-text annotation before saving.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

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
        task: "merged_episode_reasoning",

        submittedAt,
        clickedAt: submittedAt,

        answers: {
          task: "merged_episode_reasoning",

          episodeNumber,
          episodeLabel:
            selectedEvent?.episodeLabel ?? selectedEvent?.title ?? null,

          vital: selectedEvent?.vital ?? null,
          startMin: selectedEvent?.startMin ?? null,
          endMin: selectedEvent?.endMin ?? null,
          y1: selectedEvent?.y1 ?? null,
          y2: selectedEvent?.y2 ?? null,
          anesthesiaStart,

          prompt: {
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

          freeText: currentText,
        },
      });

      onSaveAndNextStep();
    } catch (e: any) {
      console.error("Failed to save merged episode reasoning:", e);
      setError(e?.message ?? "Failed to save annotation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      {episodeList.length > 0 && (
        <div className="mb-5 rounded-xl border bg-gray-50 p-4">
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

      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="mb-2 font-semibold text-blue-950">
          Please include:
        </div>

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
      </div>

      {selectedEvent && (
        <div className="mb-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <span className="font-semibold">Episode:</span>{" "}
              {selectedEvent.episodeLabel ??
                selectedEvent.title ??
                "Selected event"}
            </div>

            <div>
              <span className="font-semibold">Vital:</span>{" "}
              {selectedEvent.vital ?? "N/A"}
            </div>

            <div>
              <span className="font-semibold">Start:</span>{" "}
              {selectedEvent.startMin ?? "N/A"} min
            </div>

            <div>
              <span className="font-semibold">End:</span>{" "}
              {selectedEvent.endMin ?? "N/A"} min
            </div>
          </div>
        </div>
      )}

      <textarea
        value={freeText}
        onChange={(e) => setCurrentFreeText(e.target.value)}
        className="min-h-[320px] w-full rounded-xl border border-gray-300 p-4 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        placeholder="Example: The patient developed hypotension shortly after induction. The likely mechanism was vasodilation from anesthetic agents, possibly compounded by relative hypovolemia. Phenylephrine boluses were clinically relevant and produced a transient MAP increase, but the effect was not sustained..."
      />

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={startVoiceNote}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Start Voice Note
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

          <button
            type="button"
            onClick={() => {
              setCurrentFreeText("");
              setError(null);
            }}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset This Episode
          </button>
        </div>

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
          {saving ? "Saving..." : "Save & Next Episode"}
        </button>
      </div>
    </div>
  );
}