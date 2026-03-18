// ---- local types for legacy transform-data.ts ----

type TimeValuePoint = {
  time: number;
  value: number;
};

type SeriesMap = Record<string, TimeValuePoint[]>;

type VitalsData = {
  id: string;
  MAP: TimeValuePoint[];
  SBP: TimeValuePoint[];
  DBP: TimeValuePoint[];
  HR: TimeValuePoint[];
  SpO2: TimeValuePoint[];
  ETCO2: TimeValuePoint[];
  gases: {
    fio2: TimeValuePoint[];
    feo2: TimeValuePoint[];
    inco2: TimeValuePoint[];
  };
  meds: {
    pressors: SeriesMap;
    vasodilators: SeriesMap;
    inotropes: SeriesMap;
    sedatives: SeriesMap;
    opioids: SeriesMap;
    nmbas: SeriesMap;
  };
  ventilation: {
    vent_rr: TimeValuePoint[];
    vent_tv: TimeValuePoint[];
    vent_mv: TimeValuePoint[];
    vent_peep: TimeValuePoint[];
    vent_pip: TimeValuePoint[];
    vent_pplat: TimeValuePoint[];
    vent_compliance: TimeValuePoint[];
  };
  hemodynamics: {
    hemo_co: TimeValuePoint[];
    hemo_ci: TimeValuePoint[];
    hemo_svr: TimeValuePoint[];
    hemo_cvp: TimeValuePoint[];
    hemo_svv: TimeValuePoint[];
  };
  depth: {
    depth_bis: TimeValuePoint[];
    depth_sr: TimeValuePoint[];
    depth_mac: TimeValuePoint[];
  };
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

// ---- helpers ----

const num = (v: any) =>
  v === null || v === undefined || v === "" ? NaN : Number(v);

function mkSeries(
  times: number[],
  values: (number | string | null | undefined)[]
): TimeValuePoint[] {
  const out: TimeValuePoint[] = [];
  const n = Math.min(times.length, values.length);

  for (let i = 0; i < n; i++) {
    const v = num(values[i]);
    if (!Number.isNaN(v) && Number.isFinite(times[i])) {
      out.push({ time: Number(times[i]), value: v });
    }
  }

  return out;
}

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const buildSeriesFromWide = (
  rows: Row[],
  timeCol: string,
  valueCol: string
): TimeValuePoint[] => {
  const times = rows.map((r) => Number(r[timeCol]));
  const values = rows.map((r) => r[valueCol]);
  return mkSeries(times, values);
};

const pickMedSeries = (
  rows: Row[],
  medNames: string[],
  timeCol: string,
  doseCol: string,
  nameCol: string
): TimeValuePoint[] => {
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
    .filter(
      (x) => keep.has(x.med) && Number.isFinite(x.time) && Number.isFinite(x.value)
    )
    .map((x) => ({ time: x.time, value: x.value }));
};

const pickIntervalSeries = (
  rows: Row[],
  medNames: string[],
  startCol: string,
  endCol: string,
  doseCol: string,
  nameCol: string
): TimeValuePoint[] => {
  const keep = new Set(medNames.map((x) => x.toLowerCase()));
  const out: TimeValuePoint[] = [];

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
  void fluidInRows;
  void fluidOutRows;

  const MAP = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ARTM");
  const SBP = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ARTS");
  const DBP = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "ARTD");
  const HR = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "HR_EKG");
  const SpO2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "SPO2 %");
  const ETCO2 = buildSeriesFromWide(
    phyRows,
    "relative_anesthesia_time",
    "ETCO2 (mmHg)"
  );

  const fio2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "FiO2");
  const feo2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "inO2 %");
  const inco2 = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "inN2O %");

  const vent_rr = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "RR");
  const vent_tv = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "TV");
  const vent_mv = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "MV");
  const vent_peep = buildSeriesFromWide(
    phyRows,
    "relative_anesthesia_time",
    "PEEP (cm H2O)"
  );
  const vent_pip = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "PIP");
  const vent_pplat = buildSeriesFromWide(
    phyRows,
    "relative_anesthesia_time",
    "Plateau PIP"
  );
  const vent_compliance = buildSeriesFromWide(
    phyRows,
    "relative_anesthesia_time",
    "Mean PIP"
  );

  const hemo_co: TimeValuePoint[] = [];
  const hemo_ci: TimeValuePoint[] = [];
  const hemo_svr: TimeValuePoint[] = [];
  const hemo_cvp = buildSeriesFromWide(phyRows, "relative_anesthesia_time", "CVP");
  const hemo_svv: TimeValuePoint[] = [];

  const depth_bis = buildSeriesFromWide(
    phyRows,
    "relative_anesthesia_time",
    "PSI/BIS/Entropy"
  );
  const depth_sr: TimeValuePoint[] = [];
  const depth_mac = buildSeriesFromWide(
    phyRows,
    "relative_anesthesia_time",
    "etMAC exhaled"
  );

  const pressors: SeriesMap = {
    vasopressors_norepinephrine: [
      ...pickMedSeries(
        medBolusRows,
        ["norepinephrine"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["norepinephrine"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),

    vasopressors_phenylephrine: [
      ...pickMedSeries(
        medBolusRows,
        ["phenylephrine"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["phenylephrine"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),

    vasopressors_vasopressin: [
      ...pickMedSeries(
        medBolusRows,
        ["vasopressin"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["vasopressin"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),

    vasopressors_epinephrine: [
      ...pickMedSeries(
        medBolusRows,
        ["epinephrine"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["epinephrine"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),
  };

  const vasodilators: SeriesMap = {
    vasodilators_nitroglycerin: [
      ...pickMedSeries(
        medBolusRows,
        ["nitroglycerin"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["nitroglycerin"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),

    vasodilators_sodium_nitroprusside: [
      ...pickMedSeries(
        medBolusRows,
        ["nitroprusside"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["nitroprusside"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),
  };

  const inotropes: SeriesMap = {
    inotropes_dobutamine: pickIntervalSeries(
      medInfusionRows,
      ["dobutamine"],
      "relative_anesthesia_start",
      "relative_anesthesia_end",
      "dose",
      "med_concept_desc"
    ),
    inotropes_dopamine: pickIntervalSeries(
      medInfusionRows,
      ["dopamine"],
      "relative_anesthesia_start",
      "relative_anesthesia_end",
      "dose",
      "med_concept_desc"
    ),
    inotropes_milrinone: pickIntervalSeries(
      medInfusionRows,
      ["milrinone"],
      "relative_anesthesia_start",
      "relative_anesthesia_end",
      "dose",
      "med_concept_desc"
    ),
    inotropes_prostaglandin_e1: [],
  };

  const sedatives: SeriesMap = {
    sedatives_propofol: [
      ...pickMedSeries(
        medBolusRows,
        ["propofol"],
        "relative_anesthesia_time",
        "dose",
        "med_concept_desc"
      ),
      ...pickIntervalSeries(
        medInfusionRows,
        ["propofol"],
        "relative_anesthesia_start",
        "relative_anesthesia_end",
        "dose",
        "med_concept_desc"
      ),
    ].sort((a, b) => a.time - b.time),
    sedatives_dexmedetomidine_low: pickIntervalSeries(
      medInfusionRows,
      ["dexmedetomidine"],
      "relative_anesthesia_start",
      "relative_anesthesia_end",
      "dose",
      "med_concept_desc"
    ),
    sedatives_dexmedetomidine_high: [],
  };

  const opioids: SeriesMap = {
    opioids_remifentanil_low: pickIntervalSeries(
      medInfusionRows,
      ["remifentanil"],
      "relative_anesthesia_start",
      "relative_anesthesia_end",
      "dose",
      "med_concept_desc"
    ),
    opioids_remifentanil_high: [],
  };

  const nmbas: SeriesMap = {
    nmbas_rocuronium: pickMedSeries(
      medBolusRows,
      ["rocuronium"],
      "relative_anesthesia_time",
      "dose",
      "med_concept_desc"
    ),
    nmbas_vecuronium: pickMedSeries(
      medBolusRows,
      ["vecuronium"],
      "relative_anesthesia_time",
      "dose",
      "med_concept_desc"
    ),
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