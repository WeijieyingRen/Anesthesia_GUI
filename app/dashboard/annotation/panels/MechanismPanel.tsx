"use client";

import * as React from "react";
import type { EventType } from "../types";
import { submitAnnotation } from "@/lib/submit";

type MechanismPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  eventType: EventType;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";
type VoiceTarget = "othersNote" | "rankingNote" | null;

type MechanismAtom = {
  displayId: string;
  label: string;
};

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
    "Medication wearing off",
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
  atom,
  selected,
  disabled,
  onClick,
}: {
  atom: MechanismAtom;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[44px] rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? "border-green-500 bg-green-100 text-green-700"
          : disabled
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
          : "border-gray-300 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-500"
      }`}
    >
      <div className="text-[12px] leading-5 font-medium">
        <span className="text-gray-500">{atom.displayId}-</span>
        <span>{atom.label}</span>
      </div>
    </button>
  );
}

function TaskBlock({
  title,
  titleRight,
  children,
  noBorder = false,
}: {
  title: React.ReactNode;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={`${noBorder ? "" : "border-b"} px-4 py-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {titleRight ? <div className="shrink-0">{titleRight}</div> : null}
      </div>
      {children}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-sm font-semibold text-gray-500 hover:border-orange-300 hover:text-orange-500"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-lg border bg-white p-3 text-xs leading-5 text-gray-700 shadow-lg">
          {text}
        </div>
      )}
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
  annotatorName,
  onSaveAndNextStep,
}: MechanismPanelProps) {
  const mechanismAtoms = React.useMemo(() => {
    const base = MECHANISM_OPTIONS[eventType] ?? [];
    const labels = base.includes("Others") ? base : [...base, "Others"];

    return labels.map((label, index) => ({
      displayId: `M${index + 1}`,
      label,
    }));
  }, [eventType]);

  const [selectedMechanisms, setSelectedMechanisms] = React.useState<string[]>(
    []
  );
  const [othersNote, setOthersNote] = React.useState("");
  const [rankingNote, setRankingNote] = React.useState("");
  const [recordingTarget, setRecordingTarget] =
    React.useState<VoiceTarget>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const panelOpenedAtRef = React.useRef<number | null>(null);

  const hasOthersSelected = selectedMechanisms.includes("Others");

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  function toggleMechanism(label: string) {
    setSelectedMechanisms((prev) => {
      if (prev.includes(label)) {
        return prev.filter((item) => item !== label);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, label];
    });
  }

  React.useEffect(() => {
    if (!hasOthersSelected) {
      setOthersNote("");
      if (recordingTarget === "othersNote") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [hasOthersSelected, recordingTarget]);

  function validateMechanism() {
    if (!eventType) {
      return "Selected event type is missing.";
    }

    if (selectedMechanisms.length === 0) {
      return "Task 1 incomplete: please choose at least one mechanism label.";
    }

    if (hasOthersSelected && !othersNote.trim()) {
      return "Task 2 incomplete: please explain what you mean by 'Others'.";
    }

    if (!rankingNote.trim()) {
      return "Task 3 incomplete: please provide a confidence ranking note.";
    }

    return null;
  }

  async function startVoiceNote(target: Exclude<VoiceTarget, null>) {
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
      recognitionRef.current?.stop?.();

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "othersNote") {
          setOthersNote(transcript);
        } else if (target === "rankingNote") {
          setRankingNote(transcript);
        }
      };

      recognition.onerror = () => {
        setRecordingTarget(null);
      };

      recognition.onend = () => {
        setRecordingTarget(null);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecordingTarget(target);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      setRecordingTarget(null);
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    setRecordingTarget(null);
  }

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

      const selectedMechanismAtoms = mechanismAtoms.filter((atom) =>
        selectedMechanisms.includes(atom.label)
      );

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,
        caseId,
        eventId,
        panel: "mechanism_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          eventType,
          startMin,
          endMin,
          selectedMechanisms,
          selectedMechanismAtoms,
          othersNote: othersNote.trim(),
          rankingNote: rankingNote.trim(),
        },
      });

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
    setOthersNote("");
    setRankingNote("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 2: Identify the most likely mechanism for the selected abnormal
          event.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Select the most likely 1–3 mechanism labels">
            <div className="mb-3 text-sm text-gray-600">
              Selected event type:{" "}
              <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">
                {eventType}
              </span>
            </div>

            {mechanismAtoms.length === 0 ? (
              <div className="text-sm text-gray-500">
                No mechanism list configured for this event type yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mechanismAtoms.map((atom) => {
                  const selected = selectedMechanisms.includes(atom.label);
                  const disabled = !selected && selectedMechanisms.length >= 3;

                  return (
                    <MechanismChip
                      key={atom.displayId}
                      atom={atom}
                      selected={selected}
                      disabled={disabled}
                      onClick={() => toggleMechanism(atom.label)}
                    />
                  );
                })}
              </div>
            )}
          </TaskBlock>

          <TaskBlock
            title="Task 2. If 'Others' is selected, explain it"
            titleRight={
              <InfoTooltip text="This field is only required when you select 'Others' in Task 1. Otherwise, it can be skipped." />
            }
          >
            <textarea
              value={othersNote}
              onChange={(e) => setOthersNote(e.target.value)}
              disabled={!hasOthersSelected}
              className="min-h-[120px] w-full rounded-md border px-3 py-3 text-sm text-gray-800 outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-gray-400"
              placeholder={
                hasOthersSelected
                  ? "Briefly explain what you mean by 'Others' and why the predefined mechanism labels do not fit well."
                  : "This field is only required if 'Others' is selected."
              }
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={
                  recordingTarget === "othersNote"
                    ? stopVoiceNote
                    : () => startVoiceNote("othersNote")
                }
                disabled={!hasOthersSelected}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  !hasOthersSelected
                    ? "cursor-not-allowed bg-gray-300"
                    : recordingTarget === "othersNote"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recordingTarget === "othersNote"
                  ? "Stop Voice Note"
                  : "Start Voice Note"}
              </button>
            </div>
          </TaskBlock>

          <TaskBlock
            title="Task 3. Confidence Ranking"
            titleRight={
              <InfoTooltip text="Briefly rank the selected mechanisms by confidence using the displayed IDs, for example: M4 > M2 > M1." />
            }
            noBorder
          >
            <textarea
              value={rankingNote}
              onChange={(e) => setRankingNote(e.target.value)}
              className="min-h-[100px] w-full rounded-md border px-3 py-3 text-sm text-gray-800 outline-none focus:border-orange-400"
              placeholder="Example: M4 > M2 > M1"
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={
                  recordingTarget === "rankingNote"
                    ? stopVoiceNote
                    : () => startVoiceNote("rankingNote")
                }
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  recordingTarget === "rankingNote"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recordingTarget === "rankingNote"
                  ? "Stop Voice Note"
                  : "Start Voice Note"}
              </button>
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              Complete the required tasks before saving.
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