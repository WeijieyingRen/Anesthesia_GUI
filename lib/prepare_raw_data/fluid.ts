import type {
  FluidBolusPoint,
  FluidInfusionSegment,
  FluidOutputPoint,
  FluidPanelData,
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

function extractFluidQualifier(
  fluidName: string,
  conceptName: string
): string | undefined {
  const text = `${fluidName} ${conceptName}`.toLowerCase();

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const val = percentMatch[1];
    if (val === "0.9") return undefined;
    return `${val}%`;
  }

  return undefined;
}

function normalizeFluidRowName(
  fluidNameRaw: any,
  conceptNameRaw: any,
  routeRaw: any
): string {
  const fluidName = lower(fluidNameRaw);
  const conceptName = lower(conceptNameRaw);
  const route = lower(routeRaw);
  const text = `${fluidName} ${conceptName}`.trim();

  if (text.includes("urine output")) return "Urine output";
  if (text.includes("estimated blood loss")) return "Estimated blood loss";
  if (text.includes("emesis")) return "Emesis";

  if (route.includes("irrigation") || text.includes("irrigation")) {
    return "Irrigation";
  }
  if (route.includes("nebulizer") || text.includes("nebulizer")) {
    return "Nebulizer saline";
  }
  if (text.includes("flush syringe") || text.includes("pf injection")) {
    return "Flush / injection";
  }

  if (text.includes("albumin")) return "Albumin";
  if (text.includes("hetastarch") || text.includes("hespan")) return "Hetastarch";
  if (text.includes("normosol") || text.includes("electrolyte-r")) return "Normosol";

  if (text.includes("lactated ringers") || text.includes("lr ")) return "LR";
  if (text === "lr") return "LR";

  if (text.includes("saline 3%") || text.includes("sodium chloride 3%")) {
    return "Hypertonic saline";
  }

  if (
    text.includes("d5-lr") ||
    text.includes("dextrose / lactated ringers 5%")
  ) {
    return "D5-LR";
  }

  if (
    text.includes("d10-ns") ||
    text.includes("dextrose / saline 10% / 0.9%")
  ) {
    return "D10-NS";
  }

  if (
    text.includes("d5-ns + kcl") ||
    text.includes("dextrose / saline w/kcl 5% / 0.9%")
  ) {
    return "D5-NS + KCl";
  }

  if (
    text.includes("d5-ns") ||
    text.includes("dextrose / saline 5% / 0.9%")
  ) {
    return "D5-NS";
  }

  if (
    text.includes("d5-1/2 ns + kcl") ||
    text.includes("dextrose / saline w/kcl 5% / 0.45%")
  ) {
    return "D5-1/2NS + KCl";
  }

  if (
    text.includes("d5-1/2 ns") ||
    text.includes("dextrose / saline 5% / 0.45%")
  ) {
    return "D5-1/2NS";
  }

  if (
    text.includes("d5w") ||
    text.includes("dextrose / water 5%")
  ) {
    return "D5W";
  }

  if (
    text.includes("d10w") ||
    text.includes("dextrose / water 10%")
  ) {
    return "D10W";
  }

  if (
    text.includes("ns + kcl") ||
    text.includes("saline w/kcl 0.9%")
  ) {
    return "NS + KCl";
  }

  if (
    text.includes("normal saline") ||
    text.includes("ns infusion") ||
    text.includes("ns bolus") ||
    text.includes("saline 0.9%")
  ) {
    return "NS";
  }

  return cleanName(conceptNameRaw) || cleanName(fluidNameRaw) || "Unknown fluid";
}

function buildFluidVolumeLabel(
  fluidNameRaw: any,
  conceptNameRaw: any,
  dose: number | undefined,
  unit: string | undefined
): string {
  const qualifier = extractFluidQualifier(
    cleanName(fluidNameRaw),
    cleanName(conceptNameRaw)
  );

  const doseText =
    Number.isFinite(dose) ? `${dose} ${unit ?? ""}`.trim() : "";

  if (qualifier && doseText) return `${qualifier} ${doseText}`;
  if (qualifier) return qualifier;
  return doseText;
}

function isInfusionUnit(unitRaw: any): boolean {
  const unit = lower(unitRaw);
  return unit.includes("/hr");
}

function shouldSkipFluidRow(rowName: string): boolean {
  return (
    rowName === "Irrigation" ||
    rowName === "Nebulizer saline" ||
    rowName === "Flush / injection"
  );
}

export function prepareFluidData(
  fluidInRows: CsvRow[],
  fluidOutRows: CsvRow[]
): FluidPanelData {
  const result: FluidPanelData = {
    bolus: {},
    infusion: {},
    output: {},
  };

  for (const row of fluidInRows) {
    const fluidName = cleanName(row["fluid_name"]);
    const conceptName = cleanName(row["concept_name"]);
    const route = cleanName(row["route"]);
    const rowName = normalizeFluidRowName(fluidName, conceptName, route);

    if (!rowName || shouldSkipFluidRow(rowName)) continue;

    const dose = toNum(row["dose"]);
    const rawUnit = row["unit"] ? String(row["unit"]).trim() : undefined;

    const start = toNum(row["relative_anesthesia_start"]);
    const endRaw = toNum(row["relative_anesthesia_end"]);

    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(dose)) continue;

    const startMin = start as number;
    const endMin =
      Number.isFinite(endRaw) && (endRaw as number) > startMin
        ? (endRaw as number)
        : startMin;

    // 统一按区间 infusion 处理
    if (!result.infusion[rowName]) result.infusion[rowName] = [];

    result.infusion[rowName].push({
      start: startMin,
      end: endMin,

      // 这里只是为了 chart 还能画出来，别再给它换算成 mL/hr 展示
      rate: dose as number,

      // 保留原始单位
      unit: rawUnit,

      // 显示总量
      label: buildFluidVolumeLabel(fluidName, conceptName, dose, rawUnit),

      absoluteStartTime: row["start_time"] ? String(row["start_time"]) : undefined,
      absoluteEndTime: row["end_time"] ? String(row["end_time"]) : undefined,
      rawName: fluidName || undefined,
      conceptName: conceptName || undefined,
      route: route || undefined,
    } as FluidInfusionSegment);
  }

  for (const row of fluidOutRows) {
    const outputName = cleanName(row["output_name"]);
    const conceptName = cleanName(row["concept_name"]);
    const route = cleanName(row["route"]);
    const rowName = normalizeFluidRowName(outputName, conceptName, route);

    if (!rowName) continue;

    const time = toNum(row["relative_anesthesia_start"]);
    const dose = toNum(row["dose"]);
    const unit = row["unit"] ? String(row["unit"]).trim() : undefined;

    if (!Number.isFinite(time) || !Number.isFinite(dose)) continue;

    if (!result.output[rowName]) result.output[rowName] = [];
    result.output[rowName].push({
      time: time as number,
      dose: dose as number,
      unit,
      label: `${dose} ${unit ?? ""}`.trim(),
      absoluteTime: row["start_time"] ? String(row["start_time"]) : undefined,
      rawName: outputName || undefined,
      conceptName: conceptName || undefined,
      route: route || undefined,
    } as FluidOutputPoint);
  }

  Object.values(result.bolus).forEach((arr) => arr.sort((a, b) => a.time - b.time));
  Object.values(result.infusion).forEach((arr) => arr.sort((a, b) => a.start - b.start));
  Object.values(result.output).forEach((arr) => arr.sort((a, b) => a.time - b.time));

  return result;
}