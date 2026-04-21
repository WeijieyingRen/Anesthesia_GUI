"use client";

import * as React from "react";
import type { TimeValuePoint } from "@/lib/types";
import { submitAnnotation } from "@/lib/submit";

type InterventionEvalPanelProps = {
  eventId?: string;
  caseId?: string;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;

  medBolusRows?: any[];
  medInfusionRows?: any[];
  fluidInRows?: any[];
  fluidOutRows?: any[];
  gasData?: Record<string, TimeValuePoint[] | undefined>;

  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type ReplaceableChoice = "Yes" | "No" | "";
type PreventionChoice = "Yes" | "No" | "Unclear" | "";
type SaveStatus = "idle" | "saving" | "success" | "error";
type OverallJudgmentValue =
  | "Appropriate overall"
  | "Partially appropriate"
  | "Uncertain"
  | "";

type ResponseCourseChoice =
  | "Improved after intervention"
  | "No clear change"
  | "Worsened despite intervention"
  | "Fluctuating / mixed"
  | "No relevant intervention"
  | "Unclear"
  | "";

type VoiceTarget =
  | "overall"
  | "preventionHypothesis"
  | "response"
  | "purpose"
  | "replaceable"
  | null;

type TreatmentCandidate = {
  id: string;
  label: string;
  modality: "Medication" | "Fluid" | "Gas / Ventilation";
};

type InterventionTaskKey =
  | "task1_overall_appropriateness"
  | "task2_relevant_treatments"
  | "task3_preventive_attempt"
  | "task4_response_course"
  | "task5_response_summary"
  | "task6_nonrelevant_purpose"
  | "task7_reasonable_alternative";

type TaskTiming = {
  startedAt: number | null;
  firstInteractionAt: number | null;
  firstTypingAt: number | null;
  firstVoiceStartAt: number | null;
  selectedAt: number | null;
};

const OVERALL_JUDGMENT_OPTIONS: OverallJudgmentValue[] = [
  "Appropriate overall",
  "Partially appropriate",
  "Uncertain",
];

const RESPONSE_COURSE_OPTIONS: Exclude<ResponseCourseChoice, "">[] = [
  "Improved after intervention",
  "No clear change",
  "Worsened despite intervention",
  "Fluctuating / mixed",
  "No relevant intervention",
  "Unclear",
];

function buildEmptyTaskTimingMap(): Record<InterventionTaskKey, TaskTiming> {
  return {
    task1_overall_appropriateness: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task2_relevant_treatments: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task3_preventive_attempt: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task4_response_course: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task5_response_summary: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task6_nonrelevant_purpose: {
      startedAt: null,
      firstInteractionAt: null,
      firstTypingAt: null,
      firstVoiceStartAt: null,
      selectedAt: null,
    },
    task7_reasonable_alternative: {
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
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-white p-3 text-xs leading-5 text-gray-600 shadow-lg">
          {content}
        </div>
      )}
    </div>
  );
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

function SelectionPill({
  label,
  selected,
  onClick,
  disabled = false,
  selectedTone = "green",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  selectedTone?: "green" | "blue" | "orange";
}) {
  const toneClass =
    selectedTone === "green"
      ? "border-green-500 bg-green-100 text-green-700"
      : selectedTone === "blue"
        ? "border-sky-500 bg-sky-100 text-sky-700"
        : "border-orange-400 bg-orange-100 text-orange-700";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? toneClass
          : disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900"
      }`}
    >
      {label}
    </button>
  );
}

function cleanText(v: any) {
  return String(v ?? "").trim();
}

function toFiniteNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstFiniteNumber(...values: any[]): number | null {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getWindow(startMin: number, endMin: number) {
  return {
    windowStart: Number(startMin) - 5,
    windowEnd: Number(endMin) + 5,
  };
}

function formatAbsoluteTime(rawTime: any) {
  if (!rawTime) return "";

  const dt = new Date(rawTime);
  if (Number.isNaN(dt.getTime())) return "";

  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function formatDose(item: any) {
  const dose = item?.dose;
  const unit = cleanText(item?.unit);

  if (dose === undefined || dose === null || String(dose).trim() === "") {
    return "";
  }

  return `${dose}${unit ? ` ${unit}` : ""}`;
}

function roundSmart(v: number) {
  if (Math.abs(v) >= 10) return Math.round(v);
  if (Math.abs(v) >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

/* -------------------- MEDICATION EXTRACTION -------------------- */

function normalizeMedicationName(item: any) {
  return (
    item?.medication ??
    item?.med_concept_desc ??
    item?.name ??
    item?.label ??
    "Unknown medication"
  );
}

function sumNumeric(values: any[]) {
  return values.reduce((acc, v) => {
    const n = Number(v);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
}

function extractMedicationCandidates(
  medBolusRows: any[] = [],
  medInfusionRows: any[] = [],
  startMin: number,
  endMin: number
): TreatmentCandidate[] {
  const { windowStart, windowEnd } = getWindow(startMin, endMin);

  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) {
    return [];
  }

  const results: TreatmentCandidate[] = [];
  const seen = new Set<string>();

  function pushCandidate(label: string) {
    const id = `med::${label}`;
    if (!seen.has(id)) {
      seen.add(id);
      results.push({
        id,
        label,
        modality: "Medication",
      });
    }
  }

  const bolusGroups = new Map<string, any[]>();

  for (const item of medBolusRows ?? []) {
    const t = Number(item?.relative_anesthesia_time);
    if (!Number.isFinite(t)) continue;
    if (t < windowStart || t > windowEnd) continue;

    const name = normalizeMedicationName(item);
    if (!bolusGroups.has(name)) bolusGroups.set(name, []);
    bolusGroups.get(name)!.push(item);
  }

  for (const [name, items] of bolusGroups.entries()) {
    const sorted = [...items].sort(
      (a, b) =>
        Number(a?.relative_anesthesia_time ?? 0) -
        Number(b?.relative_anesthesia_time ?? 0)
    );

    const times = sorted.map(
      (x) =>
        formatAbsoluteTime(x?.observation_time) ||
        `${Math.round(Number(x?.relative_anesthesia_time))} min`
    );

    const doses = sorted.map((x) => x?.dose);
    const units = Array.from(
      new Set(sorted.map((x) => cleanText(x?.unit)).filter(Boolean))
    );
    const totalDose = sumNumeric(doses);
    const unitText = units.length === 1 ? units[0] : units.join("/");

    const label =
      sorted.length === 1
        ? `${name} @ ${times[0]}${
            formatDose(sorted[0]) ? ` (${formatDose(sorted[0])})` : ""
          }`
        : `${name} (${sorted.length} boluses, ${times.join(", ")}${
            Number.isFinite(totalDose) && totalDose > 0
              ? `; total ${totalDose}${unitText ? ` ${unitText}` : ""}`
              : ""
          })`;

    pushCandidate(label);
  }

  const infusionGroups = new Map<string, any[]>();

  for (const item of medInfusionRows ?? []) {
    const s = Number(item?.relative_anesthesia_start);
    const e = Number(item?.relative_anesthesia_end);

    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;

    const overlaps = e >= windowStart && s <= windowEnd;
    if (!overlaps) continue;

    const name = normalizeMedicationName(item);
    if (!infusionGroups.has(name)) infusionGroups.set(name, []);
    infusionGroups.get(name)!.push(item);
  }

  for (const [name, segments] of infusionGroups.entries()) {
    const sorted = [...segments].sort(
      (a, b) =>
        Number(a?.relative_anesthesia_start ?? 0) -
        Number(b?.relative_anesthesia_start ?? 0)
    );

    const firstSeg = sorted[0];
    const lastSeg = sorted[sorted.length - 1];

    const displayStart =
      formatAbsoluteTime(firstSeg?.start_time) ||
      `${Math.round(Number(firstSeg?.relative_anesthesia_start))} min`;

    const displayEnd =
      formatAbsoluteTime(lastSeg?.end_time) ||
      `${Math.round(Number(lastSeg?.relative_anesthesia_end))} min`;

    const segmentDescriptions = sorted.map((seg) => {
      const segStart =
        formatAbsoluteTime(seg?.start_time) ||
        `${Math.round(Number(seg?.relative_anesthesia_start))} min`;

      const segEnd =
        formatAbsoluteTime(seg?.end_time) ||
        `${Math.round(Number(seg?.relative_anesthesia_end))} min`;

      const doseText = formatDose(seg);

      return doseText
        ? `${segStart}-${segEnd}: ${doseText}`
        : `${segStart}-${segEnd}`;
    });

    const label = `${name} infusion @ ${displayStart}-${displayEnd} [${segmentDescriptions.join(
      "; "
    )}]`;

    pushCandidate(label);
  }

  return results;
}

/* -------------------- FLUID EXTRACTION -------------------- */

function normalizeFluidName(item: any) {
  return (
    cleanText(item?.fluid_name) ||
    cleanText(item?.output_name) ||
    cleanText(item?.concept_name) ||
    cleanText(item?.name) ||
    "Unknown fluid"
  );
}

function inferFluidType(item: any): "input-bolus" | "input-infusion" | "output" {
  const unit = cleanText(item?.unit).toLowerCase();
  const ioType = Number(item?.io_type);

  if (ioType === 2) return "output";
  if (unit.includes("/hr")) return "input-infusion";
  return "input-bolus";
}

function buildFluidCandidateLabel(item: any) {
  const type = inferFluidType(item);
  const name = normalizeFluidName(item);
  const doseText = formatDose(item);

  const timeText =
    formatAbsoluteTime(item?.start_time) ||
    formatAbsoluteTime(item?.observation_time) ||
    formatAbsoluteTime(item?.end_time);

  const relStart = firstFiniteNumber(
    item?.relative_anesthesia_start,
    item?.relative_anesthesia_time,
    item?.relative_anesthesia_end
  );

  const relEnd = firstFiniteNumber(item?.relative_anesthesia_end);

  const route = cleanText(item?.route);

  let typeText = "";
  if (type === "input-bolus") typeText = "input bolus";
  if (type === "input-infusion") typeText = "input infusion";
  if (type === "output") typeText = "output";

  if (type === "input-infusion") {
    const relRange =
      relStart !== null && relEnd !== null
        ? `${Math.round(relStart)}-${Math.round(relEnd)} min`
        : relStart !== null
          ? `${Math.round(relStart)} min`
          : "";

    const absRange =
      cleanText(item?.start_time) && cleanText(item?.end_time)
        ? `${formatAbsoluteTime(item?.start_time)}-${formatAbsoluteTime(
            item?.end_time
          )}`
        : "";

    const rangeText = absRange || relRange;

    return `${name} [${typeText}]${rangeText ? ` @ ${rangeText}` : ""}${
      doseText ? ` (${doseText})` : ""
    }${route ? ` [${route}]` : ""}`;
  }

  const singleTime =
    timeText || (relStart !== null ? `${Math.round(relStart)} min` : "");

  return `${name} [${typeText}]${singleTime ? ` @ ${singleTime}` : ""}${
    doseText ? ` (${doseText})` : ""
  }${route ? ` [${route}]` : ""}`;
}

function extractFluidCandidates(
  fluidInRows: any[] = [],
  fluidOutRows: any[] = [],
  startMin: number,
  endMin: number
): TreatmentCandidate[] {
  const { windowStart, windowEnd } = getWindow(startMin, endMin);

  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) {
    return [];
  }

  const results: TreatmentCandidate[] = [];
  const seen = new Set<string>();

  function pushLabel(label: string) {
    const id = `fluid::${label}`;
    if (!seen.has(id)) {
      seen.add(id);
      results.push({
        id,
        label,
        modality: "Fluid",
      });
    }
  }

  for (const item of fluidInRows ?? []) {
    const type = inferFluidType(item);

    if (type === "input-infusion") {
      const s = toFiniteNumber(item?.relative_anesthesia_start);
      const e = firstFiniteNumber(
        item?.relative_anesthesia_end,
        item?.relative_anesthesia_start
      );
      if (s === null || e === null) continue;

      const overlaps = e >= windowStart && s <= windowEnd;
      if (!overlaps) continue;

      pushLabel(buildFluidCandidateLabel(item));
    } else {
      const t = firstFiniteNumber(
        item?.relative_anesthesia_start,
        item?.relative_anesthesia_time
      );
      if (t === null) continue;
      if (t < windowStart || t > windowEnd) continue;

      pushLabel(buildFluidCandidateLabel(item));
    }
  }

  for (const item of fluidOutRows ?? []) {
    const t = firstFiniteNumber(
      item?.relative_anesthesia_start,
      item?.relative_anesthesia_time
    );
    if (t === null) continue;
    if (t < windowStart || t > windowEnd) continue;

    pushLabel(buildFluidCandidateLabel(item));
  }

  return results;
}

/* -------------------- GAS EXTRACTION -------------------- */

function extractGasCandidates(
  gasData: Record<string, TimeValuePoint[] | undefined> = {},
  startMin: number,
  endMin: number
): TreatmentCandidate[] {
  const { windowStart, windowEnd } = getWindow(startMin, endMin);

  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return [];

  const keyAliases: Array<{ display: string; keys: string[] }> = [
    { display: "FiO2", keys: ["FiO2", "FIO2"] },
    { display: "MAC exhaled", keys: ["etMAC exhaled", "MAC_EXHALED"] },
    { display: "Sevoflurane inspired", keys: ["inSevoflurane %", "SEVO_INSP"] },
    { display: "Isoflurane inspired", keys: ["inIsoflurane", "ISO_INSP"] },
    { display: "O2 flow/inspired", keys: ["O2 (L/Min)", "O2_INSP"] },
    { display: "N2O flow", keys: ["N2O (L/min)", "N2O_FLOW"] },
    { display: "N2O inspired", keys: ["inN2O %", "N2O_INSP"] },
  ];

  const results: TreatmentCandidate[] = [];

  for (const alias of keyAliases) {
    let arr: TimeValuePoint[] = [];

    for (const k of alias.keys) {
      if (gasData[k]?.length) {
        arr = gasData[k] ?? [];
        break;
      }
    }

    const points = arr
      .filter(
        (p) =>
          Number.isFinite(p.time) &&
          Number.isFinite(p.value) &&
          p.time >= windowStart &&
          p.time <= windowEnd
      )
      .sort((a, b) => a.time - b.time);

    if (!points.length) continue;

    const hasAnyNonZero = points.some((p) => Math.abs(p.value) > 1e-9);
    if (!hasAnyNonZero) continue;

    const nonZeroPoints = points.filter((p) => Math.abs(p.value) > 1e-9);
    const firstNonZero = nonZeroPoints[0] ?? points[0];
    const lastNonZero =
      nonZeroPoints[nonZeroPoints.length - 1] ?? points[points.length - 1];

    const label = `${alias.display} @ ${Math.round(firstNonZero.time)}-${Math.round(
      lastNonZero.time
    )} min (start=${roundSmart(firstNonZero.value)}, end=${roundSmart(
      lastNonZero.value
    )})`;

    results.push({
      id: `gas::${label}`,
      label,
      modality: "Gas / Ventilation",
    });
  }

  return results;
}

/* -------------------- PANEL -------------------- */

export default function InterventionEvalPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  patientId,
  patientFolder,
  episodeNumber,
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,

  medBolusRows = [],
  medInfusionRows = [],
  fluidInRows = [],
  fluidOutRows = [],
  gasData = {},

  annotatorName,
  onSaveAndNextStep,
}: InterventionEvalPanelProps) {
  const candidateTreatments = React.useMemo(() => {
    const meds = extractMedicationCandidates(
      medBolusRows,
      medInfusionRows,
      startMin,
      endMin
    );
    const fluids = extractFluidCandidates(
      fluidInRows,
      fluidOutRows,
      startMin,
      endMin
    );
    const gases = extractGasCandidates(gasData, startMin, endMin);

    return [...meds, ...fluids, ...gases];
  }, [
    medBolusRows,
    medInfusionRows,
    fluidInRows,
    fluidOutRows,
    gasData,
    startMin,
    endMin,
  ]);

  const groupedCandidates = React.useMemo(() => {
    return {
      Medication: candidateTreatments.filter((x) => x.modality === "Medication"),
      Fluid: candidateTreatments.filter((x) => x.modality === "Fluid"),
      "Gas / Ventilation": candidateTreatments.filter(
        (x) => x.modality === "Gas / Ventilation"
      ),
    };
  }, [candidateTreatments]);

  const noTreatmentCaptured = candidateTreatments.length === 0;

  const [expandedGroups, setExpandedGroups] = React.useState({
    medication: false,
    fluid: false,
    gas: false,
  });

  const [noRelevantByGroup, setNoRelevantByGroup] = React.useState({
    medication: false,
    fluid: false,
    gas: false,
  });

  const [overallJudgment, setOverallJudgment] =
    React.useState<OverallJudgmentValue>("");
  const [overallNote, setOverallNote] = React.useState("");

  const [relevantIds, setRelevantIds] = React.useState<string[]>([]);

  const [preventionChoice, setPreventionChoice] =
    React.useState<PreventionChoice>("");
  const [preventionHypothesis, setPreventionHypothesis] = React.useState("");

  const [responseCourseChoice, setResponseCourseChoice] =
    React.useState<ResponseCourseChoice>("");
  const [responseCourseNote, setResponseCourseNote] = React.useState("");

  const [purposeNote, setPurposeNote] = React.useState("");

  const [replaceableChoice, setReplaceableChoice] =
    React.useState<ReplaceableChoice>("");
  const [replaceableNote, setReplaceableNote] = React.useState("");

  const [recordingTarget, setRecordingTarget] =
    React.useState<VoiceTarget>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);

  const pageOpenedAtRef = React.useRef<number | null>(null);
  const firstInteractionAtRef = React.useRef<number | null>(null);
  const firstTypingAtRef = React.useRef<number | null>(null);
  const firstVoiceStartAtRef = React.useRef<number | null>(null);
  const taskTimingRef = React.useRef<Record<InterventionTaskKey, TaskTiming>>(
    buildEmptyTaskTimingMap()
  );

  React.useEffect(() => {
    pageOpenedAtRef.current = Date.now();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    taskTimingRef.current = buildEmptyTaskTimingMap();
  }, [caseId, eventId]);

  React.useEffect(() => {
    if (preventionChoice !== "Yes") {
      setPreventionHypothesis("");
      if (recordingTarget === "preventionHypothesis") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [preventionChoice, recordingTarget]);

  React.useEffect(() => {
    if (overallJudgment === "Appropriate overall") {
      setOverallNote("");
      if (recordingTarget === "overall") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [overallJudgment, recordingTarget]);

  React.useEffect(() => {
    if (replaceableChoice !== "Yes") {
      setReplaceableNote("");
      if (recordingTarget === "replaceable") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [replaceableChoice, recordingTarget]);

  const relevantTreatments = React.useMemo(
    () => candidateTreatments.filter((x) => relevantIds.includes(x.id)),
    [candidateTreatments, relevantIds]
  );

  const nonRelevantTreatments = React.useMemo(
    () => candidateTreatments.filter((x) => !relevantIds.includes(x.id)),
    [candidateTreatments, relevantIds]
  );

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
    taskKey: InterventionTaskKey,
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

  function getGroupItems(groupKey: "medication" | "fluid" | "gas") {
    if (groupKey === "medication") return groupedCandidates.Medication;
    if (groupKey === "fluid") return groupedCandidates.Fluid;
    return groupedCandidates["Gas / Ventilation"];
  }

  function toggleRelevant(id: string) {
    const item = candidateTreatments.find((x) => x.id === id);
    if (!item) return;

    markTaskInteraction("task2_relevant_treatments", "select");

    const groupKey =
      item.modality === "Medication"
        ? "medication"
        : item.modality === "Fluid"
          ? "fluid"
          : "gas";

    setNoRelevantByGroup((prev) => ({
      ...prev,
      [groupKey]: false,
    }));

    setRelevantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleNoRelevant(groupKey: "medication" | "fluid" | "gas") {
    markTaskInteraction("task2_relevant_treatments", "select");

    const groupItems = getGroupItems(groupKey);
    const groupIds = new Set(groupItems.map((x) => x.id));

    setNoRelevantByGroup((prev) => {
      const nextValue = !prev[groupKey];

      if (nextValue) {
        setRelevantIds((prevIds) => prevIds.filter((id) => !groupIds.has(id)));
      }

      return {
        ...prev,
        [groupKey]: nextValue,
      };
    });
  }

  function toggleGroup(group: "medication" | "fluid" | "gas") {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }

  function groupSatisfied(groupKey: "medication" | "fluid" | "gas") {
    const items = getGroupItems(groupKey);
    if (items.length === 0) return true;
    if (noRelevantByGroup[groupKey]) return true;
    return items.some((item) => relevantIds.includes(item.id));
  }

  function validatePanel() {
    if (!overallJudgment) {
      return "Task 1 incomplete: please select an overall treatment strategy judgment.";
    }

    if (overallJudgment !== "Appropriate overall" && !overallNote.trim()) {
      return "Task 1 incomplete: please briefly explain your judgment and any key uncertainty.";
    }

    if (!noTreatmentCaptured) {
      if (!groupSatisfied("medication")) {
        return "Task 2 incomplete: for Medications, select one or more relevant items or choose 'No medications are relevant'.";
      }
      if (!groupSatisfied("fluid")) {
        return "Task 2 incomplete: for Fluids, select one or more relevant items or choose 'No fluids are relevant'.";
      }
      if (!groupSatisfied("gas")) {
        return "Task 2 incomplete: for Gas / Ventilation, select one or more relevant items or choose 'No gas / ventilation items are relevant'.";
      }
    }

    if (preventionChoice === "") {
      return "Task 3 incomplete: please choose Yes, No, or Unclear.";
    }

    if (preventionChoice === "Yes" && !preventionHypothesis.trim()) {
      return "Task 3 incomplete: please provide your hypothesis for why the patient still developed the abnormal event despite the earlier intervention.";
    }

    if (responseCourseChoice === "") {
      return "Task 4 incomplete: please select the overall short-term physiologic response.";
    }

    if (
      responseCourseChoice !== "No relevant intervention" &&
      !responseCourseNote.trim()
    ) {
      return "Task 5 incomplete: please provide brief supporting details for your response judgment.";
    }

    if (
      !noTreatmentCaptured &&
      nonRelevantTreatments.length > 0 &&
      !purposeNote.trim()
    ) {
      return "Task 6 incomplete: please describe the likely purpose of the treatments not selected as relevant.";
    }

    if (replaceableChoice === "") {
      return "Task 7 incomplete: please choose Yes or No.";
    }

    if (replaceableChoice === "Yes" && !replaceableNote.trim()) {
      return "Task 7 incomplete: please describe what could be replaced and with what alternative.";
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

      let taskKey: InterventionTaskKey | null = null;
      if (target === "overall") taskKey = "task1_overall_appropriateness";
      if (target === "preventionHypothesis") taskKey = "task3_preventive_attempt";
      if (target === "response") taskKey = "task5_response_summary";
      if (target === "purpose") taskKey = "task6_nonrelevant_purpose";
      if (target === "replaceable") taskKey = "task7_reasonable_alternative";

      if (taskKey) {
        markTaskInteraction(taskKey, "voice");
      }

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "overall") setOverallNote(transcript);
        if (target === "preventionHypothesis") setPreventionHypothesis(transcript);
        if (target === "response") setResponseCourseNote(transcript);
        if (target === "purpose") setPurposeNote(transcript);
        if (target === "replaceable") setReplaceableNote(transcript);
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

  async function handleSave() {
    const validationError = validatePanel();
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
        panel: "intervention_eval_panel",
        action: "submit",
        task: "intervention",

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
          candidateTreatments,
          tasks: {
            task1_overall_appropriateness: {
              question:
                "Within this time window, were the interventions overall appropriate?",
              answer: {
                overallJudgment,
                overallNote: overallNote.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task1_overall_appropriateness.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task1_overall_appropriateness.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task1_overall_appropriateness.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task1_overall_appropriateness.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task1_overall_appropriateness.selectedAt
                ),
                submittedAt,
              },
            },
            task2_relevant_treatments: {
              question:
                "Select the treatments in the window (5 min before, within the box, and 5 min after) that are clinically relevant to this episode.",
              answer: {
                candidateTreatments,
                relevantIds,
                relevantTreatments,
                noRelevantByGroup,
              },
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task2_relevant_treatments.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task2_relevant_treatments.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task2_relevant_treatments.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task2_relevant_treatments.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task2_relevant_treatments.selectedAt
                ),
                submittedAt,
              },
            },
            task3_preventive_attempt: {
              question:
                "Before the abnormal episode developed, was there any apparent preventive intervention attempt?",
              answer: {
                preventionChoice,
                preventionHypothesis: preventionHypothesis.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task3_preventive_attempt.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task3_preventive_attempt.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task3_preventive_attempt.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task3_preventive_attempt.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task3_preventive_attempt.selectedAt
                ),
                submittedAt,
              },
            },
            task4_response_course: {
              question:
                "What was the overall short-term physiologic response after the relevant intervention(s)?",
              answer: responseCourseChoice,
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task4_response_course.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task4_response_course.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task4_response_course.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task4_response_course.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task4_response_course.selectedAt
                ),
                submittedAt,
              },
            },
            task5_response_summary: {
              question:
                "In 1–3 sentences, summarize the relevant management during this period, including the intended purpose of each intervention, how the patient responded, and whether the desired effect was achieved.",
              answer: responseCourseNote.trim(),
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task5_response_summary.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task5_response_summary.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task5_response_summary.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task5_response_summary.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task5_response_summary.selectedAt
                ),
                submittedAt,
              },
            },
            task6_nonrelevant_purpose: {
              question:
                "Briefly describe the likely purpose of the treatments not selected as relevant.",
              answer: {
                nonRelevantTreatments,
                purposeNote: purposeNote.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task6_nonrelevant_purpose.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task6_nonrelevant_purpose.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task6_nonrelevant_purpose.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task6_nonrelevant_purpose.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task6_nonrelevant_purpose.selectedAt
                ),
                submittedAt,
              },
            },
            task7_reasonable_alternative: {
              question:
                "In your usual clinical practice, is there ONE reasonable alternative intervention (medication, fluid, or gas adjustment) that could have been used here without materially changing the patient's physiologic course?",
              answer: {
                replaceableChoice,
                replaceableNote: replaceableNote.trim(),
              },
              timing: {
                startedAt: toIsoOrNull(
                  taskTimingRef.current.task7_reasonable_alternative.startedAt
                ),
                firstInteractionAt: toIsoOrNull(
                  taskTimingRef.current.task7_reasonable_alternative.firstInteractionAt
                ),
                firstTypingAt: toIsoOrNull(
                  taskTimingRef.current.task7_reasonable_alternative.firstTypingAt
                ),
                firstVoiceStartAt: toIsoOrNull(
                  taskTimingRef.current.task7_reasonable_alternative.firstVoiceStartAt
                ),
                selectedAt: toIsoOrNull(
                  taskTimingRef.current.task7_reasonable_alternative.selectedAt
                ),
                submittedAt,
              },
            },
          },
        },
      });

      setSaveStatus("success");
      setSaveMessage("Intervention evaluation saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save intervention evaluation.");
    }
  }

  function handleReset() {
    setExpandedGroups({
      medication: false,
      fluid: false,
      gas: false,
    });
    setNoRelevantByGroup({
      medication: false,
      fluid: false,
      gas: false,
    });
    setOverallJudgment("");
    setOverallNote("");
    setRelevantIds([]);
    setPreventionChoice("");
    setPreventionHypothesis("");
    setResponseCourseChoice("");
    setResponseCourseNote("");
    setPurposeNote("");
    setReplaceableChoice("");
    setReplaceableNote("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");

    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    taskTimingRef.current = buildEmptyTaskTimingMap();
  }

  function renderExpandableGroup(
    title: string,
    items: TreatmentCandidate[],
    groupKey: "medication" | "fluid" | "gas",
    noneLabel: string
  ) {
    const expanded = expandedGroups[groupKey];
    const noneSelected = noRelevantByGroup[groupKey];

    return (
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleGroup(groupKey)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">{items.length} captured</div>
          </div>
          <div className="text-sm text-gray-500">
            {expanded ? "Hide" : "Show"}
          </div>
        </button>

        {expanded && (
          <div className="border-t px-4 py-3">
            {items.length === 0 ? (
              <div className="text-sm text-gray-400">None captured</div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 hover:bg-gray-50 ${
                      noneSelected
                        ? "border-gray-100 bg-gray-50 text-gray-400"
                        : "border-gray-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={relevantIds.includes(item.id)}
                      onChange={() => toggleRelevant(item.id)}
                      disabled={noneSelected}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}

                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md border border-dashed border-orange-300 bg-orange-50 px-3 py-2 hover:bg-orange-100">
                  <input
                    type="checkbox"
                    checked={noneSelected}
                    onChange={() => toggleNoRelevant(groupKey)}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-orange-700">
                    {noneLabel}
                  </span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[900px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 3: Evaluate intervention relevance, rationale, response, and
          possible alternatives.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Within this time window, were the interventions overall appropriate?">
            <select
              value={overallJudgment}
              onChange={(e) => {
                markTaskInteraction("task1_overall_appropriateness", "select");
                setOverallJudgment(e.target.value as OverallJudgmentValue);
              }}
              className="w-full max-w-[320px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select overall judgment</option>
              {OVERALL_JUDGMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {(overallJudgment === "Partially appropriate" ||
              overallJudgment === "Uncertain") && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold text-gray-900">
                  Explain why the interventions were only partially appropriate or uncertain.
                </div>

                <textarea
                  value={overallNote}
                  onChange={(e) => {
                    markTaskInteraction("task1_overall_appropriateness", "typing");
                    setOverallNote(e.target.value);
                  }}
                  className="min-h-[100px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Explain why the interventions were only partially appropriate or uncertain."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "overall"
                        ? stopVoiceNote
                        : () => startVoiceNote("overall")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "overall"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "overall"
                      ? "Stop Recording"
                      : "Start Recording"}
                  </button>
                </div>
              </div>
            )}
          </TaskBlock>

          <TaskBlock title="Task 2. Select the treatments in the window (5 min before, within the box, and 5 min after) that are clinically relevant to this episode.">
            {noTreatmentCaptured ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No medication, fluid, or gas / ventilation feature was captured
                in the selected time window.
              </div>
            ) : (
              <div className="space-y-4">
                {renderExpandableGroup(
                  "Medications",
                  groupedCandidates.Medication,
                  "medication",
                  "No medications are relevant"
                )}
                {renderExpandableGroup(
                  "Fluids",
                  groupedCandidates.Fluid,
                  "fluid",
                  "No fluids are relevant"
                )}
                {renderExpandableGroup(
                  "Gas / Ventilation",
                  groupedCandidates["Gas / Ventilation"],
                  "gas",
                  "No gas / ventilation items are relevant"
                )}
              </div>
            )}
          </TaskBlock>

          <TaskBlock
            title="Task 3. Before the abnormal episode developed, was there any apparent preventive intervention attempt?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">How to answer</div>
                <div className="mt-1">
                  Judge whether there appears to have been an intervention
                  attempt intended to reduce the chance of deterioration before
                  the abnormal episode fully developed.
                </div>
                <div className="mt-1">
                  If yes, briefly explain your hypothesis for why the patient
                  still developed the abnormal event despite the earlier
                  intervention.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Unclear</span> if the
                  intent or timing cannot be determined confidently.
                </div>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <SelectionPill
                label="Yes"
                selected={preventionChoice === "Yes"}
                onClick={() => {
                  markTaskInteraction("task3_preventive_attempt", "select");
                  setPreventionChoice("Yes");
                }}
                selectedTone="green"
              />
              <SelectionPill
                label="No"
                selected={preventionChoice === "No"}
                onClick={() => {
                  markTaskInteraction("task3_preventive_attempt", "select");
                  setPreventionChoice("No");
                }}
                selectedTone="green"
              />
              <SelectionPill
                label="Unclear"
                selected={preventionChoice === "Unclear"}
                onClick={() => {
                  markTaskInteraction("task3_preventive_attempt", "select");
                  setPreventionChoice("Unclear");
                }}
                selectedTone="green"
              />
            </div>

            {preventionChoice === "Yes" && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold text-gray-900">
                  What is your hypothesis for why the patient still developed
                  the abnormal event?
                </div>

                <textarea
                  value={preventionHypothesis}
                  onChange={(e) => {
                    markTaskInteraction("task3_preventive_attempt", "typing");
                    setPreventionHypothesis(e.target.value);
                  }}
                  className="min-h-[110px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="For example: A preventive vasopressor was given, but the effect was insufficient or transient relative to the ongoing physiologic deterioration."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "preventionHypothesis"
                        ? stopVoiceNote
                        : () => startVoiceNote("preventionHypothesis")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "preventionHypothesis"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "preventionHypothesis"
                      ? "Stop Recording"
                      : "Start Recording"}
                  </button>
                </div>
              </div>
            )}
          </TaskBlock>

          <TaskBlock
            title="Task 4. What was the overall short-term physiologic response after the relevant intervention(s)?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">How to answer</div>
                <div className="mt-1">
                  Select the best overall summary of the patient's short-term
                  physiologic response after the relevant intervention(s).
                </div>
                <div className="mt-1">
                  If no treatment selected in Task 2 was clinically relevant to
                  this episode, choose{" "}
                  <span className="font-semibold">
                    No relevant intervention
                  </span>
                  .
                </div>
              </>
            }
          >
            <select
              value={responseCourseChoice}
              onChange={(e) => {
                markTaskInteraction("task4_response_course", "select");
                setResponseCourseChoice(e.target.value as ResponseCourseChoice);
              }}
              className="w-full max-w-[360px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
            >
              <option value="">Select overall short-term response</option>
              {RESPONSE_COURSE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </TaskBlock>

          <TaskBlock
            title={`Task 5. In 1–3 sentences, summarize the relevant management during this period, including the intended purpose of each intervention, how the patient responded, and whether the desired effect was achieved.`}
            tooltip={
              <>
                <div className="font-semibold text-gray-800">What to include</div>
                <div className="mt-1">
                  Briefly describe the specific physiologic changes that support
                  your Task 4 judgment.
                </div>
                <div className="mt-1">
                  Mention whether the response was transient or sustained, which
                  signals improved or worsened, and why any further adjustment
                  was or was not needed.
                </div>
              </>
            }
          >
            {responseCourseChoice === "No relevant intervention" ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                No detailed response explanation is required if you selected “No
                relevant intervention” in Task 4.
              </div>
            ) : (
              <>
                <textarea
                  value={responseCourseNote}
                  onChange={(e) => {
                    markTaskInteraction("task5_response_summary", "typing");
                    setResponseCourseNote(e.target.value);
                  }}
                  className="min-h-[110px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="For example: MAP increased briefly after phenylephrine, but the effect was transient and a repeat bolus was needed because hypotension recurred."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "response"
                        ? stopVoiceNote
                        : () => startVoiceNote("response")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "response"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "response"
                      ? "Stop Recording"
                      : "Start Recording"}
                  </button>
                </div>
              </>
            )}
          </TaskBlock>

          <TaskBlock
            title="Task 6. Briefly describe the likely purpose of the treatments not selected as relevant, whether related to patient physiology, procedural context, phase transition, anticipation of a clinical need, or another management consideration."
            tooltip={
              <>
                <div className="font-semibold text-gray-800">What to include</div>
                <div className="mt-1">
                  Briefly explain what these non-relevant treatments were most
                  likely used for.
                </div>
                <div className="mt-1">
                  Examples include routine maintenance, anesthesia depth
                  management, prophylaxis, or other background perioperative
                  care.
                </div>
                <div className="mt-1">
                  You can summarize them together rather than explaining each one
                  separately.
                </div>
              </>
            }
          >
            {nonRelevantTreatments.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                There are no non-relevant treatments remaining to annotate.
              </div>
            ) : (
              <>
                <textarea
                  value={purposeNote}
                  onChange={(e) => {
                    markTaskInteraction("task6_nonrelevant_purpose", "typing");
                    setPurposeNote(e.target.value);
                  }}
                  className="min-h-[100px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Describe the likely clinical purpose of the treatments not selected as relevant..."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "purpose"
                        ? stopVoiceNote
                        : () => startVoiceNote("purpose")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "purpose"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "purpose"
                      ? "Stop Recording"
                      : "Start Recording"}
                  </button>
                </div>
              </>
            )}
          </TaskBlock>

          <TaskBlock
            title="Task 7. In your usual clinical practice, is there ONE reasonable alternative intervention (medication, fluid, or gas adjustment) that could have been used here without materially changing the patient's physiologic course?"
            noBorder
            tooltip={
              <>
                <div className="font-semibold text-gray-800">What to include</div>
                <div className="mt-1">Choose Yes or No first.</div>
                <div className="mt-1">
                  If Yes, describe only ONE reasonable alternative.
                </div>
                <div className="mt-1">
                  For a medication, give the name and dose.
                </div>
                <div className="mt-1">
                  For a fluid, give the fluid type and volume or rate.
                </div>
                <div className="mt-1">
                  For a gas-related change, describe the adjustment as specifically as possible.
                </div>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <SelectionPill
                label="Yes"
                selected={replaceableChoice === "Yes"}
                onClick={() => {
                  markTaskInteraction("task7_reasonable_alternative", "select");
                  setReplaceableChoice("Yes");
                }}
                selectedTone="blue"
              />
              <SelectionPill
                label="No"
                selected={replaceableChoice === "No"}
                onClick={() => {
                  markTaskInteraction("task7_reasonable_alternative", "select");
                  setReplaceableChoice("No");
                }}
                selectedTone="blue"
              />
            </div>

            {replaceableChoice === "Yes" && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold text-gray-900">
                  Describe ONE reasonable alternative intervention.
                </div>
                <div className="mb-2 text-sm text-gray-600">
                  If you choose a medication, give the medication name and dose. If you choose a fluid, give the fluid type and volume or rate. If you choose a gas-related change, describe the adjustment as specifically as possible.
                </div>

                <textarea
                  value={replaceableNote}
                  onChange={(e) => {
                    markTaskInteraction("task7_reasonable_alternative", "typing");
                    setReplaceableNote(e.target.value);
                  }}
                  className="min-h-[110px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="For example: I would use ephedrine 10 mg instead of phenylephrine 100 mcg. Or: I would give 250 mL crystalloid bolus. Or: I would increase FiO2 as the alternative gas adjustment."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "replaceable"
                        ? stopVoiceNote
                        : () => startVoiceNote("replaceable")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "replaceable"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "replaceable"
                      ? "Stop Recording"
                      : "Start Voice Note"}
                  </button>
                </div>
              </div>
            )}
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
                onClick={handleSave}
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