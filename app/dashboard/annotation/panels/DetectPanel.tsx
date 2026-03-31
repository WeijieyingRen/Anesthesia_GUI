"use client";

import * as React from "react";
import type {
  DetectAnnotation,
  EventType,
  SeverityLevel,
  DetectVital,
  EpisodeEvolution,
  OverallCharacterization,
} from "../types";
import { submitAnnotation } from "@/lib/submit";

type DetectPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  annotation: DetectAnnotation;
  onChangeAnnotation: React.Dispatch<React.SetStateAction<DetectAnnotation>>;
  anesthesiaStart?: string | null;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type PreventionChoice = "Yes" | "No" | "Unclear" | "";
type PreventionFailureReason =
  | "Too late"
  | "Insufficient"
  | "Wrong target"
  | "Transient effect only"
  | "Ongoing deterioration despite treatment"
  | "Mixed / unclear"
  | "";

type VoiceTarget =
  | "note"
  | "eventTypeOther"
  | "overallInterpretationNote"
  | "failureNote"
  | "unclearNote"
  | null;

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

const SEVERITY_OPTIONS: SeverityLevel[] = ["Mild", "Moderate", "Severe"];

const EPISODE_EVOLUTION_OPTIONS: EpisodeEvolution[] = [
  "Sudden onset",
  "Gradual change",
  "Persistent abnormality",
  "Fluctuating pattern",
  "Recovering / resolving",
  "Worsening",
  "Mixed or unclear",
];

