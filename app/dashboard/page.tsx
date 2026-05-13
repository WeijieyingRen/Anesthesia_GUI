"use client";
import ManagementReasoningPanel from "./annotation/panels/ManagementReasoningPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

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
import { prepareVitalsDataRaw } from "@/lib/prepare_raw_data/vitals";
import { prepareMedicationData } from "@/lib/prepare_raw_data/medications";
import UnifiedTimelineCard from "./UnifiedTimelineCard";
import { prepareFluidData } from "@/lib/prepare_raw_data/fluid";
import SummaryPanel from "./annotation/panels/SummaryPanel";

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
  }>;
  diagnoses?: any[];
  startTime?: string;
};

type StoredSelected = {
  folder: string;
  status?: "not_started" | "in_progress" | "completed";
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
  managementReasoningCompleted?: boolean;
  episodeState?: EpisodeAnnotationState;
  episodeTaskCompletion?: EpisodeTaskCompletionMap;
  selectedManagementEventId?: string | null;
  hasSubmitted?: boolean;
};

function dashboardDraftKey(patientFolder: string, caseId: string) {
  return `dashboardDraft:${patientFolder}:${caseId}`;
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

function FieldGrid({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  const visibleItems = items.filter((item) => hasVisibleValue(item.value));

  if (!visibleItems.length) {
    return <div className="text-sm text-gray-500">No available data.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-800 md:grid-cols-3 xl:grid-cols-6">
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

async function fetchCsvRows(folder: string, filename: string): Promise<CsvRow[]> {
  const url = `/data/${folder}/${filename}`;
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

async function fetchTextFile(folder: string, filename: string): Promise<string> {
  const url = `/data/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }

  return (await res.text()).trim();
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
    recognition.lang = "en-US";
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

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const [selectedPatients, setSelectedPatients] = useState<StoredSelected[]>([]);
  const currentPatient = selectedPatients[currentPatientIndex];
  const currentCaseLabel = currentPatient?.folder ?? "unknown_patient";
  const [caseId, setCaseId] = useState("unknown_case");
  const [demographic, setDemographic] = useState<PatientDemographic | null>(null);
  const [surgeryContext, setSurgeryContext] = useState<SurgeryContext | null>(null);
  const [preop, setPreop] = useState<PreopAssessment | null>(null);
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
  const [patientSummaryCompleted, setPatientSummaryCompleted] = useState(false);
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

  const [preopInfoOpen, setPreopInfoOpen] = useState(false);

  const voiceNote = useVoiceNote();

  const sessionStartRef = useRef<number>(performance.now());
  const sessionStartUtcRef = useRef<string>(new Date().toISOString());
  const sessionStartLocalRef = useRef<string>(getLocalTimestamp());
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
      localStorage.setItem(
        dashboardDraftKey(currentPatient.folder, caseId),
        JSON.stringify({
          selectedTask,
          annotationLevel,
          selectedDetectVital,
          selectedWindow,
          patientSummaryCompleted,
          managementReasoningCompleted,
          episodeState,
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
    if (!activeEpisode) return;

    setSelectedDetectVital(activeEpisode.vital);
    setSelectedWindow({
      vital: activeEpisode.vital,
      startMin: activeEpisode.startMin,
      endMin: activeEpisode.endMin,
      y1: activeEpisode.y1,
      y2: activeEpisode.y2,
    });
  }, [activeEpisode]);

  function resetEpisodeWorkflow() {
    if (hasSubmitted) return;
    setEpisodeState(buildEmptyEpisodeState());
    setEpisodeTaskCompletion({});
    setSelectedWindow(null);
  }

  const canSubmitFinal =
  patientSummaryCompleted &&
  managementReasoningCompleted &&
  episodeState.prioritizedEpisodeIds.length > 0 &&
  prioritizedEpisodes.some((episode) => {
    const completed = episodeTaskCompletion[episode.id];
    return Boolean(completed?.detect);
  });

  function validateBeforeFinalSubmit(): string | null {
    if (!patientSummaryCompleted) {
      return "Please complete and save the patient-level summary before submitting.";
    }
  
    if (!managementReasoningCompleted) {
      return "Please complete and save the management reasoning before submitting.";
    }
  
    if (episodeState.prioritizedEpisodeIds.length === 0) {
      return "Please select and annotate at least one episode before submitting.";
    }
  
    const hasAnnotatedEpisode = prioritizedEpisodes.some((episode) => {
      const completed = episodeTaskCompletion[episode.id];
      return Boolean(completed?.detect);
    });

    if (!hasAnnotatedEpisode) {
      return "Please save the detailed annotation for one selected episode before submitting.";
    }
  
    return null;
  }

  function handleCreateEpisodeFromWindow(window: SelectedWindow) {
    if (hasSubmitted) return;
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
    if (hasSubmitted) return;
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

    logAction("episode_detected_delete", { episodeId });
  }

  function handleTogglePrioritizedEpisode(episodeId: string) {
    if (hasSubmitted) return;
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
    if (hasSubmitted) return;
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
    if (hasSubmitted) return;
    if (annotationLevel === "episode") {
      if (episodeState.stage === "annotate") {
        return;
      }
  
      handleCreateEpisodeFromWindow(window);
      setSelectedWindow(window);
      return;
    }
  
    setSelectedWindow(window);
  }

  function handleSelectedWindowChange(nextWindow: SelectedWindow | null) {
    if (hasSubmitted) return;
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
    if (hasSubmitted) return;
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
      router.push("/patient-list");
      return;
    }

    const gameData = JSON.parse(raw) as GameData;
    const idx = gameData.currentPatientIndex ?? 0;

    setCurrentPatientIndex(idx);
    setSelectedPatients(gameData.selectedPatients || []);
    setDashboardBackStack([]);

    if (gameData.selectedPatients?.length) {
      void loadPatient(gameData.selectedPatients[idx].folder);
    } else {
      setLoading(false);
      setLoadError("No selected patients found.");
    }
  }, [router]);

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

    router.push("/patient-list");
  }

  async function handleNextNavigation() {
    const nextIndex = currentPatientIndex + 1;

    if (nextIndex >= selectedPatients.length) {
      alert("No more patients.");
      return;
    }

    if (!hasSubmitted) {
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
      logAction("next_after_submit");
    }

    await navigateToPatientIndex(nextIndex, { pushCurrentToBackStack: true });
  }

  async function loadPatient(folder: string) {
    try {
      sessionStartRef.current = performance.now();
      sessionStartUtcRef.current = new Date().toISOString();
      sessionStartLocalRef.current = getLocalTimestamp();
      actionLogRef.current = [];
      const patientMeta = selectedPatients.find(
        (patient) => patient.folder === folder
      );
      setHasSubmitted(patientMeta?.status === "completed");
      setPatientSummaryCompleted(false);
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
      setManagementEvents([]);
      setSelectedManagementEvent(null);
      resetEpisodeWorkflow();

      const caseIdFromFile = await fetchTextFile(folder, "case_id.txt");
      setCaseId(caseIdFromFile);

   
      const [
        caseInfoRows,
        patientAttrRows,
        caseStaticRows,
        caseDynamicRows,
        preopRows,
        labRows,
        phyRows,
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
        fetchCsvRows(folder, "lab.csv"),
        fetchCsvRows(folder, "phy_data.csv"),
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
        prepareDemographicData(caseInfo, patientAttr, preopRow, caseIdFromFile)
      );

      setSurgeryContext(prepareSurgeryContextData(caseInfo, caseStatic, preopRow));
      setPreop(preparePreopData(preopRow));
      setLab(prepareLabData(labRow));
      setVitals(prepareVitalsDataRaw(shiftedPhyRows));

      setMedBolusRowsState(shiftedMedBolusRows);
      setMedInfusionRowsState(shiftedMedInfusionRows);
      setFluidInRowsState(shiftedFluidInRows);
      setFluidOutRowsState(shiftedFluidOutRows);

      setMedications(prepareMedicationData(shiftedMedBolusRows, shiftedMedInfusionRows));
      setFluids(prepareFluidData(shiftedFluidInRows, shiftedFluidOutRows));
      const parsedManagementEvents = prepareManagementEvents(shiftedManagementRows);
setManagementEvents(parsedManagementEvents);
setSelectedManagementEvent(parsedManagementEvents[0] ?? null);

      const savedDraft = readStoredJson<DashboardCaseDraft>(
        dashboardDraftKey(folder, caseIdFromFile)
      );

      if (savedDraft) {
        if (savedDraft.selectedTask) setSelectedTask(savedDraft.selectedTask);
        if (savedDraft.annotationLevel) {
          setAnnotationLevel(savedDraft.annotationLevel);
        }
        if (savedDraft.selectedDetectVital) {
          setSelectedDetectVital(savedDraft.selectedDetectVital);
        }
        if (savedDraft.selectedWindow !== undefined) {
          setSelectedWindow(savedDraft.selectedWindow ?? null);
        }
        if (typeof savedDraft.patientSummaryCompleted === "boolean") {
          setPatientSummaryCompleted(savedDraft.patientSummaryCompleted);
        }
        if (typeof savedDraft.managementReasoningCompleted === "boolean") {
          setManagementReasoningCompleted(
            savedDraft.managementReasoningCompleted
          );
        }
        if (savedDraft.episodeState) {
          setEpisodeState(savedDraft.episodeState);
        }
        if (savedDraft.episodeTaskCompletion) {
          setEpisodeTaskCompletion(savedDraft.episodeTaskCompletion);
        }
        if (
          patientMeta?.status !== "completed" &&
          typeof savedDraft.hasSubmitted === "boolean"
        ) {
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
      
    } catch (e: any) {
      console.error("Failed to load patient:", e);
      setLoadError(e?.message ?? "Failed to load patient.");
    } finally {
      setLoading(false);
    }
  }

  const collectSubmissionPayload = () => {
    const participantInfoRaw = localStorage.getItem("participantInfo");
    let participantInfo: any = {};
  
    try {
      participantInfo = participantInfoRaw ? JSON.parse(participantInfoRaw) : {};
    } catch {
      participantInfo = {};
    }
  
    const accessCode =
      String(participantInfo?.accessCode ?? localStorage.getItem("doctorAccessCode") ?? "").trim() || null;
  
    // 如果前端暂时没有 doctorId，也没关系；后端会用 accessCode.csv 反查
    const doctorId =
      String(participantInfo?.doctorId ?? "").trim() || null;
  
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
        accessCode,
        doctorId,
      },

      answers: {
        summary: summaryResult,
        abnormalityReasoning: abnormalityReasoningResult,
        managementReasoning: managementReasoningResult,
        completionStatus: {
          patientSummaryCompleted,
          abnormalityReasoningCompleted: prioritizedEpisodes.some(
            (episode) => Boolean(episodeTaskCompletion[episode.id]?.detect)
          ),
          managementReasoningCompleted,
        },
      },
    };
  };

  const submitCurrentSession = async (): Promise<boolean> => {
    const payload = collectSubmissionPayload();

    console.log("===== SUBMISSION PAYLOAD =====");
    console.log(payload);

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

      setHasSubmitted(true);
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

    return Math.ceil(diffMin / 15) * 15;
  })();

  const viewWindowWidthMin = useMemo(() => {
    if (timeResolution === 15) return sharedTimelineEnd;
    return 120;
  }, [timeResolution, sharedTimelineEnd]);

  const sharedXTicks = Array.from(
    { length: Math.floor(sharedTimelineEnd / 15) + 1 },
    (_, i) => i * 15
  );

  useEffect(() => {
    const maxStart = Math.max(0, sharedTimelineEnd - viewWindowWidthMin);
    if (viewStartMin > maxStart) {
      setViewStartMin(maxStart);
    }
  }, [sharedTimelineEnd, viewWindowWidthMin, viewStartMin]);

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
        : selectedWindow?.startMin;
  
    const contextEnd =
      annotationLevel === "otherEvents" && selectedManagementEvent
        ? Number(selectedManagementEvent.end_time_min ?? selectedManagementEvent.time_min) + 10
        : selectedWindow?.endMin;
  
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
      <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-col px-4 py-4 lg:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-4 text-2xl font-bold">
        <span>{currentCaseLabel.replace("_", " ")}</span>
</h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void handleBackNavigation();
              }}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back
            </button>

            {hasSubmitted && (
              <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
                ✅ Submitted
              </span>
            )}

            <button
              type="button"
              disabled={hasSubmitted || submitting || !canSubmitFinal}
              onClick={async () => {
                const validationError = validateBeforeFinalSubmit();
                if (validationError) {
                  setSubmitError(validationError);
                  return;
                }

                logAction("submit_session");
                await submitCurrentSession();
              }}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                hasSubmitted
                  ? "cursor-not-allowed bg-green-200 text-green-800"
                  : submitting
                    ? "cursor-wait bg-blue-300 text-white"
                    : !canSubmitFinal
                      ? "cursor-not-allowed bg-blue-300 text-white"
                      : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {hasSubmitted ? "Submitted" : submitting ? "Submitting..." : "Submit"}
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
          </div>
        </div>

        {submitError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </div>
        )}

        <div className="grid gap-4">
          <SectionCard
            title="Patient Pre-operative Information"
            collapsible
            open={preopInfoOpen}
            onToggle={() => setPreopInfoOpen((value) => !value)}
          >
            <div className="space-y-3">
              {demographic && (
                <div>
                  <h4 className="mb-1 text-sm font-bold text-gray-800">Demographic</h4>
                  <FieldGrid
                    items={[
                      { label: "Age", value: demographic.age },
                      { label: "Sex", value: demographic.sex },
                      { label: "Race", value: demographic.race },
                      { label: "Height", value: formatHeightCm(demographic.height) },
                      { label: "Weight", value: formatWeightKg(demographic.weight) },
                      { label: "BMI", value: formatBmi(demographic.height, demographic.weight) },
                    ]}
                  />
                </div>
              )}

              {surgeryContext && (
                <div>
                  <h4 className="mb-1 text-sm font-bold text-gray-800">Surgery Context</h4>
                  <FieldGrid
                    items={[
                      { label: "Procedure Room", value: surgeryContext.procedure_room },
                      { label: "Department", value: surgeryContext.department },
                      { label: "Admission Type", value: surgeryContext.admission_type },
                      {
                        label: "Preoperative Diagnosis",
                        value: surgeryContext.preoperative_diagnosis,
                      },
                      { label: "Actual Procedure", value: surgeryContext.actual_procedure },
                      { label: "Anesthesia Type", value: surgeryContext.anesthesia_type },
                      { label: "Airway", value: surgeryContext.airway },
                      {
                        label: "Emergent",
                        value:
                          surgeryContext.emergent === 1
                            ? "Yes"
                            : surgeryContext.emergent === 0
                              ? "No"
                              : undefined,
                      },
                    ]}
                  />
                </div>
              )}

              {preop && (
                <div>
                  <h4 className="mb-1 text-sm font-bold text-gray-800">
                    Preoperative Assessment
                  </h4>
                  <FieldGrid
                    items={[
                      { label: "ASA Status", value: preop.asa_status },
                      { label: "Mallampati Score", value: preop.mallampati_score },
                      { label: "NPO Since", value: preop.npo_since },
                      { label: "Limited Cervical ROM", value: preop.limited_cervical_rom },
                      { label: "TM Distance", value: preop.tm_distance },
                      {
                        label: "Abnormal Oropharynx Anatomy",
                        value: preop.abnormal_oropharynx_anatomy,
                      },
                    ]}
                  />
                </div>
              )}

              {lab && (
                <div>
                  <h4 className="mb-1 text-sm font-bold text-gray-800">Lab</h4>
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
                      { label: "Oxygen Saturation", value: lab.oxygen_saturation },
                    ]}
                  />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Annotation Tasks">
            {!vitals || !hasAnyVitalData(vitals) ? (
              <div className="text-sm text-gray-500">No intraoperative data available.</div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(500px,0.95fr)_minmax(0,1.85fr)]">
                <div className="sticky top-2 z-30 min-w-0 xl:max-w-[680px]">
                  <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                    <div className="border-b bg-white px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={() => {
        setAnnotationLevel("summary");
        setSelectedTask("summary");
        logAction("annotation_level_click", { level: "summary" });
      }}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
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
        logAction("annotation_level_click", { level: "episode" });
      }}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
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
      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
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
                      <div className="bg-white">
                      <SummaryPanel
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
  readOnly={hasSubmitted}
/>
                      </div>
                    )}

                    
{annotationLevel === "otherEvents" && (
  <div className="bg-white">
    <ManagementReasoningPanel
      caseId={caseId}
      managementEvent={selectedManagementEvent}
      patientIndex={currentPatientIndex + 1}
      patientId={currentPatient?.folder ?? undefined}
      patientFolder={currentPatient?.folder ?? undefined}
      anesthesiaStart={anesthesiaStart}
      onSaveSuccess={() => {
        setManagementReasoningCompleted(true);
      }}
      readOnly={hasSubmitted}
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
                        disabled={hasSubmitted}
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
                        disabled={hasSubmitted}
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
                  resetEpisodeWorkflow();
                  logAction("episode_select_all_reset");
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reset All
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleAdvanceEpisodeStage();
                }}
                disabled={
                  hasSubmitted ||
                  episodeState.prioritizedEpisodeIds.length === 0 ||
                  submitting
                }
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  hasSubmitted ||
                  episodeState.prioritizedEpisodeIds.length === 0 ||
                  submitting
                    ? "cursor-not-allowed bg-blue-300 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {submitting ? "Saving..." : "Save & Next Step"}
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
                      disabled={hasSubmitted}
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                        checked
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-300 bg-white text-transparent"
                      }`}
                      title={checked ? "Unselect episode" : "Select episode"}
                    >
                      ✓
                    </button>
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
                hasSubmitted ||
                episodeState.prioritizedEpisodeIds.length === 0 ||
                submitting
              }
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                hasSubmitted ||
                episodeState.prioritizedEpisodeIds.length === 0 ||
                submitting
                  ? "cursor-not-allowed bg-blue-300 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {submitting ? "Saving..." : "Save & Next Step"}
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
  <div className="space-y-4 bg-white p-4">
    {selectedEvent ? (
      <TaskWorkspace
        task={selectedTask}
        onChangeTask={setSelectedTask}
        onSaveAndNextStep={(finishedTask) => {
          if (finishedTask === "detect") {
            handleSaveAndNextStep(finishedTask);
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
        readOnly={hasSubmitted}
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

                <div className="min-w-0 space-y-3 rounded-xl border bg-white p-3 shadow-sm">
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
                    onChangeTimeResolution={setTimeResolution}
                    viewStartMin={viewStartMin}
                    onChangeViewStartMin={setViewStartMin}
                    viewWindowWidthMin={viewWindowWidthMin}
                    selectedDetectVital={selectedDetectVital}
                    onChangeSelectedDetectVital={setSelectedDetectVital}
                    showVitalSelector={annotationLevel !== "episode"}
                    selectedWindow={selectedWindow}
                    onChangeSelectedWindow={handleSelectedWindowChange}
                    onCreateEventFromWindow={handleTimelineWindowCreate}
                    readOnly={hasSubmitted}
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
    </main>
  );
}
