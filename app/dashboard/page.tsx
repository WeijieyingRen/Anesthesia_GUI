"use client";
import ManagementReasoningPanel from "./annotation/panels/ManagementReasoningPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import UserGuideOverlay from "@/components/UserGuideOverlay";
import ObservationSelectionGuide from "./annotation/panels/ObservationSelectionGuide";
import type {
  AnnotationTaskKey,
  DetectVital,
  WorkspaceTaskKey,
  SidebarEventItem,
  EpisodeAnnotationState,
  DetectedEpisodeItem,
} from "./annotation/types";
import type {
  PatientDemographic,
  SurgeryContext,
  PreopAssessment,
  LabData,
  VitalPanelData,
  MedicationPanelData,
  FluidPanelData,
} from "@/lib/types";
import type { ManagementEvent } from "@/lib/types_management";
import { prepareManagementEvents } from "@/lib/prepare_management";
import TaskWorkspace from "./annotation/TaskWorkspace";
import { prepareDemographicData } from "@/lib/prepare_raw_data/demographic";
import { prepareSurgeryContextData } from "@/lib/prepare_raw_data/surgery_context";
import { preparePreopData } from "@/lib/prepare_raw_data/preop";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";
import { prepareTimelineContextData } from "@/lib/prepare_raw_data/timeline_context";
import {
  buildPhysiologyRowsFromPanelFiles,
  prepareVitalsDataRaw,
} from "@/lib/prepare_raw_data/vitals";
import { prepareMedicationData } from "@/lib/prepare_raw_data/medications";
import UnifiedTimelineCard from "./UnifiedTimelineCard";
import { prepareFluidData } from "@/lib/prepare_raw_data/fluid";
import SummaryPanel from "./annotation/panels/SummaryPanel";
import { getSpeechRecognitionLanguage } from "@/lib/speech-language";
import { DATASET_BASE } from "@/lib/dataset-config";

type CsvRow = Record<string, any>;

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type GameData = {
  currentPatientIndex: number;
  selectedPatients: Array<{
    folder: string;
    status?: "not_started" | "in_progress" | "completed";
    workflowMode?: "annotation" | "review";
    displayCaseId?: number;
  }>;
  diagnoses?: any[];
  startTime?: string;
};

type StoredSelected = {
  folder: string;
  status?: "not_started" | "in_progress" | "completed";
  workflowMode?: "annotation" | "review";
  displayCaseId?: number;
};

type LocalDriveExportEntry = {
  objectPath: string;
  data: unknown;
  savedAt?: string;
};

type AnnotationLevel = "summary" | "episode" | "otherEvents";

type EpisodeTaskCompletionMap = Record<
  string,
  Partial<Record<AnnotationTaskKey, boolean>>
>;

const EPISODE_TASK_ORDER: AnnotationTaskKey[] = [
  "detect",
];

