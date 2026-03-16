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
  
  /**
   * 从 fluid_name / concept_name 中提取需要显示在 label 里的 qualifier
   * 比如：
   * - albumin 5%  -> 5%
   * - albumin 25% -> 25%
   * - saline 3%   -> 3%
   *
   * 注意：
   * - 像 NS / LR / Normosol 这种默认液体，不强制把 0.9% 放到 label 里
   * - D5-1/2NS + KCl 这类配方已经体现在 row name，不再重复塞进 label
   */
  function extractFluidQualifier(fluidName: string, conceptName: string): string | undefined {
    const text = `${fluidName} ${conceptName}`.toLowerCase();
  
    const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      const val = percentMatch[1];
      if (val === "0.9") return undefined; // NS 默认不显示 0.9%
      return `${val}%`;
    }
  
    return undefined;
  }
  
  /**
   * 标准化成 chart 左侧 row name
   * 这里 row name 适度归一化，但不要粗到 crystalloid / colloid 那种程度
   */
  function normalizeFluidRowName(fluidNameRaw: any, conceptNameRaw: any, routeRaw: any): string {
    const fluidName = lower(fluidNameRaw);
    const conceptName = lower(conceptNameRaw);
    const route = lower(routeRaw);
    const text = `${fluidName} ${conceptName}`.trim();
  
    // 输出
    if (text.includes("urine output")) return "Urine output";
    if (text.includes("estimated blood loss")) return "Estimated blood loss";
    if (text.includes("emesis")) return "Emesis";
  
    // 先过滤明显不适合画到主要 fluid chart 的东西
    if (route.includes("irrigation") || text.includes("irrigation")) {
      return "Irrigation";
    }
    if (route.includes("nebulizer") || text.includes("nebulizer")) {
      return "Nebulizer saline";
    }
    if (text.includes("flush syringe") || text.includes("pf injection")) {
      return "Flush / injection";
    }
  
    // Albumin
    if (text.includes("albumin")) return "Albumin";
  
    // Hetastarch
    if (text.includes("hetastarch") || text.includes("hespan")) return "Hetastarch";
  
    // Normosol
    if (text.includes("normosol") || text.includes("electrolyte-r")) return "Normosol";
  
    // LR
    if (text.includes("lactated ringers") || text.includes("lr ")) return "LR";
    if (text === "lr") return "LR";
  
    // 高渗盐水
    if (text.includes("saline 3%") || text.includes("sodium chloride 3%")) {
      return "Hypertonic saline";
    }
  
    // D5-LR
    if (
      text.includes("d5-lr") ||
      text.includes("dextrose / lactated ringers 5%")
    ) {
      return "D5-LR";
    }
  
    // D10-NS
    if (
      text.includes("d10-ns") ||
      text.includes("dextrose / saline 10% / 0.9%")
    ) {
      return "D10-NS";
    }
  
    // D5-NS + KCl
    if (
      text.includes("d5-ns + kcl") ||
      text.includes("dextrose / saline w/kcl 5% / 0.9%")
    ) {
      return "D5-NS + KCl";
    }
  
    // D5-NS
    if (
      text.includes("d5-ns") ||
      text.includes("dextrose / saline 5% / 0.9%")
    ) {
      return "D5-NS";
    }
  
    // D5-1/2NS + KCl
    if (
      text.includes("d5-1/2 ns + kcl") ||
      text.includes("dextrose / saline w/kcl 5% / 0.45%")
    ) {
      return "D5-1/2NS + KCl";
    }
  
    // D5-1/2NS
    if (
      text.includes("d5-1/2 ns") ||
      text.includes("dextrose / saline 5% / 0.45%")
    ) {
      return "D5-1/2NS";
    }
  
    // D5W
    if (
      text.includes("d5w") ||
      text.includes("dextrose / water 5%")
    ) {
      return "D5W";
    }
  
    // D10W
    if (
      text.includes("d10w") ||
      text.includes("dextrose / water 10%")
    ) {
      return "D10W";
    }
  
    // NS + KCl
    if (
      text.includes("ns + kcl") ||
      text.includes("saline w/kcl 0.9%")
    ) {
      return "NS + KCl";
    }
  
    // NS
    if (
      text.includes("normal saline") ||
      text.includes("ns infusion") ||
      text.includes("ns bolus") ||
      text.includes("saline 0.9%")
    ) {
      return "NS";
    }
  
    // fallback：优先 concept_name
    return cleanName(conceptNameRaw) || cleanName(fluidNameRaw) || "Unknown fluid";
  }
  
  /**
   * 用于 label 的正文
   * - bolus: [qualifier] + [dose unit]
   * - infusion: [qualifier] + [rate unit]
   * 不写 bolus / infusion 文字，靠图形区分
   */
  function buildFluidLabel(
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
  
  function isBolusUnit(unitRaw: any): boolean {
    const unit = lower(unitRaw);
    return unit === "ml" || unit === "g" || unit === "mg";
  }
  
  function shouldSkipFluidRow(rowName: string): boolean {
    // 这些先不进主 fluid chart
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
  
    // -----------------------------
    // fluid input
    // -----------------------------
    for (const row of fluidInRows) {
      const fluidName = cleanName(row["fluid_name"]);
      const conceptName = cleanName(row["concept_name"]);
      const route = cleanName(row["route"]);
      const rowName = normalizeFluidRowName(fluidName, conceptName, route);
  
      if (!rowName || shouldSkipFluidRow(rowName)) continue;
  
      const dose = toNum(row["dose"]);
      const unit = row["unit"] ? String(row["unit"]).trim() : undefined;
  
      const start = toNum(row["relative_anesthesia_start"]);
      const end = toNum(row["relative_anesthesia_end"]);
  
      if (!Number.isFinite(start)) continue;
      if (!Number.isFinite(dose)) continue;
  
      const label = buildFluidLabel(fluidName, conceptName, dose, unit);
  
      if (isInfusionUnit(unit)) {
        if (!result.infusion[rowName]) result.infusion[rowName] = [];
  
        result.infusion[rowName].push({
          start: start as number,
          end: Number.isFinite(end) ? (end as number) : (start as number),
          rate: dose as number,
          unit,
          label,
          absoluteStartTime: row["start_time"] ? String(row["start_time"]) : undefined,
          absoluteEndTime: row["end_time"] ? String(row["end_time"]) : undefined,
          rawName: fluidName || undefined,
          conceptName: conceptName || undefined,
          route: route || undefined,
        } as FluidInfusionSegment);
      } else {
        // 其余按 bolus / point 处理
        if (!result.bolus[rowName]) result.bolus[rowName] = [];
  
        result.bolus[rowName].push({
          time: start as number,
          dose: dose as number,
          unit,
          label,
          absoluteTime: row["start_time"] ? String(row["start_time"]) : undefined,
          rawName: fluidName || undefined,
          conceptName: conceptName || undefined,
          route: route || undefined,
        } as FluidBolusPoint);
      }
    }
  
    // -----------------------------
    // fluid output
    // 目前先按 point 处理
    // -----------------------------
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
  
    // 排序
    Object.values(result.bolus).forEach((arr) => arr.sort((a, b) => a.time - b.time));
    Object.values(result.infusion).forEach((arr) => arr.sort((a, b) => a.start - b.start));
    Object.values(result.output).forEach((arr) => arr.sort((a, b) => a.time - b.time));
  
    return result;
  }