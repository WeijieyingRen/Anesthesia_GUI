import type {
  MedicationBolusPoint,
  MedicationInfusionSegment,
  MedicationPanelData,
} from "@/lib/types";

type CsvRow = Record<string, any>;

function toNum(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function cleanName(v: any): string {
  return String(v ?? "").trim();
}

function lower(v: any): string {
  return cleanName(v).toLowerCase();
}

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 统一 medication 名称：优先用 medication 列，没有再退回 med_concept_desc */
function normalizeMedicationName(row: CsvRow): string {
  const medication = cleanName(row["medication"]);
  const desc = cleanName(row["med_concept_desc"]);

  const raw = medication || desc;
  const rawLower = raw.toLowerCase();

  if (!rawLower) return "";

  if (rawLower.includes("propofol")) return "propofol";
  if (rawLower.includes("midazolam")) return "midazolam";
  if (rawLower.includes("fentanyl")) return "fentanyl";
  if (rawLower.includes("methadone")) return "methadone";
  if (rawLower.includes("rocuronium")) return "rocuronium";
  if (rawLower.includes("sugammadex")) return "sugammadex";
  if (rawLower.includes("labetalol")) return "labetalol";
  if (rawLower.includes("ondansetron")) return "ondansetron";
  if (rawLower.includes("dexamethasone")) return "dexamethasone";
  if (rawLower.includes("aprepitant")) return "aprepitant";
  if (rawLower.includes("hydromorphone")) return "hydromorphone";
  if (rawLower.includes("oxycodone")) return "oxycodone";
  if (rawLower.includes("ketamine")) return "ketamine";
  if (rawLower.includes("dexmedetomidine")) return "dexmedetomidine";
  if (rawLower.includes("phenylephrine")) return "phenylephrine";
  if (rawLower.includes("ephedrine")) return "ephedrine";

  return rawLower;
}

function isPropofol(name: string): boolean {
  return lower(name).includes("propofol");
}

function convertPropofolBolusToMg(
  dose: number | undefined,
  unitRaw: any
): { dose: number | undefined; unit: string | undefined } {
  if (!Number.isFinite(dose)) {
    return {
      dose,
      unit: cleanName(unitRaw) || undefined,
    };
  }

  const unit = lower(unitRaw);

  if (unit === "mg") {
    return { dose: roundTo(dose as number, 2), unit: "mg" };
  }

  if (unit === "mcg" || unit === "ug") {
    return { dose: roundTo((dose as number) / 1000, 3), unit: "mg" };
  }

  if (unit === "g") {
    return { dose: roundTo((dose as number) * 1000, 2), unit: "mg" };
  }

  return {
    dose: roundTo(dose as number, 2),
    unit: cleanName(unitRaw) || undefined,
  };
}

export function prepareMedicationData(
  medBolusRows: CsvRow[],
  medInfusionRows: CsvRow[]
): MedicationPanelData {
  const result: MedicationPanelData = {
    bolus: {},
    infusion: {},
  };

  /** case 级别 total dose，优先取 total_dose_per_case_med */
  const bolusTotalMap: Record<string, number> = {};

  for (const row of medBolusRows) {
    const name = normalizeMedicationName(row);
    let dose = toNum(row["dose"]);
    let unit = cleanName(row["unit"]) || undefined;
    const totalDosePerCaseMed = toNum(row["total_dose_per_case_med"]);

    if (!name) continue;

    if (Number.isFinite(totalDosePerCaseMed)) {
      let totalDose = totalDosePerCaseMed as number;

      if (isPropofol(name)) {
        const converted = convertPropofolBolusToMg(totalDose, unit);
        totalDose = converted.dose ?? totalDose;
      }

      bolusTotalMap[name] = totalDose;
      continue;
    }

    if (!Number.isFinite(dose)) continue;

    if (isPropofol(name)) {
      const converted = convertPropofolBolusToMg(dose, unit);
      dose = converted.dose;
      unit = converted.unit;
    }

    if (!Number.isFinite(dose)) continue;
    bolusTotalMap[name] = (bolusTotalMap[name] ?? 0) + (dose as number);
  }

  for (const row of medBolusRows) {
    const name = normalizeMedicationName(row);
    const time = toNum(row["relative_anesthesia_time"]);
    let dose = toNum(row["dose"]);
    let unit = cleanName(row["unit"]) || undefined;

    if (!name || !Number.isFinite(time) || !Number.isFinite(dose)) continue;

    if (isPropofol(name)) {
      const converted = convertPropofolBolusToMg(dose, unit);
      dose = converted.dose;
      unit = converted.unit;
    }

    if (!Number.isFinite(dose)) continue;

    if (!result.bolus[name]) result.bolus[name] = [];

    result.bolus[name].push({
      time: time as number,
      dose: dose as number,
      unit,
      label: `${roundTo(dose as number, 3)}`,
      totalDose: bolusTotalMap[name],
      absoluteTime: row["observation_time"]
        ? String(row["observation_time"])
        : undefined,
    } as MedicationBolusPoint);
  }

  for (const row of medInfusionRows) {
    const name = normalizeMedicationName(row);
    const start = toNum(row["relative_anesthesia_start"]);
    const end = toNum(row["relative_anesthesia_end"]);
    const rate = toNum(row["dose"]);
    const unit = cleanName(row["unit"]) || undefined;

    if (!name || !Number.isFinite(start) || !Number.isFinite(rate)) continue;

    if (!result.infusion[name]) result.infusion[name] = [];

    result.infusion[name].push({
      start: start as number,
      end: Number.isFinite(end) ? (end as number) : (start as number),
      rate: rate as number,
      unit,
      label: `${roundTo(rate as number, 3)}`,
    } as MedicationInfusionSegment);
  }

  Object.values(result.bolus).forEach((arr) =>
    arr.sort((a, b) => a.time - b.time)
  );
  Object.values(result.infusion).forEach((arr) =>
    arr.sort((a, b) => a.start - b.start)
  );

  return result;
}