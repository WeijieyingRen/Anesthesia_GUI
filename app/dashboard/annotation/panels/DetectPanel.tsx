"use client";

import * as React from "react";
import type {
  DetectAnnotation,
  EventType,
  SeverityLevel,
  DetectVital,
} from "../types";
import { submitAnnotation } from "@/lib/submit";

type DetectPanelProps = {
  eventId?: string;
  caseId?: string;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;
  eventTitle?: string;
  episodeLabel?: string;
  annotation: DetectAnnotation;
  onChangeAnnotation: React.Dispatch<React.SetStateAction<DetectAnnotation>>;
  anesthesiaStart?: string | null;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";
type VoiceTarget = "note" | "eventTypeOther" | null;

type DetectTaskKey =
  | "task1_primary_vitals"
  | "task2_artifact"
  | "task3_event_type"
  | "task4_associated_changes"
  | "task5_onset_pattern"
  | "task6_episode_course"
  | "task7_severity"
  | "task8_confidence";

type TaskTiming = {
  startedAt: number | null;
  firstInteractionAt: number | null;
  firstTypingAt: number | null;
  firstVoiceStartAt: number | null;
  selectedAt: number | null;
};

const ALL_EVENT_TYPE_OPTIONS: (EventType | "Others")[] = [
  "Hypotension",
  "Hypertension",
  "Bradycardia",
  "Tachycardia",
  "Hypoxia",
  "Hypercapnia",
  "Hypocapnia",
  "Tachypnea",
  "Bradypnea",
  "Hypothermia",
  "Hyperthermia",
  "Others",
];

const VITAL_OPTIONS: DetectVital[] = [
  "MAP",
  "SBP",
  "DBP",
  "HR",
  "SPO2",
  "RR",
  "ETCO2",
  "TEMP",
];

const CONTINUE_ANNOTATION_OPTIONS = [
  "Yes, likely artifact",
  "No",
  "Unclear",
] as const;

const ONSET_PATTERN_OPTIONS = [
  "Sudden onset",
  "Gradual onset",
  "Unclear onset",
] as const;

const EPISODE_COURSE_OPTIONS = [
  "Persistent and stable abnormality",
  "Fluctuating pattern",
  "Improving or recovering",
  "Worsening",
  "Mixed / unclear",
] as const;

const SEVERITY_OPTIONS: SeverityLevel[] = ["Mild", "Moderate", "Severe"];

const EVENT_TYPES_BY_VITAL: Record<DetectVital, EventType[]> = {
  MAP: ["Hypotension", "Hypertension"],
  SBP: ["Hypotension", "Hypertension"],
  DBP: ["Hypotension", "Hypertension"],
  HR: ["Bradycardia", "Tachycardia"],
  SPO2: ["Hypoxia"],
  RR: ["Bradypnea", "Tachypnea"],
  ETCO2: ["Hypocapnia", "Hypercapnia"],
  TEMP: ["Hypothermia", "Hyperthermia"],
};

function buildEmptyTaskTiming(): TaskTiming {
  return {
    startedAt: null,
    firstInteractionAt: null,
    firstTypingAt: null,
    firstVoiceStartAt: null,
    selectedAt: null,
  };
}

function buildEmptyTaskTimingMap(): Record<DetectTaskKey, TaskTiming> {
  return {
    task1_primary_vitals: buildEmptyTaskTiming(),
    task2_artifact: buildEmptyTaskTiming(),
    task3_event_type: buildEmptyTaskTiming(),
    task4_associated_changes: buildEmptyTaskTiming(),
    task5_onset_pattern: buildEmptyTaskTiming(),
    task6_episode_course: buildEmptyTaskTiming(),
    task7_severity: buildEmptyTaskTiming(),
    task8_confidence: buildEmptyTaskTiming(),
  };
}

function toIsoOrNull(value: number | null) {
  if (value == null) return null;
  return new Date(value).toISOString();
}

function OptionChip({
  label,
  selected = false,
  onClick,
  tone = "orange",
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  tone?: "orange" | "blue";
}) {
  const selectedClass =
    tone === "blue"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-orange-400 bg-orange-400 text-white";

  const hoverClass =
    tone === "blue"
      ? "hover:border-blue-300 hover:text-blue-600"
      : "hover:border-orange-300 hover:text-orange-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? selectedClass
          : `border-gray-300 bg-white text-gray-700 ${hoverClass}`
      }`}
    >
      {label}
    </button>
  );
}

function ConfidencePill({
  value,
  selected,
  onClick,
}: {
  value: 1 | 2 | 3 | 4 | 5;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
        selected
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600"
      }`}
    >
      {value}
    </button>
  );
}

