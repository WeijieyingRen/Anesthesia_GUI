// app/dashboard/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

import type { VitalsData } from "@/lib/types";
import { prepareVitalsData } from "@/lib/transform-data";
import { ReferenceArea } from "recharts";


import {
LineChart,
Line,
XAxis,
YAxis,
Tooltip,
Legend,
ResponsiveContainer,
CartesianGrid,
} from "recharts";
// ---- minimal shared game types ----
type StoredSelected = { id: string; file?: string };
type GameData = {
currentPatientIndex: number;
selectedPatients: StoredSelected[];
diagnoses: Array<any>;
startTime: string;
};

type PlaybackSpeed = { label: string; factor: number };
const playbackSpeeds: PlaybackSpeed[] = [
{ label: "Normal", factor: 1 },
{ label: "Faster", factor: 1.25 },
{ label: "Slower", factor: 0.75 },
{ label: "Slower+", factor: 0.5 },
{ label: "Slowest", factor: 0.25 },
];

const VITALS = ["bpMean", "bpSys", "bpDia", "pulse", "spo2", "etco2"] as const;
type VitalKey = typeof VITALS[number];
type AbnormalPiece = {
 feature: VitalKey;
 pieceIndex: number;
 start: number;
 end: number;
 centerY: number;
 yAxisId: "left" | "right";

 // ✅ 新增字段
 etiology: string;
 confidence: number; // 允许输入中态
};
const MED_MARKERS: Record<string, "cross" | "xmark" | "star" | "diamond" | "dot"> = {
// Pressors
ephedrine: "cross",
phenylephrine: "xmark",
norepinephrine: "star",
vasopressin: "diamond",
epinephrine: "dot",
// Sedatives
propofol: "cross",
ketamine: "xmark",
dexmedetomidine: "star",
etomidate: "diamond",

// Opioids
fentanyl: "cross",
hydromorphone: "xmark",
remifentanil: "star",

// Antihypertensives
labetalol: "diamond",
esmolol: "dot",
// Anticholinergics
glycopyrrolate: "cross",
};

const MedDot: React.FC<{
cx?: number;
cy?: number;
color: string;
shape: "cross" | "xmark" | "star" | "diamond" | "dot";
}> = ({ cx, cy, color, shape }) => {
if (cx == null || cy == null) return null;

const size = 6; // overall marker radius

switch (shape) {
  case "cross":
    return (
      <g transform={`translate(${cx},${cy})`}>
        <circle r={size} fill={color} />
        <path
          d="M -3 0 L 3 0 M 0 -3 L 0 3"
          stroke="black"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
    );

  case "xmark":
    return (
      <g transform={`translate(${cx},${cy})`}>
        <circle r={size} fill={color} />
        <path
          d="M -3 -3 L 3 3 M -3 3 L 3 -3"
          stroke="black"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
    );

  case "star":
    return (
      <g transform={`translate(${cx},${cy})`}>
        <circle r={size} fill={color} />
        <polygon
          points="0,-3 1,0 3,0 1.5,1.5 2,4 0,2.5 -2,4 -1.5,1.5 -3,0 -1,0"
          fill="black"
        />
      </g>
    );

  case "diamond":
    return (
      <g transform={`translate(${cx},${cy})`}>
        <circle r={size} fill={color} />
        <polygon points="0,-3 3,0 0,3 -3,0" fill="black" />
      </g>
    );

  default: // dot
    return (
      <g transform={`translate(${cx},${cy})`}>
        <circle r={size} fill={color} />
        <circle r={2} fill="black" />
      </g>
    );
}
};

const GasDot: React.FC<{ cx?: number; cy?: number; color: string }> = ({ cx, cy, color }) => {
if (cx == null || cy == null) return null;
return <circle cx={cx} cy={cy} r={5} fill={color} />;
};

const CustomDot: React.FC<{ cx?: number; cy?: number; shape: any }> = ({
cx,
cy,
shape,
}) => {
if (cx == null || cy == null) return null;

switch (shape.shape) {
  case "square":
    return (
      <rect
        x={cx - shape.r}
        y={cy - shape.r}
        width={shape.r * 2}
        height={shape.r * 2}
        fill={shape.fill}
      />
    );

  case "triangleUp":
    return (
      <polygon
        points={`${cx},${cy - shape.r} ${cx - shape.r},${cy + shape.r} ${cx + shape.r},${cy + shape.r}`}
        fill={shape.fill}
      />
    );

  case "triangleDown":
    return (
      <polygon
        points={`${cx - shape.r},${cy - shape.r} ${cx + shape.r},${cy - shape.r} ${cx},${cy + shape.r}`}
        fill={shape.fill}
      />
    );

  default:
    // Circle (solid dot)
    return <circle cx={cx} cy={cy} r={shape.r} fill={shape.fill} />;
}
};
/* ---------- Helpers ---------- */
function getDotShape(keyName: string, color: string) {
const base = {
  r: 5,
  fill: color,
  stroke: color,
  strokeWidth: 1.5,
};

if (keyName === "pulse") return { ...base, shape: "circle" };
if (keyName === "spo2") return { ...base, shape: "square" };
if (keyName === "bpSys") return { ...base, shape: "triangleUp" };
if (keyName === "bpDia") return { ...base, shape: "triangleDown" };
if (keyName === "bpMean") return { ...base, shape: "circle" }; // solid dot for MAP
return { ...base, shape: "circle" };
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

    // ---- SpeechRecognition ----
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
      const t = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setText(t);
    };

    recognition.start();
    recognitionRef.current = recognition;

    // ---- Audio recording ----
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
    setText,     // 👈 允许医生编辑
    audioBlob,   // 👈 你现在可以不用
    start,
    stop,
  };
}


