"use client";

import Papa from "papaparse";
import { ReferenceArea, ReferenceLine, Label } from "recharts";
import { useAbnormalAnnotations } from "@/lib/useAbnormalAnnotations";
import { useEffect, useRef, useState, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { prepareVitalsData } from "@/lib/transform-data";
import type {
  PatientDemographic,
  SurgeryContext,
  PreopAssessment,
  LabData,
} from "@/lib/types";

import { prepareDemographicData } from "@/lib/prepare_raw_data/demographic";
import { prepareSurgeryContextData } from "@/lib/prepare_raw_data/surgery_context";
import { preparePreopData } from "@/lib/prepare_raw_data/preop";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type GameData = {
  currentPatientIndex: number;
  selectedPatients: Array<{
    folder: string;
  }>;
  diagnoses?: any[];
  startTime?: string;
};

type StoredSelected = { folder: string };

type SeriesMeta = {
  key: string;
  label?: string;
  color: string;
};

type TimeSeriesChartProps = {
  data: Array<Record<string, number | null>>;
  series: SeriesMeta[];
  height?: number;
  yDomain?: [number, number];
  yLabel?: string;
  syncId?: string;
};

const VITALS = ["MAP", "SBP", "DBP", "ETCO2", "HR", "SpO2"] as const;
type VitalKey = typeof VITALS[number];

const UNIFIED_MARGIN = {
  top: 10,
  right: 20,
  bottom: 28,
  left: 60,
};

const CLINICAL_LABELS: Record<string, string> = {
  gas_fio2: "FiO₂",
  gas_feo2: "FeO₂",
  gas_inco2: "Inspired CO₂",

  vent_rr: "Respiratory Rate",
  vent_tv: "Tidal Volume",
  vent_mv: "Minute Ventilation",
  vent_peep: "PEEP",
  vent_pip: "PIP",
  vent_pplat: "Plateau Pressure",
  vent_compliance: "Compliance",

  vasopressors_norepinephrine: "Norepinephrine",
  vasopressors_phenylephrine: "Phenylephrine",
  vasopressors_vasopressin: "Vasopressin",
  vasopressors_epinephrine: "Epinephrine",

  inotropes_dobutamine: "Dobutamine",
  inotropes_dopamine: "Dopamine",
  inotropes_milrinone: "Milrinone",
  inotropes_prostaglandin_e1: "PGE₁",

  sedatives_propofol: "Propofol",
  sedatives_dexmedetomidine_low: "Dexmedetomidine (Low)",
  sedatives_dexmedetomidine_high: "Dexmedetomidine (High)",

  opioids_remifentanil_low: "Remifentanil (Low)",
  opioids_remifentanil_high: "Remifentanil (High)",

  nmbas_rocuronium: "Rocuronium",
  nmbas_vecuronium: "Vecuronium",

  hemo_co: "Cardiac Output",
  hemo_ci: "Cardiac Index",
  hemo_svr: "SVR",
  hemo_cvp: "CVP",
  hemo_svv: "SVV",

  depth_bis: "BIS",
  depth_sr: "Suppression Ratio",
  depth_mac: "MAC",
};

const MONITOR_COLORS = {
  SpO2: "#85409D",
  DBP: "#001BB7",
  MAP: "#DC0E0E",
  HR: "#3A2525",
  SBP: "#73AF6F",
  ETCO2: "#F9A825",
};

const PANEL_COLORS = {
  pressors: {
    vasopressors_norepinephrine: "#FF8F8F",
    vasopressors_phenylephrine: "#CBD99B",
    vasopressors_vasopressin: "#C2E2FA",
    vasopressors_epinephrine: "#B7A3E3",
  },
  inotropes: {
    inotropes_dobutamine: "#FF8F8F",
    inotropes_dopamine: "#CBD99B",
    inotropes_milrinone: "#C2E2FA",
    inotropes_prostaglandin_e1: "#B7A3E3",
  },
  sedatives: {
    sedatives_propofol: "#fdd835",
    sedatives_dexmedetomidine_low: "#ffee58",
    sedatives_dexmedetomidine_high: "#fbc02d",
  },
  opioids: {
    opioids_remifentanil_low: "#007E6E",
    opioids_remifentanil_high: "#E67E22",
  },
  nmba: {
    nmbas_rocuronium: "#007E6E",
    nmbas_vecuronium: "#E67E22",
  },
  ventilation: {
    vent_rr: "#007E6E",
    vent_tv: "#E67E22",
    vent_mv: "#FF8F8F",
    vent_peep: "#CBD99B",
    vent_pip: "#00796b",
    vent_pplat: "#C2E2FA",
    vent_compliance: "#B7A3E3",
  },
  gas: {
    gas_fio2: "#BF1A1A",
    gas_feo2: "#007E6E",
    gas_inco2: "#2979ff",
  },
  hemodynamics: {
    hemo_co: "#CBD99B",
    hemo_ci: "#00796b",
    hemo_svr: "#B7A3E3",
    hemo_cvp: "#C2E2FA",
    hemo_svv: "#bcaaa4",
  },
  depth: {
    depth_bis: "#007E6E",
    depth_sr: "#F875AA",
    depth_mac: "#E67E22",
  },
};

const VITAL_META: Record<
  VitalKey,
  {
    label: string;
    color: string;
    yAxisId: "left";
  }
> = {
  MAP: { label: "MAP", color: MONITOR_COLORS.MAP, yAxisId: "left" },
  SBP: { label: "SBP", color: MONITOR_COLORS.SBP, yAxisId: "left" },
  DBP: { label: "DBP", color: MONITOR_COLORS.DBP, yAxisId: "left" },
  HR: { label: "HR", color: MONITOR_COLORS.HR, yAxisId: "left" },
  SpO2: { label: "SpO₂", color: MONITOR_COLORS.SpO2, yAxisId: "left" },
  ETCO2: { label: "ETCO₂", color: MONITOR_COLORS.ETCO2, yAxisId: "left" },
};

function getAreaStyle(lineColor: string) {
  const c = lineColor.toLowerCase();
  const isWhite = c === "#fff" || c === "#ffffff";
  return {
    fill: isWhite ? "rgba(255,255,255,0.20)" : `${lineColor}33`,
    stroke: isWhite ? "#111111" : lineColor,
    strokeWidth: 5,
  };
}

const ChartCard = memo(({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border bg-white p-4 shadow-sm">{children}</div>
));

function LegendBox({ series }: { series: SeriesMeta[] }) {
  return (
    <div className="w-[120px] shrink-0 pr-3">
      <ul className="space-y-1 text-sm">
        {series.map((s) => (
          <li key={s.key} className="flex items-start gap-2">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="break-words leading-tight">{s.label ?? s.key}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VitalLegend({
  series,
  visibleMap,
  onToggle,
}: {
  series: SeriesMeta[];
  visibleMap: Record<VitalKey, boolean>;
  onToggle: (k: VitalKey) => void;
}) {
  return (
    <div className="w-[120px] shrink-0 pr-3">
      <ul className="space-y-1 text-sm">
        {series.map((s) => {
          const key = s.key as VitalKey;
          const isVisible = visibleMap[key];

          return (
            <li
              key={key}
              onClick={() => onToggle(key)}
              className={`flex cursor-pointer select-none items-start gap-2 ${
                isVisible ? "opacity-100" : "opacity-30"
              }`}
            >
              <span
                className="mt-1 inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: s.color,
                  opacity: isVisible ? 1 : 0.3,
                }}
              />
              <span className="break-words leading-tight">{s.label ?? s.key}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function drugColor(key: string) {
  if (key.startsWith("vasopressors_")) return "#9400D3";
  if (key.startsWith("vasodilators_")) return "#B0AFAF";
  if (key.startsWith("inotropes_")) return "#FF7043";
  if (key.startsWith("sedatives_")) return "#FFD600";
  if (key.startsWith("opioids_")) return "#29B6F6";
  if (key.startsWith("nmbas_")) return "#8D6E63";
  return "#999999";
}

function mergeSeries(
  seriesMap: Record<string, { time: number; value: number }[]>
) {
  const keys = Object.keys(seriesMap);
  const rows: Record<number, Record<string, number | null> & { time: number }> =
    {};

  for (const [k, arr] of Object.entries(seriesMap)) {
    for (const { time, value } of arr) {
      const row = (rows[time] ??= { time });
      row[k] = Number.isFinite(value) ? value : null;
    }
  }

  const out = Object.values(rows).sort(
    (a, b) => (a.time as number) - (b.time as number)
  );

  for (const row of out) {
    for (const k of keys) {
      if (!(k in row)) row[k] = null;
    }
  }

  return out;
}

const buildSeries = <K extends string>(
  m?: Record<K, { time: number; value: number }[]>,
  color?: (k: K) => string
): SeriesMeta[] => {
  const entries = Object.entries(m ?? {}) as [
    K,
    { time: number; value: number }[]
  ][];

  return entries
    .filter(([, a]) => a.some((p) => Number.isFinite(p.value)))
    .map(([k]) => ({
      key: k,
      label: CLINICAL_LABELS[k] ?? k,
      color: color ? color(k) : drugColor(k),
    }));
};

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
    recognition.lang = ((typeof localStorage !== "undefined" && localStorage.getItem("speechRecognitionLanguage")) || (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hi") ? "hi-IN" : "en-US"));
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

function TimeSeriesChart({
  data,
  series,
  height = 280,
  yDomain = [0, 200],
  yLabel,
  syncId = "timeSync",
}: TimeSeriesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} syncId={syncId} margin={UNIFIED_MARGIN}>
        <CartesianGrid stroke="#444" strokeDasharray="3 3" />

        <XAxis
          dataKey="time"
          type="number"
          allowDataOverflow
          interval={0}
          ticks={(() => {
            const maxT = Math.max(...data.map((d) => Number(d.time ?? 0)));
            if (!Number.isFinite(maxT) || maxT <= 0) return [0];
            const out: number[] = [];
            for (let t = 0; t <= Math.ceil(maxT / 20) * 20; t += 20) out.push(t);
            return out;
          })()}
          tick={({ x, y, payload }) => (
            <g transform={`translate(${x},${y})`}>
              <text
                x={0}
                y={0}
                dy={12}
                textAnchor="end"
                fill="#111"
                fontSize={11}
                transform="rotate(-35)"
              >
                {`min ${payload.value}`}
              </text>
            </g>
          )}
        />

        <YAxis
          yAxisId="left"
          domain={yDomain}
          stroke="#000"
          tick={{ fill: "#000", fontSize: 10 }}
          label={
            yLabel
              ? {
                  value: yLabel,
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fill: "#555", fontSize: 11, fontWeight: 500 },
                }
              : undefined
          }
        />

        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            yAxisId="left"
            stroke={s.color}
            dot={false}
            name={s.label ?? s.key}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

async function fetchCsvRows(folder: string, filename: string) {
  const url = `/data/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return Papa.parse<Record<string, any>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

async function fetchTextFile(folder: string, filename: string) {
  const url = `/data/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.text()).trim();
}

export default function Dashboard() {
  const sessionStartRef = useRef<number>(performance.now());
  const getSessionDurationMs = () => performance.now() - sessionStartRef.current;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const actionLogRef = useRef<
    {
      type: string;
      ts: number;
      payload?: any;
    }[]
  >([]);

  const logAction = (type: string, payload?: any) => {
    const ts = performance.now() - sessionStartRef.current;
    console.log("[LOG]", type, ts);
    actionLogRef.current.push({ type, ts, payload });
  };

  const router = useRouter();

  const [demographic, setDemographic] = useState<PatientDemographic | null>(null);
  const [surgeryContext, setSurgeryContext] = useState<SurgeryContext | null>(null);
  const [preop, setPreop] = useState<PreopAssessment | null>(null);
  const [lab, setLab] = useState<LabData | null>(null);
  const [vitals, setVitals] = useState<any | null>(null);

  const [caseTime, setCaseTime] = useState<{
    casestart?: number;
    anestart?: number;
    opstart?: number;
    opend?: number;
    aneend?: number;
    caseend?: number;
  } | null>(null);

  const [activeVital, setActiveVital] = useState<VitalKey>("MAP");
  const [visibleVitals, setVisibleVitals] = useState<Record<VitalKey, boolean>>(
    () =>
      VITALS.reduce((acc, v) => {
        acc[v] = true;
        return acc;
      }, {} as Record<VitalKey, boolean>)
  );

  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const [selectedPatients, setSelectedPatients] = useState<StoredSelected[]>([]);
  const currentPatient = selectedPatients[currentPatientIndex];
  const [caseId, setCaseId] = useState("unknown_case");
  const voiceNote = useVoiceNote();
  const [loading, setLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const {
    abnormalPieces,
    abnormalDraft,
    deleteAbnormalPiece,
    updateAbnormalPiece,
    bindChartHandlers,
    setAbnormalPieces,
  } = useAbnormalAnnotations({
    patientId: caseId,
    activeVital,
  });

  const collectSubmissionPayload = () => {
    return {
      caseId,
      folder: currentPatient?.folder ?? null,
      session: {
        startedAt: sessionStartRef.current,
        durationMs: getSessionDurationMs(),
      },
      abnormalAnnotations: abnormalPieces.map((p: any) => ({
        feature: p.feature,
        pieceIndex: p.pieceIndex,
        start: p.start,
        end: p.end,
        etiology: p.etiology,
        confidence: p.confidence,
      })),
      actionLog: actionLogRef.current,
      voice: {
        text: voiceNote.text,
        hasAudio: Boolean(voiceNote.audioBlob),
        audioDurationMs: undefined,
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
    }
  }, [router]);

  async function loadPatient(rawFolder: string) {
    try {
      sessionStartRef.current = performance.now();
      actionLogRef.current = [];
      setHasSubmitted(false);
      setLoading(true);
      setAbnormalPieces([]);

      const folder = rawFolder;
      const caseIdFromFile = await fetchTextFile(folder, "case_id.txt");
      setCaseId(caseIdFromFile);

      const [
        phyRows,
        caseStaticRows,
        caseInfoRows,
        preopRows,
        labRows,
        patientAttrRows,
        medBolusRows,
        medInfusionRows,
        fluidInRows,
        fluidOutRows,
      ] = await Promise.all([
        fetchCsvRows(folder, "phy_data.csv"),
        fetchCsvRows(folder, "case_static.csv"),
        fetchCsvRows(folder, "case_info.csv"),
        fetchCsvRows(folder, "preop.csv"),
        fetchCsvRows(folder, "lab.csv"),
        fetchCsvRows(folder, "patients_attributes_case.csv"),
        fetchCsvRows(folder, "med_bolus.csv"),
        fetchCsvRows(folder, "med_infusion.csv"),
        fetchCsvRows(folder, "fluid_in.csv"),
        fetchCsvRows(folder, "fluid_out.csv"),
      ]);

      const caseStatic = caseStaticRows[0] ?? {};
      const caseInfo = caseInfoRows[0] ?? {};
      const preopRow = preopRows[0] ?? {};
      const labRow = labRows[0] ?? {};
      const patientAttr = patientAttrRows[0] ?? {};

      const toMinute = (value: any, startRaw: any) => {
        if (!value || !startRaw) return undefined;
        const t = new Date(value).getTime();
        const t0 = new Date(startRaw).getTime();
        if (!Number.isFinite(t) || !Number.isFinite(t0)) return undefined;
        return (t - t0) / 60000;
      };

      const anesthesiaStartRaw = caseStatic["anesthesia_start"];

      setCaseTime({
        casestart: toMinute(caseStatic["case_start"], anesthesiaStartRaw),
        anestart: 0,
        opstart: toMinute(caseStatic["procedure_start"], anesthesiaStartRaw),
        opend: toMinute(caseStatic["procedure_end"], anesthesiaStartRaw),
        aneend: toMinute(caseStatic["anesthesia_stop"], anesthesiaStartRaw),
        caseend: toMinute(caseStatic["case_end"], anesthesiaStartRaw),
      });

      setDemographic(
        prepareDemographicData(caseInfo, patientAttr, preopRow, caseIdFromFile)
      );

      setSurgeryContext(
        prepareSurgeryContextData(caseInfo, caseStatic, preopRow)
      );

      setPreop(preparePreopData(preopRow));
      setLab(prepareLabData(labRow));

      const v = prepareVitalsData({
        id: caseIdFromFile,
        phyRows,
        medBolusRows,
        medInfusionRows,
        fluidInRows,
        fluidOutRows,
      });
      setVitals(v);

      const annKey = "abnormal_annotations";
      const allAnn: any[] = JSON.parse(localStorage.getItem(annKey) || "[]");
      const mine = allAnn
        .filter((r) => r.patientId === caseIdFromFile)
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
    } catch (e) {
      console.error("Failed to load patient:", e);
    } finally {
      setLoading(false);
    }
  }

  const vitalChartData = useMemo(
    () =>
      vitals
        ? mergeSeries({
            MAP: vitals.MAP,
            SBP: vitals.SBP,
            DBP: vitals.DBP,
            HR: vitals.HR,
            SpO2: vitals.SpO2,
            ETCO2: vitals.ETCO2,
          })
        : [],
    [vitals]
  );

  const chartHandlers = useMemo(
    () => bindChartHandlers(vitalChartData),
    [bindChartHandlers, vitalChartData]
  );

  const timeIntervals = useMemo(() => {
    const t = caseTime;
    if (!t) return [];

    const caseStart = t.casestart;
    const anesStart =
      Number.isFinite(t.anestart) &&
      Number.isFinite(t.casestart) &&
      t.anestart! < t.casestart!
        ? t.casestart
        : t.anestart;

    const intervals: {
      start: number;
      end: number;
      label: string;
      color: string;
      opacity: number;
    }[] = [];

    const ok = (x: any) => Number.isFinite(x);

    const COLOR_SURGERY = "#90CAF9";
    const COLOR_ANES = "#FFCC80";
    const COLOR_OTHER = "#A5D6A7";

    const OP_SURGERY = 0.16;
    const OP_ANES = 0.16;
    const OP_OTHER = 0.12;

    if (ok(caseStart) && ok(anesStart) && caseStart! < anesStart!) {
      intervals.push({
        start: caseStart!,
        end: anesStart!,
        label: "Pre-Anesthesia (Case)",
        color: COLOR_OTHER,
        opacity: OP_OTHER,
      });
    }

    if (ok(anesStart) && ok(t.opstart) && anesStart! < t.opstart!) {
      intervals.push({
        start: anesStart!,
        end: t.opstart!,
        label: "Anesthesia (Pre-op)",
        color: COLOR_ANES,
        opacity: OP_ANES,
      });
    }

    if (ok(t.opstart) && ok(t.opend) && t.opstart! < t.opend!) {
      intervals.push({
        start: t.opstart!,
        end: t.opend!,
        label: "Surgery",
        color: COLOR_SURGERY,
        opacity: OP_SURGERY,
      });
    }

    if (ok(t.opend) && ok(t.aneend) && t.opend! < t.aneend!) {
      intervals.push({
        start: t.opend!,
        end: t.aneend!,
        label: "Anesthesia (Post-op)",
        color: COLOR_ANES,
        opacity: OP_ANES,
      });
    }

    if (ok(t.aneend) && ok(t.caseend) && t.aneend! < t.caseend!) {
      intervals.push({
        start: t.aneend!,
        end: t.caseend!,
        label: "Post-Anesthesia (Case)",
        color: COLOR_OTHER,
        opacity: OP_OTHER,
      });
    }

    return intervals;
  }, [caseTime]);

  const gasSeriesMap = useMemo(
    () => ({
      gas_fio2: vitals?.gases?.fio2 ?? [],
      gas_feo2: vitals?.gases?.feo2 ?? [],
      gas_inco2: vitals?.gases?.inco2 ?? [],
    }),
    [vitals]
  );

  const gasSeries = buildSeries(
    gasSeriesMap,
    (k) => PANEL_COLORS.gas[k as keyof typeof PANEL_COLORS.gas] ?? "#999"
  );

  const gasChartData = useMemo(() => mergeSeries(gasSeriesMap), [gasSeriesMap]);

  const ventMechanicsMap = useMemo(
    () => ({
      vent_tv: vitals?.ventilation?.vent_tv ?? [],
      vent_compliance: vitals?.ventilation?.vent_compliance ?? [],
    }),
    [vitals]
  );

  const ventControlMap = useMemo(
    () => ({
      vent_rr: vitals?.ventilation?.vent_rr ?? [],
      vent_mv: vitals?.ventilation?.vent_mv ?? [],
      vent_peep: vitals?.ventilation?.vent_peep ?? [],
      vent_pip: vitals?.ventilation?.vent_pip ?? [],
      vent_pplat: vitals?.ventilation?.vent_pplat ?? [],
    }),
    [vitals]
  );

  if (loading || !vitals) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-700" />
          <p className="text-lg">Loading patient data…</p>
        </div>
      </div>
    );
  }

  const vitalSeriesMap = {
    MAP: vitals.MAP,
    SBP: vitals.SBP,
    DBP: vitals.DBP,
    HR: vitals.HR,
    SpO2: vitals.SpO2,
    ETCO2: vitals.ETCO2,
  };

  const vitalSeries = buildSeries(
    vitalSeriesMap,
    (k) => MONITOR_COLORS[k as VitalKey]
  );
  const availableVitals = vitalSeries.map((s) => s.key as VitalKey);

  const pressorSeries = buildSeries(
    vitals.meds?.pressors,
    (k) =>
      PANEL_COLORS.pressors[k as keyof typeof PANEL_COLORS.pressors] ?? "#999"
  );

  const vasodilatorSeries = buildSeries(vitals.meds?.vasodilators);

  const inotropeSeries = buildSeries(
    vitals.meds?.inotropes,
    (k) =>
      PANEL_COLORS.inotropes[k as keyof typeof PANEL_COLORS.inotropes] ?? "#999"
  );

  const sedativeSeries = buildSeries(
    vitals.meds?.sedatives,
    (k) =>
      PANEL_COLORS.sedatives[k as keyof typeof PANEL_COLORS.sedatives] ?? "#999"
  );

  const opioidSeries = buildSeries(
    vitals.meds?.opioids,
    (k) =>
      PANEL_COLORS.opioids[k as keyof typeof PANEL_COLORS.opioids] ?? "#999"
  );

  const nmbaSeries = buildSeries(
    vitals.meds?.nmbas,
    (k) => PANEL_COLORS.nmba[k as keyof typeof PANEL_COLORS.nmba] ?? "#999"
  );

  const ventMechanicsSeries = buildSeries(
    ventMechanicsMap,
    (k) => PANEL_COLORS.ventilation[k as keyof typeof PANEL_COLORS.ventilation] ?? "#999"
  );

  const ventControlSeries = buildSeries(
    ventControlMap,
    (k) => PANEL_COLORS.ventilation[k as keyof typeof PANEL_COLORS.ventilation] ?? "#999"
  );

  const hemoSeries = buildSeries(
    vitals.hemodynamics,
    (k) =>
      PANEL_COLORS.hemodynamics[k as keyof typeof PANEL_COLORS.hemodynamics] ??
      "#999"
  );

  const depthSeries = buildSeries(
    vitals.depth,
    (k) => PANEL_COLORS.depth[k as keyof typeof PANEL_COLORS.depth] ?? "#999"
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-0 max-w-[1600px] flex-1 flex-col px-8 py-6 sm:px-10 lg:px-16 xl:px-18">
        <div className="flex min-h-0 flex-1 flex-col space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-4 text-2xl font-bold">
              Patient {currentPatientIndex + 1}
           
            </h1>

            <div className="flex items-center gap-3">
              {hasSubmitted && (
                <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
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
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
                  hasSubmitted
                    ? "cursor-not-allowed bg-green-200 text-green-800"
                    : submitting
                    ? "cursor-wait bg-blue-300 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {hasSubmitted ? "Submitted" : submitting ? "Submitting..." : "Submit"}
              </button>

              {submitError && (
                <span className="text-sm font-semibold text-red-600">
                  {submitError}
                </span>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  if (!hasSubmitted) {
                    const ok = window.confirm(
                      "You are about to submit this case and move to the next patient.\n\nThis action cannot be undone. Continue?"
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
                    loadPatient(selectedPatients[nextIndex].folder);
                  } else {
                    alert("No more patients.");
                  }
                }}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
                  submitting
                    ? "cursor-not-allowed bg-gray-100 text-gray-400"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`}
              >
                Next
              </button>

              <button
                type="button"
                onClick={() => {
                  logAction("logout");
                  localStorage.removeItem("gameData");
                  router.push("/login");
                }}
                className="rounded-md bg-red-100 px-4 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-200"
              >
                Log out
              </button>
            </div>
          </div>

          {demographic && surgeryContext && (
            <ChartCard>
              <h3 className="mb-2 text-sm font-bold text-gray-800">
                Demographic & Surgery Context
              </h3>
              <div className="grid grid-cols-6 gap-3 text-sm text-gray-700">
                <div>Age: {demographic.age ?? "-"}</div>
                <div>Sex: {demographic.sex ?? "-"}</div>
                <div>Race: {demographic.race ?? "-"}</div>
                <div>Height: {demographic.height ?? "-"}</div>
                <div>Weight: {demographic.weight ?? "-"}</div>

                <div>Procedure Room: {surgeryContext.procedure_room ?? "-"}</div>
                <div>Department: {surgeryContext.department ?? "-"}</div>
                <div>Admission Type: {surgeryContext.admission_type ?? "-"}</div>
                <div>
                  Preoperative Diagnosis: {surgeryContext.preoperative_diagnosis ?? "-"}
                </div>
                <div>Actual Procedure: {surgeryContext.actual_procedure ?? "-"}</div>
                <div>Anesthesia Type: {surgeryContext.anesthesia_type ?? "-"}</div>
                <div>Airway: {surgeryContext.airway ?? "-"}</div>
                <div>Airway Type: {surgeryContext.airway_type ?? "-"}</div>
                <div>Destination: {surgeryContext.destination ?? "-"}</div>
                <div>Emergent: {surgeryContext.emergent ?? "-"}</div>
              </div>
            </ChartCard>
          )}

          {preop && (
            <ChartCard>
              <div className="mb-2 text-sm font-semibold text-gray-800">
                Preoperative Assessment
              </div>

              <div className="grid grid-cols-6 gap-3 text-sm text-gray-700">
                <div>ASA Status: {preop.asa_status ?? "-"}</div>
                <div>Mallampati Score: {preop.mallampati_score ?? "-"}</div>
                <div>NPO Since: {preop.npo_since ?? "-"}</div>
                <div>Limited Cervical ROM: {preop.limited_cervical_rom ?? "-"}</div>
                <div>TM Distance: {preop.tm_distance ?? "-"}</div>
                <div>
                  Abnormal Oropharynx Anatomy: {preop.abnormal_oropharynx_anatomy ?? "-"}
                </div>
              </div>
            </ChartCard>
          )}

          {lab && (
            <ChartCard>
              <div className="mb-2 text-sm font-semibold text-gray-800">Lab</div>

              <div className="grid grid-cols-6 gap-3 text-sm text-gray-700">
                <div>Sodium: {lab.sodium ?? "-"}</div>
                <div>Potassium: {lab.potassium ?? "-"}</div>
                <div>Chloride: {lab.chloride ?? "-"}</div>
                <div>CO₂: {lab.co2 ?? "-"}</div>
                <div>Glucose: {lab.glucose ?? "-"}</div>
                <div>Creatinine: {lab.creatinine ?? "-"}</div>
                <div>BUN: {lab.blood_urea_nitrogen ?? "-"}</div>
                <div>Hemoglobin: {lab.hemoglobin ?? "-"}</div>
                <div>Platelet Count: {lab.platelet_count ?? "-"}</div>
                <div>PT: {lab.prothrombin_time ?? "-"}</div>
                <div>aPTT: {lab.partial_thromboplastin_time ?? "-"}</div>
                <div>Albumin: {lab.albumin ?? "-"}</div>
                <div>AST: {lab.ast ?? "-"}</div>
                <div>ALT: {lab.alt ?? "-"}</div>
                <div>pH: {lab.ph ?? "-"}</div>
                <div>PCO₂: {lab.pco2 ?? "-"}</div>
                <div>PO₂: {lab.po2 ?? "-"}</div>
                <div>HCO₃: {lab.hco3 ?? "-"}</div>
                <div>Base Excess: {lab.base_excess ?? "-"}</div>
                <div>Oxygen Saturation: {lab.oxygen_saturation ?? "-"}</div>
              </div>
            </ChartCard>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-6">
            <div className="sticky top-6 min-h-[400px] self-start space-y-4">
              {abnormalPieces.length > 0 && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                  <div className="mb-2 text-sm font-semibold text-red-700">
                    Recorded Abnormal Pieces
                  </div>

                  <div className="max-h-[540px] overflow-y-auto pr-1">
                    <ul className="space-y-3">
                      {abnormalPieces.map((p: any) => (
                        <li
                          key={`${p.feature}-${p.pieceIndex}`}
                          className="rounded-lg border border-red-200 bg-white p-3"
                        >
                          <div className="relative mb-2 flex items-center gap-3">
                            <button
                              type="button"
                              title="Delete this abnormal piece"
                              className="absolute right-0 top-0 text-lg font-bold leading-none text-gray-400 hover:text-red-600"
                              onClick={() => deleteAbnormalPiece(p.feature, p.pieceIndex)}
                            >
                              ×
                            </button>

                            <div className="w-full space-y-1 pr-6 text-sm font-medium text-red-800">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const meta = VITAL_META[p.feature as VitalKey];
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

                                <span className="text-gray-500">·</span>
                                <span>
                                  {p.start}–{p.end} min
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-gray-900">
                                <button
                                  type="button"
                                  className="font-bold hover:text-gray-700"
                                  onClick={() => {
                                    const next = p.confidence >= 5 ? 1 : p.confidence + 1;
                                    logAction("confidence_change", {
                                      feature: p.feature,
                                      pieceIndex: p.pieceIndex,
                                      newValue: next,
                                    });

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
                                  className="w-12 rounded-md border border-gray-300 px-1 py-0.5 text-center text-xs font-semibold text-gray-700"
                                  value={p.confidence}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const raw = e.target.value;

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

                              <div className="mt-2 flex items-center gap-2">
                                <span className="w-20 text-xs font-semibold text-gray-900">
                                  Etiology
                                </span>

                                <textarea
                                  rows={2}
                                  className="min-h-[56px] flex-1 resize-y rounded-md border px-2 py-1 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="e.g. Hypovolemia, anesthesia depth, surgical stimulation…"
                                  value={p.etiology}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    logAction("etiology_edit", {
                                      feature: p.feature,
                                      pieceIndex: p.pieceIndex,
                                      length: e.target.value.length,
                                    });

                                    updateAbnormalPiece(p.feature, p.pieceIndex, {
                                      etiology: e.target.value,
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">
                    Voice Note (Free Dictation)
                  </h3>

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
                    className={`rounded px-3 py-1 text-sm font-semibold ${
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
                  placeholder="Speak or type patient intro-operative summary here…"
                  value={voiceNote.text}
                  onChange={(e) => voiceNote.setText(e.target.value)}
                />

                <div className="mt-1 text-xs text-gray-500">
                  Voice transcription uses browser speech recognition. Please review and edit.
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-6">
              <div className="mb-2 flex gap-2">
                {VITALS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setActiveVital(v)}
                    className={`rounded border px-2 py-1 text-sm ${
                      activeVital === v
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    {VITAL_META[v].label}
                  </button>
                ))}
              </div>

              {availableVitals.length > 0 && (
                <ChartCard>
                  <div className="flex items-center">
                    <VitalLegend
                      series={vitalSeries}
                      visibleMap={visibleVitals}
                      onToggle={(k) =>
                        setVisibleVitals((prev) => ({
                          ...prev,
                          [k]: !prev[k],
                        }))
                      }
                    />

                    <div className="flex-1">
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          height: 360,
                          cursor: abnormalDraft ? "crosshair" : "default",
                        }}
                      >
                        <ResponsiveContainer width="100%" height={360}>
                          <LineChart
                            {...chartHandlers}
                            data={vitalChartData}
                            syncId="timeSync"
                            margin={UNIFIED_MARGIN}
                            style={{ cursor: abnormalDraft ? "crosshair" : "default" }}
                          >
                            <CartesianGrid stroke="#444" strokeDasharray="3 3" />

                            <XAxis
                              dataKey="time"
                              type="number"
                              allowDataOverflow
                              interval={0}
                              ticks={(() => {
                                const maxT = Math.max(
                                  ...vitalChartData.map((d) => Number(d.time ?? 0))
                                );
                                if (!Number.isFinite(maxT) || maxT <= 0) return [0];
                                const out: number[] = [];
                                for (let t = 0; t <= Math.ceil(maxT / 20) * 20; t += 20) {
                                  out.push(t);
                                }
                                return out;
                              })()}
                              tick={({ x, y, payload }) => (
                                <g transform={`translate(${x},${y})`}>
                                  <text
                                    x={0}
                                    y={0}
                                    dy={14}
                                    textAnchor="end"
                                    fill="#111"
                                    fontSize={11}
                                    transform="rotate(-35)"
                                  >
                                    {`min ${payload.value}`}
                                  </text>
                                </g>
                              )}
                            />

                            <XAxis
                              xAxisId="top"
                              dataKey="time"
                              type="number"
                              allowDataOverflow
                              orientation="top"
                              axisLine={false}
                              tickLine={false}
                              tick={false}
                              interval={0}
                              ticks={(() => {
                                const maxT = Math.max(
                                  ...vitalChartData.map((d) => Number(d.time ?? 0))
                                );
                                if (!Number.isFinite(maxT) || maxT <= 0) return [0];
                                const out: number[] = [];
                                for (let t = 0; t <= Math.ceil(maxT / 20) * 20; t += 20) {
                                  out.push(t);
                                }
                                return out;
                              })()}
                            />

                            <YAxis
                              yAxisId="left"
                              domain={[0, 200]}
                              ticks={Array.from({ length: 21 }, (_, i) => i * 10)}
                            />

                            {timeIntervals.map((t) => (
                              <ReferenceArea
                                key={t.label}
                                x1={t.start}
                                x2={t.end}
                                yAxisId="left"
                                y1={0}
                                y2={200}
                                fill={t.color}
                                fillOpacity={t.opacity}
                                stroke="none"
                                ifOverflow="extendDomain"
                              />
                            ))}

                            {(() => {
                              const t = caseTime;
                              if (!t) return null;

                              const markers = [
                                { x: t.casestart, label: "Case Start", dy: 0 },
                                { x: t.anestart, label: "Anesthesia Start", dy: 14 },
                                { x: t.opstart, label: "Operation Start", dy: 0 },
                                { x: t.opend, label: "Operation End", dy: 14 },
                                { x: t.aneend, label: "Anesthesia End", dy: 0 },
                                { x: t.caseend, label: "Case End", dy: 14 },
                              ].filter((m) => Number.isFinite(m.x));

                              return markers.map((m) => (
                                <ReferenceLine
                                  key={m.label}
                                  x={m.x as number}
                                  xAxisId="top"
                                  yAxisId="left"
                                  stroke="#111"
                                  strokeDasharray="4 4"
                                  ifOverflow="extendDomain"
                                >
                                  <Label
                                    value={m.label}
                                    position="top"
                                    offset={10}
                                    dy={m.dy}
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      fill: "#111",
                                    }}
                                  />
                                </ReferenceLine>
                              ));
                            })()}

                            {abnormalPieces.map((p: any) => {
                              const meta = VITAL_META[p.feature as VitalKey];
                              if (!meta) return null;
                              const style = getAreaStyle(meta.color);
                              return (
                                <ReferenceArea
                                  key={`${p.feature}-${p.pieceIndex}`}
                                  x1={p.start}
                                  x2={p.end}
                                  y1={p.centerY - 15}
                                  y2={p.centerY + 15}
                                  yAxisId={p.yAxisId}
                                  fill={style.fill}
                                  stroke={style.stroke}
                                  strokeWidth={style.strokeWidth}
                                  strokeDasharray="4 2"
                                  isFront
                                />
                              );
                            })}

                            {abnormalDraft &&
                              (() => {
                                const meta = VITAL_META[abnormalDraft.feature as VitalKey];
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
                                  />
                                );
                              })()}

                            {availableVitals.map((k) =>
                              visibleVitals[k] ? (
                                <Line
                                  key={k}
                                  yAxisId="left"
                                  dataKey={k}
                                  stroke={MONITOR_COLORS[k]}
                                  dot={false}
                                  strokeWidth={2}
                                  isAnimationActive={false}
                                />
                              ) : null
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </ChartCard>
              )}

              <div className="h-[600px] space-y-6 overflow-y-auto pr-2">
                {gasSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={gasSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(gasSeriesMap)}
                          yLabel="Gases"
                          yDomain={[0, 5]}
                          series={gasSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {pressorSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={pressorSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.meds?.pressors ?? {})}
                          yLabel="Vasopressors"
                          series={pressorSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {vasodilatorSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={vasodilatorSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.meds?.vasodilators ?? {})}
                          yLabel="Vasodilators"
                          yDomain={[0, 20]}
                          series={vasodilatorSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {inotropeSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={inotropeSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.meds?.inotropes ?? {})}
                          yLabel="Inotropes"
                          yDomain={[0, 20]}
                          series={inotropeSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {sedativeSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={sedativeSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.meds?.sedatives ?? {})}
                          yLabel="Sedatives"
                          yDomain={[0, 20]}
                          series={sedativeSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {opioidSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={opioidSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.meds?.opioids ?? {})}
                          yLabel="Opioids"
                          yDomain={[0, 20]}
                          series={opioidSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {nmbaSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={nmbaSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.meds?.nmbas ?? {})}
                          yLabel="NMBAs"
                          yDomain={[0, 20]}
                          series={nmbaSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {ventMechanicsSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={ventMechanicsSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(ventMechanicsMap)}
                          yLabel="Ventilation Mechanics"
                          yDomain={[0, 800]}
                          series={ventMechanicsSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {ventControlSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={ventControlSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(ventControlMap)}
                          yLabel="Ventilation Control & Pressure"
                          yDomain={[0, 40]}
                          series={ventControlSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {hemoSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={hemoSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.hemodynamics ?? {})}
                          yLabel="Hemodynamics"
                          yDomain={[0, 20]}
                          series={hemoSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}

                {depthSeries.length > 0 && (
                  <ChartCard>
                    <div className="flex items-center">
                      <LegendBox series={depthSeries} />
                      <div className="flex-1">
                        <TimeSeriesChart
                          data={mergeSeries(vitals.depth ?? {})}
                          yLabel="Depth"
                          yDomain={[10, 100]}
                          series={depthSeries}
                        />
                      </div>
                    </div>
                  </ChartCard>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}