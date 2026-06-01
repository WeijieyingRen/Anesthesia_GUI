import type { TimeValuePoint, VitalPanelData } from "@/lib/types";

type CsvRow = Record<string, any>;

type PhysiologyPanelRows = {
  vitalRows?: CsvRow[];
  gasRows?: CsvRow[];
  ventilationRows?: CsvRow[];
  cvRows?: CsvRow[];
  temperatureRows?: CsvRow[];
};

function toNum(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toTempC(v: any): number | undefined {
  const n = toNum(v);
  if (n === undefined) return undefined;
  return n > 60 ? (n - 32) * 5 / 9 : n;
}

function pushPoint(
  map: Record<string, TimeValuePoint[]>,
  key: string,
  time: number | undefined,
  value: number | undefined
) {
  if (!key) return;
  if (!Number.isFinite(time)) return;
  if (!Number.isFinite(value)) return;

  if (!map[key]) map[key] = [];
  map[key].push({
    time: time as number,
    value: value as number,
  });
}

function hasAnyNonNanColumn(phyRows: CsvRow[], columnName: string): boolean {
  return phyRows.some((row) => Number.isFinite(toNum(row[columnName])));
}

export function buildPhysiologyRowsFromPanelFiles({
  vitalRows = [],
  gasRows = [],
  ventilationRows = [],
  cvRows = [],
  temperatureRows = [],
}: PhysiologyPanelRows): CsvRow[] {
  return [
    ...vitalRows,
    ...gasRows,
    ...ventilationRows,
    ...cvRows,
    ...temperatureRows,
  ].sort((a, b) => {
    const timeA = toNum(a["relative_anesthesia_time"]) ?? Number.POSITIVE_INFINITY;
    const timeB = toNum(b["relative_anesthesia_time"]) ?? Number.POSITIVE_INFINITY;
    if (timeA !== timeB) return timeA - timeB;

    const obsA = String(a["observation_time"] ?? "");
    const obsB = String(b["observation_time"] ?? "");
    return obsA.localeCompare(obsB);
  });
}

export function prepareVitalsDataRaw(phyRows: CsvRow[]): VitalPanelData {
  const main: Record<string, TimeValuePoint[]> = {
    HR: [],
    "SPO2 %": [],
    RR: [],
    NIBP_SBP: [],
    NIBP_DBP: [],
    NIBP_MAP: [],
    ARTS: [],
    ARTD: [],
    ARTM: [],
    "ETCO2 (mmHg)": [],
  };

  const gas: Record<string, TimeValuePoint[]> = {};
  const ventilation: Record<string, TimeValuePoint[]> = {};
  const hemodynamics: Record<string, TimeValuePoint[]> = {};
  const depth: Record<string, TimeValuePoint[]> = {};
  const cv: Record<string, TimeValuePoint[]> = {};
  const tmp: Record<string, TimeValuePoint[]> = {};
  const other: Record<string, TimeValuePoint[]> = {};

  const hrSource = hasAnyNonNanColumn(phyRows, "HR_ART")
    ? "HR_ART"
    : hasAnyNonNanColumn(phyRows, "HR_EKG")
    ? "HR_EKG"
    : hasAnyNonNanColumn(phyRows, "HR_SPO2")
    ? "HR_SPO2"
    : null;

  const rrSource = hasAnyNonNanColumn(phyRows, "RR_ETCO2")
    ? "RR_ETCO2"
    : hasAnyNonNanColumn(phyRows, "RR")
    ? "RR"
    : null;

  for (const row of phyRows) {
    const time = toNum(row["relative_anesthesia_time"]);
    if (!Number.isFinite(time)) continue;

    pushPoint(main, "ARTD", time, toNum(row["ARTD"]));
    pushPoint(main, "ARTM", time, toNum(row["ARTM"]));
    pushPoint(main, "ARTS", time, toNum(row["ARTS"]));

    if (hrSource) {
      pushPoint(main, "HR", time, toNum(row[hrSource]));
    }

    pushPoint(main, "ETCO2 (mmHg)", time, toNum(row["ETCO2 (mmHg)"]));
    pushPoint(main, "NIBP_DBP", time, toNum(row["NIBP_DBP"]));
    pushPoint(main, "NIBP_MAP", time, toNum(row["NIBP_MAP"]));
    pushPoint(main, "NIBP_SBP", time, toNum(row["NIBP_SBP"]));

    if (rrSource) {
      pushPoint(main, "RR", time, toNum(row[rrSource]));
    }

    pushPoint(main, "SPO2 %", time, toNum(row["SPO2 %"]));

    pushPoint(gas, "Air (L/min)", time, toNum(row["Air (L/min)"]));
    pushPoint(gas, "FiO2", time, toNum(row["FiO2"]));
    pushPoint(gas, "N2O (L/min)", time, toNum(row["N2O (L/min)"]));
    pushPoint(gas, "O2 (L/Min)", time, toNum(row["O2 (L/Min)"]));
    pushPoint(gas, "inN2O %", time, toNum(row["inN2O %"]));
    pushPoint(gas, "inO2 %", time, toNum(row["inO2 %"]));
    pushPoint(gas, "inIsoflurane", time, toNum(row["inIsoflurane"]));
    pushPoint(gas, "inSevoflurane %", time, toNum(row["inSevoflurane %"]));
    pushPoint(gas, "etMAC exhaled", time, toNum(row["etMAC exhaled"]));

    pushPoint(ventilation, "MV", time, toNum(row["MV"]));
    pushPoint(ventilation, "Mean PIP", time, toNum(row["Mean PIP"]));
    pushPoint(ventilation, "PEEP (cm H2O)", time, toNum(row["PEEP (cm H2O)"]));
    pushPoint(ventilation, "PIP", time, toNum(row["PIP"]));
    pushPoint(ventilation, "Plateau PIP", time, toNum(row["Plateau PIP"]));
    pushPoint(ventilation, "TV", time, toNum(row["TV"]));
    pushPoint(ventilation, "RR", time, toNum(row["RR"]));
    pushPoint(ventilation, "RR_ETCO2", time, toNum(row["RR_ETCO2"]));

    pushPoint(hemodynamics, "CVP", time, toNum(row["CVP"]));
    pushPoint(hemodynamics, "PAP_DBP", time, toNum(row["PAP_DBP"]));
    pushPoint(hemodynamics, "PAP_MAP", time, toNum(row["PAP_MAP"]));
    pushPoint(hemodynamics, "PAP_SBP", time, toNum(row["PAP_SBP"]));
    pushPoint(hemodynamics, "SVO2 %", time, toNum(row["SVO2 %"]));
    pushPoint(hemodynamics, "rSO2 left", time, toNum(row["rSO2 left"]));
    pushPoint(hemodynamics, "rSO2 right", time, toNum(row["rSO2 right"]));

    pushPoint(depth, "PSI/BIS/Entropy", time, toNum(row["PSI/BIS/Entropy"]));
    pushPoint(depth, "TOF count", time, toNum(row["TOF count"]));
    pushPoint(depth, "TOF ratio %", time, toNum(row["TOF ratio %"]));

    pushPoint(tmp, "TMP Bladder", time, toTempC(row["TMP Bladder"]));
    pushPoint(tmp, "TMP Blood", time, toTempC(row["TMP Blood"]));
    pushPoint(tmp, "TMP Esophageal", time, toTempC(row["TMP Esophageal"]));
    pushPoint(tmp, "TMP Nasopharyngeal", time, toTempC(row["TMP Nasopharyngeal"]));
    pushPoint(tmp, "TMP Rectal", time, toTempC(row["TMP Rectal"]));

    pushPoint(cv, "CVP", time, toNum(row["CVP"]));
    pushPoint(cv, "PAPS", time, toNum(row["PAPS"]));
    pushPoint(cv, "PAPD", time, toNum(row["PAPD"]));
    pushPoint(cv, "PAPM", time, toNum(row["PAPM"]));
    pushPoint(cv, "Cerebral Oximetry Left", time, toNum(row["Cerebral Oximetry Left"]));
    pushPoint(cv, "Cerebral Oximetry Right", time, toNum(row["Cerebral Oximetry Right"]));
    pushPoint(cv, "SVO2 %", time, toNum(row["SVO2 %"]));
    pushPoint(cv, "ABPS", time, toNum(row["ABPS"]));
    pushPoint(cv, "ABPD", time, toNum(row["ABPD"]));
  }

  return {
    main,
    gas,
    ventilation,
    hemodynamics,
    cv,
    depth,
    tmp,
    other,
  };
}
