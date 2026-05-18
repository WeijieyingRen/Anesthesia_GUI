"use client";

import * as React from "react";
import type { EventType } from "../types";
import { submitAnnotation } from "@/lib/submit";

type MechanismPanelProps = {
  eventId?: string;
  caseId?: string;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  eventType?: EventType;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";
type VoiceTarget = "othersNote" | "rankingNote" | "triggerOthersNote" | null;

type MechanismAtom = {
  displayId: string;
  label: string;
};

type TriggerOption =
  | "Surgical stimulation"
  | "Drug effect"
  | "Airway problem"
  | "Ventilation problem"
  | "Blood loss"
  | "Volume shift"
  | "Cardiac cause"
  | "Position change"
  | "Monitoring artifact"
  | "Unclear"
  | "Unknown"
  | "Others";

type MechanismTaskKey =
  | "task1_mechanism_labels"
  | "task2_confidence_ranking"
  | "task3_trigger";

type TaskTiming = {
  startedAt: number | null;
  firstInteractionAt: number | null;
  firstTypingAt: number | null;
  firstVoiceStartAt: number | null;
  selectedAt: number | null;
};

const TRIGGER_OPTIONS: TriggerOption[] = [
  "Surgical stimulation",
  "Drug effect",
  "Airway problem",
  "Ventilation problem",
  "Blood loss",
  "Volume shift",
  "Cardiac cause",
  "Position change",
  "Monitoring artifact",
  "Unclear",
  "Unknown",
  "Others",
];

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

  Bradycardia: [
    "Excess anesthetic depth",
    "Opioid effect",
    "Vagal stimulation",
    "Conduction abnormality",
    "Beta-blocker / calcium channel blocker effect",
    "Electrolyte disturbance",
    "Measurement artifact",
    "Unknown",
  ],

  Tachycardia: [
    "Pain / inadequate anesthesia",
    "Hypovolemia",
    "Sympathetic surge",
    "Fever / hypermetabolic state",
    "Medication effect",
    "Arrhythmia",
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

function buildEmptyTaskTimingMap(): Record<MechanismTaskKey, TaskTiming> {
  return {
    task1_mechanism_labels: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task2_confidence_ranking: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task3_trigger: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
  };
}

function toIsoOrNull(value: number | null) {
  return value != null ? new Date(value).toISOString() : null;
}

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

function TriggerChip({
  label,
  selected,
  onClick,
}: {
  label: TriggerOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[42px] rounded-lg border px-3 py-2 text-sm font-medium transition ${
        selected
          ? "border-blue-500 bg-blue-100 text-blue-700"
          : "border-gray-300 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-500"
      }`}
    >
      {label}
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
  patientId,
  patientFolder,
  episodeNumber,
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,
  eventType,
  annotatorName,
  onSaveAndNextStep,
}: MechanismPanelProps) {
  const mechanismAtoms = React.useMemo(() => {
    const base = eventType ? MECHANISM_OPTIONS[eventType] ?? [] : [];
    const labels = base.includes("Others") ? base : [...base, "Others"];

    return labels.map((label, index) => ({
      displayId: String(index + 1),
      label,
    }));
  }, [eventType]);

  const [selectedMechanisms, setSelectedMechanisms] = React.useState<string[]>([]);
  const [othersNote, setOthersNote] = React.useState("");
  const [selectedTriggers, setSelectedTriggers] = React.useState<TriggerOption[]>([]);
  const [triggerOthersNote, setTriggerOthersNote] = React.useState("");
  const [rankingNote, setRankingNote] = React.useState("");
  const [recordingTarget, setRecordingTarget] = React.useState<VoiceTarget>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);

  const pageOpenedAtRef = React.useRef<number | null>(null);
  const firstInteractionAtRef = React.useRef<number | null>(null);
  const firstTypingAtRef = React.useRef<number | null>(null);
  const firstVoiceStartAtRef = React.useRef<number | null>(null);
  const taskTimingRef = React.useRef<Record<MechanismTaskKey, TaskTiming>>(
    buildEmptyTaskTimingMap()
  );

  const hasOthersSelected = selectedMechanisms.includes("Others");
  const hasOthersTrigger = selectedTriggers.includes("Others");

  React.useEffect(() => {
    pageOpenedAtRef.current = Date.now();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    taskTimingRef.current = buildEmptyTaskTimingMap();
  }, [caseId, eventId]);

  React.useEffect(() => {
    setSelectedMechanisms([]);
    setOthersNote("");
    setSelectedTriggers([]);
    setTriggerOthersNote("");
    setRankingNote("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    taskTimingRef.current = buildEmptyTaskTimingMap();
  }, [eventType]);

  function markPageInteraction(mode: "typing" | "voice" | "select") {
    const now = Date.now();

    if (firstInteractionAtRef.current == null) {
      firstInteractionAtRef.current = now;
    }

    if (mode === "typing" && firstTypingAtRef.current == null) {
      firstTypingAtRef.current = now;
    }

    if (mode === "voice" && firstVoiceStartAtRef.current == null) {
      firstVoiceStartAtRef.current = now;
    }
  }

  function markTaskInteraction(
    taskKey: MechanismTaskKey,
    mode: "typing" | "voice" | "select"
  ) {
    const now = Date.now();
    const taskTiming = taskTimingRef.current[taskKey];

    if (taskTiming.startedAt == null) {
      taskTiming.startedAt = now;
    }

    if (taskTiming.firstInteractionAt == null) {
      taskTiming.firstInteractionAt = now;
    }

    if (mode === "typing" && taskTiming.firstTypingAt == null) {
      taskTiming.firstTypingAt = now;
    }

    if (mode === "voice" && taskTiming.firstVoiceStartAt == null) {
      taskTiming.firstVoiceStartAt = now;
    }

    if (mode === "select" && taskTiming.selectedAt == null) {
      taskTiming.selectedAt = now;
    }

    markPageInteraction(mode);
  }

  function toggleMechanism(label: string) {
    markTaskInteraction("task1_mechanism_labels", "select");

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

  function toggleTrigger(label: TriggerOption) {
    markTaskInteraction("task3_trigger", "select");

    setSelectedTriggers((prev) => {
      if (prev.includes(label)) {
        return prev.filter((item) => item !== label);
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

  React.useEffect(() => {
    if (!hasOthersTrigger) {
      setTriggerOthersNote("");
      if (recordingTarget === "triggerOthersNote") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [hasOthersTrigger, recordingTarget]);

  function validateMechanism() {
    if (!eventType) {
      return "Selected event type is missing. Please complete the detection step first.";
    }

    if (selectedMechanisms.length === 0) {
      return "Task 1 incomplete: please choose at least one mechanism label.";
    }

    if (hasOthersSelected && !othersNote.trim()) {
      return "Task 1 incomplete: please explain what you mean by 'Others'.";
    }

    if (!rankingNote.trim()) {
      return "Task 2 incomplete: please provide a confidence ranking note.";
    }

    if (selectedTriggers.length === 0) {
      return "Task 3 incomplete: please choose at least one trigger.";
    }

    if (hasOthersTrigger && !triggerOthersNote.trim()) {
      return "Task 3 incomplete: please describe the trigger when 'Others' is selected.";
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
      recognition.lang = ((typeof localStorage !== "undefined" && localStorage.getItem("speechRecognitionLanguage")) || (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hi") ? "hi-IN" : "en-US"));
      recognition.interimResults = true;
      recognition.continuous = true;

      let taskKey: MechanismTaskKey | null = null;
      if (target === "othersNote") taskKey = "task1_mechanism_labels";
      if (target === "rankingNote") taskKey = "task2_confidence_ranking";
      if (target === "triggerOthersNote") taskKey = "task3_trigger";

      if (taskKey) {
        markTaskInteraction(taskKey, "voice");
      }

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "othersNote") {
          setOthersNote(transcript);
        } else if (target === "rankingNote") {
          setRankingNote(transcript);
        } else if (target === "triggerOthersNote") {
          setTriggerOthersNote(transcript);
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
      const selectedMechanismAtoms = mechanismAtoms.filter((atom) =>
        selectedMechanisms.includes(atom.label)
      );

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,

        doctorId,
        accessCode,

        caseId,
        patientId,
        patientFolder,

        eventId,
        episodeId: episodeNumber ? `episode_${episodeNumber}` : eventId,

        panel: "mechanism_panel",
        action: "submit",
        task: "mechanism",

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
          eventType,
          startMin,
          endMin,
          tasks: {
            task1_mechanism_labels: {
              question: "Select the most likely 1–3 mechanism labels",
              answer: {
                selectedMechanisms,
                selectedMechanismAtoms,
                othersNote: othersNote.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task1_mechanism_labels.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task1_mechanism_labels.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task1_mechanism_labels.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task1_mechanism_labels.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task1_mechanism_labels.selectedAt
                ),
                submittedAt,
              },
            },
            task2_confidence_ranking: {
              question: "Ranking your Confidence in order",
              answer: rankingNote.trim(),
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task2_confidence_ranking.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task2_confidence_ranking.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task2_confidence_ranking.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task2_confidence_ranking.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task2_confidence_ranking.selectedAt
                ),
                submittedAt,
              },
            },
            task3_trigger: {
              question:
                "What was the trigger of this abnormal event? (multi-select allowed)",
              answer: {
                selectedTriggers,
                triggerOthersNote: triggerOthersNote.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task3_trigger.startedAt),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task3_trigger.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task3_trigger.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task3_trigger.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task3_trigger.selectedAt
                ),
                submittedAt,
              },
            },
          },
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
    setSelectedTriggers([]);
    setTriggerOthersNote("");
    setRankingNote("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");

    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    taskTimingRef.current = buildEmptyTaskTimingMap();
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
                {eventType ?? "Not selected"}
              </span>
            </div>

            {!eventType ? (
              <div className="text-sm text-red-500">
                Event type is missing. Please go back to the detection panel and select an abnormal event type first.
              </div>
            ) : mechanismAtoms.length === 0 ? (
              <div className="text-sm text-gray-500">
                No mechanism list configured for this event type yet.
              </div>
            ) : (
              <>
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

                {hasOthersSelected && (
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      If “Others”, please describe
                    </div>

                    <textarea
                      value={othersNote}
                      onChange={(e) => {
                        markTaskInteraction("task1_mechanism_labels", "typing");
                        setOthersNote(e.target.value);
                      }}
                      className="min-h-[110px] w-full rounded-md border px-3 py-3 text-sm text-gray-800 outline-none focus:border-orange-400"
                      placeholder="Briefly describe the mechanism if it is not covered by the predefined options."
                    />

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={
                          recordingTarget === "othersNote"
                            ? stopVoiceNote
                            : () => startVoiceNote("othersNote")
                        }
                        className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                          recordingTarget === "othersNote"
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-orange-400 hover:bg-orange-500"
                        }`}
                      >
                        {recordingTarget === "othersNote"
                          ? "Stop Voice Note"
                          : "Start Voice Note"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TaskBlock>

          <TaskBlock
            title="Task 2. Ranking your Confidence in order"
            titleRight={
              <InfoTooltip text="Briefly rank the selected mechanisms by confidence using the displayed numbers, for example: 4 > 2 > 1." />
            }
          >
            <textarea
              value={rankingNote}
              onChange={(e) => {
                markTaskInteraction("task2_confidence_ranking", "typing");
                setRankingNote(e.target.value);
              }}
              className="h-[72px] w-full max-w-[420px] rounded-md border px-3 py-2 text-sm text-gray-800 outline-none focus:border-orange-400"
              placeholder="Example: 4,2,1"
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

          <TaskBlock
            title="Task 3. What was the trigger of this abnormal event? (multi-select allowed)"
            titleRight={
              <InfoTooltip text="You can choose more than one trigger if clinically appropriate. If none of the predefined trigger options fits well, select 'Others' and briefly describe it." />
            }
            noBorder
          >
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_OPTIONS.map((trigger) => (
                <TriggerChip
                  key={trigger}
                  label={trigger}
                  selected={selectedTriggers.includes(trigger)}
                  onClick={() => toggleTrigger(trigger)}
                />
              ))}
            </div>

            {hasOthersTrigger && (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  If “Others”, please describe
                </div>

                <textarea
                  value={triggerOthersNote}
                  onChange={(e) => {
                    markTaskInteraction("task3_trigger", "typing");
                    setTriggerOthersNote(e.target.value);
                  }}
                  className="min-h-[110px] w-full rounded-md border px-3 py-3 text-sm text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Briefly describe the trigger if it is not covered by the predefined options."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "triggerOthersNote"
                        ? stopVoiceNote
                        : () => startVoiceNote("triggerOthersNote")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "triggerOthersNote"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "triggerOthersNote"
                      ? "Stop Voice Note"
                      : "Start Voice Note"}
                  </button>
                </div>
              </div>
            )}
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