function mergeSeries(
seriesMap: Record<string, { time: number; value: number }[]>
): Array<Record<string, number>> {
const timeSet = new Set<number>();
Object.values(seriesMap).forEach((arr) => arr.forEach((p) => timeSet.add(p.time)));
const times = Array.from(timeSet).sort((a, b) => a - b);
return times.map((time) => {
  const row: Record<string, number> = { time };
  for (const [key, arr] of Object.entries(seriesMap)) {
    const found = arr.find((p) => p.time === time);
    row[key] = found?.value ?? NaN;
  }
  return row;
});
}

function formatTime(mins: number) {
if (!Number.isFinite(mins)) return "";
return `min ${mins.toFixed(0)}`;
}

function fmt(val: number) {
if (!Number.isFinite(val)) return "—";
return val.toFixed(0);
}

function getLatestValues(data: any[], keys: string[]) {
const res: Record<string, number> = {};
if (!data?.length) return res;
const last = data[data.length - 1];
keys.forEach((k) => (res[k] = last[k]));
return res;
}

/* ---------- Monitor Colors ---------- */
const MONITOR_COLORS = {
pulse: "#00FF00",   // neon green
spo2: "#00FFFF",    // cyan
bp: "#FF3300",      // orange-red
map: "#FFFFFF",     // white
etco2: "#CC66FF",   // violet
resp: "#FFFF00",    // yellow (optional, if added later)
};

const DRUG_COLORS = {
propofol: "#FFFF00",
ketamine: "#FFFF00",
dexmedetomidine: "#00BFFF",
etomidate: "#FFFF00",
fentanyl: "#00BFFF",
hydromorphone: "#00BFFF",
remifentanil: "#00BFFF",
ephedrine: "#9400D3",
phenylephrine: "#9400D3",
norepinephrine: "#9400D3",
vasopressin: "#9400D3",
epinephrine: "#9400D3",
glycopyrrolate: "#00FF00",
atropine: "#00FF00",
labetalol: "#B0AFAF",
esmolol: "#B0AFAF",
};

