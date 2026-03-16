"use client";

import * as React from "react";
import type { EventType } from "../types";

type MechanismPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  eventType: EventType;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

const MECHANISM_OPTIONS: Partial<Record<EventType, string[]>> = {
  Hypotension: [
    "Vasodilation",
    "Hypovolemia",
    "Cardiac dysfunction",
    "Obstructive physiology",
    "Drug-induced negative inotropy",
    "Measurement artifact",
    "Mixed / multifactorial",
    "Unknown",
  ],

  Hypertension: [
    "Inadequate anesthesia depth",
    "Hypervolemia",
    "Sympathetic surge",
    "Medication withdrawal",
    "Measurement artifact",
    "Unknown",
  ],

  Hypoxia: [
    "Airway obstruction",
    "Hypoventilation",
    "Atelectasis",
    "Shunt",
    "Low FiO₂ delivery",
    "Pulmonary edema",
    "Pneumothorax",
    "Probe artifact",
    "Unknown",
  ],

  Hypercapnia: [
    "Hypoventilation",
    "Increased dead space",
    "Rebreathing",
    "CO₂ production increase",
    "Ventilator malfunction",
    "Unknown",
  ],

  Hypocapnia: [
    "Hyperventilation",
    "Reduced CO₂ production",
    "Massive PE",
    "Low cardiac output",
    "Sampling artifact",
    "Unknown",
  ],

  Tachypnea: [
    "Pain",
    "Metabolic acidosis",
    "Hypoxia-driven compensation",
    "Light anesthesia",
    "Anxiety / sympathetic activation",
    "Ventilator overdrive",
    "Unknown",
  ],

  Bradypnea: [
    "Opioid effect",
    "Deep anesthesia",
    "Neuromuscular blockade",
    "Central depression",
    "Ventilator underdrive",
    "Unknown",
  ],

  Hypothermia: [
    "Redistribution",
    "Exposure",
    "Massive transfusion",
    "Impaired thermoregulation",
    "Environmental factors",
    "Unknown",
  ],

  Hyperthermia: [
    "Malignant hyperthermia",
    "Sepsis",
    "Drug reaction",
    "Thyroid storm",
    "Environmental",
    "Unknown",
  ],
};

function MechanismChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
        selected
          ? "border-green-500 bg-green-100 text-green-700"
          : disabled
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
          : "border-gray-300 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-500"
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

export default function MechanismPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,
  eventType,
  onSaveAndNextStep,
}: MechanismPanelProps) {
  const options = MECHANISM_OPTIONS[eventType] ?? [];
  const [selectedMechanisms, setSelectedMechanisms] = React.useState<string[]>([]);
  const [note, setNote] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);

  function toggleMechanism(option: string) {
    setSelectedMechanisms((prev) => {
      if (prev.includes(option)) {
        return prev.filter((item) => item !== option);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, option];
    });
  }

  function validateMechanism() {
    if (!eventType) {
      return "Selected event type is missing.";
    }

    if (selectedMechanisms.length === 0) {
      return "Task 1 incomplete: please choose at least one mechanism label.";
    }

    if (!note || note.trim() === "") {
      return "Task 2 incomplete: please enter a free-text explanation before saving.";
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
        setNote(transcript);
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

  const payload = React.useMemo(
    () => ({
      task: "mechanism",
      caseId,
      eventId,
      eventTitle,
      episodeLabel,
      annotation: {
        eventType,
        startMin,
        endMin,
        selectedMechanisms,
        note,
      },
      submittedAt: new Date().toISOString(),
    }),
    [
      caseId,
      eventId,
      eventTitle,
      episodeLabel,
      eventType,
      startMin,
      endMin,
      selectedMechanisms,
      note,
    ]
  );

  async function handleSaveMechanism() {
    const validationError = validateMechanism();
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed with status ${res.status}`);
      }

      setSaveStatus("success");
      setSaveMessage("Mechanism annotation saved successfully.");

      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save mechanism annotation.");
    }
  }

  function handleReset() {
    setSelectedMechanisms([]);
    setNote("");
    setRecording(false);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 2: Identify the most likely mechanism for the selected abnormal event.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Select the most likely 1–3 mechanism labels">
            <div className="mb-3 text-sm text-gray-600">
              Selected event type:{" "}
              <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">
                {eventType}
              </span>
            </div>

            {options.length === 0 ? (
              <div className="text-sm text-gray-500">
                No mechanism list configured for this event type yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {options.map((item) => {
                  const selected = selectedMechanisms.includes(item);
                  const disabled = !selected && selectedMechanisms.length >= 3;

                  return (
                    <MechanismChip
                      key={item}
                      label={item}
                      selected={selected}
                      disabled={disabled}
                      onClick={() => toggleMechanism(item)}
                    />
                  );
                })}
              </div>
            )}
          </TaskBlock>

          <TaskBlock title="Task 2. Free-text explanation of the likely etiology" noBorder>
            <div className="mb-3 text-sm text-gray-600">
              Please explain the likely etiology based on waveform trends, medications,
              timing, and perioperative context.
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              placeholder="Describe the likely etiology, including supporting context from waveform trends, medications, and pre-op status if relevant."
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
                {recording ? "Stop Voice Note" : "Start Voice Note"}
              </button>
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              All tasks must be completed before saving.
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
                onClick={handleSaveMechanism}
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