"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";

type SummaryPanelProps = {
  eventId?: string;
  caseId?: string;
  patientId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  annotatorName?: string;
  annotatorEmail?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type QuestionTiming = {
  startedAt: string | null;
  firstInteractionAt: string | null;
  firstTypingAt: string | null;
  firstVoiceStartAt: string | null;
  submittedAt: string | null;
};

function makeEmptyQuestionTiming(nowIso?: string): QuestionTiming {
  return {
    startedAt: nowIso ?? null,
    firstInteractionAt: null,
    firstTypingAt: null,
    firstVoiceStartAt: null,
    submittedAt: null,
  };
}

export default function SummaryPanel({
  eventId = "patient-summary",
  caseId = "unknown_case",
  patientId = "unknown_patient",
  eventTitle = "Patient-level Summary",
  episodeLabel = "Patient",
  startMin = 0,
  endMin = 0,
  annotatorName,
  annotatorEmail,
  onSaveAndNextStep,
}: SummaryPanelProps) {
  const [summaryText, setSummaryText] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [instructionsOpen, setInstructionsOpen] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const voiceBaseTextRef = React.useRef("");

  const pageOpenedAtRef = React.useRef<string | null>(null);
  const firstInteractionAtRef = React.useRef<string | null>(null);
  const firstTypingAtRef = React.useRef<string | null>(null);
  const firstVoiceStartAtRef = React.useRef<string | null>(null);

  const summaryTimingRef = React.useRef<QuestionTiming>(
    makeEmptyQuestionTiming()
  );

  React.useEffect(() => {
    const nowIso = new Date().toISOString();

    pageOpenedAtRef.current = nowIso;
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    voiceBaseTextRef.current = "";

    summaryTimingRef.current = makeEmptyQuestionTiming(nowIso);
  }, [caseId, eventId]);

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus !== "saving") return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveStatus]);

  function markPageFirstInteraction(nowIso?: string) {
    const t = nowIso ?? new Date().toISOString();

    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = t;
    }
  }

  function markSummaryFirstInteraction(nowIso?: string) {
    const t = nowIso ?? new Date().toISOString();

    if (!summaryTimingRef.current.firstInteractionAt) {
      summaryTimingRef.current.firstInteractionAt = t;
    }

    markPageFirstInteraction(t);
  }

  function markSummaryTyping() {
    const nowIso = new Date().toISOString();

    markSummaryFirstInteraction(nowIso);

    if (!summaryTimingRef.current.firstTypingAt) {
      summaryTimingRef.current.firstTypingAt = nowIso;
    }

    if (!firstTypingAtRef.current) {
      firstTypingAtRef.current = nowIso;
    }
  }

  function markSummaryVoiceStart() {
    const nowIso = new Date().toISOString();

    markSummaryFirstInteraction(nowIso);

    if (!summaryTimingRef.current.firstVoiceStartAt) {
      summaryTimingRef.current.firstVoiceStartAt = nowIso;
    }

    if (!firstVoiceStartAtRef.current) {
      firstVoiceStartAtRef.current = nowIso;
    }
  }

  async function startVoiceNote() {
    if (saveStatus === "saving") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSaveStatus("error");
      setSaveMessage(
        "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      voiceBaseTextRef.current = summaryText.trim();

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("")
          .trim();

        if (transcript.length > 0) {
          markSummaryFirstInteraction();
        }

        const base = voiceBaseTextRef.current;
        const nextText = base ? `${base} ${transcript}` : transcript;
        setSummaryText(nextText);
      };

      recognition.onerror = () => {
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
      };

      markSummaryVoiceStart();

      recognition.start();
      recognitionRef.current = recognition;
      setRecording(true);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      setRecording(false);
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    setRecording(false);
  }

  async function handleSaveSummary() {
    if (!summaryText.trim()) {
      setSaveStatus("error");
      setSaveMessage("Please provide the patient-level summary.");
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage(
        "Saving to cloud storage... Please wait and do not close the page."
      );

      recognitionRef.current?.stop?.();
      setRecording(false);

      let participantInfo: any = {};

      try {
        const raw = localStorage.getItem("participantInfo");
        participantInfo = raw ? JSON.parse(raw) : {};
      } catch {
        participantInfo = {};
      }

      const doctorId =
        String(
          participantInfo?.doctorId ?? localStorage.getItem("doctorId") ?? ""
        ).trim() || null;

      const accessCode =
        String(
          participantInfo?.accessCode ??
            localStorage.getItem("doctorAccessCode") ??
            ""
        ).trim() || null;

      const submittedAt = new Date().toISOString();
      summaryTimingRef.current.submittedAt = submittedAt;

      await submitAnnotation({
        annotator:
          annotatorName || annotatorEmail
            ? { name: annotatorName, email: annotatorEmail }
            : undefined,

        participantInfo: {
          name: participantInfo?.name ?? annotatorName ?? undefined,
          email: participantInfo?.email ?? annotatorEmail ?? undefined,
          doctorId: doctorId ?? undefined,
          accessCode: accessCode ?? undefined,
        },

        doctorId,
        accessCode,
        patientId,
        patientFolder: patientId,

        caseId,
        eventId,
        episodeId: "patient-summary",

        panel: "summary_panel",
        action: "submit",

        pageOpenedAt: pageOpenedAtRef.current,
        firstInteractionAt: firstInteractionAtRef.current,
        firstTypingAt: firstTypingAtRef.current,
        firstVoiceStartAt: firstVoiceStartAtRef.current,
        submittedAt,

        panelOpenedAt: pageOpenedAtRef.current,
        clickedAt: submittedAt,

        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          summaryText: summaryText.trim(),
          tasks: {
            task1_overall_summary: {
              question:
                "Please summarize the overall intraoperative course for this patient, including major abnormal events, likely mechanisms, important interventions, and overall patient response.",
              answer: summaryText.trim(),
              timing: { ...summaryTimingRef.current },
            },
          },
        },
      });

      setSaveStatus("success");
      setSaveMessage("Summary saved successfully to cloud storage.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(
        error?.message ||
          "Failed to save summary to cloud storage. Please click Save again."
      );
    }
  }

  function handleReset() {
    if (saveStatus === "saving") return;

    setSummaryText("");
    setRecording(false);
    recognitionRef.current?.stop?.();
    voiceBaseTextRef.current = "";
    setSaveStatus("idle");
    setSaveMessage("");

    const nowIso = new Date().toISOString();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    summaryTimingRef.current = makeEmptyQuestionTiming(nowIso);
  }

  return (
    <div className="bg-white">
      <div className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
          <span>Patient-level Panel 1: Overall Intraoperative Summary</span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setInstructionsOpen((value) => !value)}
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Instructions
            </button>

            {instructionsOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-[min(420px,80vw)] rounded-lg border bg-white p-3 text-xs leading-5 text-gray-700 shadow-lg">
                Please summarize the overall intraoperative course for this
                patient, including major abnormal events, likely mechanisms,
                important interventions, and overall patient response.
              </div>
            )}
          </div>
        </div>

        <textarea
          value={summaryText}
          disabled={saveStatus === "saving"}
          onChange={(e) => {
            markSummaryTyping();
            setSummaryText(e.target.value);
          }}
          className="min-h-[260px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-orange-400 disabled:cursor-not-allowed disabled:bg-gray-100"
          placeholder="Write the overall patient-level intraoperative summary here..."
        />

<div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={saveStatus === "saving"}
            onClick={recording ? stopVoiceNote : startVoiceNote}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
              saveStatus === "saving"
                ? "cursor-not-allowed bg-gray-400"
                : recording
                ? "bg-red-500 hover:bg-red-600"
                : "bg-orange-400 hover:bg-orange-500"
            }`}
          >
            {recording ? "Stop Recording" : "Start Recording"}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={saveStatus === "saving"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              saveStatus === "saving"
                ? "cursor-not-allowed bg-gray-400"
                : "border border-gray-700 bg-gray-700 hover:bg-gray-800"
            }`}
          >
            Reset All
          </button>

          <button
            type="button"
            onClick={handleSaveSummary}
            disabled={saveStatus === "saving"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              saveStatus === "saving"
                ? "cursor-wait bg-blue-300"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saveStatus === "saving" ? "Saving..." : "Save and Next"}
          </button>
        </div>

        {saveMessage && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
              saveStatus === "success"
                ? "bg-green-50 text-green-700"
                : saveStatus === "saving"
                ? "bg-blue-50 text-blue-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
}