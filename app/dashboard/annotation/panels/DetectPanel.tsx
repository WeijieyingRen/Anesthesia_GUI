"use client";

import * as React from "react";
import type { DetectAnnotation, EventType, SeverityLevel, DetectVital } from "../types";

type DetectPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  annotation: DetectAnnotation;
  onChangeAnnotation: React.Dispatch<React.SetStateAction<DetectAnnotation>>;
  anesthesiaStart?: string | null;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

const EVENT_TYPE_OPTIONS: EventType[] = [
  "Hypotension",
  "Hypertension",
  "Hypoxia",
  "Hypercapnia",
  "Hypocapnia",
  "Tachypnea",
  "Bradypnea",
  "Hypothermia",
  "Hyperthermia",
];

const VITAL_OPTIONS: DetectVital[] = ["MAP", "HR", "SPO2", "RR", "ETCO2", "TEMP"];
const SEVERITY_OPTIONS: SeverityLevel[] = ["Mild", "Moderate", "Severe"];

function OptionChip({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? "border-orange-400 bg-orange-400 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-500"
      }`}
    >
      {label}
    </button>
  );
}

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero || !Number.isFinite(offsetMin)) return `${offsetMin} min`;

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return `${offsetMin} min`;

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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

export default function DetectPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  annotation,
  onChangeAnnotation,
  anesthesiaStart = null,
  onSaveAndNextStep,
}: DetectPanelProps) {
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");
  const [recording, setRecording] = React.useState(false);

  const recognitionRef = React.useRef<any>(null);

  const payload = React.useMemo(
    () => ({
      task: "detect",
      caseId,
      eventId,
      eventTitle,
      episodeLabel,
      annotation,
      submittedAt: new Date().toISOString(),
    }),
    [caseId, eventId, eventTitle, episodeLabel, annotation]
  );

  function updateField<K extends keyof DetectAnnotation>(
    key: K,
    value: DetectAnnotation[K]
  ) {
    onChangeAnnotation((prev) => ({ ...prev, [key]: value }));
  }

  function validateDetection(): string | null {
    if (!annotation.vital) {
      return "Task 1 incomplete: please confirm the vital.";
    }

    if (annotation.eventType === "") {
      return "Task 2 incomplete: please select the event type.";
    }

    if (annotation.severity === "") {
      return "Task 3 incomplete: please choose the severity.";
    }

    if (
      annotation.confidence === null ||
      annotation.confidence === undefined ||
      Number.isNaN(annotation.confidence)
    ) {
      return "Task 4 incomplete: please select confidence from 1 to 5.";
    }

    if (!annotation.note.trim()) {
      return "Task 5 incomplete: please enter a note before saving.";
    }

    if (annotation.startMin >= annotation.endMin) {
      return "Start must be smaller than End.";
    }

    return null;
  }

  async function handleSaveDetection() {
    const validationError = validateDetection();
    if (validationError) {
      setSaveStatus("error");
      setSaveMessage(validationError);
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage("");

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed with status ${res.status}`);
      }

      setSaveStatus("success");
      setSaveMessage("Detection annotation saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save detection annotation.");
    }
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

        updateField("note", transcript);
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
    recognitionRef.current?.stop();
    setRecording(false);
  }

  function handleReset() {
    onChangeAnnotation((prev) => ({
      ...prev,
      eventType: "",
      severity: "",
      confidence: null,
      note: "",
    }));
    setRecording(false);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 1: Detect patient abnormal physiology events.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Confirm bounding box window and confirm the vital (select on the right chart)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[110px_90px_90px]">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Vital
                </div>
                <select
                  value={annotation.vital}
                  onChange={(e) =>
                    updateField("vital", e.target.value as DetectVital)
                  }
                  className="w-full rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  {VITAL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Start
                </div>
                <input
                  value={formatClockTime(annotation.startMin, anesthesiaStart)}
                  readOnly
                  className="w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                />
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  End
                </div>
                <input
                  value={formatClockTime(annotation.endMin, anesthesiaStart)}
                  readOnly
                  className="w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                />
              </div>
            </div>
          </TaskBlock>

          <TaskBlock title="Task 2. Select the event type">
            <select
              value={annotation.eventType}
              onChange={(e) => updateField("eventType", e.target.value as EventType | "")}
              className="w-full max-w-[320px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select event type</option>
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </TaskBlock>

          <TaskBlock title="Task 3. Choose event severity based on your knowledge">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Severity
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {SEVERITY_OPTIONS.map((level) => (
                  <OptionChip
                    key={level}
                    label={level}
                    selected={annotation.severity === level}
                    onClick={() => updateField("severity", level)}
                  />
                ))}
              </div>
            </div>
          </TaskBlock>

          <TaskBlock title="Task 4. Select confidence from 1 to 5">
            <div>
              <div className="mb-2 grid grid-cols-3 items-center text-sm text-gray-500">
                <span className="justify-self-start">1 - Low</span>
                <span className="justify-self-center rounded-md bg-green-100 px-2 py-1 font-medium text-green-700">
                  Confidence: {annotation.confidence ?? "-"}
                </span>
                <span className="justify-self-end">5 - High</span>
              </div>

              <div className="relative px-1 py-3">
                <div className="pointer-events-none absolute left-1 right-1 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gray-200" />

                <div className="pointer-events-none absolute left-1 right-1 top-1/2 flex -translate-y-1/2 justify-between">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <span
                      key={value}
                      className={`h-3 w-3 rounded-full border-2 ${
                        annotation.confidence === value
                          ? "border-green-500 bg-green-500"
                          : "border-gray-400 bg-gray-200"
                      }`}
                    />
                  ))}
                </div>

                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={annotation.confidence ?? 1}
                  onChange={(e) => updateField("confidence", Number(e.target.value))}
                  className="relative z-10 h-2 w-full cursor-pointer appearance-none bg-transparent"
                />
              </div>
            </div>
          </TaskBlock>

          <TaskBlock
            title="Task 5. Voice note / free-text description. If you have other hypotheses or uncertainty, please describe them here"
            noBorder
          >
            <textarea
              value={annotation.note}
              onChange={(e) => updateField("note", e.target.value)}
              className="min-h-[120px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              placeholder="Describe the abnormal physiology event, your rationale, uncertainty, or other related observations..."
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
            <div className="mb-3 text-sm text-gray-500">
              All 5 tasks must be completed before saving.
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
                onClick={handleSaveDetection}
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