function SectionCard({
  title,
  children,
  collapsible = false,
  open = true,
  onToggle,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${className}`}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="mb-3 flex w-full items-center gap-3 text-left text-base font-bold text-gray-900"
        >
          <span className="text-2xl leading-none text-gray-700">
            {open ? "▾" : "▸"}
          </span>
          <span>{title}</span>
        </button>
      ) : (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      )}
      {(!collapsible || open) && children}
    </div>
  );
}

function hasVisibleValue(value: React.ReactNode) {
  if (value === null || value === undefined) return false;

  if (typeof value === "number") {
    if (Number.isNaN(value)) return false;
    if (value === 0) return false;
    return true;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return false;
    if (trimmed === "-") return false;
    if (trimmed === "0") return false;
    if (trimmed.toLowerCase() === "nan") return false;
    if (trimmed.toLowerCase() === "null") return false;
    if (trimmed.toLowerCase() === "undefined") return false;
    return true;
  }

  return true;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      trimmed === "" ||
      trimmed === "-" ||
      trimmed.toLowerCase() === "nan" ||
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "undefined"
    ) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatHeightCm(heightInInches: unknown): string | undefined {
  const inches = toFiniteNumber(heightInInches);
  if (inches === null || inches <= 0) return undefined;

  const cm = inches * 2.54;
  return `${cm.toFixed(1)} cm`;
}

function formatWeightKg(weightInOunces: unknown): string | undefined {
  const ounces = toFiniteNumber(weightInOunces);
  if (ounces === null || ounces <= 0) return undefined;

  const kg = ounces * 0.028349523125;
  return `${kg.toFixed(1)} kg`;
}

function formatBmi(
  heightInInches: unknown,
  weightInOunces: unknown
): string | undefined {
  const inches = toFiniteNumber(heightInInches);
  const ounces = toFiniteNumber(weightInOunces);

  if (inches === null || ounces === null || inches <= 0 || ounces <= 0) {
    return undefined;
  }

  const heightM = (inches * 2.54) / 100;
  const weightKg = ounces * 0.028349523125;

  if (heightM <= 0) return undefined;

  const bmi = weightKg / (heightM * heightM);
  return bmi.toFixed(1);
}

function formatClockTimeFromOffset(offsetMin: number, timeZero?: string | null) {
  if (!Number.isFinite(offsetMin) || !timeZero) return null;

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return null;

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getLocalTimestamp() {
  const date = new Date();
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMin);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMinutes = String(absOffset % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);

  return `${local}${sign}${offsetHours}:${offsetMinutes}`;
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function readStoredJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

type DashboardCaseDraft = {
  selectedTask?: WorkspaceTaskKey;
  annotationLevel?: AnnotationLevel;
  selectedDetectVital?: DetectVital;
  selectedWindow?: SelectedWindow | null;
  patientSummaryCompleted?: boolean;
  abnormalityReasoningCompleted?: boolean;
  managementReasoningCompleted?: boolean;
  episodeState?: EpisodeAnnotationState;
  episodeTaskCompletion?: EpisodeTaskCompletionMap;
  selectedManagementEventId?: string | null;
  hasSubmitted?: boolean;
};

type DriveReviewPayload = {
  ok?: boolean;
  summary?: { data?: Record<string, unknown> | null } | null;
  managementReasoning?: { data?: Record<string, unknown> | null } | null;
  abnormalityReasoning?: { data?: Record<string, unknown> | null } | null;
  caseSubmission?: { data?: Record<string, unknown> | null } | null;
};

function dashboardDraftKey(patientFolder: string, caseId: string) {
  return `dashboardDraft:${patientFolder}:${caseId}`;
}

function clearCaseLocalDrafts(patientFolder: string, caseId: string) {
  try {
    const exactKeys = [
      `annotationDraft:summary:${patientFolder}:${caseId}`,
      `annotationResult:summary:${patientFolder}:${caseId}`,
      `annotationRevision:summary:${patientFolder}:${caseId}`,
      `annotationSaveNotice:summary:${patientFolder}:${caseId}`,
      `annotationDraft:management_reasoning:${patientFolder}:${caseId}`,
      `annotationResult:management_reasoning:${patientFolder}:${caseId}`,
      `annotationRevision:management_reasoning:${patientFolder}:${caseId}`,
      `annotationSaveNotice:management_reasoning:${patientFolder}:${caseId}`,
      `annotationResult:abnormality_reasoning:${patientFolder}:${caseId}`,
      `annotationRevision:abnormality_reasoning:${patientFolder}:${caseId}`,
      dashboardDraftKey(patientFolder, caseId),
    ];

    for (const key of exactKeys) {
      localStorage.removeItem(key);
    }

    const prefixes = [
      `annotationDraft:abnormality_reasoning:${patientFolder}:${caseId}:`,
      `annotationSaveNotice:abnormality_reasoning:${patientFolder}:${caseId}:`,
    ];

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function extractPayloadCaseId(payload: DriveReviewPayload): string | null {
  const candidates = [
    payload.caseSubmission?.data?.caseId,
    payload.summary?.data?.caseId,
    payload.managementReasoning?.data?.caseId,
    payload.abnormalityReasoning?.data?.caseId,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (normalized) return normalized;
  }

  return null;
}

function hasAnyDriveReviewContent(payload: DriveReviewPayload): boolean {
  return Boolean(
    payload.summary?.data ||
      payload.managementReasoning?.data ||
      payload.abnormalityReasoning?.data
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getSavedAnswers(
  section?: { data?: Record<string, unknown> | null } | null
): Record<string, unknown> | null {
  return asRecord(section?.data?.answers);
}

function extractSummaryResultRecord(payload: DriveReviewPayload) {
  return asRecord(payload.summary?.data);
}

function extractAbnormalityResultRecord(payload: DriveReviewPayload) {
  return asRecord(payload.abnormalityReasoning?.data);
}

function extractManagementResultRecord(payload: DriveReviewPayload) {
  return asRecord(payload.managementReasoning?.data);
}

function extractAbnormalityAnswersFromReviewPayload(payload: DriveReviewPayload) {
  return getSavedAnswers(payload.abnormalityReasoning);
}

function extractManagementAnswersFromReviewPayload(payload: DriveReviewPayload) {
  return getSavedAnswers(payload.managementReasoning);
}

function extractSummaryAnswersFromReviewPayload(payload: DriveReviewPayload) {
  return getSavedAnswers(payload.summary);
}

function resolveReviewDashboardDraft(payload: DriveReviewPayload) {
  const abnormalityAnswers = extractAbnormalityAnswersFromReviewPayload(payload);

  const nextDraft: DashboardCaseDraft | null =
    abnormalityAnswers
      ? {
          hasSubmitted: false,
          patientSummaryCompleted: false,
          managementReasoningCompleted: false,
          abnormalityReasoningCompleted:
            Boolean(
              String(abnormalityAnswers?.abnormalityReasoningText ?? "").trim()
            ),
        }
      : null;

  return {
    draft: nextDraft,
    eventId: null,
  };
}

function extractSummaryTextFromReviewPayload(payload: DriveReviewPayload) {
  const answers = extractSummaryAnswersFromReviewPayload(payload);

  return String(
    answers?.summaryText ??
      ""
  ).trim();
}

function extractAbnormalityTextFromReviewPayload(payload: DriveReviewPayload) {
  const answers = extractAbnormalityAnswersFromReviewPayload(payload);

  return String(
    answers?.abnormalityReasoningText ??
      ""
  ).trim();
}

function extractManagementTaskAnswersFromReviewPayload(payload: DriveReviewPayload) {
  const answers = extractManagementAnswersFromReviewPayload(payload);
  const tasks = asRecord(answers?.tasks);

  const task1 = asRecord(tasks?.task1_reason_for_intervention);
  const task2 = asRecord(tasks?.task2_counterfactual);

  const answer1 = String(task1?.answer ?? "").trim();
  const answer2 = String(task2?.answer ?? "").trim();

  return {
    answer1,
    answer2,
    mergedText: [answer1, answer2]
      .filter(Boolean)
      .map((text, index) => `Task ${index + 1}: ${text}`)
      .join("\n\n"),
  };
}

function extractManagementTextFromReviewPayload(payload: DriveReviewPayload) {
  const answers = extractManagementAnswersFromReviewPayload(payload);
  const extracted = extractManagementTaskAnswersFromReviewPayload(payload);

  return String(
    answers?.managementReasoningText ??
      answers?.freeText ??
      extracted.mergedText ??
      ""
  ).trim();
}
function extractAbnormalityEventIdFromPayload(payload: DriveReviewPayload) {
  const answers = extractAbnormalityAnswersFromReviewPayload(payload);

  const directId = String(
    answers?.eventId ??
      answers?.episodeId ??
      answers?.event_id ??
      answers?.episode_id ??
      ""
  ).trim();

  if (directId) return directId;

  const annotatedEpisode = asRecord(answers?.annotatedEpisode);

  const annotatedEpisodeId = String(
    annotatedEpisode?.id ??
      annotatedEpisode?.eventId ??
      annotatedEpisode?.episodeId ??
      annotatedEpisode?.event_id ??
      annotatedEpisode?.episode_id ??
      ""
  ).trim();

  if (annotatedEpisodeId) return annotatedEpisodeId;

  const selectedEpisodes = Array.isArray(answers?.selectedEpisodes)
    ? (answers.selectedEpisodes as Array<Record<string, unknown>>)
    : [];

  const selectedEpisode =
    selectedEpisodes.find((episode) => Boolean(episode.selected)) ??
    selectedEpisodes[0];

  return String(
    selectedEpisode?.id ??
      selectedEpisode?.eventId ??
      selectedEpisode?.episodeId ??
      selectedEpisode?.event_id ??
      selectedEpisode?.episode_id ??
      ""
  ).trim();
}

function getPointTime(point: any): number | null {
  return toFiniteNumber(
    point?.timeMin ??
      point?.time_min ??
      point?.relative_anesthesia_time ??
      point?.time ??
      point?.x
  );
}

function getPointValue(point: any): number | null {
  return toFiniteNumber(point?.value ?? point?.y);
}

function getVitalSeriesFromPanel(
  vitals: VitalPanelData | null,
  vital: DetectVital
): any[] {
  if (!vitals) return [];

  const keyCandidates = [
    vital,
    `NIBP_${vital}`,
    vital === "SPO2" ? "SPO2 %" : null,
   
  ].filter(Boolean) as string[];

  const groups = [
    vitals.main,
    vitals.gas,
    vitals.ventilation,
    vitals.hemodynamics,
    vitals.cv,
    vitals.depth,
    vitals.tmp,
    vitals.other,
  ] as Array<Record<string, any[]> | undefined>;

  for (const group of groups) {
    if (!group) continue;

    for (const key of keyCandidates) {
      if (Array.isArray(group[key]) && group[key].length > 0) {
        return group[key];
      }
    }

    const vitalLower = String(vital).toLowerCase();
    const matchedKey = Object.keys(group).find(
      (key) =>
        key.toLowerCase() === vitalLower ||
        key.toLowerCase().includes(vitalLower)
    );

    if (matchedKey && Array.isArray(group[matchedKey])) {
      return group[matchedKey];
    }
  }

  return [];
}

function repairEpisodeYRangeFromVitals(
  episode: DetectedEpisodeItem,
  vitals: VitalPanelData | null
): DetectedEpisodeItem {
  const y1 = toFiniteNumber(episode.y1);
  const y2 = toFiniteNumber(episode.y2);

  if (
    y1 !== null &&
    y2 !== null &&
    Number.isFinite(y1) &&
    Number.isFinite(y2) &&
    y1 !== y2
  ) {
    return episode;
  }

  const series = getVitalSeriesFromPanel(vitals, episode.vital);

  const values = series
    .filter((point) => {
      const t = getPointTime(point);
      return (
        t !== null &&
        t >= episode.startMin &&
        t <= episode.endMin
      );
    })
    .map(getPointValue)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return episode;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(5, (maxValue - minValue) * 0.2);

  return {
    ...episode,
    y1: minValue - padding,
    y2: maxValue + padding,
  };
}

function parseClockTimeToOffsetMin(
  value: unknown,
  anesthesiaStart?: string | null
): number | null {
  const text = String(value ?? "").trim();
  if (!text || !anesthesiaStart) return null;

  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const base = new Date(anesthesiaStart);
  if (Number.isNaN(base.getTime())) return null;

  const target = new Date(base);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);

  return Math.round((target.getTime() - base.getTime()) / 60000);
}
function buildEpisodeStateFromStoredAbnormalityResult({
  abnormalityResult,
  anesthesiaStart,
}: {
  abnormalityResult: Record<string, unknown> | null;
  anesthesiaStart?: string | null;
}) {
  const abnormalityAnswers =
    asRecord(abnormalityResult?.answers) ?? abnormalityResult;

  const selectedEpisodes = Array.isArray(abnormalityAnswers?.selectedEpisodes)
    ? (abnormalityAnswers.selectedEpisodes as Array<Record<string, unknown>>)
    : [];

  if (selectedEpisodes.length === 0) {
    return null;
  }

  const annotatedEpisode = asRecord(abnormalityAnswers?.annotatedEpisode);
  const annotatedEpisodeIndex = Number(annotatedEpisode?.episodeIndex);

  const detectedEpisodes: DetectedEpisodeItem[] = [];
  const prioritizedEpisodeIds: string[] = [];

  for (const episode of selectedEpisodes) {
    const episodeIndex = Number(episode.episodeIndex);

    const startMin = parseClockTimeToOffsetMin(
      episode.startMin,
      anesthesiaStart
    );

    const endMin = parseClockTimeToOffsetMin(
      episode.endMin,
      anesthesiaStart
    );

    if (
      !Number.isFinite(episodeIndex) ||
      startMin === null ||
      endMin === null
    ) {
      continue;
    }

    const fallbackId = `review-episode-${Math.floor(episodeIndex)}`;

    const id = String(
      episode.id ??
        episode.eventId ??
        episode.episodeId ??
        episode.event_id ??
        episode.episode_id ??
        fallbackId
    ).trim();

    const selected = Boolean(episode.selected);

    const vital = String(
      episode.vital ??
        episode.detectVital ??
        episode.selectedDetectVital ??
        "MAP"
    ).trim() as DetectVital;

    const rawY1 = toFiniteNumber(episode.y1);
    const rawY2 = toFiniteNumber(episode.y2);
    
    detectedEpisodes.push({
      id,
      label: `Episode ${Math.floor(episodeIndex)}`,
      vital,
      startMin,
      endMin,
      y1: rawY1 ?? 0,
      y2: rawY2 ?? 0,
      selectedForAnnotation: selected,
      createdAtUtc: String(episode.createdAtUtc ?? "") || undefined,
      updatedAtUtc: String(episode.updatedAtUtc ?? "") || undefined,
    });

    if (selected) {
      prioritizedEpisodeIds.push(id);
    }
  }

  if (detectedEpisodes.length === 0) return null;

  const activeEpisodeId =
    detectedEpisodes.find((episode) => {
      const numberFromLabel = Number(
        String(episode.label).replace("Episode ", "")
      );

      return (
        Number.isFinite(annotatedEpisodeIndex) &&
        annotatedEpisodeIndex > 0 &&
        numberFromLabel === Math.floor(annotatedEpisodeIndex)
      );
    })?.id ??
    prioritizedEpisodeIds[0] ??
    detectedEpisodes[0]?.id ??
    null;

  return {
    stage: "annotate",
    annotateStep: "detect",
    detectedEpisodes,
    prioritizedEpisodeIds:
      prioritizedEpisodeIds.length > 0
        ? prioritizedEpisodeIds
        : activeEpisodeId
          ? [activeEpisodeId]
          : [],
    activeEpisodeId,
  } satisfies EpisodeAnnotationState;
}
function forceReviewEpisodeSelectionStage(
  state: EpisodeAnnotationState | null
): EpisodeAnnotationState | null {
  if (!state) return null;

  const selectedIdsFromEpisodes = state.detectedEpisodes
    .filter((episode) => episode.selectedForAnnotation)
    .map((episode) => episode.id);

  const existingPrioritizedIds = state.prioritizedEpisodeIds ?? [];

  const prioritizedEpisodeIds =
    existingPrioritizedIds.length > 0
      ? existingPrioritizedIds
      : selectedIdsFromEpisodes;

  const activeEpisodeId =
    state.activeEpisodeId ??
    prioritizedEpisodeIds[0] ??
    state.detectedEpisodes[0]?.id ??
    null;

  return {
    ...state,
    stage: "select_all",
    annotateStep: "detect",
    prioritizedEpisodeIds,
    activeEpisodeId,
    detectedEpisodes: state.detectedEpisodes.map((episode) => ({
      ...episode,
      selectedForAnnotation: prioritizedEpisodeIds.includes(episode.id),
    })),
  };
}

function hydrateReviewDraftFromDrive({
  patientFolder,
  caseId,
  payload,
}: {
  patientFolder: string;
  caseId: string;
  payload: DriveReviewPayload;
}) {
  try {
    const reviewDraft = resolveReviewDashboardDraft(payload);

    const summaryText = extractSummaryTextFromReviewPayload(payload);
    const summaryResult = extractSummaryResultRecord(payload);

    if (summaryText) {
      localStorage.setItem(
        `annotationDraft:summary:${patientFolder}:${caseId}`,
        summaryText
      );

      localStorage.setItem(
        `annotationResult:summary:${patientFolder}:${caseId}`,
        JSON.stringify(summaryResult ?? {})
      );
    }

    const managementText = extractManagementTextFromReviewPayload(payload);
    const managementResult = extractManagementResultRecord(payload);

    if (managementText) {
      localStorage.setItem(
        `annotationDraft:management_reasoning:${patientFolder}:${caseId}`,
        managementText
      );

      localStorage.setItem(
        `annotationResult:management_reasoning:${patientFolder}:${caseId}`,
        JSON.stringify(managementResult ?? {})
      );
    }

    const abnormalityText = extractAbnormalityTextFromReviewPayload(payload);
    const abnormalityResult = extractAbnormalityResultRecord(payload);

    let abnormalityEventId =
      reviewDraft.eventId || extractAbnormalityEventIdFromPayload(payload);

    if (!abnormalityEventId) {
      const abnormalityData = abnormalityResult;
      abnormalityEventId = String(
        abnormalityData?.event_id ??
          abnormalityData?.episode_id ??
          ""
      ).trim();
    }

    if (abnormalityText) {
      if (abnormalityEventId) {
        localStorage.setItem(
          `annotationDraft:abnormality_reasoning:${patientFolder}:${caseId}:${abnormalityEventId}`,
          abnormalityText
        );
      }

      localStorage.setItem(
        `annotationResult:abnormality_reasoning:${patientFolder}:${caseId}`,
        JSON.stringify(abnormalityResult ?? {})
      );
    }

    const nextDraft: DashboardCaseDraft = {
      ...(reviewDraft.draft ?? {}),
      patientSummaryCompleted: Boolean(summaryText),
      abnormalityReasoningCompleted: Boolean(abnormalityText),
      managementReasoningCompleted: Boolean(managementText),
      selectedManagementEventId:
        reviewDraft.draft?.selectedManagementEventId ?? undefined,
      hasSubmitted: false,
    };

    localStorage.setItem(
      dashboardDraftKey(patientFolder, caseId),
      JSON.stringify(nextDraft)
    );

    console.log("[Review hydrate] restored from Drive", {
      summaryText: Boolean(summaryText),
      abnormalityText: Boolean(abnormalityText),
      managementText: Boolean(managementText),
      abnormalityEventId,
      patientFolder,
      caseId,
    });
  } catch (error) {
    console.error("Failed to hydrate review draft from Drive:", error);
  }
}

function getManagementEventId(event: ManagementEvent | null | undefined) {
  if (!event) return null;
  return String(
    (event as any).event_id ??
      `${event.row_name ?? "management"}_${event.time_min ?? "unknown"}`
  );
}

function formatEpisodeTimeRange(
  startMin: number,
  endMin: number,
  timeZero?: string | null
) {
  const start = formatClockTimeFromOffset(startMin, timeZero);
  const end = formatClockTimeFromOffset(endMin, timeZero);
  if (start && end) return `${start} - ${end}`;
  return `${Math.round(startMin)} - ${Math.round(endMin)} min`;
}

function roundDownToQuarterHourIso(value: unknown): string | null {
  if (!value) return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  const rounded = new Date(date);
  rounded.setMinutes(Math.floor(rounded.getMinutes() / 15) * 15, 0, 0);
  return rounded.toISOString();
}

function getMinuteOffset(fromTime: unknown, toTime: unknown): number {
  if (!fromTime || !toTime) return 0;

  const from = new Date(String(fromTime));
  const to = new Date(String(toTime));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;

  const diffMin = (from.getTime() - to.getTime()) / 60000;
  return Number.isFinite(diffMin) ? diffMin : 0;
}

function shiftRelativeTimeRows(
  rows: CsvRow[],
  fields: string[],
  offsetMin: number
): CsvRow[] {
  if (!offsetMin) return rows;

  return rows.map((row) => {
    const next = { ...row };

    for (const field of fields) {
      const rawValue = next[field];
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;

      const value = Number(rawValue);
      if (Number.isFinite(value)) {
        next[field] = value + offsetMin;
      }
    }

    return next;
  });
}

function normalizeManagementName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function rowMatchesManagementName(rowValue: unknown, targetValue: unknown) {
  const rowName = normalizeManagementName(rowValue);
  const target = normalizeManagementName(targetValue);

  if (!rowName || !target) return false;

  return rowName === target || rowName.includes(target) || target.includes(rowName);
}

function getGasChangeValues(
  event: ManagementEvent,
  phyRows: CsvRow[]
): Pick<ManagementEvent, "change_from" | "change_to" | "change_unit"> | null {
  const timeMin = toFiniteNumber(event.time_min);
  if (timeMin === null) return null;

  const endTimeMin = toFiniteNumber(event.end_time_min) ?? timeMin;
  const points = phyRows
    .map((row) => ({
      time: toFiniteNumber(row["relative_anesthesia_time"]),
      value: toFiniteNumber(row[event.row_name]),
    }))
    .filter(
      (point): point is { time: number; value: number } =>
        point.time !== null && point.value !== null
    )
    .sort((a, b) => a.time - b.time);

  if (!points.length) return null;

  const toPoint =
    points.find((point) => point.time >= endTimeMin) ??
    points.find((point) => point.time >= timeMin) ??
    points[points.length - 1];
  const fromPoint =
    [...points].reverse().find((point) => point.time < timeMin) ??
    points[0];

  if (!fromPoint || !toPoint || fromPoint.value === toPoint.value) return null;

  return {
    change_from: fromPoint.value,
    change_to: toPoint.value,
    change_unit: getGasDisplayUnit(event.row_name, event.unit),
  };
}

function getGasDisplayUnit(rowName: string, fallback?: string) {
  const lower = rowName.toLowerCase();
  if (rowName.includes("%")) return "%";
  if (lower.includes("l/min")) return "L/min";
  if (lower.includes("cm h2o")) return "cm H2O";
  if (lower.includes("mmhg")) return "mmHg";
  return fallback === "abs_rate_per_min" ? undefined : fallback;
}

function getMedicationInfusionChangeValues(
  event: ManagementEvent,
  medInfusionRows: CsvRow[]
): Pick<ManagementEvent, "change_from" | "change_to" | "change_unit"> | null {
  const timeMin = toFiniteNumber(event.time_min);
  if (timeMin === null) return null;

  const matchingRows = medInfusionRows
    .filter((row) =>
      rowMatchesManagementName(
        row["medication"] || row["med_concept_desc"],
        event.row_name
      )
    )
    .map((row) => ({
      start: toFiniteNumber(row["relative_anesthesia_start"]),
      end: toFiniteNumber(row["relative_anesthesia_end"]),
      dose: toFiniteNumber(row["dose"]),
      unit: String(row["unit"] ?? "").trim() || event.unit,
    }))
    .filter(
      (row): row is {
        start: number;
        end: number | null;
        dose: number;
        unit: string | undefined;
      } =>
        row.start !== null && row.dose !== null
    )
    .sort((a, b) => a.start - b.start);

  if (!matchingRows.length) return null;

  const toSegment =
    matchingRows.find((row) => Math.abs(row.start - timeMin) <= 1) ??
    matchingRows.find(
      (row) =>
        row.start <= timeMin &&
        (row.end === null || row.end >= timeMin)
    ) ??
    matchingRows.find((row) => row.start >= timeMin);

  if (!toSegment) return null;

  const fromSegment =
    [...matchingRows]
      .reverse()
      .find((row) => row.start < toSegment.start && row.dose !== toSegment.dose) ??
    [...matchingRows].reverse().find((row) => row.start < toSegment.start);

  if (!fromSegment || fromSegment.dose === toSegment.dose) return null;

  return {
    change_from: fromSegment.dose,
    change_to: toSegment.dose,
    change_unit: toSegment.unit ?? fromSegment.unit ?? event.unit,
  };
}

function enrichManagementEventsWithChangeValues(
  events: ManagementEvent[],
  medInfusionRows: CsvRow[],
  phyRows: CsvRow[]
) {
  return events.map((event) => {
    const eventType = String(event.event_type ?? "").toLowerCase();

    if (event.chart_type === "gas" && eventType.includes("gas_adjustment")) {
      return {
        ...event,
        ...getGasChangeValues(event, phyRows),
      };
    }

    if (
      event.chart_type === "medication" &&
      eventType.includes("infusion_adjustment")
    ) {
      return {
        ...event,
        ...getMedicationInfusionChangeValues(event, medInfusionRows),
      };
    }

    return event;
  });
}

function FieldGrid({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  const visibleItems = items.filter((item) => hasVisibleValue(item.value));

  if (!visibleItems.length) {
    return <div className="text-sm text-gray-500">No available more data.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {visibleItems.map((item) => (
        <div key={item.label} className="min-w-0 break-words leading-6">
          <span className="font-semibold text-gray-600">{item.label}:</span>{" "}
          <span className="break-words whitespace-normal text-gray-900">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
function groupPreopHistoryRows(rows: CsvRow[]) {
  const grouped: Record<string, string[]> = {};

  const hiddenCategories = new Set(["Home Medication"]);

  const cleanText = (value: unknown) => {
    const text = String(value ?? "").trim();

    if (
      !text ||
      text === "-" ||
      text.toLowerCase() === "nan" ||
      text.toLowerCase() === "null" ||
      text.toLowerCase() === "undefined"
    ) {
      return "";
    }

    return text;
  };

  for (const row of rows) {
    const category = cleanText(
      row["history_category"] ?? row["category"] ?? "Other"
    );

    if (!category || hiddenCategories.has(category)) {
      continue;
    }

    const feature = cleanText(row["feature_name"] ?? row["feature"]);

    const value = cleanText(
      row["value"] ??
        row["value_combined"] ??
        row["aims_value_text"] ??
        row["aims_value_numeric"]
    );

    if (!value) continue;

    if (!grouped[category]) {
      grouped[category] = [];
    }

    if (category === "Allergy") {
      const lowerValue = value.toLowerCase();

      if (["no", "none", "negative", "false", "0"].includes(lowerValue)) {
        if (!grouped[category].includes("No known allergy")) {
          grouped[category].push("No known allergy");
        }
        continue;
      }

      if (["yes", "positive", "true", "1"].includes(lowerValue)) {
        const allergyName = feature || "Allergy";
        if (!grouped[category].includes(allergyName)) {
          grouped[category].push(allergyName);
        }
        continue;
      }

      const allergyText = feature ? `${feature}: ${value}` : value;
      if (!grouped[category].includes(allergyText)) {
        grouped[category].push(allergyText);
      }
      continue;
    }

    if (!grouped[category].includes(value)) {
      grouped[category].push(value);
    }
  }

  return grouped;
}

async function fetchCsvRows(folder: string, filename: string): Promise<CsvRow[]> {
  const url = `${DATASET_BASE}/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  return Papa.parse<CsvRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

async function fetchOptionalCsvRows(
  folder: string,
  filename: string
): Promise<CsvRow[]> {
  const url = `${DATASET_BASE}/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return [];
  }

  const text = await res.text();

  return Papa.parse<CsvRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

function useVoiceNote() {
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const start = async () => {
    setText("");
    setAudioBlob(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechRecognitionLanguage();
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setText(transcript);
    };

    recognition.start();
    recognitionRef.current = recognition;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setAudioBlob(blob);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return {
    recording,
    text,
    setText,
    audioBlob,
    start,
    stop,
  };
}

function hasAnyVitalData(vitals: VitalPanelData | null) {
  if (!vitals) return false;

  const groups = [
    vitals.main,
    vitals.gas,
    vitals.ventilation,
    vitals.hemodynamics,
    vitals.cv,
    vitals.depth,
    vitals.tmp,
    vitals.other,
  ];

  return groups.some((group) =>
    Object.values(group ?? {}).some((arr) =>
      (arr ?? []).some((p) => Number.isFinite(p.value))
    )
  );
}

function buildEmptyEpisodeState(): EpisodeAnnotationState {
  return {
    stage: "select_all",
    annotateStep: "detect",
    detectedEpisodes: [],
    prioritizedEpisodeIds: [],
    activeEpisodeId: null,
  };
}

function buildEpisodeTitle(episodes: DetectedEpisodeItem[]): string {
  return `Episode ${episodes.length + 1}`;
}

function renumberDetectedEpisodes(
  episodes: DetectedEpisodeItem[]
): DetectedEpisodeItem[] {
  return episodes.map((episode, index) => ({
    ...episode,
    label: `Episode ${index + 1}`,
  }));
}

type ZipFileEntry = {
  path: string;
  data: string;
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(output: number[], value: number) {
  output.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  );
}

function appendBytes(output: number[], bytes: Uint8Array) {
  for (let i = 0; i < bytes.length; i += 1) {
    output.push(bytes[i]);
  }
}

function makeZipBlob(entries: ZipFileEntry[]) {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const centralDirectory: number[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = encoder.encode(entry.data);
    const crc = crc32(dataBytes);
    const localHeaderOffset = output.length;

    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0x0800);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint32(output, crc);
    writeUint32(output, dataBytes.length);
    writeUint32(output, dataBytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    appendBytes(output, nameBytes);
    appendBytes(output, dataBytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0x0800);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, crc);
    writeUint32(centralDirectory, dataBytes.length);
    writeUint32(centralDirectory, dataBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localHeaderOffset);
    appendBytes(centralDirectory, nameBytes);
  }

  const centralDirectoryOffset = output.length;
  output.push(...centralDirectory);

  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, entries.length);
  writeUint16(output, entries.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralDirectoryOffset);
  writeUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: "application/zip" });
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const [selectedPatients, setSelectedPatients] = useState<StoredSelected[]>([]);
  const currentPatient = selectedPatients[currentPatientIndex];
  const currentCaseLabel = currentPatient?.folder ?? "unknown_patient";
  const currentDisplayCaseId = currentPatient?.displayCaseId ?? currentPatientIndex + 1;
  const [caseId, setCaseId] = useState("unknown_case");
  const [demographic, setDemographic] = useState<PatientDemographic | null>(null);
  const [surgeryContext, setSurgeryContext] = useState<SurgeryContext | null>(null);
  const [preop, setPreop] = useState<PreopAssessment | null>(null);
  const [preopHistoryRows, setPreopHistoryRows] = useState<CsvRow[]>([]);
  const [lab, setLab] = useState<LabData | null>(null);
  const [vitals, setVitals] = useState<VitalPanelData | null>(null);
  const [medications, setMedications] = useState<MedicationPanelData | null>(null);
  const [medBolusRowsState, setMedBolusRowsState] = useState<CsvRow[]>([]);
  const [medInfusionRowsState, setMedInfusionRowsState] = useState<CsvRow[]>([]);
  const [fluids, setFluids] = useState<FluidPanelData | null>(null);
  const [fluidInRowsState, setFluidInRowsState] = useState<CsvRow[]>([]);
  const [fluidOutRowsState, setFluidOutRowsState] = useState<CsvRow[]>([]);
  const [caseStaticRowState, setCaseStaticRowState] = useState<CsvRow | null>(null);
  const [caseDynamicRowsState, setCaseDynamicRowsState] = useState<CsvRow[]>([]);

  const [anesthesiaStart, setAnesthesiaStart] = useState<string | null>(null);
  const [anesthesiaStop, setAnesthesiaStop] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [patientSummaryCompleted, setPatientSummaryCompleted] = useState(false);
  const [abnormalityReasoningCompleted, setAbnormalityReasoningCompleted] =
    useState(false);
  const [managementReasoningCompleted, setManagementReasoningCompleted] = useState(false);
  const [selectedTask, setSelectedTask] = useState<WorkspaceTaskKey>("summary");
  const [annotationLevel, setAnnotationLevel] = useState<AnnotationLevel>("summary");

  const [selectedDetectVital, setSelectedDetectVital] = useState<DetectVital>("MAP");
  const [selectedWindow, setSelectedWindow] = useState<SelectedWindow | null>(null);

  const [timeResolution, setTimeResolution] = useState<15 | 5>(15);
  const [viewStartMin, setViewStartMin] = useState(0);
  const [sharedScrollLeft, setSharedScrollLeft] = useState(0);
  const [managementEvents, setManagementEvents] = useState<ManagementEvent[]>([]);
  const [selectedManagementEvent, setSelectedManagementEvent] =
    useState<ManagementEvent | null>(null);
  const [dashboardBackStack, setDashboardBackStack] = useState<number[]>([]);
  const [episodeState, setEpisodeState] = useState<EpisodeAnnotationState>(
    buildEmptyEpisodeState()
  );
  const [episodeTaskCompletion, setEpisodeTaskCompletion] =
    useState<EpisodeTaskCompletionMap>({});
  const [reviewHydrationVersion, setReviewHydrationVersion] = useState(0);

  const [preopInfoOpen, setPreopInfoOpen] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [isUserGuideMode, setIsUserGuideMode] = useState(false);
  const isCaseLocked = hasSubmitted && !isReviewMode;

  const sessionStartRef = useRef<number>(performance.now());
  const sessionStartUtcRef = useRef<string>(new Date().toISOString());
  const sessionStartLocalRef = useRef<string>(getLocalTimestamp());
  const visualizationPanelRef = useRef<HTMLDivElement | null>(null);
  const actionLogRef = useRef<
    Array<{
      type: string;
      ts: number;
      payload?: Record<string, any>;
    }>
  >([]);

  function logAction(type: string, payload?: Record<string, any>) {
    const ts = performance.now() - sessionStartRef.current;
    actionLogRef.current.push({
      type,
      ts,
      payload,
    });
    console.log("[ACTION]", { type, ts, payload });
  }

  function saveDashboardDraft() {
    if (!currentPatient?.folder || !caseId || caseId === "unknown_case") return;
  
    try {
      const episodeStateToSave =
        isReviewMode
          ? forceReviewEpisodeSelectionStage(episodeState) ?? episodeState
          : episodeState;
  
      localStorage.setItem(
        dashboardDraftKey(currentPatient.folder, caseId),
        JSON.stringify({
          selectedTask,
          annotationLevel,
          selectedDetectVital,
          selectedWindow,
          patientSummaryCompleted,
          abnormalityReasoningCompleted,
          managementReasoningCompleted,
          episodeState: episodeStateToSave,
          episodeTaskCompletion,
          selectedManagementEventId: getManagementEventId(selectedManagementEvent),
          hasSubmitted,
        } satisfies DashboardCaseDraft)
      );
    } catch {
      // ignore
    }
  }
  const prioritizedEpisodes = useMemo(() => {
    return episodeState.detectedEpisodes.filter((e) =>
      episodeState.prioritizedEpisodeIds.includes(e.id)
    );
  }, [episodeState]);

  const activeEpisode = useMemo(() => {
    if (!episodeState.activeEpisodeId) return null;
    return (
      episodeState.detectedEpisodes.find(
        (e) => e.id === episodeState.activeEpisodeId
      ) ?? null
    );
  }, [episodeState]);

  const activeEpisodeNumber = useMemo(() => {
    if (!activeEpisode) return null;

    const idx = prioritizedEpisodes.findIndex(
      (episode) => episode.id === activeEpisode.id
    );

    return idx >= 0 ? idx + 1 : null;
  }, [activeEpisode, prioritizedEpisodes]);


  const selectedEvent: SidebarEventItem | null = useMemo(() => {
    if (!activeEpisode) return null;
  
    const completed = episodeTaskCompletion[activeEpisode.id];
  
    return {
      id: activeEpisode.id,
      vital: activeEpisode.vital,
      title: activeEpisode.label,
      episodeLabel: activeEpisode.label,
      startMin: activeEpisode.startMin,
      endMin: activeEpisode.endMin,
      y1: activeEpisode.y1,
      y2: activeEpisode.y2,
  
      createdAtUtc: activeEpisode.createdAtUtc,
      updatedAtUtc: activeEpisode.updatedAtUtc,
  
      completed: {
        detect: completed?.detect ?? false,
        mechanism: false,
        fluidEval: false,
      },
    };
  }, [activeEpisode, episodeTaskCompletion]);

  useEffect(() => {
    if (annotationLevel !== "episode") return;
    if (!activeEpisode) return;
  
    setSelectedDetectVital(activeEpisode.vital);
    setSelectedWindow({
      vital: activeEpisode.vital,
      startMin: activeEpisode.startMin,
      endMin: activeEpisode.endMin,
      y1: activeEpisode.y1,
      y2: activeEpisode.y2,
    });
  }, [annotationLevel, activeEpisode]);
  function resetEpisodeWorkflow() {
    if (isCaseLocked) return;
    setEpisodeState(buildEmptyEpisodeState());
    setEpisodeTaskCompletion({});
    setAbnormalityReasoningCompleted(false);
    setSelectedWindow(null);
  }

  const canSubmitFinal = isReviewMode
    ? true
    : patientSummaryCompleted &&
      abnormalityReasoningCompleted &&
      managementReasoningCompleted &&
      episodeState.prioritizedEpisodeIds.length > 0;

  function validateBeforeFinalSubmit(): string | null {
    if (isReviewMode) {
      return null;
    }

    if (!patientSummaryCompleted) {
      return "Please complete and save the patient-level summary before submitting.";
    }
  
    if (!managementReasoningCompleted) {
      return "Please complete and save the management reasoning before submitting.";
    }
  
    if (episodeState.prioritizedEpisodeIds.length === 0) {
      return "Please select and annotate at least one episode before submitting.";
    }
  
    if (!abnormalityReasoningCompleted) {
      return "Please save the detailed annotation for one selected episode before submitting.";
    }
  
    return null;
  }

  function handleCreateEpisodeFromWindow(window: SelectedWindow) {
    if (isCaseLocked) return;
    setEpisodeState((prev) => {
      const duplicate = prev.detectedEpisodes.some(
        (e) =>
          e.vital === window.vital &&
          e.startMin === window.startMin &&
          e.endMin === window.endMin
      );

      if (duplicate) {
        logAction("episode_duplicate_ignored", {
          vital: window.vital,
          startMin: window.startMin,
          endMin: window.endMin,
        });
        return prev;
      }

      const nowUtc = new Date().toISOString();

      const newEpisode: DetectedEpisodeItem = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: buildEpisodeTitle(prev.detectedEpisodes),
        vital: window.vital,
        startMin: window.startMin,
        endMin: window.endMin,
        y1: window.y1,
        y2: window.y2,
        selectedForAnnotation: false,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      };

      setEpisodeTaskCompletion((prevCompletion) => ({
        ...prevCompletion,
        [newEpisode.id]: {
          detect: false
        },
      }));

      logAction("episode_detected_add", {
        id: newEpisode.id,
        label: newEpisode.label,
        vital: newEpisode.vital,
        startMin: newEpisode.startMin,
        endMin: newEpisode.endMin,
      });

      return {
        ...prev,
        detectedEpisodes: [...prev.detectedEpisodes, newEpisode],
      };
    });
  }

  function handleDeleteDetectedEpisode(episodeId: string) {
    if (isCaseLocked) return;
    setEpisodeState((prev) => {
      const filteredDetected = prev.detectedEpisodes.filter((e) => e.id !== episodeId);
      const renumberedDetected = renumberDetectedEpisodes(filteredDetected);

      const nextPrioritized = prev.prioritizedEpisodeIds.filter((id) => id !== episodeId);

      let nextActive = prev.activeEpisodeId;
      if (nextActive === episodeId) {
        nextActive = nextPrioritized[0] ?? null;
      }

      return {
        ...prev,
        detectedEpisodes: renumberedDetected,
        prioritizedEpisodeIds: nextPrioritized,
        activeEpisodeId: nextActive,
      };
    });

    setEpisodeTaskCompletion((prev) => {
      const next = { ...prev };
      delete next[episodeId];
      return next;
    });

    setAbnormalityReasoningCompleted(false);
    try {
      const patientFolder = currentPatient?.folder ?? "unknown_patient";
      localStorage.removeItem(
        `annotationResult:abnormality_reasoning:${patientFolder}:${caseId}`
      );
      localStorage.removeItem(
        `annotationDraft:abnormality_reasoning:${patientFolder}:${caseId}:${episodeId}`
      );
    } catch {
      // ignore localStorage cleanup failures
    }

    logAction("episode_detected_delete", { episodeId });
  }

  function handleTogglePrioritizedEpisode(episodeId: string) {
    if (isCaseLocked) return;
    setEpisodeState((prev) => {
      const isSelected = prev.prioritizedEpisodeIds.includes(episodeId);

      const nextPrioritized = isSelected
        ? prev.prioritizedEpisodeIds.filter((id) => id !== episodeId)
        : [...prev.prioritizedEpisodeIds, episodeId];

      const nextDetected = prev.detectedEpisodes.map((episode) =>
        episode.id === episodeId
          ? { ...episode, selectedForAnnotation: !isSelected }
          : {
              ...episode,
              selectedForAnnotation: nextPrioritized.includes(episode.id),
            }
      );

      let nextActive = prev.activeEpisodeId;
      if (!nextActive || !nextPrioritized.includes(nextActive)) {
        nextActive = nextPrioritized[0] ?? null;
      }

      logAction("episode_prioritized_toggle", {
        episodeId,
        selected: !isSelected,
        prioritizedCount: nextPrioritized.length,
      });

      return {
        ...prev,
        detectedEpisodes: nextDetected,
        prioritizedEpisodeIds: nextPrioritized,
        activeEpisodeId: nextActive,
      };
    });
  }

  
  async function handleAdvanceEpisodeStage() {
    if (isCaseLocked) return;
    if (episodeState.stage === "select_all") {
      if (episodeState.detectedEpisodes.length === 0) {
        setSubmitError("Please detect at least one episode before continuing.");
        return;
      }
  
      if (episodeState.prioritizedEpisodeIds.length === 0) {
        setSubmitError("Please confirm at least one episode before continuing.");
        return;
      }
  
      setSubmitError(null);
      setSelectedTask("detect");
      setEpisodeState((prev) => ({
        ...prev,
        stage: "annotate",
        activeEpisodeId: prev.prioritizedEpisodeIds[0] ?? null,
      }));
  
      logAction("episode_stage_advance", {
        from: "select_all",
        to: "annotate",
      });
  
      return;
    }
  
    if (episodeState.stage === "pick_top3") {
      if (episodeState.prioritizedEpisodeIds.length === 0) {
        setSubmitError("Please confirm at least one episode before continuing.");
        return;
      }
  
      setSubmitError(null);
      setSelectedTask("detect");
      setEpisodeState((prev) => ({
        ...prev,
        stage: "annotate",
        activeEpisodeId: prev.prioritizedEpisodeIds[0] ?? null,
      }));
  
      logAction("episode_stage_advance", {
        from: "pick_top3",
        to: "annotate",
      });
    }
  }
  function handleTimelineWindowCreate(window: SelectedWindow) {
    if (isCaseLocked) return;
    if (annotationLevel === "episode") {
      if (episodeState.stage === "annotate") {
        if (episodeState.activeEpisodeId) {
          handleSelectedWindowChange(window);
        } else {
          handleCreateEpisodeFromWindow(window);
        }
        setSelectedWindow(window);
        return;
      }
  
      handleCreateEpisodeFromWindow(window);
      setSelectedWindow(window);
      return;
    }
  
    setSelectedWindow(window);
  }

  function handleSelectedWindowChange(nextWindow: SelectedWindow | null) {
    if (isCaseLocked) return;
    const previousWindow = selectedWindow;
  
    setSelectedWindow(nextWindow);
  
    if (!nextWindow) return;
  
    if (annotationLevel !== "episode") return;
  
    setEpisodeState((prev) => {
      let targetEpisodeId: string | null = null;
  
      if (prev.stage === "annotate") {
        targetEpisodeId = prev.activeEpisodeId;
      }
  
      if (
        (prev.stage === "select_all" || prev.stage === "pick_top3") &&
        previousWindow
      ) {
        const matchedEpisode = prev.detectedEpisodes.find(
          (episode) =>
            episode.vital === previousWindow.vital &&
            episode.startMin === previousWindow.startMin &&
            episode.endMin === previousWindow.endMin &&
            episode.y1 === previousWindow.y1 &&
            episode.y2 === previousWindow.y2
        );
  
        targetEpisodeId = matchedEpisode?.id ?? null;
      }
  
      if (!targetEpisodeId) return prev;
  
      const updatedEpisodes = prev.detectedEpisodes.map((episode) => {
        if (episode.id !== targetEpisodeId) return episode;
  
        return {
          ...episode,
          vital: nextWindow.vital,
          startMin: nextWindow.startMin,
          endMin: nextWindow.endMin,
          y1: nextWindow.y1,
          y2: nextWindow.y2,
          updatedAtUtc: new Date().toISOString(),
        };
      });
  
      logAction("episode_window_adjust", {
        episodeId: targetEpisodeId,
        vital: nextWindow.vital,
        startMin: nextWindow.startMin,
        endMin: nextWindow.endMin,
        y1: nextWindow.y1,
        y2: nextWindow.y2,
        stage: prev.stage,
      });
  
      return {
        ...prev,
        detectedEpisodes: updatedEpisodes,
      };
    });
  }

  function handleSaveAndNextStep(task: AnnotationTaskKey) {
    if (isCaseLocked) return;
    if (!activeEpisode) return;

    setEpisodeTaskCompletion((prev) => ({
      ...prev,
      [activeEpisode.id]: {
        ...(prev[activeEpisode.id] ?? {
          detect: false
        }),
        [task]: true,
      },
    }));

    const currentIndex = EPISODE_TASK_ORDER.indexOf(task);
    if (currentIndex >= 0 && currentIndex < EPISODE_TASK_ORDER.length - 1) {
      setSelectedTask(EPISODE_TASK_ORDER[currentIndex + 1] as WorkspaceTaskKey);
      return;
    }

    logAction("episode_detail_annotation_saved", {
      episodeId: activeEpisode.id,
      task,
    });
  }

  useEffect(() => {
    const raw = localStorage.getItem("gameData");
    if (!raw) {
      const currentWorkflowMode =
        localStorage.getItem("currentWorkflowMode") === "review"
          ? "review"
          : "annotation";
  
      router.push(
        currentWorkflowMode === "review" ? "/review-list" : "/patient-list"
      );
      return;
    }
  
    const params = new URLSearchParams(window.location.search);
    const guideFromUrl = params.get("guide") === "1";
    const guideFromStorage = localStorage.getItem("isUserGuideMode") === "true";
    const nextIsUserGuideMode = guideFromUrl || guideFromStorage;
  
    setIsUserGuideMode(nextIsUserGuideMode);
  
    const gameData = JSON.parse(raw) as GameData;
    const idx = gameData.currentPatientIndex ?? 0;
  
    setCurrentPatientIndex(idx);
    setSelectedPatients(gameData.selectedPatients || []);
    setDashboardBackStack([]);
  
    if (gameData.selectedPatients?.length) {
      void loadPatient(
        gameData.selectedPatients[idx].folder,
        gameData.selectedPatients[idx]
      );
  
      if (nextIsUserGuideMode) {
        window.setTimeout(() => {
          setShowUserGuide(true);
        }, 500);
      }
    } else {
      setLoading(false);
      setLoadError("No selected patients found.");
    }
  }, [router]);

  function focusManagementEventOnTimeline() {
    if (!selectedManagementEvent) return;

    const eventTime = Number(selectedManagementEvent.time_min);
    if (Number.isFinite(eventTime)) {
      const pxPerMin = timeResolution === 5 ? 64 / 5 : 64 / 15;
      const targetStart = Math.max(
        0,
        Math.min(
          Math.max(0, sharedTimelineEnd - viewWindowWidthMin),
          eventTime - Math.floor(viewWindowWidthMin * 0.25)
        )
      );

      setViewStartMin(targetStart);
      setSharedScrollLeft(Math.max(0, targetStart * pxPerMin));
    }

    visualizationPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    logAction("management_direct_to_event", {
      eventId: getManagementEventId(selectedManagementEvent),
      timeMin: selectedManagementEvent.time_min,
    });
  }

  function persistCurrentPatientIndex(nextIndex: number) {
    try {
      const raw = localStorage.getItem("gameData");
      if (!raw) return;

      const gameData = JSON.parse(raw) as GameData;
      localStorage.setItem(
        "gameData",
        JSON.stringify({
          ...gameData,
          currentPatientIndex: nextIndex,
        })
      );
    } catch {
      // ignore corrupted localStorage
    }
  }

  async function navigateToPatientIndex(
    nextIndex: number,
    options: { pushCurrentToBackStack?: boolean } = {}
  ) {
    const nextPatient = selectedPatients[nextIndex];
    if (!nextPatient) return;

    if (options.pushCurrentToBackStack) {
      setDashboardBackStack((prev) => [...prev, currentPatientIndex]);
    }

      setCurrentPatientIndex(nextIndex);
    persistCurrentPatientIndex(nextIndex);
    await loadPatient(nextPatient.folder);
  }

  async function handleBackNavigation() {
    logAction("go_back");

    const previousPatientIndex = dashboardBackStack[dashboardBackStack.length - 1];

    if (previousPatientIndex !== undefined) {
      setDashboardBackStack((prev) => prev.slice(0, -1));
      await navigateToPatientIndex(previousPatientIndex);
      return;
    }

    router.push(isReviewMode ? "/review-list" : "/patient-list");
  }

  async function handleNextNavigation() {
    const accessOk = await validateStoredAccessCodeOrRedirect();

    if (!accessOk) {
      return;
    }

    const nextIndex = currentPatientIndex + 1;
    if (nextIndex >= selectedPatients.length) {
      alert("No more patients.");
      return;
    }

    if (!hasSubmitted) {
      if (isReviewMode) {
        logAction("next_in_review_mode_without_validation");
        await navigateToPatientIndex(nextIndex, { pushCurrentToBackStack: true });
        return;
      }

      const validationError = validateBeforeFinalSubmit();

      if (!validationError) {
        logAction("next_with_submit");
        const success = await submitCurrentSession();
        if (!success) return;
      } else {
        const ok = window.confirm(
          `${validationError}\n\nMove to the next patient without submitting this case?`
        );

        if (!ok) {
          logAction("next_cancelled", { reason: "incomplete_case" });
          return;
        }

        logAction("next_without_submit", { reason: validationError });
      }
    } else {
      logAction(isReviewMode ? "next_in_review_mode" : "next_after_submit");
    }

    await navigateToPatientIndex(nextIndex, { pushCurrentToBackStack: true });
  }

  async function loadPatient(
    folder: string,
    patientMetaOverride?: StoredSelected | null
  ) {
    try {
      sessionStartRef.current = performance.now();
      sessionStartUtcRef.current = new Date().toISOString();
      sessionStartLocalRef.current = getLocalTimestamp();
      actionLogRef.current = [];
  
      const patientMeta =
        patientMetaOverride ??
        selectedPatients.find((patient) => patient.folder === folder);
  
      const reviewMode = patientMeta?.workflowMode === "review";
  
      let reviewPayloadPromise: Promise<DriveReviewPayload | null> =
        Promise.resolve(null);
  
      setHasSubmitted(false);
      setIsReviewMode(reviewMode);
  
      try {
        localStorage.setItem(
          "currentWorkflowMode",
          reviewMode ? "review" : "annotation"
        );
        localStorage.setItem(
          "currentDisplayCaseId",
          String(patientMeta?.displayCaseId ?? currentPatientIndex + 1)
        );
      } catch {
        // ignore
      }
  
      setPatientSummaryCompleted(false);
      setAbnormalityReasoningCompleted(false);
      setManagementReasoningCompleted(false);
      setSubmitError(null);
      setLoadError(null);
      setLoading(true);
  
      setSelectedTask("summary");
      setSelectedDetectVital("MAP");
      setSelectedWindow(null);
      setAnnotationLevel("summary");
      setTimeResolution(15);
      setViewStartMin(0);
      setSharedScrollLeft(0);
      setManagementEvents([]);
      setSelectedManagementEvent(null);
      setEpisodeState(buildEmptyEpisodeState());
      setEpisodeTaskCompletion({});
      setReviewHydrationVersion(0);
  
      const [
        caseInfoRows,
        patientAttrRows,
        caseStaticRows,
        caseDynamicRows,
        preopRows,
        preopHistoryRowsLoaded,
        labRows,
        vitalRows,
        gasRows,
        ventilationRows,
        cvRows,
        temperatureRows,
        medBolusRows,
        medInfusionRows,
        fluidInRows,
        fluidOutRows,
        managementRows,
      ] = await Promise.all([
        fetchCsvRows(folder, "case_info.csv"),
        fetchCsvRows(folder, "patients_attributes_case.csv"),
        fetchCsvRows(folder, "case_static.csv"),
        fetchCsvRows(folder, "case_dynamic_events.csv"),
        fetchCsvRows(folder, "preop.csv"),
        fetchOptionalCsvRows(folder, "preop_history.csv"),
        fetchCsvRows(folder, "lab.csv"),
        fetchCsvRows(folder, "vital.csv"),
        fetchCsvRows(folder, "gas.csv"),
        fetchCsvRows(folder, "ventilation.csv"),
        fetchCsvRows(folder, "cv.csv"),
        fetchCsvRows(folder, "temperature.csv"),
        fetchCsvRows(folder, "med_bolus.csv"),
        fetchCsvRows(folder, "med_infusion.csv"),
        fetchCsvRows(folder, "fluid_in.csv"),
        fetchCsvRows(folder, "fluid_out.csv"),
        fetchCsvRows(folder, "management.csv"),
      ]);
  
      const caseInfo = caseInfoRows[0] ?? {};
      const patientAttr = patientAttrRows[0] ?? {};
      const caseStatic = caseStaticRows[0] ?? {};
      const preopRow = preopRows[0] ?? {};
      const labRow = labRows[0] ?? {};
  
      const phyRows = buildPhysiologyRowsFromPanelFiles({
        vitalRows,
        gasRows,
        ventilationRows,
        cvRows,
        temperatureRows,
      });
  
      const resolvedCaseId =
        String(caseInfo["mpog_case_id"] ?? "").trim() ||
        String(caseStatic["mpog_case_id"] ?? "").trim() ||
        folder;
  
      setCaseId(resolvedCaseId);
  
      const rawAnesthesiaStart = caseStatic["anesthesia_start"] ?? null;
      const visualizationStart =
        roundDownToQuarterHourIso(rawAnesthesiaStart) ?? rawAnesthesiaStart;
  
      const visualizationOffsetMin = getMinuteOffset(
        rawAnesthesiaStart,
        visualizationStart
      );
  
      const visualizationCaseStatic = {
        ...caseStatic,
        __visualization_start: visualizationStart,
      };
  
      const shiftedPhyRows = shiftRelativeTimeRows(
        phyRows,
        ["relative_anesthesia_time"],
        visualizationOffsetMin
      );
  
      const shiftedMedBolusRows = shiftRelativeTimeRows(
        medBolusRows,
        ["relative_anesthesia_time"],
        visualizationOffsetMin
      );
  
      const shiftedMedInfusionRows = shiftRelativeTimeRows(
        medInfusionRows,
        ["relative_anesthesia_start", "relative_anesthesia_end"],
        visualizationOffsetMin
      );
  
      const shiftedFluidInRows = shiftRelativeTimeRows(
        fluidInRows,
        ["relative_anesthesia_start", "relative_anesthesia_end"],
        visualizationOffsetMin
      );
  
      const shiftedFluidOutRows = shiftRelativeTimeRows(
        fluidOutRows,
        ["relative_anesthesia_start", "relative_anesthesia_end"],
        visualizationOffsetMin
      );
  
      const shiftedManagementRows = shiftRelativeTimeRows(
        managementRows,
        ["time_min", "end_time_min"],
        visualizationOffsetMin
      );
  
      setCaseStaticRowState(visualizationCaseStatic);
      setCaseDynamicRowsState(caseDynamicRows);
      setAnesthesiaStart(visualizationStart);
      setAnesthesiaStop(caseStatic["anesthesia_stop"] ?? null);
  
      setDemographic(
        prepareDemographicData(caseInfo, patientAttr, preopRow, resolvedCaseId)
      );
  
      setSurgeryContext(
        prepareSurgeryContextData(caseInfo, caseStatic, preopRow)
      );
  
      setPreop(preparePreopData(preopRow));
      setPreopHistoryRows(preopHistoryRowsLoaded);
      setLab(prepareLabData(labRow));
      setVitals(prepareVitalsDataRaw(shiftedPhyRows));
  
      setMedBolusRowsState(shiftedMedBolusRows);
      setMedInfusionRowsState(shiftedMedInfusionRows);
      setFluidInRowsState(shiftedFluidInRows);
      setFluidOutRowsState(shiftedFluidOutRows);
  
      setMedications(
        prepareMedicationData(shiftedMedBolusRows, shiftedMedInfusionRows)
      );
  
      setFluids(prepareFluidData(shiftedFluidInRows, shiftedFluidOutRows));
  
      const parsedManagementEvents = enrichManagementEventsWithChangeValues(
        prepareManagementEvents(shiftedManagementRows),
        shiftedMedInfusionRows,
        shiftedPhyRows
      );
  
      setManagementEvents(parsedManagementEvents);
      setSelectedManagementEvent(parsedManagementEvents[0] ?? null);
  
      try {
        let participantInfo: any = {};
  
        try {
          const raw = localStorage.getItem("participantInfo");
          participantInfo = raw ? JSON.parse(raw) : {};
        } catch {
          participantInfo = {};
        }
  
        const accessCode =
          String(
            participantInfo?.accessCode ??
              localStorage.getItem("doctorAccessCode") ??
              ""
          ).trim() || "";
  
        const doctorName = String(participantInfo?.name ?? "").trim();
  
        const displayCaseId =
          String(patientMeta?.displayCaseId ?? currentPatientIndex + 1).trim();
  
          if (reviewMode) {
            clearCaseLocalDrafts(folder, resolvedCaseId);
          
            if (accessCode && displayCaseId) {
              const params = new URLSearchParams({
                accessCode,
                doctorName,
                patientId: folder,
                displayCaseId,
                caseId: resolvedCaseId,
              });
          
              reviewPayloadPromise = fetch(
                `/api/case_review_data?${params.toString()}`,
                { cache: "no-store" }
              )
                .then(async (reviewRes) => {
                  if (!reviewRes.ok) return null;
                  return (await reviewRes.json()) as DriveReviewPayload;
                })
                .catch((error) => {
                  console.error("Failed to load review content from Drive:", error);
                  return null;
                });
            }
          }
      } catch (error) {
        console.error("Failed to load review content from Drive:", error);
      }
  
      try {
        const reviewPayload = await reviewPayloadPromise;
  
        if (reviewPayload && hasAnyDriveReviewContent(reviewPayload)) {
          const remoteCaseId = extractPayloadCaseId(reviewPayload);
          const caseIdsMatch = !remoteCaseId || remoteCaseId === resolvedCaseId;
  
          if (caseIdsMatch) {
            hydrateReviewDraftFromDrive({
              patientFolder: folder,
              caseId: resolvedCaseId,
              payload: reviewPayload,
            });
  
            setReviewHydrationVersion((value) => value + 1);
          } else {
            console.warn("Skipping Drive hydrate due to caseId mismatch.", {
              patientFolder: folder,
              localCaseId: resolvedCaseId,
              remoteCaseId,
            });
          }
        }
      } catch (error) {
        console.error("Failed to hydrate review content from Drive:", error);
      }
  
      const savedDraft = readStoredJson<DashboardCaseDraft>(
        dashboardDraftKey(folder, resolvedCaseId)
      );
  
      const storedAbnormalityResult =
        readStoredJson<Record<string, unknown>>(
          `annotationResult:abnormality_reasoning:${folder}:${resolvedCaseId}`
        );
  
      const fallbackEpisodeState = buildEpisodeStateFromStoredAbnormalityResult({
        abnormalityResult: storedAbnormalityResult,
        anesthesiaStart: visualizationStart,
      });
  
      if (savedDraft) {
        if (savedDraft.selectedTask) {
          setSelectedTask(savedDraft.selectedTask);
        }
  
        if (!reviewMode && savedDraft.annotationLevel) {
          setAnnotationLevel(savedDraft.annotationLevel);
        }
        if (savedDraft.selectedDetectVital) {
          setSelectedDetectVital(savedDraft.selectedDetectVital);
        }
  
        if (!reviewMode && savedDraft.selectedWindow !== undefined) {
          setSelectedWindow(savedDraft.selectedWindow ?? null);
        }
  
        if (typeof savedDraft.patientSummaryCompleted === "boolean") {
          setPatientSummaryCompleted(savedDraft.patientSummaryCompleted);
        }
  
        if (typeof savedDraft.abnormalityReasoningCompleted === "boolean") {
          setAbnormalityReasoningCompleted(
            savedDraft.abnormalityReasoningCompleted
          );
        }
  
        if (typeof savedDraft.managementReasoningCompleted === "boolean") {
          setManagementReasoningCompleted(
            savedDraft.managementReasoningCompleted
          );
        }
  
        if (!reviewMode && typeof savedDraft.hasSubmitted === "boolean") {
          setHasSubmitted(savedDraft.hasSubmitted);
        }
  
        if (savedDraft.selectedManagementEventId) {
          const restoredManagementEvent =
            parsedManagementEvents.find(
              (event) =>
                getManagementEventId(event) ===
                savedDraft.selectedManagementEventId
            ) ?? null;
  
          if (restoredManagementEvent) {
            setSelectedManagementEvent(restoredManagementEvent);
          }
        }
      }
  
      const baseEpisodeState = savedDraft?.episodeState ?? fallbackEpisodeState;

      if (reviewMode) {
        const reviewEpisodeState =
          forceReviewEpisodeSelectionStage(baseEpisodeState);
      
        // Review mode 进入 case 时，永远先停在 Summary
        setAnnotationLevel("summary");
        setSelectedTask("summary");
      
        if (reviewEpisodeState) {
          // 但是提前恢复 abnormality checklist
          // reviewer 点 Abnormality Reasoning 后，就能看到 checklist
          setEpisodeState(reviewEpisodeState);
      
          const nextCompletion: EpisodeTaskCompletionMap = {};
      
          for (const episode of reviewEpisodeState.detectedEpisodes) {
            nextCompletion[episode.id] = {
              detect: reviewEpisodeState.prioritizedEpisodeIds.includes(
                episode.id
              ),
            };
          }
      
          setEpisodeTaskCompletion(nextCompletion);
      
   
        }
      } else if (savedDraft?.episodeState) {
        setEpisodeState(savedDraft.episodeState);
      
        if (savedDraft.episodeTaskCompletion) {
          setEpisodeTaskCompletion(savedDraft.episodeTaskCompletion);
        }
      } else if (fallbackEpisodeState) {
        setEpisodeState(fallbackEpisodeState);
      
        if (fallbackEpisodeState.activeEpisodeId) {
          setEpisodeTaskCompletion({
            [fallbackEpisodeState.activeEpisodeId]: {
              detect: true,
            },
          });
        }
      
        setAbnormalityReasoningCompleted(
          Boolean(
            String(
              storedAbnormalityResult?.abnormalityReasoningText ??
                storedAbnormalityResult?.freeText ??
                ""
            ).trim()
          )
        );
      }
      
      setLoading(false);
    } catch (e: any) {
      console.error("Failed to load patient:", e);
      setLoadError(e?.message ?? "Failed to load patient.");
      setLoading(false);
    }
  }

  function getStoredAccessInfo() {
    let participantInfo: any = {};

    try {
      const raw = localStorage.getItem("participantInfo");
      participantInfo = raw ? JSON.parse(raw) : {};
    } catch {
      participantInfo = {};
    }

    const accessCode =
      String(
        participantInfo?.accessCode ??
          localStorage.getItem("doctorAccessCode") ??
          ""
      ).trim() || null;

    const doctorId =
      String(
        participantInfo?.doctorId ??
          localStorage.getItem("doctorId") ??
          ""
      ).trim() || null;

    return {
      participantInfo,
      accessCode,
      doctorId,
    };
  }


  async function validateStoredAccessCodeOrRedirect(): Promise<boolean> {
    const { accessCode } = getStoredAccessInfo();

    if (!accessCode || !/^\d{4}$/.test(accessCode)) {
      const message =
        "Invalid access code. Please log in again with a valid 4-digit access code.";

      setSubmitError(message);
      alert(message);

      logAction("blocked_invalid_access_code_format", {
        accessCodePresent: Boolean(accessCode),
      });

      router.push("/");
      return false;
    }

    try {
      const res = await fetch("/assigned_code/access_review_code.csv", {
        cache: "no-store",
      });

      if (!res.ok) {
        const message =
          "Failed to validate access code. Please log in again.";

        setSubmitError(message);
        alert(message);

        logAction("blocked_access_code_validation_load_failed", {
          status: res.status,
        });

        router.push("/");
        return false;
      }

      const text = await res.text();

      const rows = Papa.parse<CsvRow>(text, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      }).data;

      const matched = rows.find(
        (row) =>
          String(row["annotation_code"] ?? "").trim() === accessCode ||
          String(row["review_code"] ?? "").trim() === accessCode
      );

      if (!matched) {
        const message =
          "Invalid access code. Please log in again with a valid access code.";

        setSubmitError(message);
        alert(message);

        localStorage.removeItem("gameData");
        localStorage.removeItem("participantInfo");
        localStorage.removeItem("doctorAccessCode");
        localStorage.removeItem("doctorId");
        localStorage.removeItem("currentWorkflowMode");
        localStorage.removeItem("loginWorkflowMode");

        logAction("blocked_access_code_not_found", {
          accessCode,
        });

        router.push("/");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Access code validation failed:", error);

      const message =
        "Failed to validate access code. Please log in again.";

      setSubmitError(message);
      alert(message);

      logAction("blocked_access_code_validation_exception", {});
      router.push("/");
      return false;
    }
  }
  const collectSubmissionPayload = () => {
    const { participantInfo, accessCode, doctorId } = getStoredAccessInfo();

    const patientFolder = currentPatient?.folder ?? null;
  
    const summaryResult = patientFolder && caseId
      ? readStoredJson(`annotationResult:summary:${patientFolder}:${caseId}`)
      : null;
    const abnormalityReasoningResult = patientFolder && caseId
      ? readStoredJson(`annotationResult:abnormality_reasoning:${patientFolder}:${caseId}`)
      : null;
    const managementReasoningResult = patientFolder && caseId
      ? readStoredJson(`annotationResult:management_reasoning:${patientFolder}:${caseId}`)
      : null;
    const submittedAtUtc = new Date().toISOString();
    const totalDurationSec = Number(
      ((performance.now() - sessionStartRef.current) / 1000).toFixed(3)
    );

    return {
      doctorId,
      accessCode,
      patientId: patientFolder,
      patientFolder,
      displayCaseId: currentDisplayCaseId,
      workflowMode: isReviewMode ? "review" : "annotation",

      caseId,
      folder: patientFolder,
      panel: "case_summary",
      pageOpenedAt: sessionStartUtcRef.current,
      pageOpenedAtLocal: sessionStartLocalRef.current,
      submittedAt: submittedAtUtc,
      submittedAtLocal: getLocalTimestamp(),
      totalDurationSec,
      localTimezone: getBrowserTimezone(),
  
      participantInfo: {
        name: participantInfo?.name ?? null,
        email: participantInfo?.email ?? null,
      
        gender: participantInfo?.gender ?? null,
        degree: participantInfo?.degree ?? null,
        degrees: participantInfo?.degrees ?? null,
        degreeOther: participantInfo?.degreeOther ?? null,
      
        trainingCountry: participantInfo?.trainingCountry ?? null,
        clinicalRole: participantInfo?.clinicalRole ?? null,
        clinicalRoleOther: participantInfo?.clinicalRoleOther ?? null,
        experienceYears: participantInfo?.experienceYears ?? null,
      
        boardCertified: participantInfo?.boardCertified ?? null,
        clinicalSubspecialty: participantInfo?.clinicalSubspecialty ?? null,
      
        accessCode,
        doctorId,
        workflowMode: participantInfo?.workflowMode ?? (isReviewMode ? "review" : "annotation"),
        annotationCode: participantInfo?.annotationCode ?? null,
        loginTimestamp: participantInfo?.timestamp ?? null,
      },

      annotationState: {
        selectedTask,
        annotationLevel,
        selectedDetectVital,
        selectedWindow,
        patientSummaryCompleted,
        abnormalityReasoningCompleted,
        managementReasoningCompleted,
        episodeState,
        episodeTaskCompletion,
        selectedManagementEventId: getManagementEventId(selectedManagementEvent),
      },

      answers: {
        summary: summaryResult,
        abnormalityReasoning: abnormalityReasoningResult,
        managementReasoning: managementReasoningResult,
        completionStatus: {
          patientSummaryCompleted,
          abnormalityReasoningCompleted,
          managementReasoningCompleted,
        },
      },
    };
  };

  function makeSafeFileNamePart(value: unknown, fallback: string) {
    const text = String(value ?? "").trim();
    if (!text) return fallback;

    return text
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || fallback;
  }

  function downloadSubmissionPayload(payload: ReturnType<typeof collectSubmissionPayload>) {
    try {
      if (!payload.accessCode || !/^\d{4}$/.test(String(payload.accessCode))) {
        throw new Error("Invalid access code. Submission file was not generated.");
      }

      const patientPart = makeSafeFileNamePart(payload.patientFolder, "unknown_patient");
      const casePart = makeSafeFileNamePart(payload.caseId, "unknown_case");
      const accessCodePart = makeSafeFileNamePart(
        payload.accessCode,
        "invalid_code"
      );
      const modePart = payload.workflowMode === "review" ? "review" : "annotation";
      const root = `${accessCodePart}/${modePart}/patient_${patientPart}_${casePart}`;
      const fileName = `${accessCodePart}_${modePart}_${patientPart}_${casePart}.zip`;
      const archiveKey = `localDriveExportArchive:${payload.patientId ?? payload.patientFolder ?? "unknown_patient"}:${payload.caseId ?? "unknown_case"}`;
      const archived = JSON.parse(localStorage.getItem(archiveKey) || "[]");
      const archiveEntries = Array.isArray(archived) ? archived : [];
      const zipEntries: ZipFileEntry[] = archiveEntries
        .filter(
          (entry: any) =>
            entry &&
            typeof entry.objectPath === "string" &&
            !entry.objectPath.includes("case_status_index.json")
        )
        .map((entry: any) => ({
          path: entry.objectPath,
          data: JSON.stringify(entry.data, null, 2),
        }));
      zipEntries.push({
        path: `${root}/case_submission/case_summary.json`,
        data: JSON.stringify(
          {
            doctor_id: payload.doctorId ?? null,
            access_code: payload.accessCode,
            patient_id:
              payload.patientId ?? payload.patientFolder ?? "unknown_patient",
            patient_folder: payload.patientFolder ?? null,
            display_case_id: payload.displayCaseId ?? null,
            workflow_mode: payload.workflowMode ?? null,
        
            case_id: payload.caseId ?? null,
            folder: payload.folder ?? null,
            panel: payload.panel,
        
            saved_at_utc: payload.submittedAt,
            saved_at_local: payload.submittedAtLocal,
        
            participant_info: payload.participantInfo ?? null,
        
            annotation_state: payload.annotationState ?? null,
        
            answers: payload.answers,
        
            timing: {
              page_opened_at_utc: payload.pageOpenedAt,
              page_opened_at_local: payload.pageOpenedAtLocal,
              page_submitted_at_utc: payload.submittedAt,
              page_submitted_at_local: payload.submittedAtLocal,
              total_duration_sec: payload.totalDurationSec,
              local_timezone: payload.localTimezone,
            },
          },
          null,
          2
        ),
      });

      const blob = makeZipBlob(zipEntries);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Local submission download failed:", error);
    }
  }

  const submitCurrentSession = async (): Promise<boolean> => {
    const accessOk = await validateStoredAccessCodeOrRedirect();

    if (!accessOk) {
      return false;
    }

    const payload = collectSubmissionPayload();

    console.log("===== SUBMISSION PAYLOAD =====");
    console.log(payload);

    downloadSubmissionPayload(payload);

    try {
      setSubmitting(true);
      setSubmitError(null);

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        console.error("Submit failed:", res.status, msg);
        setSubmitError(`Submit failed (${res.status})`);
        return false;
      }

      if (!isReviewMode) {
        setHasSubmitted(true);
      }
      return true;
    } catch (e) {
      console.error("Submit exception:", e);
      setSubmitError("Submit exception");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const sharedTimelineEnd = (() => {
    if (!anesthesiaStart || !anesthesiaStop) return 240;
  
    const start = new Date(anesthesiaStart);
    const stop = new Date(anesthesiaStop);
  
    const diffMin = Math.ceil((stop.getTime() - start.getTime()) / 60000);
    if (!Number.isFinite(diffMin) || diffMin <= 0) return 240;
  
    return Math.ceil(diffMin / 5) * 5;
  })();

  const viewWindowWidthMin = useMemo(() => {
    if (timeResolution === 15) return 240;
    return 120;
  }, [timeResolution]);

  const sharedXTicks = Array.from(
    { length: Math.floor(sharedTimelineEnd / 15) + 1 },
    (_, i) => i * 15
  );

  useEffect(() => {
    const maxStart = Math.max(0, sharedTimelineEnd - viewWindowWidthMin);
    const nextViewStartMin = Math.min(viewStartMin, maxStart);
  
    if (nextViewStartMin !== viewStartMin) {
      setViewStartMin(nextViewStartMin);
    }
  
    const pxPerMin = timeResolution === 5 ? 64 / 5 : 64 / 15;
    setSharedScrollLeft(Math.max(0, nextViewStartMin * pxPerMin));
  }, [sharedTimelineEnd, viewWindowWidthMin, viewStartMin, timeResolution]);
  useEffect(() => {
    if (annotationLevel !== "otherEvents") return;
  
    if (!selectedManagementEvent && managementEvents.length > 0) {
      setSelectedManagementEvent(managementEvents[0]);
    }
  }, [annotationLevel, selectedManagementEvent, managementEvents]);

  useEffect(() => {
    if (loading) return;
    saveDashboardDraft();
  }, [
    loading,
    currentPatient?.folder,
    caseId,
    selectedTask,
    annotationLevel,
    selectedDetectVital,
    selectedWindow,
    patientSummaryCompleted,
    abnormalityReasoningCompleted,
    managementReasoningCompleted,
    episodeState,
    episodeTaskCompletion,
    selectedManagementEvent,
    hasSubmitted,
  ]);

  const timelineContext = useMemo(() => {
    if (!caseStaticRowState) return null;
  
    const contextStart =
    annotationLevel === "otherEvents" && selectedManagementEvent
      ? Math.max(0, Number(selectedManagementEvent.time_min) - 10)
      : annotationLevel === "episode"
        ? selectedWindow?.startMin
        : undefined;
  
  const contextEnd =
    annotationLevel === "otherEvents" && selectedManagementEvent
      ? Number(
          selectedManagementEvent.end_time_min ??
            selectedManagementEvent.time_min
        ) + 10
      : annotationLevel === "episode"
        ? selectedWindow?.endMin
        : undefined;
  
    return prepareTimelineContextData(
      caseStaticRowState,
      caseDynamicRowsState,
      contextStart,
      contextEnd,
      timeResolution
    );
  }, [
    caseStaticRowState,
    caseDynamicRowsState,
    selectedWindow,
    timeResolution,
    annotationLevel,
    selectedManagementEvent,
  ]);

  function handleChangeTimeResolution(nextResolution: 15 | 5) {
    setTimeResolution(nextResolution);
  
    const nextViewWindowWidthMin =
      nextResolution === 15 ? 240 : 120;
  
    const maxStart = Math.max(0, sharedTimelineEnd - nextViewWindowWidthMin);
    const nextViewStartMin = Math.min(viewStartMin, maxStart);
  
    const pxPerMin = nextResolution === 5 ? 64 / 5 : 64 / 15;
  
    setViewStartMin(nextViewStartMin);
    setSharedScrollLeft(Math.max(0, nextViewStartMin * pxPerMin));
  }
  const activeManagementEvent = useMemo(() => {
    if (annotationLevel !== "otherEvents") return null;
    return selectedManagementEvent;
  }, [annotationLevel, selectedManagementEvent]);


  

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-700" />
          <p className="text-lg">Loading patient data…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <div className="mb-3 text-4xl text-red-500">⚠️</div>
          <h2 className="mb-2 text-xl font-bold">Failed to Load Patient</h2>
          <p className="mb-4 text-sm text-gray-600">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div
        data-guide="dashboard-overview"
        className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-col px-4 py-4 lg:px-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-4 text-2xl font-bold">
        <span>{currentCaseLabel.replace("_", " ")}</span>
        <span className="rounded-md bg-gray-100 px-2 py-1 text-sm font-medium text-gray-600">
          Case {currentDisplayCaseId}
        </span>
</h1>

<div data-guide="submit-area" className="flex items-center gap-3">
  {hasSubmitted && !isReviewMode ? (
    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
      ✅ Submitted
    </span>
  ) : null}

  <button
    type="button"
    disabled={submitting || (!isReviewMode && (hasSubmitted || !canSubmitFinal))}
    onClick={async () => {
      const validationError = validateBeforeFinalSubmit();
      if (validationError) {
        setSubmitError(validationError);
        return;
      }

      logAction(isReviewMode ? "submit_in_review_mode" : "submit_session");
      await submitCurrentSession();
    }}
    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
      submitting
        ? "cursor-wait bg-blue-300 text-white"
        : !isReviewMode && hasSubmitted
          ? "cursor-not-allowed bg-green-200 text-green-800"
          : !canSubmitFinal
            ? "cursor-not-allowed bg-blue-300 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700"
    }`}
  >
    {submitting
      ? "Submitting..."
      : hasSubmitted && !isReviewMode
        ? "Submitted"
        : "Submit"}
  </button>

  <button
    type="button"
    onClick={() => {
      void handleBackNavigation();
    }}
    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Back
  </button>

  <button
    type="button"
    disabled={
      submitting || currentPatientIndex >= selectedPatients.length - 1
    }
    onClick={() => {
      void handleNextNavigation();
    }}
    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
      submitting || currentPatientIndex >= selectedPatients.length - 1
        ? "cursor-not-allowed bg-blue-300 text-white"
        : "bg-blue-600 text-white hover:bg-blue-700"
    }`}
  >
    Next
  </button>

  <button
    type="button"
    onClick={() => {
      logAction("logout");
      localStorage.removeItem("gameData");
      localStorage.removeItem("participantInfo");
      localStorage.removeItem("doctorAccessCode");
      localStorage.removeItem("doctorId");
      localStorage.removeItem("consentInfo");
      router.push("/");
    }}
    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Logout
  </button>

  <button
    type="button"
    onClick={() => {
      logAction(isReviewMode ? "home_to_review_list" : "home_to_patient_list");
      router.push(isReviewMode ? "/review-list" : "/patient-list");
    }}
    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Home
  </button>

  {!isUserGuideMode && (
    <button
      type="button"
      onClick={() => {
        logAction("open_user_guide");
        setShowUserGuide(true);
      }}
      className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
    >
      User Guide
    </button>
  )}
</div>
</div>

{submitError && (
  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
    {submitError}
  </div>
)}

        <div className="grid gap-4">
  
        <div data-guide="preop-info">
        <SectionCard
  title="Patient Pre-operative Information"
  collapsible
  open={preopInfoOpen}
  onToggle={() => setPreopInfoOpen((value) => !value)}
>
  <div className="space-y-4">
    {/* 1. Patient & Surgery */}
    {(demographic || surgeryContext) && (
      <div>
        <h4 className="mb-1 text-sm font-bold text-gray-800">
          Patient & Surgery
        </h4>

        <FieldGrid
          items={[
            { label: "Age", value: demographic?.age },
            { label: "Sex", value: demographic?.sex },
            { label: "Race", value: demographic?.race },
            {
              label: "Height",
              value: formatHeightCm(demographic?.height),
            },
            {
              label: "Weight",
              value: formatWeightKg(demographic?.weight),
            },
            {
              label: "BMI",
              value: formatBmi(demographic?.height, demographic?.weight),
            },
         
            {
              label: "Procedure Service",
              value: surgeryContext?.procedure_service,
            },
            {
              label: "Admission Type",
              value: surgeryContext?.admission_type,
            },
            {
              label: "Preoperative Diagnosis",
              value: surgeryContext?.preoperative_diagnosis,
            },
            {
              label: "Actual Procedure",
              value: surgeryContext?.actual_procedure,
            },
            {
              label: "Anesthesia Type",
              value: surgeryContext?.anesthesia_type,
            },
            {
              label: "Airway Type",
              value: surgeryContext?.airway_type,
            },
            {
              label: "Airway",
              value: surgeryContext?.airway,
            },
            {
              label: "Emergent",
              value:
                surgeryContext?.emergent === 1
                  ? "Yes"
                  : surgeryContext?.emergent === 0
                    ? "No"
                    : undefined,
            },
          ]}
        />
      </div>
    )}

    {/* 2. Airway / Anesthesia Risk */}
    {preop && (
      <div>
        <h4 className="mb-1 text-sm font-bold text-gray-800">
          Airway / Anesthesia Risk
        </h4>

        <FieldGrid
          items={[
            { label: "ASA Status", value: preop.asa_status },
            { label: "NPO Since", value: preop.npo_since },
            { label: "Mallampati Score", value: preop.mallampati_score },
            { label: "TM Distance", value: preop.tm_distance },
            { label: "Thick Neck", value: preop.thick_neck },
            {
              label: "Limited Cervical ROM",
              value: preop.limited_cervical_rom,
            },
            {
              label: "Abnormal Oropharynx Anatomy",
              value: preop.abnormal_oropharynx_anatomy,
            },
            {
              label: "No Notable Dental Hx",
              value: preop.no_notable_dental_hx,
            },
            { label: "Chipped Teeth", value: preop.chipped_teeth },
            { label: "Loose Teeth", value: preop.loose_teeth },
            {
              label: "Dental Hx Comments",
              value: preop.dental_hx_comments,
            },
            { label: "Beard", value: preop.beard },
            {
              label: "Tracheostomy Present",
              value: preop.tracheostomy_present,
            },
            {
              label: "Airway Comments",
              value: preop.airway_comments,
            },
          ]}
        />
      </div>
    )}

    {/* 3. Cardiopulmonary & Other Findings */}
    {preop && (
      <div>
        <h4 className="mb-1 text-sm font-bold text-gray-800">
          Cardiopulmonary & Other Findings
        </h4>

        <FieldGrid
          items={[
            {
              label: "Cardiovascular Exam Normal",
              value: preop.cardiovascular_exam_normal,
            },
            { label: "Irregular Rhythm", value: preop.irregular_rhythm },
            { label: "Murmur", value: preop.murmur },
            { label: "Carotid Bruit", value: preop.carotid_bruit },
            { label: "Peripheral Edema", value: preop.peripheral_edema },
            { label: "Heart Sounds", value: preop.heart_sounds },
            {
              label: "Cardiovascular Comments",
              value: preop.cardiovascular_exam_comments,
            },
            {
              label: "Pulmonary Exam Normal",
              value: preop.pulmonary_exam_normal,
            },
            { label: "Breath Sounds", value: preop.breath_sounds },
            { label: "Wheezes", value: preop.wheezes },
            { label: "Rales", value: preop.rales },
            {
              label: "Decreased Breath Sounds",
              value: preop.decreased_breath_sounds,
            },
            { label: "Wheezing", value: preop.wheezing },
            {
              label: "Pulmonary Comments",
              value: preop.pulmonary_exam_comments,
            },
            {
              label: "IV Access Difficult",
              value: preop.iv_access_difficult,
            },
            {
              label: "Difficult IV Placement",
              value: preop.difficult_iv_placement,
            },
            {
              label: "Level of Consciousness",
              value: preop.level_of_consciousness,
            },
            {
              label: "Orientation Level",
              value: preop.orientation_level,
            },
            { label: "EKG", value: preop.ekg },
       
           
          ]}
        />
      </div>
    )}

    {/* 4. Relevant History / Labs */}
    {(preopHistoryRows.length > 0 || lab) && (
      <div>
        <h4 className="mb-1 text-sm font-bold text-gray-800">
          Relevant History / Labs
        </h4>

        {preopHistoryRows.length > 0 && (
  <div className="mb-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-gray-800 md:grid-cols-2 xl:grid-cols-3">
    {Object.entries(groupPreopHistoryRows(preopHistoryRows)).map(
      ([category, values]) => (
        <div key={category} className="min-w-0 leading-6">
          <span className="font-semibold text-gray-600">
            {category}:
          </span>{" "}
          <span className="break-words text-gray-900">
            {values.join(", ")}
          </span>
        </div>
      )
    )}
  </div>
)}

        {lab ? (
          <FieldGrid
            items={[
              { label: "Sodium", value: lab.sodium },
              { label: "Potassium", value: lab.potassium },
              { label: "Chloride", value: lab.chloride },
              { label: "CO₂", value: lab.co2 },
              { label: "Glucose", value: lab.glucose },
              { label: "Creatinine", value: lab.creatinine },
              { label: "BUN", value: lab.blood_urea_nitrogen },
              { label: "Hemoglobin", value: lab.hemoglobin },
              { label: "Platelet Count", value: lab.platelet_count },
              { label: "PT", value: lab.prothrombin_time },
              { label: "aPTT", value: lab.partial_thromboplastin_time },
              { label: "Albumin", value: lab.albumin },
              { label: "AST", value: lab.ast },
              { label: "ALT", value: lab.alt },
              { label: "pH", value: lab.ph },
              { label: "PCO₂", value: lab.pco2 },
              { label: "PO₂", value: lab.po2 },
              { label: "HCO₃", value: lab.hco3 },
              { label: "Base Excess", value: lab.base_excess },
              {
                label: "Oxygen Saturation",
                value: lab.oxygen_saturation,
              },
            ]}
          />
        ) : (
          <div className="text-sm text-gray-500">No available lab data.</div>
        )}
      </div>
    )}
  </div>
</SectionCard>
</div>
          <SectionCard title="Annotation Tasks">
            {!vitals || !hasAnyVitalData(vitals) ? (
              <div className="text-sm text-gray-500">No intraoperative data available.</div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(420px,0.66fr)_minmax(0,1.34fr)]">
<div
  data-guide="annotation-tasks"
  className="sticky top-2 z-30 min-w-0 xl:max-w-[560px]"
>
                  <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="border-b bg-white px-4 py-2">
                    <div
                      data-guide="task-tabs"
                      className="flex items-center gap-2 overflow-x-auto pb-1"
                    >
   <button
  type="button"
  onClick={() => {
    setAnnotationLevel("summary");
    setSelectedTask("summary");
    setSelectedWindow(null);
    logAction("annotation_level_click", { level: "summary" });
  }}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition ${
        annotationLevel === "summary"
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      Summary
    </button>

    <button
  type="button"
  onClick={() => {
    setAnnotationLevel("episode");

    if (selectedTask !== "detect") {
      setSelectedTask("detect");
    }

    const episodeToRestore =
      episodeState.detectedEpisodes.find(
        (episode) => episode.id === episodeState.activeEpisodeId
      ) ??
      episodeState.detectedEpisodes.find((episode) =>
        episodeState.prioritizedEpisodeIds.includes(episode.id)
      ) ??
      episodeState.detectedEpisodes[0] ??
      null;

    if (episodeToRestore) {
      setEpisodeState((prev) => ({
        ...prev,
        activeEpisodeId: episodeToRestore.id,
      }));

      setSelectedDetectVital(episodeToRestore.vital);
      setSelectedWindow({
        vital: episodeToRestore.vital,
        startMin: episodeToRestore.startMin,
        endMin: episodeToRestore.endMin,
        y1: episodeToRestore.y1,
        y2: episodeToRestore.y2,
      });
    }

    logAction("annotation_level_click", { level: "episode" });
  }}
  className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition ${
    annotationLevel === "episode"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
  }`}
