"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import AnnotationSidebar from "./annotation/AnnotationSidebar";
import type { AnnotationTaskKey, SidebarEventItem } from "./annotation/types";
import type {
  PatientDemographic,
  SurgeryContext,
  PreopAssessment,
  LabData,
  VitalPanelData,
  MedicationPanelData,
  FluidPanelData,
} from "@/lib/types";
import TaskWorkspace from "./annotation/TaskWorkspace";
import { prepareDemographicData } from "@/lib/prepare_raw_data/demographic";
import { prepareSurgeryContextData } from "@/lib/prepare_raw_data/surgery_context";
import { preparePreopData } from "@/lib/prepare_raw_data/preop";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";
import { prepareVitalsDataRaw } from "@/lib/prepare_raw_data/vitals";
import { prepareMedicationData } from "@/lib/prepare_raw_data/medications";
import UnifiedTimelineCard from "./UnifiedTimelineCard";
import { prepareFluidData } from "@/lib/prepare_raw_data/fluid";
import SummaryPanel from "./annotation/panels/SummaryPanel";
type CsvRow = Record<string, any>;

type DetectVital = "MAP" | "HR" | "SPO2" | "RR" | "ETCO2" | "TEMP";

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
};

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      {children}
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
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

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


export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const [selectedPatients, setSelectedPatients] = useState<StoredSelected[]>([]);
  const currentPatient = selectedPatients[currentPatientIndex];

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

  const [anesthesiaStart, setAnesthesiaStart] = useState<string | null>(null);
  const [anesthesiaStop, setAnesthesiaStop] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AnnotationTaskKey>("detect");
  const [annotationLevel, setAnnotationLevel] = useState<"episode" | "patient">("episode");

const [selectedDetectVital, setSelectedDetectVital] = useState<DetectVital>("MAP");
const [selectedWindow, setSelectedWindow] = useState<SelectedWindow | null>(null);

const [sidebarEvents, setSidebarEvents] = useState<SidebarEventItem[]>([]);
function handleCreateEventFromWindow(window: SelectedWindow) {
  const duplicate = sidebarEvents.some(
    (e) =>
      e.vital === window.vital &&
      e.startMin === window.startMin &&
      e.endMin === window.endMin
  );

  if (duplicate) {
    logAction("window_create_duplicate_ignored", {
      vital: window.vital,
      startMin: window.startMin,
      endMin: window.endMin,
      y1: window.y1,
      y2: window.y2,
    });
    return;
  }

  const sameVitalCount = sidebarEvents.filter(
    (e) => e.vital === window.vital
  ).length;

  const nextIndex = sameVitalCount + 1;

  const newEvent: SidebarEventItem = {
    id: `evt-${Date.now()}`,
    vital: window.vital,
    title: `${window.vital}-${nextIndex}`,
    episodeLabel: `${window.startMin}–${window.endMin} min`,
    startMin: window.startMin,
    endMin: window.endMin,
    y1: window.y1,
    y2: window.y2,
    completed: {
      detect: false,
      mechanism: false,
      gasEval: false,
      medEval: false,
      fluidEval: false,
      response: false,
      summary: false,
    },
  };

  setSidebarEvents((prev) => [...prev, newEvent]);
  setSelectedEventId(newEvent.id);
  setSelectedDetectVital(newEvent.vital);
  setSelectedWindow(window);
  setSelectedTask("detect");

  logAction("window_create_event", {
    eventId: newEvent.id,
    title: newEvent.title,
    vital: newEvent.vital,
    startMin: newEvent.startMin,
    endMin: newEvent.endMin,
    y1: newEvent.y1,
    y2: newEvent.y2,
  });
}
  