function InfoTooltip({ content }: { content: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className="relative ml-2 inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-500 hover:border-orange-300 hover:text-orange-500"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-white p-3 text-xs leading-5 text-gray-600 shadow-lg">
          {content}
        </div>
      )}
    </div>
  );
}

function getTask3Placeholder(primaryVital: DetectVital | null) {
  if (primaryVital === "MAP") {
    return "e.g. HR increased mildly during the MAP drop, while SpO2 remained stable.";
  }
  if (primaryVital === "SBP") {
    return "e.g. DBP and MAP also decreased, with mild compensatory tachycardia.";
  }
  if (primaryVital === "DBP") {
    return "e.g. MAP decreased in parallel, while HR remained relatively stable.";
  }
  if (primaryVital === "HR") {
    return "e.g. MAP decreased slightly during tachycardia, without major SpO2 change.";
  }
  if (primaryVital === "SPO2") {
    return "e.g. ETCO2 increased and RR decreased during the desaturation episode.";
  }
  if (primaryVital === "RR") {
    return "e.g. ETCO2 increased as RR decreased, while hemodynamics remained stable.";
  }
  if (primaryVital === "ETCO2") {
    return "e.g. RR decreased and SpO2 remained stable during the ETCO2 rise.";
  }
  if (primaryVital === "TEMP") {
    return "e.g. No major hemodynamic change, but temperature declined gradually throughout the window.";
  }
  return "Briefly describe any clinically relevant associated changes in other vital signs.";
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
  tooltip,
}: {
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className={`${noBorder ? "" : "border-b"} px-4 py-4`}>
      <div className="mb-3 flex items-center text-sm font-semibold text-gray-900">
        <span>{title}</span>
        {tooltip ? <InfoTooltip content={tooltip} /> : null}
      </div>
      {children}
    </div>
  );
}

