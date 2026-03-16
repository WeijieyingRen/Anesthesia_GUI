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

export function prepareMedicationData(
  medBolusRows: CsvRow[],
  medInfusionRows: CsvRow[]
): MedicationPanelData {
  const result: MedicationPanelData = {
    bolus: {},
    infusion: {},
  };

  // 先统计当前 case 内每一种 bolus medication 的 total dose
  const bolusTotalMap: Record<string, number> = {};

  for (const row of medBolusRows) {
    const name = cleanName(row["med_concept_desc"]);
    const dose = toNum(row["dose"]);

    if (!name || !Number.isFinite(dose)) continue;

    bolusTotalMap[name] = (bolusTotalMap[name] ?? 0) + (dose as number);
  }

  for (const row of medBolusRows) {
    const name = cleanName(row["med_concept_desc"]);
    const time = toNum(row["relative_anesthesia_time"]);
    const dose = toNum(row["dose"]);
    const unit = row["unit"] ? String(row["unit"]).trim() : undefined;

    if (!name || !Number.isFinite(time) || !Number.isFinite(dose)) continue;

    if (!result.bolus[name]) result.bolus[name] = [];
    result.bolus[name].push({
      time: time as number,
      dose: dose as number,
      unit,
      label: `${dose} ${unit ?? ""}`.trim(),
      absoluteTime: row["observation_time"] ? String(row["observation_time"]) : undefined,
    } as MedicationBolusPoint);
  }

  for (const row of medInfusionRows) {
    const name = cleanName(row["med_concept_desc"]);
    const start = toNum(row["relative_anesthesia_start"]);
    const end = toNum(row["relative_anesthesia_end"]);
    const rate = toNum(row["dose"]);
    const unit = row["unit"] ? String(row["unit"]).trim() : undefined;

    if (!name || !Number.isFinite(start) || !Number.isFinite(rate)) continue;

    if (!result.infusion[name]) result.infusion[name] = [];
    result.infusion[name].push({
      start: start as number,
      end: Number.isFinite(end) ? (end as number) : (start as number),
      rate: rate as number,
      unit,
      label: `${rate} ${unit ?? ""}`.trim(),
    });
  }

  Object.values(result.bolus).forEach((arr) => arr.sort((a, b) => a.time - b.time));
  Object.values(result.infusion).forEach((arr) => arr.sort((a, b) => a.start - b.start));

  return result;
}