const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const voiceNote = useVoiceNote();
  const selectedEvent =
  sidebarEvents.find((item) => item.id === selectedEventId) ?? null;
  const sessionStartRef = useRef<number>(performance.now());
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
  
  const TASK_ORDER: AnnotationTaskKey[] = [
    "detect",
    "mechanism",
    "gasEval",
    "medEval",
    "fluidEval",
    "response"
  ];
  
  function handleSaveAndNextStep(task: AnnotationTaskKey) {
    if (!selectedEventId) return;
  
    setSidebarEvents((prev) =>
      prev.map((event) =>
        event.id === selectedEventId
          ? {
              ...event,
              completed: {
                ...event.completed,
                [task]: true,
              },
            }
          : event
      )
    );
  
    const currentIndex = TASK_ORDER.indexOf(task);
    if (currentIndex >= 0 && currentIndex < TASK_ORDER.length - 1) {
      setSelectedTask(TASK_ORDER[currentIndex + 1]);
    }
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

    if (gameData.selectedPatients?.length) {
      void loadPatient(gameData.selectedPatients[idx].folder);
    } else {
      setLoading(false);
      setLoadError("No selected patients found.");
    }
  }, [router]);


  async function loadPatient(folder: string) {
    try {
      sessionStartRef.current = performance.now();
      actionLogRef.current = [];
      setHasSubmitted(false);
      setSubmitError(null);
      setLoadError(null);
      setLoading(true);

      
      setSelectedTask("detect");
      setSelectedDetectVital("MAP");
      setSelectedWindow(null);
      setSidebarEvents([]);
      setSelectedEventId(null);
      setAnnotationLevel("episode");

      const caseIdFromFile = await fetchTextFile(folder, "case_id.txt");
      setCaseId(caseIdFromFile);

      const [
        caseInfoRows,
        patientAttrRows,
        caseStaticRows,
        preopRows,
        labRows,
        phyRows,
        medBolusRows,
        medInfusionRows,
        fluidInRows,
        fluidOutRows,
      ] = await Promise.all([
        fetchCsvRows(folder, "case_info.csv"),
        fetchCsvRows(folder, "patients_attributes_case.csv"),
        fetchCsvRows(folder, "case_static.csv"),
        fetchCsvRows(folder, "preop.csv"),
        fetchCsvRows(folder, "lab.csv"),
        fetchCsvRows(folder, "phy_data.csv"),
        fetchCsvRows(folder, "med_bolus.csv"),
        fetchCsvRows(folder, "med_infusion.csv"),
        fetchCsvRows(folder, "fluid_in.csv"),
        fetchCsvRows(folder, "fluid_out.csv"),
      ]);

      const caseInfo = caseInfoRows[0] ?? {};
      const patientAttr = patientAttrRows[0] ?? {};
      const caseStatic = caseStaticRows[0] ?? {};
      setAnesthesiaStart(caseStatic["anesthesia_start"] ?? null);
      setAnesthesiaStop(caseStatic["anesthesia_stop"] ?? null);
      const preopRow = preopRows[0] ?? {};
      const labRow = labRows[0] ?? {};

      setDemographic(
        prepareDemographicData(caseInfo, patientAttr, preopRow, caseIdFromFile)
      );

      setSurgeryContext(
        prepareSurgeryContextData(caseInfo, caseStatic, preopRow)
      );

      setPreop(preparePreopData(preopRow));
      setLab(prepareLabData(labRow));
      setVitals(prepareVitalsDataRaw(phyRows));
      
      setMedBolusRowsState(medBolusRows);
      setMedInfusionRowsState(medInfusionRows);
      setFluidInRowsState(fluidInRows);
      setFluidOutRowsState(fluidOutRows);
      
      setMedications(
        prepareMedicationData(
          medBolusRows,
          medInfusionRows
        )
      );

      setFluids(
        prepareFluidData(
          fluidInRows,
          fluidOutRows
        )
      );
    } catch (e: any) {
      console.error("Failed to load patient:", e);
      setLoadError(e?.message ?? "Failed to load patient.");
    } finally {
      setLoading(false);
    }
  }

  const collectSubmissionPayload = () => {
    return {
      caseId,
      folder: currentPatient?.folder ?? null,
      session: {
        startedAtMs: sessionStartRef.current,
        durationMs: performance.now() - sessionStartRef.current,
      },
      annotationState: {
        selectedTask,
        selectedEventId,
        selectedDetectVital,
        selectedWindow,
        sidebarEvents,
      },
      data: {
        demographic,
        surgeryContext,
        preop,
        lab,
        vitals,
        medications,
        fluids,
      },
      voice: {
        text: voiceNote.text,
        hasAudio: Boolean(voiceNote.audioBlob),
      },
      actionLog: actionLogRef.current,
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

  const sharedXTicks = Array.from(
    { length: Math.floor(sharedTimelineEnd / 15) + 1 },
    (_, i) => i * 15
  );

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
            <span>Patient {currentPatientIndex + 1}</span>
            <span className="text-base font-normal text-gray-500">
              Case ID: {caseId}
            </span>
          </h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                logAction("go_back_patient");
              
                const prevIndex = currentPatientIndex - 1;
              
                if (prevIndex >= 0) {
                  setCurrentPatientIndex(prevIndex);
                  await loadPatient(selectedPatients[prevIndex].folder);
                } else {
                  router.push("/patient-list");
                }
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
    disabled={hasSubmitted || submitting}
    onClick={async () => {
      logAction("submit_session");
      await submitCurrentSession();
    }}
    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
      hasSubmitted
        ? "cursor-not-allowed bg-green-200 text-green-800"
        : submitting
        ? "cursor-wait bg-blue-300 text-white"
        : "bg-blue-600 text-white hover:bg-blue-700"
    }`}
  >
    {hasSubmitted ? "Submitted" : submitting ? "Submitting..." : "Submit"}
  </button>

  <button
    type="button"
    disabled={submitting}
    onClick={async () => {
      if (!hasSubmitted) {
        const ok = window.confirm(
          "You have not submitted your annotation yet.\n\nThis action cannot be undone. Continue?"
        );

        if (!ok) {
          logAction("next_cancelled");
          return;
        }

        logAction("next_with_submit");
        const success = await submitCurrentSession();
        if (!success) return;
      } else {
        logAction("next_after_submit");
      }

      const nextIndex = currentPatientIndex + 1;
      if (nextIndex < selectedPatients.length) {
        setCurrentPatientIndex(nextIndex);
        await loadPatient(selectedPatients[nextIndex].folder);
      } else {
        alert("No more patients.");
      }
    }}
    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
      submitting
        ? "cursor-not-allowed bg-blue-300 text-white"
        : "bg-blue-600 text-white hover:bg-blue-700"
    }`}
  >
    Next
  </button>

  <button
  type="button"
  onClick={() => {
    logAction("home_and_logout");
    localStorage.removeItem("gameData");
    router.push("/patient-list");
  }}
  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