function PrimaryVitalDropdown({
  options,
  selectedValues,
  onToggle,
}: {
  options: DetectVital[];
  selectedValues: DetectVital[];
  onToggle: (vital: DetectVital) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  let label = "Select primary vital(s)";
  if (selectedValues.length === 1) label = "1 selected";
  if (selectedValues.length > 1) label = `${selectedValues.length} selected`;

  return (
    <div ref={containerRef} className="relative w-full max-w-[240px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[52px] w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left text-base text-gray-800 outline-none transition hover:border-orange-300 focus:border-orange-400"
      >
        <span className={selectedValues.length > 0 ? "text-gray-900" : "text-gray-500"}>
          {label}
        </span>
        <span className="ml-3 text-sm text-gray-500">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-xl border bg-white p-2 shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {options.map((item) => {
              const checked = selectedValues.includes(item);

              return (
                <label
                  key={item}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                    checked
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(item)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="font-medium">{item}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DetectPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  patientId,
  patientFolder,
  episodeNumber,
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  annotation,
  onChangeAnnotation,
  anesthesiaStart = null,
  annotatorName,
  onSaveAndNextStep,
}: DetectPanelProps) {
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");
  const [recordingTarget, setRecordingTarget] =
    React.useState<VoiceTarget>(null);

  const recognitionRef = React.useRef<any>(null);
  const recognitionTargetRef = React.useRef<VoiceTarget>(null);

  const pageOpenedAtRef = React.useRef<number | null>(null);
  const firstInteractionAtRef = React.useRef<number | null>(null);
  const firstTypingAtRef = React.useRef<number | null>(null);
  const firstVoiceStartAtRef = React.useRef<number | null>(null);

  const taskTimingRef = React.useRef<Record<DetectTaskKey, TaskTiming>>(
    buildEmptyTaskTimingMap()
  );

  React.useEffect(() => {
    pageOpenedAtRef.current = Date.now();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    taskTimingRef.current = buildEmptyTaskTimingMap();
  }, [caseId, eventId]);

  function markPageInteraction() {
    if (firstInteractionAtRef.current == null) {
      firstInteractionAtRef.current = Date.now();
    }
  }

  function markTaskInteraction(
    taskKey: DetectTaskKey,
    mode: "select" | "typing" | "voice" | "interaction" = "interaction"
  ) {
    const now = Date.now();
    const task = taskTimingRef.current[taskKey];

    if (task.startedAt == null) {
      task.startedAt = now;
    }
    if (task.firstInteractionAt == null) {
      task.firstInteractionAt = now;
    }

    if (mode === "select") {
      task.selectedAt = now;
    }
    if (mode === "typing" && task.firstTypingAt == null) {
      task.firstTypingAt = now;
    }
    if (mode === "voice" && task.firstVoiceStartAt == null) {
      task.firstVoiceStartAt = now;
    }

    markPageInteraction();

    if (mode === "typing" && firstTypingAtRef.current == null) {
      firstTypingAtRef.current = now;
    }
    if (mode === "voice" && firstVoiceStartAtRef.current == null) {
      firstVoiceStartAtRef.current = now;
    }
  }

  React.useEffect(() => {
    if (annotation.associatedChanges !== "Yes") {
      if (annotation.note) {
        onChangeAnnotation((prev) => ({
          ...prev,
          note: "",
        }));
      }

      if (recordingTarget === "note") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [
    annotation.associatedChanges,
    annotation.note,
    onChangeAnnotation,
    recordingTarget,
  ]);

  const selectedPrimaryVitals: DetectVital[] =
    annotation.primaryVitals && annotation.primaryVitals.length > 0
      ? annotation.primaryVitals
      : annotation.vital
        ? [annotation.vital]
        : [];

  const firstPrimaryVital = selectedPrimaryVitals[0] ?? null;

  const isArtifact =
    annotation.shouldContinueAnnotation === "Yes, likely artifact";

  const shouldContinue =
    annotation.shouldContinueAnnotation === "No" ||
    annotation.shouldContinueAnnotation === "Unclear";

  const filteredEventTypeOptions: (EventType | "Others")[] = React.useMemo(() => {
    if (selectedPrimaryVitals.length === 0) {
      return ALL_EVENT_TYPE_OPTIONS;
    }

    const union = new Set<EventType>();
    selectedPrimaryVitals.forEach((vital) => {
      EVENT_TYPES_BY_VITAL[vital].forEach((evt) => union.add(evt));
    });

    return [...Array.from(union), "Others"];
  }, [selectedPrimaryVitals]);

  const isOtherEventType = annotation.eventType === "Others";

  function updateField<K extends keyof DetectAnnotation>(
    key: K,
    value: DetectAnnotation[K]
  ) {
    onChangeAnnotation((prev) => ({ ...prev, [key]: value }));
  }

  function togglePrimaryVital(vital: DetectVital) {
    markTaskInteraction("task1_primary_vitals", "select");

    const current = selectedPrimaryVitals;
    const exists = current.includes(vital);

    const next = exists
      ? current.filter((v) => v !== vital)
      : [...current, vital];

    const nextPrimary = next[0] ?? annotation.vital ?? "MAP";

    onChangeAnnotation((prev) => {
      const currentEventType = prev.eventType;
      const nextAllowed = new Set<EventType>();

      next.forEach((v) => {
        EVENT_TYPES_BY_VITAL[v].forEach((evt) => nextAllowed.add(evt));
      });

      const shouldClearEventType =
        currentEventType !== "" &&
        currentEventType !== "Others" &&
        !nextAllowed.has(currentEventType as EventType);

      return {
        ...prev,
        vital: nextPrimary,
        primaryVitals: next,
        eventType: shouldClearEventType ? "" : prev.eventType,
      };
    });
  }

  function validateDetection(): string | null {
    if (selectedPrimaryVitals.length === 0) {
      return "Task 1 incomplete: please confirm at least one primary vital.";
    }

    if (annotation.shouldContinueAnnotation === "") {
      return "Task 2 incomplete: please decide whether this episode should proceed to full annotation.";
    }

    if (isArtifact) {
      if (
        annotation.confidence === null ||
        annotation.confidence === undefined ||
        Number.isNaN(annotation.confidence)
      ) {
        return "Confidence incomplete: please select confidence from 1 to 5.";
      }
      return null;
    }

    if (annotation.shouldContinueAnnotation === "Unclear") {
      if (
        annotation.confidence === null ||
        annotation.confidence === undefined ||
        Number.isNaN(annotation.confidence)
      ) {
        return "Confidence incomplete: please select confidence from 1 to 5.";
      }
      return null;
    }

    if (annotation.eventType === "") {
      return "Task 3 incomplete: please select the primary event type.";
    }

    if (
      annotation.eventType !== "Others" &&
      !filteredEventTypeOptions.includes(annotation.eventType)
    ) {
      return "Task 3 incomplete: please select an event type consistent with the selected primary vital(s).";
    }

    if (
      annotation.eventType === "Others" &&
      !(annotation.eventTypeOther ?? "").trim()
    ) {
      return "Task 3 incomplete: please explain why 'Others' was selected.";
    }

    if (annotation.associatedChanges === "") {
      return "Task 4 incomplete: please indicate whether there were associated changes in other vital signs.";
    }

    if (annotation.associatedChanges === "Yes" && !annotation.note.trim()) {
      return "Task 4 incomplete: please describe the associated changes in other vital signs.";
    }

    if (annotation.onsetPattern === "") {
      return "Task 5 incomplete: please select the onset pattern.";
    }

    if (annotation.episodeCourse === "") {
      return "Task 6 incomplete: please select the course within this window.";
    }

    if (annotation.severity === "") {
      return "Task 7 incomplete: please choose the severity.";
    }

    if (
      annotation.confidence === null ||
      annotation.confidence === undefined ||
      Number.isNaN(annotation.confidence)
    ) {
      return "Task 8 incomplete: please select confidence from 1 to 5.";
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

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,

        doctorId,
        accessCode,

        caseId,
        patientId,
        patientFolder,

        eventId,
        episodeId: episodeNumber ? `episode_${episodeNumber}` : eventId,

        panel: "detect_panel",
        action: "submit",
        task: "detection",

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
          vital: annotation.vital,
          primaryVitals: selectedPrimaryVitals,
          startMin: annotation.startMin,
          endMin: annotation.endMin,
          tasks: {
            task1_primary_vitals: {
              question:
                "Confirm bounding box window and primary vital(s) (select on the right chart).",
              answer: {
                vital: annotation.vital,
                primaryVitals: selectedPrimaryVitals,
                startMin: annotation.startMin,
                endMin: annotation.endMin,
              },
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task1_primary_vitals.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task1_primary_vitals.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task1_primary_vitals.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task1_primary_vitals.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task1_primary_vitals.selectedAt),
                submittedAt,
              },
            },
            task2_artifact: {
              question: "Is this episode likely an artifact?",
              answer: annotation.shouldContinueAnnotation,
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task2_artifact.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task2_artifact.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task2_artifact.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task2_artifact.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task2_artifact.selectedAt),
                submittedAt,
              },
            },
            task3_event_type: {
              question: "Select the primary event type",
              answer: {
                eventType: annotation.eventType,
                eventTypeOther: (annotation.eventTypeOther ?? "").trim(),
              },
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task3_event_type.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task3_event_type.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task3_event_type.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task3_event_type.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task3_event_type.selectedAt),
                submittedAt,
              },
            },
            task4_associated_changes: {
              question:
                "Were there associated changes in other vital signs during this episode?",
              answer: {
                associatedChanges: annotation.associatedChanges,
                note: annotation.note.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task4_associated_changes.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task4_associated_changes.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task4_associated_changes.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task4_associated_changes.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task4_associated_changes.selectedAt),
                submittedAt,
              },
            },
            task5_onset_pattern: {
              question: "What was the onset pattern?",
              answer: annotation.onsetPattern,
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task5_onset_pattern.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task5_onset_pattern.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task5_onset_pattern.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task5_onset_pattern.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task5_onset_pattern.selectedAt),
                submittedAt,
              },
            },
            task6_episode_course: {
              question: "How did the episode evolve within this window?",
              answer: annotation.episodeCourse,
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task6_episode_course.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task6_episode_course.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task6_episode_course.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task6_episode_course.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task6_episode_course.selectedAt),
                submittedAt,
              },
            },
            task7_severity: {
              question: "How severe was this event?",
              answer: annotation.severity,
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task7_severity.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task7_severity.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task7_severity.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task7_severity.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task7_severity.selectedAt),
                submittedAt,
              },
            },
            task8_confidence: {
              question: "Confidence in assessment",
              answer: annotation.confidence,
              timing: {
                startedAt: toIsoOrNull(taskTimingRef.current.task8_confidence.startedAt),
                firstInteractionAt: toIsoOrNull(taskTimingRef.current.task8_confidence.firstInteractionAt),
                firstTypingAt: toIsoOrNull(taskTimingRef.current.task8_confidence.firstTypingAt),
                firstVoiceStartAt: toIsoOrNull(taskTimingRef.current.task8_confidence.firstVoiceStartAt),
                selectedAt: toIsoOrNull(taskTimingRef.current.task8_confidence.selectedAt),
                submittedAt,
              },
            },
          },
        },
      });

      setSaveStatus("success");
      setSaveMessage("Detection annotation saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save detection annotation.");
    }
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

      recognitionTargetRef.current = target;

      const taskKey: DetectTaskKey =
        target === "eventTypeOther"
          ? "task3_event_type"
          : "task4_associated_changes";

      markTaskInteraction(taskKey, "voice");

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        const currentTarget = recognitionTargetRef.current;
        if (!currentTarget) return;

        updateField(currentTarget as keyof DetectAnnotation, transcript as any);
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

  function handleReset() {
    onChangeAnnotation((prev) => ({
      ...prev,
      vital: prev.vital ?? "MAP",
      primaryVitals: [],
      shouldContinueAnnotation: "",
      eventType: "",
      eventTypeOther: "",
      associatedChanges: "",
      note: "",
      onsetPattern: "",
      episodeCourse: "",
      severity: "",
      confidence: null,
    }));
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
    taskTimingRef.current = buildEmptyTaskTimingMap();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 1: Detect patient abnormal physiology events.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Confirm bounding box window and primary vital(s) (select on the right chart).">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_110px_110px]">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Primary vital(s)
                </div>

                <PrimaryVitalDropdown
                  options={VITAL_OPTIONS}
                  selectedValues={selectedPrimaryVitals}
                  onToggle={togglePrimaryVital}
                />
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Start
                </div>
                <input
                  value={formatClockTime(annotation.startMin, anesthesiaStart)}
                  readOnly
                  className="h-[52px] w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                />
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  End
                </div>
                <input
                  value={formatClockTime(annotation.endMin, anesthesiaStart)}
                  readOnly
                  className="h-[52px] w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                />
              </div>
            </div>
          </TaskBlock>

          <TaskBlock
            title="Task 2. Is this episode likely an artifact?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">
                  How to decide
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Yes</span> if this episode is likely artifact, noise, or not clinically meaningful.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">No</span> if this is a real abnormal event and should continue to full annotation.
                </div>
              </>
            }
          >
            <select
              value={annotation.shouldContinueAnnotation}
              onChange={(e) => {
                markTaskInteraction("task2_artifact", "select");
                updateField(
                  "shouldContinueAnnotation",
                  e.target.value as DetectAnnotation["shouldContinueAnnotation"]
                );
              }}
              className="w-full max-w-[420px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select artifact decision</option>
              {CONTINUE_ANNOTATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </TaskBlock>

          {shouldContinue && annotation.shouldContinueAnnotation !== "" && (
            <>
              <TaskBlock
                title="Task 3. Select the primary event type"
                tooltip={
                  <>
                    <div className="font-semibold text-gray-800">
                      How to choose the label
                    </div>
                    <div className="mt-1">
                      The available event types are filtered by the selected primary vital(s).
                    </div>
                    <div className="mt-1">
                      For example, HR shows bradycardia or tachycardia, while MAP/SBP/DBP show hypotension or hypertension.
                    </div>
                    <div className="mt-1">
                      You may also choose Normal physiologic dynamic if the selected window reflects a clinically meaningful but expected physiologic change rather than a harmful abnormality.
                    </div>
                    <div className="mt-1">
                      If none of the predefined labels fits well, select{" "}
                      <span className="font-semibold">Others</span> and briefly explain why.
                    </div>
                  </>
                }
              >
                <select
                  value={annotation.eventType}
                  onChange={(e) => {
                    markTaskInteraction("task3_event_type", "select");
                    updateField(
                      "eventType",
                      e.target.value as EventType | "Others" | ""
                    );
                  }}
                  className="w-full max-w-[320px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  <option value="">Select event type</option>
                  {filteredEventTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                {isOtherEventType && (
                  <div className="mt-4 max-w-[420px]">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      If “Others”, please explain
                    </div>

                    <textarea
                      value={annotation.eventTypeOther ?? ""}
                      onChange={(e) => {
                        markTaskInteraction("task3_event_type", "typing");
                        updateField("eventTypeOther", e.target.value as any);
                      }}
                      className="min-h-[64px] w-full rounded-md border px-3 py-2 text-sm text-gray-800 outline-none focus:border-orange-400"
                      placeholder="Briefly explain..."
                    />

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={
                          recordingTarget === "eventTypeOther"
                            ? stopVoiceNote
                            : () => startVoiceNote("eventTypeOther")
                        }
                        className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                          recordingTarget === "eventTypeOther"
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-orange-400 hover:bg-orange-500"
                        }`}
                      >
                        {recordingTarget === "eventTypeOther"
                          ? "Stop Recording"
                          : "Start Recording"}
                      </button>
                    </div>
                  </div>
                )}
              </TaskBlock>

              <TaskBlock
                title="Task 4. Were there associated changes in other vital signs during this episode?"
                tooltip={
                  <>
                    <div className="font-semibold text-gray-800">
                      What to include
                    </div>
                    <div className="mt-1">
                      Indicate whether other vital signs changed in a clinically relevant way during this episode.
                    </div>
                    <div className="mt-1">
                      If yes, briefly describe only the associated changes.
                    </div>
                    <div className="mt-1">
                      Focus on what was observed in this window, not the likely mechanism.
                    </div>
                  </>
                }
              >
                <div className="flex flex-wrap gap-2">
                  <OptionChip
                    label="Yes"
                    selected={annotation.associatedChanges === "Yes"}
                    onClick={() => {
                      markTaskInteraction("task4_associated_changes", "select");
                      updateField("associatedChanges", "Yes");
                    }}
                  />
                  <OptionChip
                    label="No"
                    selected={annotation.associatedChanges === "No"}
                    onClick={() => {
                      markTaskInteraction("task4_associated_changes", "select");
                      updateField("associatedChanges", "No");
                    }}
                  />
                  <OptionChip
                    label="Unclear"
                    selected={annotation.associatedChanges === "Unclear"}
                    onClick={() => {
                      markTaskInteraction("task4_associated_changes", "select");
                      updateField("associatedChanges", "Unclear");
                    }}
                  />
                </div>

                {annotation.associatedChanges === "Yes" && (
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Briefly describe the associated changes
                    </div>

                    <textarea
                      value={annotation.note}
                      onChange={(e) => {
                        markTaskInteraction("task4_associated_changes", "typing");
                        updateField("note", e.target.value);
                      }}
                      className="min-h-[120px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                      placeholder={getTask3Placeholder(firstPrimaryVital)}
                    />

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={
                          recordingTarget === "note"
                            ? stopVoiceNote
                            : () => startVoiceNote("note")
                        }
                        className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                          recordingTarget === "note"
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-orange-400 hover:bg-orange-500"
                        }`}
                      >
                        {recordingTarget === "note"
                          ? "Stop Recording"
                          : "Start Recording"}
                      </button>
                    </div>
                  </div>
                )}
              </TaskBlock>

              <TaskBlock
                title="Task 5. What was the onset pattern?"
                tooltip={
                  <>
                    <div className="font-semibold text-gray-800">
                      How to choose onset
                    </div>
                    <div className="mt-1">
                      Use this to describe how the episode began.
                    </div>
                  </>
                }
              >
                <select
                  value={annotation.onsetPattern}
                  onChange={(e) => {
                    markTaskInteraction("task5_onset_pattern", "select");
                    updateField(
                      "onsetPattern",
                      e.target.value as DetectAnnotation["onsetPattern"]
                    );
                  }}
                  className="w-full max-w-[320px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  <option value="">Select onset pattern</option>
                  {ONSET_PATTERN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </TaskBlock>

              <TaskBlock
                title="Task 6. How did the episode evolve within this window?"
                tooltip={
                  <>
                    <div className="font-semibold text-gray-800">
                      How to choose the course
                    </div>
                    <div className="mt-1">
                      Use this to describe the temporal course after onset within the selected window.
                    </div>
                  </>
                }
              >
                <select
                  value={annotation.episodeCourse}
                  onChange={(e) => {
                    markTaskInteraction("task6_episode_course", "select");
                    updateField(
                      "episodeCourse",
                      e.target.value as DetectAnnotation["episodeCourse"]
                    );
                  }}
                  className="w-full max-w-[360px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  <option value="">Select episode course</option>
                  {EPISODE_COURSE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </TaskBlock>

              <TaskBlock title="Task 7. How severe was this event?">
                <select
                  value={annotation.severity}
                  onChange={(e) => {
                    markTaskInteraction("task7_severity", "select");
                    updateField("severity", e.target.value as DetectAnnotation["severity"]);
                  }}
                  className="w-full max-w-[260px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  <option value="">Select severity</option>
                  {SEVERITY_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </TaskBlock>
            </>
          )}

          <TaskBlock title="Task 8. Confidence in assessment" noBorder>
            <div className="mb-3 text-sm text-gray-600">
              How confident are you in your detection assessment?
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <ConfidencePill
                  key={score}
                  value={score as 1 | 2 | 3 | 4 | 5}
                  selected={annotation.confidence === score}
                  onClick={() => {
                    markTaskInteraction("task8_confidence", "select");
                    updateField("confidence", score as 1 | 2 | 3 | 4 | 5);
                  }}
                />
              ))}
            </div>

            <div className="mt-2 text-xs text-gray-500">
              1 = very low confidence, 5 = very high confidence
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div
              className={`mb-3 text-sm ${
                isArtifact ? "text-red-700 font-semibold" : "text-gray-500"
              }`}
            >
              {isArtifact
                ? "Artifact selected: no further annotation is required for this episode."
                : "Complete all required tasks before saving."}
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
                {saveStatus === "saving"
                  ? "Saving..."
                  : isArtifact
                    ? "Save & Next Episode"
                    : "Save & Next Step"}
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