export default function Dashboard() {
const router = useRouter();

const SHARED_MARGIN = { top: 10, right: 20, bottom: 0, left: 60 };
const VITAL_META: Record<VitalKey, {
  label: string;
  color: string;
  yAxisId: "left" | "right";
}> = {
  bpMean: { label: "MAP", color: "#ffffff", yAxisId: "left" },
  bpSys:  { label: "SBP", color: MONITOR_COLORS.bp, yAxisId: "left" },
  bpDia:  { label: "DBP", color: MONITOR_COLORS.bp, yAxisId: "left" },
  pulse:  { label: "HR",  color: MONITOR_COLORS.pulse, yAxisId: "left" },
  spo2:   { label: "SpO₂",color: MONITOR_COLORS.spo2, yAxisId: "left" },
  etco2:  { label: "ETCO₂",color: MONITOR_COLORS.etco2, yAxisId: "left" },
};
 const [abnormalDraft, setAbnormalDraft] = useState<{
  feature: VitalKey;
  start: number;
  end: number | null;
  centerY: number;
  yAxisId: "left" | "right";
} | null>(null);
const [activeVital, setActiveVital] = useState<VitalKey>("bpMean");
const [abnormalPieces, setAbnormalPieces] = useState<AbnormalPiece[]>([]);

// selection/progress
const [currentPatientIndex, setCurrentPatientIndex] = useState(0);

function getAreaStyle(lineColor: string) {
  const c = lineColor.toLowerCase();
  const isWhite = c === "#fff" || c === "#ffffff";
  return {
    fill: isWhite ? "rgba(255,255,255,0.20)" : `${lineColor}33`,
    stroke: isWhite ? "#111111" : lineColor,  // 白线用深色描边，保证可见
    strokeWidth: 2,
  };
}
function submitAbnormalPiece(
 feature: VitalKey,
 start: number,
 end: number,
 centerY: number,
 yAxisId: "left" | "right"
) {
 const patientId = selectedPatients[currentPatientIndex]?.id ?? "unknown";
 const key = "abnormal_annotations";
 const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");
 const pieceIndex =
     Math.max(
       0,
       ...existing
         .filter((r) => r.patientId === patientId && r.feature === feature)
         .map((r) => Number(r.pieceIndex) || 0)
     ) + 1;

  const record = {
    patientId,
    feature,
    pieceIndex,
    startMinute: start,
    endMinute: end,
    centerY,
    yAxisId,

    etiology: "",
    confidence: 3,

    createdAt: Date.now(),
  };

  existing.push(record);
  localStorage.setItem(key, JSON.stringify(existing));

  setAbnormalPieces((prev) => [
    ...prev,
    {
      feature,
      pieceIndex,
      start,
      end,
      centerY,
      yAxisId,
      etiology: "",
      confidence: 3,
    },
  ]);
   }
   function deleteAbnormalPiece(feature: VitalKey, pieceIndex: number) {
     // 1️⃣ 删 state
     setAbnormalPieces((prev) =>
       prev.filter(
         (p) => !(p.feature === feature && p.pieceIndex === pieceIndex)
       )
     );
  
     // 2️⃣ 删 localStorage
     const patientId = selectedPatients[currentPatientIndex]?.id ?? "unknown";
     const key = "abnormal_annotations";
     const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");
  
     const filtered = existing.filter(
       (r) =>
         !(
           r.patientId === patientId &&
           r.feature === feature &&
           Number(r.pieceIndex) === pieceIndex
         )
     );
  
     localStorage.setItem(key, JSON.stringify(filtered));
   }

function updateAbnormalPiece(
 feature: VitalKey,
 pieceIndex: number,
 patch: Partial<Pick<AbnormalPiece, "etiology" | "confidence">>
) {
 // 1) 更新 state
 setAbnormalPieces((prev) =>
   prev.map((p) =>
     p.feature === feature && p.pieceIndex === pieceIndex
       ? { ...p, ...patch }
       : p
   )
 );
 const patientId = selectedPatients[currentPatientIndex]?.id ?? "unknown";
 const key = "abnormal_annotations";
 const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");


 const idx = existing.findIndex(
   (r) =>
     r.patientId === patientId &&
     r.feature === feature &&
     r.pieceIndex === pieceIndex
 );
 if (idx >= 0) {
   existing[idx] = { ...existing[idx], ...patch };
   localStorage.setItem(key, JSON.stringify(existing));
 }
}

const [selectedPatients, setSelectedPatients] = useState<StoredSelected[]>([]);

// vitals + playback
const [vitals, setVitals] = useState<VitalsData | null>(null);
const [currentMinute, setCurrentMinute] = useState(0); // playback cursor (minutes)
const [maxMinute, setMaxMinute] = useState(0);         // end of record (minutes)
const [isPlaying, setIsPlaying] = useState(false);
const [playbackSpeedFactor, setPlaybackSpeedFactor] = useState(1);
const [currentSpeedLabel, setCurrentSpeedLabel] = useState("Normal");
const rafRef = useRef<number | null>(null);

const voiceNote = useVoiceNote();

// Track medication clicks (by category → array of minutes)
const [medicationRecords, setMedicationRecords] = useState<{
  pressor: number[];
  sedative: number[];
  opioid: number[];
  antihypertensive: number[];
  anticholinergic: number[];
}>({
  pressor: [],
  sedative: [],
  opioid: [],
  antihypertensive: [],
  anticholinergic: [],
});
// ui
const [loading, setLoading] = useState(true);
const [diagnosisComplete, setDiagnosisComplete] = useState(false);
const [clickHistory, setClickHistory] = useState<{ type: string; time: number }[]>([]);
const [age, setAge] = useState<number | null>(null);
const [weight, setWeight] = useState<number | null>(null);
// -------- load selection and current patient --------
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
    void loadPatient(gameData.selectedPatients[idx].id);
  } else {
    setLoading(false);
  }

  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [router]);