>
  Home & Logout
</button>
</div>
        </div>

        {submitError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </div>
        )}

        <div className="grid gap-4">
          <SectionCard title="Patient Pre-operative Information">
            <div className="space-y-3">
              {demographic && (
                <div>
                  <h4 className="mb-1 text-sm font-bold text-gray-800">Demographic</h4>
                  <FieldGrid
                    items={[
                      { label: "Age", value: demographic.age },
                      { label: "Sex", value: demographic.sex },
                      { label: "Race", value: demographic.race },
                      { label: "Height", value: demographic.height },
                      { label: "Weight", value: demographic.weight },
      
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
                      { label: "Airway Type", value: surgeryContext.airway_type },
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
    <div className="grid grid-cols-[minmax(420px,1fr)_minmax(0,2fr)] gap-4 items-start">
      {/* 左侧 annotation panel */}
      <div className="min-w-0 max-w-[640px]">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-white px-4 py-3 space-y-3">
            {/* 一级：Episode / Patient */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Task Category
              </span>

              <button
                type="button"
                onClick={() => {
                  setAnnotationLevel("episode");
                  logAction("annotation_level_click", { level: "episode" });
                }}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  annotationLevel === "episode"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Episode Level
              </button>

              <button
                type="button"
                onClick={() => {
                  setAnnotationLevel("patient");
                  setSelectedTask("summary");
                  logAction("annotation_level_click", { level: "patient" });
                }}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  annotationLevel === "patient"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Patient Level
              </button>
            </div>

            {/* 二级：具体任务 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {annotationLevel === "episode" ? "Episode Tasks" : "Patient Task"}
              </span>

              {annotationLevel === "episode" ? (
                <>
                  {(
                    ["detect", "mechanism", "gasEval", "medEval", "fluidEval", "response"] as const
                  ).map((task) => {
                    const active = selectedTask === task;

                    const labelMap = {
                      detect: "Detection",
                      mechanism: "Mechanism",
                      gasEval: "GasEval",
                      medEval: "MedEval",
                      fluidEval: "FluidEval",
                      response: "Response",
                    };

                    return (
                      <button
                        key={task}
                        type="button"
                        onClick={() => {
                          setSelectedTask(task);
                          logAction("task_tab_click", {
                            task,
                            selectedEventId,
                          });
                        }}
                        className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                          active
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {labelMap[task]}
                      </button>
                    );
                  })}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTask("summary");
                    logAction("task_tab_click", {
                      task: "summary",
                      selectedEventId: null,
                    });
                  }}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                    selectedTask === "summary"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Summary
                </button>
              )}
            </div>
          </div>

          {annotationLevel === "episode" ? (
            <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start bg-white">
              <div className="border-r">
                <AnnotationSidebar
                  selectedTask={selectedTask}
                  onChangeTask={setSelectedTask}
                  events={sidebarEvents}
                  selectedEventId={selectedEventId}
                  onSelectEvent={(eventId) => {
                    const event = sidebarEvents.find((e) => e.id === eventId);
                    if (!event) return;

                    setSelectedEventId(eventId);
                    setSelectedDetectVital(event.vital);
                    setSelectedWindow({
                      vital: event.vital,
                      startMin: event.startMin,
                      endMin: event.endMin,
                      y1: event.y1,
                      y2: event.y2,
                    });

                    logAction("sidebar_event_select", {
                      eventId,
                      title: event.title,
                      vital: event.vital,
                      startMin: event.startMin,
                      endMin: event.endMin,
                    });
                  }}
                />
              </div>

              <div className="min-w-0">
                <TaskWorkspace
                  task={selectedTask}
                  onChangeTask={setSelectedTask}
                  onSaveAndNextStep={(finishedTask) => {
                    if (!selectedEventId) return;

                    setSidebarEvents((prev) =>
                      prev.map((event) =>
                        event.id === selectedEventId
                          ? {
                              ...event,
                              completed: {
                                ...event.completed,
                                [finishedTask]: true,
                              },
                            }
                          : event
                      )
                    );

                    const nextTaskMap: Record<AnnotationTaskKey, AnnotationTaskKey | null> = {
                      detect: "mechanism",
                      mechanism: "gasEval",
                      gasEval: "medEval",
                      medEval: "fluidEval",
                      fluidEval: "response",
                      response: null,
                      summary: null,
                    };

                    const nextTask = nextTaskMap[finishedTask];
                    if (nextTask) {
                      setSelectedTask(nextTask);
                    }
                  }}
                  selectedEvent={selectedEvent}
                  caseId={caseId}
                  selectedDetectVital={selectedDetectVital}
                  selectedWindow={selectedWindow}
                  anesthesiaStart={anesthesiaStart}
                  medications={medications}
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
                />
              </div>
            </div>
          ) : (
            <div className="bg-white">
              <SummaryPanel
                caseId={caseId}
                eventId="patient-summary"
                eventTitle="Patient-level Summary"
                episodeLabel={`Patient ${currentPatientIndex + 1}`}
                startMin={0}
                endMin={sharedTimelineEnd}
              />
            </div>
          )}
        </div>
      </div>

      {/* 右侧 timeline */}
      <div className="min-w-0 space-y-4">
        <UnifiedTimelineCard
          vitals={vitals}
          medications={medications}
          fluids={fluids}
          anesthesiaStart={anesthesiaStart}
          anesthesiaStop={anesthesiaStop}
          timelineEnd={sharedTimelineEnd}
          ticks={sharedXTicks}
          selectedDetectVital={selectedDetectVital}
          onChangeSelectedDetectVital={setSelectedDetectVital}
          selectedWindow={selectedWindow}
          onChangeSelectedWindow={setSelectedWindow}
          onCreateEventFromWindow={handleCreateEventFromWindow}
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
        
          <SectionCard title="Voice Note">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Free dictation / free-text note for this patient.
              </div>
              <button
                type="button"
                onClick={() => {
                  if (voiceNote.recording) {
                    logAction("voice_stop");
                    voiceNote.stop();
                  } else {
                    logAction("voice_start");
                    voiceNote.start();
                  }
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  voiceNote.recording
                    ? "bg-red-600 text-white"
                    : "bg-blue-600 text-white"
                }`}
              >
                {voiceNote.recording ? "Stop Recording" : "Start Recording"}
              </button>
            </div>

            <textarea
              className="min-h-[180px] w-full rounded-md border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Speak or type your note here…"
              value={voiceNote.text}
              onChange={(e) => voiceNote.setText(e.target.value)}
            />

            <div className="mt-2 text-xs text-gray-500">
              Voice transcription uses browser speech recognition. Please review and edit.
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}