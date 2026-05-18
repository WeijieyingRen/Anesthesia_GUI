"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";

type AdditionalEventContextPanelProps = {
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

const EVENT_OPTIONS = [
  { value: "", label: "Select an event..." },
  { value: "anesthesia_start", label: "Anesthesia Start" },
  { value: "induction", label: "Induction" },
  { value: "intubation", label: "Intubation" },
  { value: "procedure_start", label: "Procedure Start" },
  { value: "positioning", label: "Positioning" },
  { value: "extubation", label: "Extubation" },
  { value: "emergence", label: "Emergence" },
  { value: "procedure_end", label: "Procedure End" },
  { value: "anesthesia_stop", label: "Anesthesia Stop" },
  { value: "other", label: "Other" },
];

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

export default function AdditionalEventContextPanel({
  eventId = "patient-contextual-event",
  caseId = "unknown_case",
  eventTitle = "Additional Contextual Event",
  episodeLabel = "Patient",
  startMin = 0,
  endMin = 0,
  annotatorName,
  onSaveAndNextStep,
}: AdditionalEventContextPanelProps) {
  const [eventOfInterest, setEventOfInterest] = React.useState("");
  const [customEvent, setCustomEvent] = React.useState("");
  const [eventContext, setEventContext] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const panelOpenedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  const selectedEventLabel =
    EVENT_OPTIONS.find((opt) => opt.value === eventOfInterest)?.label ?? "";

  const finalEventText =
    eventOfInterest === "other"
      ? customEvent.trim()
      : selectedEventLabel && selectedEventLabel !== "Select an event..."
      ? selectedEventLabel
      : "";

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
      recognition.lang = ((typeof localStorage !== "undefined" && localStorage.getItem("speechRecognitionLanguage")) || (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hi") ? "hi-IN" : "en-US"));
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        setEventContext(transcript);
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

  async function handleSave() {
    if (!eventOfInterest) {
      setSaveStatus("error");
      setSaveMessage("Please select an event of interest.");
      return;
    }

    if (eventOfInterest === "other" && !customEvent.trim()) {
      setSaveStatus("error");
      setSaveMessage("Please specify the event when selecting Other.");
      return;
    }

    if (!eventContext.trim()) {
      setSaveStatus("error");
      setSaveMessage("Please describe what happened around this event.");
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage("");

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,
        caseId,
        eventId,
        panel: "additional_event_context_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          eventOfInterest: finalEventText,
          eventContext: eventContext.trim(),
        },
      });

      setSaveStatus("success");
      setSaveMessage("Additional event context saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save additional event context.");
    }
  }

  function handleReset() {
    setEventOfInterest("");
    setCustomEvent("");
    setEventContext("");
    setRecording(false);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Patient-level Panel 2: Additional Contextual Event
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Select an event of interest">
            <div className="mb-3 text-sm text-gray-600">
              Select one clinically meaningful event you want to comment on.
            </div>

            <select
              value={eventOfInterest}
              onChange={(e) => setEventOfInterest(e.target.value)}
              className="w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              {EVENT_OPTIONS.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {eventOfInterest === "other" && (
              <input
                type="text"
                value={customEvent}
                onChange={(e) => setCustomEvent(e.target.value)}
                placeholder="Please specify the event"
                className="mt-3 w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              />
            )}
          </TaskBlock>

          <TaskBlock title="Task 2. Describe what happened around this event" noBorder>
            <div className="mb-3 text-sm text-gray-600">
              Briefly describe what happened before, during, or after this event,
              such as physiologic changes, clinician actions, medications, or workflow context.
            </div>

            <textarea
              value={eventContext}
              onChange={(e) => setEventContext(e.target.value)}
              className="min-h-[220px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              placeholder="Describe what happened around this event..."
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={recording ? stopVoiceNote : startVoiceNote}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  recording
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recording ? "Stop Recording" : "Start Recording"}
              </button>
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
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
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  saveStatus === "saving"
                    ? "cursor-wait bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saveStatus === "saving" ? "Saving..." : "Save"}
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