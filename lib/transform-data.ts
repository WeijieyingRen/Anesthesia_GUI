import type { VitalsData } from "@/lib/types";
// ---- helpers ----
const num = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

// function mkSeries(times: number[], values: (number | string | null | undefined)[]) {
//   const out: { time: number; value: number }[] = [];
//   const n = Math.min(times.length, values.length);
//   for (let i = 0; i < n; i++) {
//     const v = num(values[i]);
//     if (Number.isFinite(v)) out.push({ time: Number(times[i]), value: v });
//   }
//   return out;
// }

function mkSeries(times: number[], values: (number | string | null | undefined)[]) {
  const out: { time: number; value: number }[] = [];
  const n = Math.min(times.length, values.length);
  for (let i = 0; i < n; i++) {
    const v = num(values[i]);
    // keep zeros!
    if (!Number.isNaN(v)) out.push({ time: Number(times[i]), value: v });
  }
  return out;
}

const lastFinite = (arr: number[]) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (Number.isFinite(v)) return v;
  }
  return null;
};

type Row = Record<string, any>;

type PrepareVitalsInput = {
  id: string;
  phyRows: Row[];
  medBolusRows: Row[];
  medInfusionRows: Row[];
  fluidInRows: Row[];
  fluidOutRows: Row[];
};

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const buildSeriesFromWide = (
  rows: Row[],
  timeCol: string,
  valueCol: string
): { time: number; value: number }[] => {
  return rows
    .map((r) => ({
      time: Number(r[timeCol]),
      value: Number(r[valueCol]),
    }))
    .filter((x) => Number.isFinite(x.time) && Number.isFinite(x.value));
};

const pickMedSeries = (
  rows: Row[],
  medNames: string[],
  timeCol: string,
  doseCol: string,
  nameCol: string
): { time: number; value: number }[] => {
  const keep = new Set(medNames.map((x) => x.toLowerCase()));
  return rows
    .map((r) => {
      const med = String(r[nameCol] ?? "").toLowerCase().trim();
      return {
        med,
        time: Number(r[timeCol]),
        value: Number(r[doseCol]),
      };
    })
    .filter((x) => keep.has(x.med) && Number.isFinite(x.time) && Number.isFinite(x.value))
    .map((x) => ({ time: x.time, value: x.value }));
};

const pickIntervalSeries = (
  rows: Row[],
  medNames: string[],
  startCol: string,
  endCol: string,
  doseCol: string,
  nameCol: string
): { time: number; value: number }[] => {
  const keep = new Set(medNames.map((x) => x.toLowerCase()));
  const out: { time: number; value: number }[] = [];

  for (const r of rows) {
    const med = String(r[nameCol] ?? "").toLowerCase().trim();
    if (!keep.has(med)) continue;

    const start = Number(r[startCol]);
    const end = Number(r[endCol]);
    const dose = Number(r[doseCol]);

    if (!Number.isFinite(start) || !Number.isFinite(dose)) continue;

    out.push({ time: start, value: dose });

    if (Number.isFinite(end)) {
      out.push({ time: end, value: dose });
    }
  }

  return out.sort((a, b) => a.time - b.time);
};

export function prepareVitalsData({
  id,
  phyRows,
  medBolusRows,
  medInfusionRows,
  fluidInRows,
  fluidOutRows,
}: PrepareVitalsInput): VitalsData {
  const MAP = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ARTM");
  const SBP = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ARTS");
  const DBP = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ARTD");
  const HR = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "HR_EKG");
  const SpO2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "SPO2 %");
  const ETCO2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ETCO2 (mmHg)");

  const fio2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "FiO2");
  const feo2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "inO2 %");
  const inco2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "inN2O %");

  const vent_rr = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "RR");
  const vent_tv = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "TV");
  const vent_mv = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "MV");
  const vent_peep = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "PEEP (cm H2O)");
  const vent_pip = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "PIP");
  const vent_pplat = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "Plateau PIP");
  const vent_compliance = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "Mean PIP");

  const hemo_co: { time: number; value: number }[] = [];
  const hemo_ci: { time: number; value: number }[] = [];
  const hemo_svr: { time: number; value: number }[] = [];
  const hemo_cvp = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "CVP");
  const hemo_svv: { time: number; value: number }[] = [];

  const depth_bis = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "PSI/BIS/Entropy");
  const depth_sr: { time: number; value: number }[] = [];
  const depth_mac = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "etMAC exhaled");

  const pressors = {
    vasopressors_norepinephrine: [
      ...pickMedSeries(medBolusRows, ["norepinephrine"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["norepinephrine"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),

    vasopressors_phenylephrine: [
      ...pickMedSeries(medBolusRows, ["phenylephrine"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["phenylephrine"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),

    vasopressors_vasopressin: [
      ...pickMedSeries(medBolusRows, ["vasopressin"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["vasopressin"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),

    vasopressors_epinephrine: [
      ...pickMedSeries(medBolusRows, ["epinephrine"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["epinephrine"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),
  };

  const vasodilators = {
    vasodilators_nitroglycerin: [
      ...pickMedSeries(medBolusRows, ["nitroglycerin"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["nitroglycerin"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),

    vasodilators_sodium_nitroprusside: [
      ...pickMedSeries(medBolusRows, ["nitroprusside"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["nitroprusside"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),
  };

  const inotropes = {
    inotropes_dobutamine: pickIntervalSeries(medInfusionRows, ["dobutamine"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    inotropes_dopamine: pickIntervalSeries(medInfusionRows, ["dopamine"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    inotropes_milrinone: pickIntervalSeries(medInfusionRows, ["milrinone"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    inotropes_prostaglandin_e1: [],
  };

  const sedatives = {
    sedatives_propofol: [
      ...pickMedSeries(medBolusRows, ["propofol"], "relative_anesthesia_time", "dose", "med_concept_desc"),
      ...pickIntervalSeries(medInfusionRows, ["propofol"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    ].sort((a, b) => a.time - b.time),
    sedatives_dexmedetomidine_low: pickIntervalSeries(medInfusionRows, ["dexmedetomidine"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    sedatives_dexmedetomidine_high: [],
  };

  const opioids = {
    opioids_remifentanil_low: pickIntervalSeries(medInfusionRows, ["remifentanil"], "relative_anesthesia_start", "relative_anesthesia_end", "dose", "med_concept_desc"),
    opioids_remifentanil_high: [],
  };

  const nmbas = {
    nmbas_rocuronium: pickMedSeries(medBolusRows, ["rocuronium"], "relative_anesthesia_time", "dose", "med_concept_desc"),
    nmbas_vecuronium: pickMedSeries(medBolusRows, ["vecuronium"], "relative_anesthesia_time", "dose", "med_concept_desc"),
  };

  return {
    id,
    MAP,
    SBP,
    DBP,
    HR,
    SpO2,
    ETCO2,
    gases: {
      fio2,
      feo2,
      inco2,
    },
    meds: {
      pressors,
      vasodilators,
      inotropes,
      sedatives,
      opioids,
      nmbas,
    },
    ventilation: {
      vent_rr,
      vent_tv,
      vent_mv,
      vent_peep,
      vent_pip,
      vent_pplat,
      vent_compliance,
    },
    hemodynamics: {
      hemo_co,
      hemo_ci,
      hemo_svr,
      hemo_cvp,
      hemo_svv,
    },
    depth: {
      depth_bis,
      depth_sr,
      depth_mac,
    },
  };
}