async function loadPatient(rawId: string) {
  try {
    setLoading(true);
    setDiagnosisComplete(false);
    setIsPlaying(false);
    setCurrentMinute(0);
    setMedicationRecords({
      pressor: [],
      sedative: [],
      opioid: [],
      antihypertensive: [],
      anticholinergic: [],
    });
    setClickHistory([]); // clear old medication logs when switching patients
    setAbnormalPieces([]);

    const id = rawId.replace(/\.csv$/i, "");
    const csvUrl = `/data/patients_csv/${encodeURIComponent(id)}.csv`;
    console.log("[dashboard] loading CSV:", csvUrl);

    const csvText = await (await fetch(csvUrl, { cache: "no-store" })).text();
    // --- very small CSV parser for numbers (assumes header row) ---
    const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
    const headers = headerLine.split(",").map((h) => h.trim());
    const lower = headers.map((h) => h.toLowerCase());
    const col = (names: string[]) => {
      const idx = names
        .map((n) => lower.indexOf(n.toLowerCase()))
        .find((i) => i >= 0);
      if (idx === undefined || idx < 0) return [] as number[];
      return lines.map((ln) => {
        const cells = ln.split(",");
        const v = Number(cells[idx]);
        return Number.isFinite(v) ? v : NaN;
      });
    };
    // --- Build raw vitals object ---
    const raw = {
      id,
      vitals: {
        values: {
          time_index_minutes: col(["time_index_minutes", "time_index", "time_min", "minute", "time"]),
          phys_bp_sys_non_invasive: col(["phys_bp_sys_non_invasive", "bp_sys", "systolic"]),
          phys_bp_dias_non_invasive: col(["phys_bp_dias_non_invasive", "bp_dia", "diastolic"]),
          phys_bp_mean_non_invasive: col(["phys_bp_mean_non_invasive", "bp_mean", "map"]),
          phys_spo2_pulse_rate: col(["phys_spo2_pulse_rate", "pulse_rate", "pulse", "hr"]),
          "phys_spo2_%": col(["phys_spo2_%", "phys_spo2_pct", "spo2"]),
          phys_end_tidal_co2_mmhg: col(["phys_end_tidal_co2_mmhg", "phys_end_tidal_co2_(mmhg)", "etco2"]),
          // --- gases ---
          "phys_sevoflurane_exp_%": col(["phys_sevoflurane_exp_%", "phys_sevo_percent", "sevo"]),
          "phys_isoflurane_exp_%": col(["phys_isoflurane_exp_%", "phys_iso_percent", "iso"]),
          "phys_desflurane_exp_%": col(["phys_desflurane_exp_%", "phys_des_percent", "des"]),
          "phys_nitrous_exp_%": col(["phys_nitrous_exp_%", "phys_n2o_percent", "nitrous", "n2o"]),
          // --- meds (5 categories) ---
          meds_ephedrine: col(["meds_ephedrine", "ephedrine"]),
          meds_phenylephrine: col(["meds_phenylephrine", "phenylephrine"]),
          meds_norepinephrine: col(["meds_norepinephrine", "norepinephrine"]),
          meds_vasopressin: col(["meds_vasopressin", "vasopressin"]),
          meds_epinephrine: col(["meds_epinephrine", "epinephrine"]),
          meds_glycopyrrolate: col(["meds_glycopyrrolate", "glycopyrrolate"]),
          meds_fentanyl: col(["meds_fentanyl", "fentanyl"]),
          meds_hydromorphone: col(["meds_hydromorphone", "hydromorphone"]),
          meds_remifentanil: col(["meds_remifentanil", "remifentanil"]),
          meds_labetalol: col(["meds_labetalol", "labetalol"]),
          meds_esmolol: col(["meds_esmolol", "esmolol"]),
          meds_propofol: col(["meds_propofol", "propofol"]),
          meds_ketamine: col(["meds_ketamine", "ketamine"]),
          meds_dexmedetomidine: col(["meds_dexmedetomidine", "dexmedetomidine"]),
          meds_etomidate: col(["meds_etomidate", "etomidate"]),
          age: col(["age"]),
          weight: col(["weight"]),
        },
      },
    };
  
    // find the age and weight column indexes
    const ageIndex = lower.indexOf("age");
    const weightIndex = lower.indexOf("weight");

    let foundAge = null;
    let foundWeight = null;
    // Only read first row because age/weight do not change
    if (ageIndex !== -1) {
      const v = Number(lines[0].split(",")[ageIndex]);
      if (!isNaN(v)) foundAge = v;
    }
    if (weightIndex !== -1) {
      const v = Number(lines[0].split(",")[weightIndex]);
      if (!isNaN(v)) foundWeight = v;
    }
    setAge(foundAge);
    setWeight(foundWeight);
  
    const v = prepareVitalsData(raw);
    setVitals(v);


    // ✅ load abnormal annotations for this patient
     const annKey = "abnormal_annotations";
     const allAnn: any[] = JSON.parse(localStorage.getItem(annKey) || "[]");
     const patientId = id; // 注意：这里 id 就是 rawId 去掉 .csv 后
     const mine = allAnn
       .filter((r) => r.patientId === patientId)
       .map((r) => ({
         feature: r.feature as VitalKey,
         pieceIndex: Number(r.pieceIndex),
         start: Number(r.startMinute),
         end: Number(r.endMinute),
         centerY: Number(r.centerY),
         yAxisId: (r.yAxisId as "left" | "right") ?? "left",
         etiology: typeof r.etiology === "string" ? r.etiology : "",
         confidence: (() => {
           const c = Number(r.confidence);
           if (!Number.isFinite(c)) return 3;
           if (c < 1) return 1;
           if (c > 5) return 5;
           return c;
         })(),
        
       }))
       .sort((a, b) => a.start - b.start);


     setAbnormalPieces(mine);
     setAbnormalDraft(null);

    // compute end time from the last point in each series
    const last = (a: { time: number }[] = []) => (a.length ? a[a.length - 1].time : -1);
    const totalMinutes = Math.max(
      last(v.bpSys),
      last(v.bpDia),
      last(v.bpMean),
      last(v.pulseRate),
      last(v.oxygenSaturation),
      last(v.etCO2)
    ) + 1;

    setMaxMinute(Math.max(0, totalMinutes - 1));
    setCurrentMinute(Math.min(10, totalMinutes - 1));
  
  } catch (e) {
    console.error("Failed to load patient:", e);
  } finally {
    setLoading(false);
  }
}