const OVERALL_CHARACTERIZATION_OPTIONS: OverallCharacterization[] = [
  "Expected physiologic change",
  "Expected treatment response",
  "Transient fluctuation / likely not clinically important",
  "Clinically significant abnormality",
  "Recovery / correction phase",
  "Mixed or unclear pattern",
  "Others",
];

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
    return "e.g. MAP decreased below baseline during this window, with mild compensatory tachycardia and no major change in SpO2.";
  }
  if (primaryVital === "SBP") {
    return "e.g. SBP decreased during this window, while DBP and HR showed partial compensation.";
  }
  if (primaryVital === "DBP") {
    return "e.g. DBP decreased during this window, with associated change in MAP and relatively stable oxygenation.";
  }
  if (primaryVital === "HR") {
    return "e.g. HR increased above baseline during this window, while MAP remained relatively stable and oxygenation was preserved.";
  }
  if (primaryVital === "SPO2") {
    return "e.g. SpO2 decreased during this window, without major concurrent change in MAP or HR.";
  }
  if (primaryVital === "RR") {
    return "e.g. RR decreased during this window, with a subsequent rise in ETCO2.";
  }
  if (primaryVital === "ETCO2") {
    return "e.g. ETCO2 increased progressively during this window, while MAP and HR remained relatively stable.";
  }
  if (primaryVital === "TEMP") {
    return "e.g. Temperature gradually decreased during this window without major hemodynamic instability.";
  }
  return "Describe the main abnormal change during this window.";
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

  const [preventionChoice, setPreventionChoice] =
    React.useState<PreventionChoice>("");
  const [failureReason, setFailureReason] =
    React.useState<PreventionFailureReason>("");
  const [failureNote, setFailureNote] = React.useState("");
  const [unclearNote, setUnclearNote] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const recognitionTargetRef = React.useRef<VoiceTarget>(null);
  const panelOpenedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  React.useEffect(() => {
    if (preventionChoice !== "Yes") {
      setFailureReason("");
      setFailureNote("");
      if (recordingTarget === "failureNote") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }

    if (preventionChoice !== "Unclear") {
      setUnclearNote("");
      if (recordingTarget === "unclearNote") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [preventionChoice, recordingTarget]);

  const selectedPrimaryVitals: DetectVital[] =
    annotation.primaryVitals && annotation.primaryVitals.length > 0
      ? annotation.primaryVitals
      : annotation.vital
      ? [annotation.vital]
      : [];

  const firstPrimaryVital = selectedPrimaryVitals[0] ?? null;

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
  const isOtherClinicalMeaning =
    annotation.overallCharacterization === "Others";

  function updateField<K extends keyof DetectAnnotation>(
    key: K,
    value: DetectAnnotation[K]
  ) {
    onChangeAnnotation((prev) => ({ ...prev, [key]: value }));
  }

  function togglePrimaryVital(vital: DetectVital) {
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

    if (annotation.eventType === "") {
      return "Task 2 incomplete: please select the primary event type.";
    }

    if (
      annotation.eventType !== "Others" &&
      !filteredEventTypeOptions.includes(annotation.eventType)
    ) {
      return "Task 2 incomplete: please select an event type consistent with the selected primary vital(s).";
    }

    if (
      annotation.eventType === "Others" &&
      !(annotation.eventTypeOther ?? "").trim()
    ) {
      return "Task 2 incomplete: please explain why 'Others' was selected.";
    }

    if (!annotation.note.trim()) {
      return "Task 3 incomplete: please describe the abnormal episode.";
    }

    if (annotation.episodeEvolution === "") {
      return "Task 4 incomplete: please select how the episode evolved.";
    }

    if (preventionChoice === "") {
      return "Task 5 incomplete: please choose Yes, No, or Unclear.";
    }

    if (preventionChoice === "Yes" && failureReason === "") {
      return "Task 5 incomplete: please select why the patient still progressed despite the preventive action.";
    }

    if (preventionChoice === "Unclear" && !unclearNote.trim()) {
      return "Task 5 incomplete: please describe what information is missing or unclear.";
    }

    if (annotation.overallCharacterization === "") {
      return "Task 6 incomplete: please describe the clinical meaning of this episode.";
    }

    if (
      annotation.overallCharacterization === "Others" &&
      !(annotation.overallInterpretationNote ?? "").trim()
    ) {
      return "Task 6 incomplete: please explain why 'Others' was selected for clinical meaning.";
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

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,
        caseId,
        eventId,
        panel: "detect_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          vital: annotation.vital,
          primaryVitals: selectedPrimaryVitals,
          startMin: annotation.startMin,
          endMin: annotation.endMin,
          eventType: annotation.eventType,
          eventTypeOther: (annotation.eventTypeOther ?? "").trim(),
          note: annotation.note.trim(),
          episodeEvolution: annotation.episodeEvolution,
          preventionChoice,
          failureReason,
          failureNote: failureNote.trim(),
          unclearNote: unclearNote.trim(),
          overallCharacterization: annotation.overallCharacterization,
          overallInterpretationNote: (
            annotation.overallInterpretationNote ?? ""
          ).trim(),
          severity: annotation.severity,
          confidence: annotation.confidence,
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

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        const currentTarget = recognitionTargetRef.current;
        if (!currentTarget) return;

        if (currentTarget === "failureNote") {
          setFailureNote(transcript);
          return;
        }

        if (currentTarget === "unclearNote") {
          setUnclearNote(transcript);
          return;
        }

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
      eventType: "",
      eventTypeOther: "",
      note: "",
      episodeEvolution: "",
      overallCharacterization: "",
      overallInterpretationNote: "",
      severity: "",
      confidence: null,
    }));
    setPreventionChoice("");
    setFailureReason("");
    setFailureNote("");
    setUnclearNote("");
    setRecordingTarget(null);
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
            title="Task 2. Select the primary event type"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">
                  How to choose the label
                </div>
                <div className="mt-1">
                  The available event types are filtered by the selected primary vital(s).
                </div>
                <div className="mt-1">
                  For example, HR will show Bradycardia / Tachycardia, while MAP/SBP/DBP will show Hypotension / Hypertension.
                </div>
                <div className="mt-1">
                  If none of the predefined labels fits well, select{" "}
                  <span className="font-semibold">Others</span> and briefly
                  explain why.
                </div>
              </>
            }
          >
            <select
              value={annotation.eventType}
              onChange={(e) =>
                updateField(
                  "eventType",
                  e.target.value as EventType | "Others" | ""
                )
              }
              className="w-full max-w-[320px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select event type</option>
              {filteredEventTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="mt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                If “Others”, please explain; or skip
              </div>

              <textarea
                value={annotation.eventTypeOther ?? ""}
                onChange={(e) =>
                  updateField("eventTypeOther", e.target.value as any)
                }
                disabled={!isOtherEventType}
                className="min-h-[90px] w-full max-w-[520px] rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-gray-400"
                placeholder={
                  isOtherEventType
                    ? "Briefly explain why none of the predefined event types fits this episode..."
                    : "This field is only required if 'Others' is selected."
                }
              />

              <div className="mt-3">
                <button
                  type="button"
                  onClick={
                    recordingTarget === "eventTypeOther"
                      ? stopVoiceNote
                      : () => startVoiceNote("eventTypeOther")
                  }
                  disabled={!isOtherEventType}
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                    !isOtherEventType
                      ? "cursor-not-allowed bg-gray-300"
                      : recordingTarget === "eventTypeOther"
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
          </TaskBlock>

          <TaskBlock
            title="Task 3. Briefly describe the primary abnormality and any associated changes in other vital signs during this episode."
            tooltip={
              <>
                <div className="font-semibold text-gray-800">
                  What to include
                </div>
                <div className="mt-1">
                  Describe the main abnormal change in the selected primary vital(s).
                </div>
                <div className="mt-1">
                  Include associated changes in other vital signs only if they
                  help explain the episode.
                </div>
                <div className="mt-1">
                  Focus on what was observed in this window, not the likely
                  mechanism.
                </div>
              </>
            }
          >
            <textarea
              value={annotation.note}
              onChange={(e) => updateField("note", e.target.value)}
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
          </TaskBlock>

          <TaskBlock
            title="Task 4. How did this episode evolve over time?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">
                  How to choose the trajectory
                </div>
                <div className="mt-1">
                  Select the option that best describes how the abnormality
                  unfolded within this window.
                </div>
              </>
            }
          >
            <select
              value={annotation.episodeEvolution}
              onChange={(e) =>
                updateField(
                  "episodeEvolution",
                  e.target.value as EpisodeEvolution | ""
                )
              }
              className="w-full max-w-[420px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select episode evolution</option>
              {EPISODE_EVOLUTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </TaskBlock>

          <TaskBlock
            title="Task 5. Before this abnormal event, was there any apparent preventive action intended to avoid or mitigate deterioration?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">How to answer</div>
                <div className="mt-1">
                  Answer based on the visible charted actions and surrounding
                  clinical context.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Yes</span> if there
                  appears to have been an action aimed at preventing or
                  mitigating deterioration before the event fully developed.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">No</span> if no such
                  preventive action is apparent.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Unclear</span> if the
                  intent or timing cannot be determined confidently.
                </div>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <OptionChip
                label="Yes"
                selected={preventionChoice === "Yes"}
                onClick={() => setPreventionChoice("Yes")}
              />
              <OptionChip
                label="No"
                selected={preventionChoice === "No"}
                onClick={() => setPreventionChoice("No")}
              />
              <OptionChip
                label="Unclear"
                selected={preventionChoice === "Unclear"}
                onClick={() => setPreventionChoice("Unclear")}
              />
            </div>
          </TaskBlock>

          {preventionChoice === "Yes" && (
            <TaskBlock
              title="If yes, why do you think the patient still progressed despite the preventive action?"
              tooltip={
                <>
                  <div className="font-semibold text-gray-800">
                    What this asks
                  </div>
                  <div className="mt-1">
                    This is not asking whether the action existed, but why it
                    may not have prevented deterioration.
                  </div>
                </>
              }
            >
              <div className="flex flex-wrap gap-2">
                {[
                  "Too late",
                  "Insufficient",
                  "Wrong target",
                  "Transient effect only",
                  "Ongoing deterioration despite treatment",
                  "Mixed / unclear",
                ].map((reason) => (
                  <OptionChip
                    key={reason}
                    label={reason}
                    selected={failureReason === reason}
                    onClick={() =>
                      setFailureReason(reason as PreventionFailureReason)
                    }
                    tone="blue"
                  />
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Optional note
                </div>
                <textarea
                  value={failureNote}
                  onChange={(e) => setFailureNote(e.target.value)}
                  className="min-h-[100px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Briefly explain if needed."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "failureNote"
                        ? stopVoiceNote
                        : () => startVoiceNote("failureNote")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "failureNote"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "failureNote"
                      ? "Stop Recording"
                      : "Start Recording"}
                  </button>
                </div>
              </div>
            </TaskBlock>
          )}

          {preventionChoice === "Unclear" && (
            <TaskBlock
              title="If unclear, what information is missing or unclear?"
              tooltip={
                <>
                  <div className="font-semibold text-gray-800">Examples</div>
                  <div className="mt-1">
                    Missing timing, dose, undocumented clinical intent, missing
                    physiologic signals, or incomplete charting.
                  </div>
                </>
              }
            >
              <textarea
                value={unclearNote}
                onChange={(e) => setUnclearNote(e.target.value)}
                className="min-h-[120px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                placeholder="Describe what information is missing or unclear."
              />

              <div className="mt-3">
                <button
                  type="button"
                  onClick={
                    recordingTarget === "unclearNote"
                      ? stopVoiceNote
                      : () => startVoiceNote("unclearNote")
                  }
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                    recordingTarget === "unclearNote"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-orange-400 hover:bg-orange-500"
                  }`}
                >
                  {recordingTarget === "unclearNote"
                    ? "Stop Recording"
                    : "Start Recording"}
                </button>
              </div>
            </TaskBlock>
          )}

          <TaskBlock
            title="Task 6. What is the overall clinical meaning of this episode?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">
                  How to interpret this episode
                </div>
                <div className="mt-1">
                  Choose the option that best summarizes the clinical meaning of
                  the selected window as a whole.
                </div>
              </>
            }
          >
            <select
              value={annotation.overallCharacterization}
              onChange={(e) =>
                updateField(
                  "overallCharacterization",
                  e.target.value as OverallCharacterization | ""
                )
              }
              className="w-full max-w-[520px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select overall characterization</option>
              {OVERALL_CHARACTERIZATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="mt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                If “Others”, please explain; or skip
              </div>

              <textarea
                value={annotation.overallInterpretationNote ?? ""}
                onChange={(e) =>
                  updateField(
                    "overallInterpretationNote",
                    e.target.value as any
                  )
                }
                disabled={!isOtherClinicalMeaning}
                className="min-h-[90px] w-full max-w-[520px] rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-gray-400"
                placeholder={
                  isOtherClinicalMeaning
                    ? "Briefly explain why none of the predefined interpretations fits this episode..."
                    : "This field is only required if 'Others' is selected."
                }
              />

              <div className="mt-3">
                <button
                  type="button"
                  onClick={
                    recordingTarget === "overallInterpretationNote"
                      ? stopVoiceNote
                      : () => startVoiceNote("overallInterpretationNote")
                  }
                  disabled={!isOtherClinicalMeaning}
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                    !isOtherClinicalMeaning
                      ? "cursor-not-allowed bg-gray-300"
                      : recordingTarget === "overallInterpretationNote"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-orange-400 hover:bg-orange-500"
                  }`}
                >
                  {recordingTarget === "overallInterpretationNote"
                    ? "Stop Recording"
                    : "Start Recording"}
                </button>
              </div>
            </div>
          </TaskBlock>

          <TaskBlock title="Task 7. Choose event severity based on your knowledge">
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
                  onClick={() =>
                    updateField("confidence", score as 1 | 2 | 3 | 4 | 5)
                  }
                />
              ))}
            </div>

            <div className="mt-2 text-xs text-gray-500">
              1 = very low confidence, 5 = very high confidence
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              Complete all required tasks before saving.
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