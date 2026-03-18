"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";

type ResponsePanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";
type ResponseValue = "Yes" | "No" | "Unknown" | "";

function ResponsePill({
  label,
  selected,
  onClick,
  selectedTone = "green",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  selectedTone?: "green" | "orange" | "gray";
}) {
  const toneClass =
    selectedTone === "green"
      ? "border-green-500 bg-green-100 text-green-700"
      : selectedTone === "orange"
      ? "border-orange-400 bg-orange-100 text-orange-700"
      : "border-slate-500 bg-slate-100 text-slate-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
        selected
          ? toneClass
          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900"
      }`}
    >
      {label}
    </button>
  );
}

function TaskBlock({
  title,
  children,
  noBorder = false,
}: {
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={`${noBorder ? "" : "border-b"} px-4 py-4`}>
      <div className="mb-3 text-sm font-semibold text-gray-900">{title}</div>
      {children}
    </div>
  );
}

export default function ResponsePanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,
  annotatorName,
  onSaveAndNextStep,
}: ResponsePanelProps) {
  const [response, setResponse] = React.useState<ResponseValue>("");
  const [etiology, setEtiology] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const panelOpenedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  const needEtiology = response === "No" || response === "Unknown";

  function validateResponse() {
    if (!response) {
      return "Task 1 incomplete: please evaluate patient response.";
    }

    if (needEtiology && !etiology.trim()) {
      return "Task 2 incomplete: please provide etiology when response is No or Unknown.";
    }

    return null;
  }

  async function startVoiceNote() {
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

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");
        setEtiology(transcript);
      };

      recognition.onerror = () => {
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
      };

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

  async function handleSaveResponse() {
    const validationError = validateResponse();
    if (validationError) {
      setSaveStatus("error");
      setSaveMessage(validationError);
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage("");

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,
        caseId,
        eventId,
        panel: "response_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          response,
          etiology: etiology.trim(),
        },
      });

      setSaveStatus("success");
      setSaveMessage("Patient response evaluation saved successfully.");

      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save response evaluation.");
    }
  }

  function handleReset() {
    setResponse("");
    setEtiology("");
    setRecording(false);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 4: Evaluate whether the patient improved as expected after the intervention.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Evaluate patient response">
            <div className="mb-3 text-sm text-gray-600">
              Did the patient improve as expected after the intervention?
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ResponsePill
                label="Yes"
                selected={response === "Yes"}
                selectedTone="green"
                onClick={() => setResponse("Yes")}
              />
              <ResponsePill
                label="No"
                selected={response === "No"}
                selectedTone="orange"
                onClick={() => setResponse("No")}
              />
              <ResponsePill
                label="Unknown"
                selected={response === "Unknown"}
                selectedTone="gray"
                onClick={() => setResponse("Unknown")}
              />
            </div>
          </TaskBlock>

          <TaskBlock
            title={`Task 2. ${
              needEtiology
                ? "Voice note / etiology explanation"
                : "Provide possible causes or explanations for why the patient did not improve as expected. Unknown if not sure."
            }`}
            noBorder
          >
            <div className="mb-3 text-sm text-gray-600">
              {needEtiology
                ? "Please provide possible causes or explanations for why the patient did not improve as expected."
                : "Add optional notes if needed."}
            </div>

            <textarea
              value={etiology}
              onChange={(e) => setEtiology(e.target.value)}
              disabled={!needEtiology && response === "Yes"}
              className="min-h-[140px] w-full max-w-[520px] rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-gray-400"
              placeholder={
                needEtiology
                  ? "Provide possible causes or explanations..."
                  : "Optional notes..."
              }
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={recording ? stopVoiceNote : startVoiceNote}
                disabled={!needEtiology && response === "Yes"}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  !needEtiology && response === "Yes"
                    ? "cursor-not-allowed bg-gray-300"
                    : recording
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recording ? "Stop Recording" : "Start Recording"}
              </button>
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              All required tasks must be completed before saving.
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-gray-700 bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Reset All
              </button>

              <button
                type="button"
                onClick={handleSaveResponse}
                disabled={saveStatus === "saving"}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  saveStatus === "saving"
                    ? "cursor-wait bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saveStatus === "saving" ? "Saving..." : "Save & Next Step"}
              </button>
            </div>

            {saveMessage && (
              <div
                className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
                  saveStatus === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {saveMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}