// -------- playback (minutes) --------
useEffect(() => {
  if (!isPlaying || !vitals) return;
  let last = 0;
  // baseline timing: how many ms per simulated minute
  const baseMsPerMinute = 3000;
  const frameTarget = baseMsPerMinute / playbackSpeedFactor;

  const tick = (ts: number) => {
    if (!last) last = ts;
    const elapsed = ts - last;
    if (elapsed >= frameTarget) {
      last = ts;
      setCurrentMinute((m) => {
        const next = Math.min(m + 1, maxMinute);
        if (next >= maxMinute) setDiagnosisComplete(true);
        return next;
      });
    }
    if (!diagnosisComplete) rafRef.current = requestAnimationFrame(tick);
  };

  rafRef.current = requestAnimationFrame(tick);
  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}, [isPlaying, vitals, maxMinute, playbackSpeedFactor, diagnosisComplete]);
// -------- controls --------
const handlePlay = () => {
  if (currentMinute >= maxMinute) return;
  setDiagnosisComplete(false);
  setIsPlaying(true);
};
const handlePause = () => setIsPlaying(false);
const handleSpeedChange = (s: PlaybackSpeed) => {
  setPlaybackSpeedFactor(s.factor);
  setCurrentSpeedLabel(s.label);
};
const handleNextPatient = () => {
  if (currentPatientIndex < selectedPatients.length - 1) {
    const next = currentPatientIndex + 1;
    const gameData = JSON.parse(localStorage.getItem("gameData") || "{}") as GameData;
    localStorage.setItem("gameData", JSON.stringify({ ...gameData, currentPatientIndex: next }));
    setCurrentPatientIndex(next);
    void loadPatient(selectedPatients[next].id);
  } else {
    router.push("/results");
  }
};
// -------- UI --------
if (loading || !vitals) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4" />
        <p className="text-lg">Loading patient data…</p>
      </div>
    </div>
  );
}
// 10-minute sliding window domain
const xDomain: [number, number] = [0, maxMinute];
// Shared X-axis ticks: every 10 minutes + last minute
const xTicks = Array.from(
  { length: Math.floor(maxMinute / 10) + 1 },
  (_, i) => i * 10
);

// Ensure the final minute is included
if (xTicks[xTicks.length - 1] !== maxMinute) {
  xTicks.push(maxMinute);
}

// --- record medication button clicks ---
const handleMedicationClick = (type: string) => {
  const recordKey = "gameData";
  const currentTime = Math.round(currentMinute);

  // Load & robustly parse gameData
  let parsed: any;
  try {
    parsed = JSON.parse(localStorage.getItem(recordKey) || "{}");
  } catch {
    parsed = {};
  }
  if (!parsed || typeof parsed !== "object") parsed = {};
  if (!Array.isArray(parsed.diagnoses)) parsed.diagnoses = [];
  // Current patient id
  const patientId = selectedPatients[currentPatientIndex]?.id ?? "unknown";

  // Find/create patient entry
  let patientEntry = parsed.diagnoses.find(
    (d: any) => d && d.patientId === patientId
  );
  if (!patientEntry) {
    patientEntry = { patientId, records: {} as Record<string, number[]> };
    parsed.diagnoses.push(patientEntry);
  }
  // Add timestamp for this medication type
  if (!Array.isArray(patientEntry.records[type])) {
    patientEntry.records[type] = [];
  }
  if (!patientEntry.records[type].includes(currentTime)) {
    patientEntry.records[type].push(currentTime);
    patientEntry.records[type].sort((a: number, b: number) => a - b);
  }

  localStorage.setItem(recordKey, JSON.stringify(parsed));
  console.log(`${type} at minute ${currentTime} (patient ${patientId})`);
  setClickHistory((prev) => [...prev, { type, time: currentTime }]);
};