>
  Abnormality Reasoning
</button>
    <button
  type="button"
  onClick={() => {
    setAnnotationLevel("otherEvents");
    setSelectedWindow(null);
    logAction("annotation_level_click", { level: "otherEvents" });
  }}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition ${
        annotationLevel === "otherEvents"
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      Management Reasoning
    </button>
</div>

    
                    </div>

                    {annotationLevel === "summary" && (
                      <div data-guide="instructions" className="bg-white">
                      <SummaryPanel
  key={`summary:${currentPatient?.folder ?? "unknown_patient"}:${caseId}:${reviewHydrationVersion}`}
  caseId={caseId}
  patientId={currentPatient?.folder ?? "unknown_patient"}
  eventId="patient-summary"
  eventTitle="Patient-level Summary"
  episodeLabel={currentCaseLabel}
  startMin={0}
  endMin={sharedTimelineEnd}
  onSaveAndNextStep={() => {
    setPatientSummaryCompleted(true);
  }}
  readOnly={isCaseLocked}
/>
                      </div>
                    )}

                    
{annotationLevel === "otherEvents" && (
  <div data-guide="instructions" className="bg-white">
    <ManagementReasoningPanel
      key={`management:${currentPatient?.folder ?? "unknown_patient"}:${caseId}:${reviewHydrationVersion}:${getManagementEventId(selectedManagementEvent) ?? "none"}`}
      caseId={caseId}
      managementEvent={selectedManagementEvent}
      patientIndex={currentPatientIndex + 1}
      patientId={currentPatient?.folder ?? undefined}
      patientFolder={currentPatient?.folder ?? undefined}
      anesthesiaStart={anesthesiaStart}
      onSaveSuccess={() => {
        setManagementReasoningCompleted(true);
      }}
      
      readOnly={isCaseLocked}
    />
  </div>
)}
{annotationLevel === "episode" && episodeState.stage !== "annotate" && (
  <div className="grid grid-cols-1 items-start bg-white">
    <div className="order-2 border-t p-4">
      <h3 className="mb-4 text-base font-bold text-gray-800">Checklist</h3>

      {episodeState.stage === "select_all" && (
        <div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {episodeState.detectedEpisodes.map((episode) => {
              const checked = episodeState.prioritizedEpisodeIds.includes(
                episode.id
              );

              const isPreviewing =
                selectedWindow?.vital === episode.vital &&
                selectedWindow?.startMin === episode.startMin &&
                selectedWindow?.endMin === episode.endMin &&
                selectedWindow?.y1 === episode.y1 &&
                selectedWindow?.y2 === episode.y2;

              return (
                <div
                  key={episode.id}
                  className={`w-full rounded-lg border px-3 py-2 transition ${
                    isPreviewing
                      ? "border-blue-700 bg-blue-300 shadow-sm"
                      : checked
                      ? "border-blue-400 bg-blue-100"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDetectVital(episode.vital);
                        setSelectedWindow({
                          vital: episode.vital,
                          startMin: episode.startMin,
                          endMin: episode.endMin,
                          y1: episode.y1,
                          y2: episode.y2,
                        });

                        logAction("episode_checklist_preview", {
                          stage: "select_all",
                          episodeId: episode.id,
                          vital: episode.vital,
                          startMin: episode.startMin,
                          endMin: episode.endMin,
                        });
                      }}
                      className="min-w-0 flex-1 text-left focus:outline-none"
                    >
                      <div className="break-words whitespace-normal text-sm font-semibold text-gray-800">
                        {episode.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatEpisodeTimeRange(
                          episode.startMin,
                          episode.endMin,
                          anesthesiaStart
                        )}
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePrioritizedEpisode(episode.id);

                          logAction("episode_select_all_toggle", {
                            episodeId: episode.id,
                            nextSelected: !checked,
                          });
                        }}
                        disabled={isCaseLocked}
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold ${
                          checked
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-300 bg-white text-transparent"
                        }`}
                        title={checked ? "Unconfirm episode" : "Confirm episode"}
                      >
                        ✓
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDetectedEpisode(episode.id);
                        }}
                        disabled={isCaseLocked}
                        className="flex h-5 w-5 items-center justify-center rounded-md text-base font-black text-black hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Delete event"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {episodeState.detectedEpisodes.length === 0 && (
              <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">
                No events yet.
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
              <span>
                Detected episodes:{" "}
                <span className="font-semibold text-gray-900">
                  {episodeState.detectedEpisodes.length}
                </span>
              </span>
              <span>
                Selected for reasoning:{" "}
                <span className="font-semibold text-gray-900">
                  {episodeState.prioritizedEpisodeIds.length}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3">
  <button
    type="button"
    onClick={() => {
      void handleAdvanceEpisodeStage();
    }}
    disabled={
      isCaseLocked ||
      episodeState.prioritizedEpisodeIds.length === 0 ||
      submitting
    }
    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
      isCaseLocked ||
      episodeState.prioritizedEpisodeIds.length === 0 ||
      submitting
        ? "cursor-not-allowed bg-blue-300 text-white"
        : "bg-blue-600 text-white hover:bg-blue-700"
    }`}
  >
    {submitting ? "Saving..." : "Save"}
  </button>
</div>
          </div>
        </div>
      )}

      {episodeState.stage === "pick_top3" && (
        <div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {episodeState.detectedEpisodes.map((episode) => {
              const checked = episodeState.prioritizedEpisodeIds.includes(
                episode.id
              );

              const isPreviewing =
                selectedWindow?.vital === episode.vital &&
                selectedWindow?.startMin === episode.startMin &&
                selectedWindow?.endMin === episode.endMin &&
                selectedWindow?.y1 === episode.y1 &&
                selectedWindow?.y2 === episode.y2;

              return (
                <div
                  key={episode.id}
                  className={`w-full rounded-lg border px-3 py-2 transition ${
                    isPreviewing
                      ? "border-blue-700 bg-blue-300 shadow-sm"
                      : checked
                      ? "border-blue-400 bg-blue-100"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDetectVital(episode.vital);
                        setSelectedWindow({
                          vital: episode.vital,
                          startMin: episode.startMin,
                          endMin: episode.endMin,
                          y1: episode.y1,
                          y2: episode.y2,
                        });

                        logAction("episode_checklist_preview", {
                          stage: "pick_top3",
                          episodeId: episode.id,
                          vital: episode.vital,
                          startMin: episode.startMin,
                          endMin: episode.endMin,
                        });
                      }}
                      className="min-w-0 flex-1 text-left focus:outline-none"
                    >
                      <div className="break-words whitespace-normal text-sm font-semibold text-gray-800">
                        {episode.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatEpisodeTimeRange(
                          episode.startMin,
                          episode.endMin,
                          anesthesiaStart
                        )}
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePrioritizedEpisode(episode.id);

                          logAction("episode_pick_top3_toggle", {
                            episodeId: episode.id,
                            nextSelected: !checked,
                          });
                        }}
                        disabled={isCaseLocked}
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                          checked
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-300 bg-white text-transparent"
                        }`}
                        title={checked ? "Unselect episode" : "Select episode"}
                      >
                        ✓
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDetectedEpisode(episode.id);
                        }}
                        disabled={isCaseLocked}
                        className="flex h-5 w-5 items-center justify-center rounded-md text-base font-black text-black hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Delete event"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {episodeState.detectedEpisodes.length === 0 && (
              <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">
                No events yet.
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-sm text-gray-600">
              Selected for detailed annotation:{" "}
              <span className="font-semibold text-gray-900">
                {episodeState.prioritizedEpisodeIds.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                void handleAdvanceEpisodeStage();
              }}
              disabled={
                isCaseLocked ||
                episodeState.prioritizedEpisodeIds.length === 0 ||
                submitting
              }
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                isCaseLocked ||
                episodeState.prioritizedEpisodeIds.length === 0 ||
                submitting
                  ? "cursor-not-allowed bg-blue-300 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>

    <div className="order-1 min-w-0 p-4">
  {episodeState.stage === "select_all" && (
    <div className="space-y-6">
 <div className="mb-3 text-sm font-semibold text-gray-900">
  Task 2.{" "}
  <span className="text-red-600">Detect all abnormalities</span>
  {" and "}
  <span className="text-red-600">annotate one</span>
  {" (next step)"}
</div>

      <ObservationSelectionGuide />
    </div>
  )}

  {episodeState.stage === "pick_top3" && (
    <div className="space-y-6">
        <div className="mb-3 text-sm font-semibold text-gray-900">
          Task 2: Select all abnormalities and annotate one
        </div>

      <p className="text-sm text-gray-600">
        From the detected episodes on the left, choose the single most
        interesting episode you want to annotate in detail.
      </p>
    </div>
  )}
</div>
  </div>
)}
{annotationLevel === "episode" && episodeState.stage === "annotate" && (
  <div data-guide="instructions" className="space-y-4 bg-white p-4">
    {selectedEvent ? (
      <TaskWorkspace
        key={`episode:${currentPatient?.folder ?? "unknown_patient"}:${caseId}:${reviewHydrationVersion}:${selectedEvent.id}`}
        task={selectedTask}
        onChangeTask={setSelectedTask}
        onSaveAndNextStep={(finishedTask) => {
          if (finishedTask === "detect") {
            handleSaveAndNextStep(finishedTask);
            setAbnormalityReasoningCompleted(true);
          }
        }}
        selectedEvent={selectedEvent}
        caseId={caseId}
        patientId={currentPatient?.folder ?? undefined}
        patientFolder={currentPatient?.folder ?? undefined}
        episodeNumber={activeEpisodeNumber ?? undefined}
        selectedDetectVital={selectedDetectVital}
        onChangeSelectedDetectVital={setSelectedDetectVital}
        selectedWindow={selectedWindow}
        anesthesiaStart={anesthesiaStart}
        gasData={{
          FiO2: vitals.gas["FiO2"],
          "O2 (L/Min)": vitals.gas["O2 (L/Min)"],
          "Air (L/min)": vitals.gas["Air (L/min)"],
          "N2O (L/min)": vitals.gas["N2O (L/min)"],
          "inO2 %": vitals.gas["inO2 %"],
          "inN2O %": vitals.gas["inN2O %"],
          "inSevoflurane %": vitals.gas["inSevoflurane %"],
          inIsoflurane: vitals.gas["inIsoflurane"],
          "etMAC exhaled": vitals.gas["etMAC exhaled"],
        }}
        medBolusRows={medBolusRowsState}
        medInfusionRows={medInfusionRowsState}
        fluidInRows={fluidInRowsState}
        fluidOutRows={fluidOutRowsState}
        episodeState={episodeState}
        onChangeEpisodeState={setEpisodeState}
        onChangeSelectedWindow={handleSelectedWindowChange}
        readOnly={isCaseLocked}
        completedTaskMap={episodeTaskCompletion}
        onChangeCompletedTaskMap={setEpisodeTaskCompletion}
      />
    ) : (
      <div className="flex min-h-[560px] items-center justify-center rounded-xl border bg-white p-6 text-sm text-gray-500">
        Please select one prioritized episode.
      </div>
    )}
  </div>
)}
                  </div>
                </div>

                <div
                  ref={visualizationPanelRef}
                  data-guide="visualization-panel"
                  className="min-w-0 space-y-3 rounded-xl border bg-white p-3 shadow-sm"
                >
                  <div className="px-1 text-sm font-bold text-gray-900">
                    Visualization Panel
                  </div>

                  <UnifiedTimelineCard
                    vitals={vitals}
                    medications={medications}
                    fluids={fluids}
                    anesthesiaStart={anesthesiaStart}
                    anesthesiaStop={anesthesiaStop}
                    timelineEnd={sharedTimelineEnd}
                    ticks={sharedXTicks}
                    timeResolution={timeResolution}
                    onChangeTimeResolution={handleChangeTimeResolution}
                    viewStartMin={viewStartMin}
                    onChangeViewStartMin={setViewStartMin}
                    viewWindowWidthMin={viewWindowWidthMin}
                    selectedDetectVital={selectedDetectVital}
                    onChangeSelectedDetectVital={setSelectedDetectVital}
                    showVitalSelector={annotationLevel !== "episode"}
                    selectedWindow={annotationLevel === "episode" ? selectedWindow : null}
                    onChangeSelectedWindow={handleSelectedWindowChange}
                    onCreateEventFromWindow={handleTimelineWindowCreate}
                    readOnly={isCaseLocked}
                    sharedScrollLeft={sharedScrollLeft}
                    onSharedScrollLeftChange={setSharedScrollLeft}
                    timelineContext={timelineContext}
                    managementEvent={activeManagementEvent}
                    gas={{
                      FiO2: vitals.gas["FiO2"],
                      "O2 (L/Min)": vitals.gas["O2 (L/Min)"],
                      "Air (L/min)": vitals.gas["Air (L/min)"],
                      "N2O (L/min)": vitals.gas["N2O (L/min)"],
                      "inO2 %": vitals.gas["inO2 %"],
                      "inN2O %": vitals.gas["inN2O %"],
                      "inSevoflurane %": vitals.gas["inSevoflurane %"],
                      inIsoflurane: vitals.gas["inIsoflurane"],
                      "etMAC exhaled": vitals.gas["etMAC exhaled"],
                    }}
                  />
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        </div>
        <UserGuideOverlay
  open={showUserGuide}
  onClose={() => {
    setShowUserGuide(false);

    if (isUserGuideMode) {
      localStorage.removeItem("isUserGuideMode");
      setIsUserGuideMode(false);
      router.push("/patient-list");
    }
  }}
/>
</main>
);
}