const vitalChartData = mergeSeries({
 pulse: vitals.pulseRate,
 spo2: vitals.oxygenSaturation,
 bpSys: vitals.bpSys,
 bpDia: vitals.bpDia,
 bpMean: vitals.bpMean,
 etco2: vitals.etCO2,
});

   const bpData = mergeSeries({
    bpSys: vitals.bpSys,
    bpDia: vitals.bpDia,
    bpMean: vitals.bpMean,
  });
   const pulseData = mergeSeries({ pulse: vitals.pulseRate });
  const spo2Data = mergeSeries({ spo2: vitals.oxygenSaturation });
  const etco2Data = mergeSeries({ etco2: vitals.etCO2 });

  const gasesData = mergeSeries({
    sevo: vitals.gases?.sevo ?? [],
    iso: vitals.gases?.iso ?? [],
    des: vitals.gases?.des ?? [],
    n2o: vitals.gases?.nitrous ?? [],
  });
    
  // Build unified meds series with window filtering (per drug)
  const medsSeriesMap: Record<string, { time: number; value: number }[]> = {};
  function addMedGroup(group?: Record<string, { time: number; value: number }[]>) {
    if (!group) return;
    for (const [drug, arr] of Object.entries(group)) {
      medsSeriesMap[drug] = arr;

    }
  }
   addMedGroup(vitals.meds?.pressors);
  addMedGroup(vitals.meds?.sedatives);
  addMedGroup(vitals.meds?.opioids);
  addMedGroup(vitals.meds?.antihypertensives);
  addMedGroup(vitals.meds?.anticholinergic);
   const medsData = mergeSeries(medsSeriesMap);
 return (
  <main className="min-h-screen px-8 py-6 bg-gray-50">

    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-4">
          Patient {currentPatientIndex + 1}

          {age !== null && (
            <span className="text-sm font-normal text-gray-600">
              (Age: {age} · Weight: {weight})
            </span>
          )}
        </h1>
      </div>


      <div className="flex gap-2 mb-2">
 {VITALS.map((v) => (
   <button
     key={v}
     onClick={() => setActiveVital(v)}
     className={`px-2 py-1 rounded text-sm border ${
       activeVital === v
         ? "bg-blue-600 text-white border-blue-600"
         : "bg-white text-gray-700 border-gray-300"
     }`}
   >
     {VITAL_META[v].label}
   </button>
 ))}
</div>

{/* ===== Abnormal Annotation Summary ===== */}
{abnormalPieces.length > 0 && (
 <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
   <div className="mb-2 text-sm font-semibold text-red-700">
     Recorded Abnormal Pieces
   </div>


   <ul className="grid grid-cols-2 gap-3">
     {abnormalPieces.map((p) => (
       <li
         key={`${p.feature}-${p.pieceIndex}`}
         className="rounded-lg border border-red-200 bg-white p-3"
       >
         {/* ===== Header (title + delete) ===== */}
         <div className="relative mb-2 flex items-center gap-3">
           <button
             type="button"
             title="Delete this abnormal piece"
             className="
               absolute right-0 top-0
               text-lg font-bold leading-none
               text-gray-400 hover:text-red-600
             "
             onClick={() =>
               deleteAbnormalPiece(p.feature, p.pieceIndex)
             }
           >
             ×
           </button>


           <div className="pr-6 flex w-full items-center gap-2 text-sm font-medium text-red-800">

           {(() => {
              const meta = VITAL_META[p.feature];
              if (!meta) {
                return (
                  <span className="font-semibold text-red-600">
                    Unknown ({p.feature}) #{p.pieceIndex}
                  </span>
                );
              }
              return (
                <span className="font-semibold">
                  {meta.label} #{p.pieceIndex}
                </span>
              );
            })()}

             {" · "}
             {p.start}–{p.end} min
             
             <button
             type="button"
             className="ml-auto text-xs font-bold text-gray-900 hover:text-gray-700"
             onClick={() => {
               const next = p.confidence >= 5 ? 1 : p.confidence + 1;
               updateAbnormalPiece(p.feature, p.pieceIndex, {
                 confidence: next,
               });
             }}
           >
             Confidence Score (1–5):
           </button>


           <input
          type="number"
          min={1}
          max={5}
          step={1}
          className="
            w-12 rounded-md border border-gray-300
            px-1 py-0.5 text-center text-xs font-semibold text-gray-700
          "
          value={p.confidence}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const raw = e.target.value;

            // 允许输入过程（例如先清空再输入）
            if (raw === "") {
              updateAbnormalPiece(p.feature, p.pieceIndex, {
                confidence: "" as any,
              });
              return;
            }

            const n = Number(raw);
            if (!Number.isNaN(n)) {
              updateAbnormalPiece(p.feature, p.pieceIndex, {
                confidence: Math.min(5, Math.max(1, n)),
              });
            }
          }}
        />

           </div>
         </div>


         {/* ===== Etiology ===== */}
         <div className="flex items-center gap-2">
          <span className="w-20 text-xs font-semibold text-gray-900">
             Etiology
           </span>
           <input
             type="text"
             placeholder="e.g. hypovolemia, anesthetic depth…"
             className="flex-1 rounded-md border px-2 py-1 font-bold text-gray-900 text-sm"
             value={p.etiology}
             onChange={(e) =>
               updateAbnormalPiece(p.feature, p.pieceIndex, {
                 etiology: e.target.value,
               })
             }
           />
         </div>
       </li>
     ))}
   </ul>
 </div>
)}

      {/* ===== Vitals Monitor (Shared Y Axis) ===== */}
      <div className="relative rounded-2xl border p-4 shadow-sm bg-sky-30">

      <div
        className="absolute left-14 top-10
                  text-sm font-bold tracking-wide font-semibold text-gray-500
                  pointer-events-none select-none"
      >
      </div>

        <ResponsiveContainer width="100%" height={260}>
        <LineChart
      
       data={vitalChartData}
        syncId="timeSync"
        margin={SHARED_MARGIN}

        onMouseDown={(e) => {
         if (typeof e?.activeLabel !== "number") return;
      
         const idx = e.activeTooltipIndex;
         if (typeof idx !== "number") return;
      
         const row = vitalChartData[idx];
         if (!row) return;
      
         const centerY = row[activeVital];
         if (!Number.isFinite(centerY)) return;
      
         setAbnormalDraft({
           feature: activeVital,   // ✅ 不再“猜”
           start: row.time,
           end: row.time,
           centerY,
           yAxisId: "left",        // 单轴，写死
         });
       }}
      
    
        onMouseMove={(e) => {
          if (!abnormalDraft) return;
          const idx = e?.activeTooltipIndex;
         if (typeof idx !== "number") return;


         const x = vitalChartData[idx]?.time;
         if (typeof x !== "number") return;


          setAbnormalDraft((prev) => (prev ? { ...prev, end: x } : null));
        }}
      
        onMouseUp={() => {
          if (!abnormalDraft || abnormalDraft.end == null) {
            setAbnormalDraft(null);
            return;
          }
      
          const start = Math.min(abnormalDraft.start, abnormalDraft.end);
          const end = Math.max(abnormalDraft.start, abnormalDraft.end);
      
          submitAbnormalPiece(
            abnormalDraft.feature,
            start,
            end,
            abnormalDraft.centerY,
            abnormalDraft.yAxisId
          );
      
          setAbnormalDraft(null);
        }}
      >


        <CartesianGrid stroke="#444" strokeDasharray="3 3" />
        <XAxis
          dataKey="time"
          type="number"
          domain={xDomain}
          ticks={xTicks}
          allowDataOverflow
          tickFormatter={formatTime}
        />


        {/* 左侧 Y 轴 */}
        <YAxis
              yAxisId="left"
              domain={[0, 200]}
              ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
              stroke="#000"
              tick={{ fill: "#000", fontSize: 10 }}
              label={{
                value: "vitals",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: {
                  fill: "#555",
                  fontSize: 11,
                  fontWeight: 500,
                },
              }}
            />

              {/* 右侧 Y 轴 */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 200]}
                ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
                stroke="#000"
                tick={{ fill: "#000", fontSize: 10 }}
              />


       {/* ================== Abnormal Areas (BACKGROUND) ================== */}


       {abnormalPieces.map((p) => {
          const meta = VITAL_META[p.feature];
          if (!meta) return null; // ✅ 防止 runtime crash

          const style = getAreaStyle(meta.color);

          return (
            <ReferenceArea
              key={`${p.feature}-${p.pieceIndex}`}
              x1={p.start}
              x2={p.end}
              y1={p.centerY - 5}
              y2={p.centerY + 5}
              yAxisId={p.yAxisId}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray="4 2"
              isFront={true}
            />
          );
        })}



       {abnormalDraft && (
         (() => {
           const meta = VITAL_META[abnormalDraft.feature];
           const style = getAreaStyle(meta.color);
           return (
             <ReferenceArea
               x1={abnormalDraft.start}
               x2={abnormalDraft.end ?? abnormalDraft.start}
               y1={abnormalDraft.centerY - 5}
               y2={abnormalDraft.centerY + 5}
               yAxisId={abnormalDraft.yAxisId}
               fill={style.fill}
               stroke={style.stroke}
               strokeWidth={style.strokeWidth}
               strokeDasharray="4 2"
               isFront={false}
             />
           );
         })()
       )}


        <Tooltip />
        <Legend
              layout="vertical"
              align="left"
              verticalAlign="top"
              wrapperStyle={{
                left: 40,
                top: 10,
                width: 110,
                paddingRight: 1,
              }}
            />


        <Line yAxisId="left" dataKey="pulse" stroke={MONITOR_COLORS.pulse} dot={false} />
        <Line yAxisId="left" dataKey="spo2" stroke={MONITOR_COLORS.spo2} dot={false} />
        <Line yAxisId="left" dataKey="bpSys" stroke={MONITOR_COLORS.bp} dot={false} />
        <Line yAxisId="left" dataKey="bpDia" stroke={MONITOR_COLORS.bp} dot={false} />
        <Line yAxisId="left" dataKey="bpMean" stroke="#111" dot={false} />
        <Line yAxisId="left" dataKey="etco2" stroke={MONITOR_COLORS.etco2} dot={false} />
      </LineChart>
        </ResponsiveContainer>

        {/* ===== Gases ===== */}
        <ResponsiveContainer width="100%" height={140}>
          <LineChart
            data={gasesData}
            syncId="timeSync"
            margin={SHARED_MARGIN}
          >
            <CartesianGrid stroke="#444" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              type="number"
              domain={xDomain}
              ticks={xTicks}
              allowDataOverflow
              tickFormatter={formatTime}
            />

            {/* 左侧 Y 轴 */}
            <YAxis
              yAxisId="left"
              domain={[0, 200]}
              ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
              stroke="#000"
              tick={{ fill: "#000", fontSize: 10 }}
              label={{
                value: "Gases",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: {
                  fill: "#555",
                  fontSize: 11,
                  fontWeight: 500,
                },
              }}
            />

              {/* 右侧 Y 轴 */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 200]}
                ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
                stroke="#000"
                tick={{ fill: "#111", fontSize: 10 }}
              />

            <Tooltip />

            <Legend
              layout="vertical"
              align="left"
              verticalAlign="top"
              wrapperStyle={{
                left: 40,
                top: 10,
                width: 110,
                paddingRight: 1,
              }}
            />
        <Line yAxisId="left" dataKey="sevo" stroke="#ffb300" dot={false} />
        <Line yAxisId="left" dataKey="iso"  stroke="#f57c00" dot={false} />
        <Line yAxisId="left" dataKey="des"  stroke="#2979ff" dot={false} />
        <Line yAxisId="left" dataKey="n2o"  stroke="#00bfa5" dot={false} />
       </LineChart>
        </ResponsiveContainer>

        {/* ===== Medications ===== */}
        <ResponsiveContainer width="100%" height={140}>
          <LineChart
            data={medsData}
            syncId="timeSync"
            margin={SHARED_MARGIN}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#444" strokeOpacity={0.4} />
            <XAxis
              dataKey="time"
              type="number"
              domain={xDomain}
              ticks={xTicks}
              allowDataOverflow
              tickFormatter={formatTime}
            />
            {/* 左侧 Y 轴 */}
            <YAxis
              yAxisId="left"
              domain={[0, 200]}
              ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
              stroke="#000"
              tick={{ fill: "#000", fontSize: 10 }}
              label={{
                value: "Dose (mg)",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: {
                  fill: "#555",
                  fontSize: 11,
                  fontWeight: 500,
                },
              }}
            />

              {/* 右侧 Y 轴 */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 200]}
                ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
                stroke="#000"
                tick={{ fill: "#000", fontSize: 10 }}
              />
            <Tooltip />
            <Legend
              layout="vertical"
              align="left"
              verticalAlign="top"
              wrapperStyle={{
                left: 40,
                top: 10,
                width: 110,
                paddingRight: 1,
              }}
            />

            {/* Pressors */}
            <Line yAxisId="left" dataKey="ephedrine" stroke="#c77dff" dot={false} />
            <Line yAxisId="left" dataKey="phenylephrine" stroke="#c77dff" dot={false} />
            <Line yAxisId="left" dataKey="norepinephrine" stroke="#c77dff" dot={false} />
            <Line yAxisId="left" dataKey="vasopressin" stroke="#c77dff" dot={false} />
            <Line yAxisId="left" dataKey="epinephrine" stroke="#c77dff" dot={false} />

            {/* Sedatives */}
            <Line yAxisId="left" dataKey="propofol" stroke="#ffeb3b" dot={false} />
            <Line yAxisId="left" dataKey="ketamine" stroke="#ffeb3b" dot={false} />
            <Line yAxisId="left" dataKey="dexmedetomidine" stroke="#ffeb3b" dot={false} />
            <Line yAxisId="left" dataKey="etomidate" stroke="#ffeb3b" dot={false} />

            {/* Opioids */}
            <Line yAxisId="left" dataKey="fentanyl" stroke="#29b6f6" dot={false} />
            <Line yAxisId="left" dataKey="hydromorphone" stroke="#29b6f6" dot={false} />
            <Line yAxisId="left" dataKey="remifentanil" stroke="#29b6f6" dot={false} />
          </LineChart>
        </ResponsiveContainer>

      </div>

       {/* ===== Voice Note Card ===== */}
<div className="rounded-xl border bg-white p-4 shadow-sm">
  <div className="mb-2 flex items-center justify-between">
    <h3 className="text-sm font-bold text-gray-900">
      Voice Note (Free Dictation)
    </h3>

    <button
      type="button"
      onClick={voiceNote.recording ? voiceNote.stop : voiceNote.start}
      className={`
        px-3 py-1 rounded text-sm font-semibold
        ${voiceNote.recording
          ? "bg-red-600 text-white"
          : "bg-blue-600 text-white"}
      `}
    >
      {voiceNote.recording ? "Stop Recording" : "Start Recording"}
    </button>
  </div>

  <textarea
    className="
      w-full min-h-[80px]
      rounded-md border
      px-3 py-2 text-sm
      text-gray-900
      focus:outline-none focus:ring-2 focus:ring-blue-500
    "
    placeholder="Speak or type clinical reasoning here…"
    value={voiceNote.text}
    onChange={(e) => voiceNote.setText(e.target.value)}
  />

  <div className="mt-1 text-xs text-gray-500">
    Voice transcription uses browser speech recognition. Please review and edit.
  </div>
</div>

    </div>

   
  </main>
);

}





