"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ZAxis,
  ReferenceLine,
} from "recharts";

import type {
  MedicationPanelData,
  MedicationBolusPoint,
  MedicationInfusionSegment,
} from "@/lib/types";
import type { ManagementEvent } from "@/lib/types_management";
import {
  CHART_AXIS_WIDTH as AXIS_COL_WIDTH,
  CHART_LEGEND_WIDTH as LEGEND_COL_WIDTH,
  CHART_RIGHT_MARGIN as RECHARTS_RIGHT_MARGIN,
  buildChartTicks,
  getChartMajorStep,
  getChartMinorStep,
  getSharedChartGeometry,
  minuteToX,
  type TimeResolution,
} from "@/src/components/charts/chartLayout";

type MedicationChartProps = {
  title?: string;
  medications: MedicationPanelData | null;
  height?: number;
  xEnd?: number;
  xTicks?: number[];
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;
  highlightWindow?: HighlightWindow | null;
  managementEvent?: ManagementEvent | null;
  timeResolution?: TimeResolution;
  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;
};

type HighlightWindow = {
  startMin: number;
  endMin: number;
};

type MarkerType = "bolus-box";

type MedRow = {
  name: string;
  bolus: MedicationBolusPoint[];
  infusion: MedicationInfusionSegment[];
  rowIndex: number;
};

type ScatterPoint = {
  x: number;
  y: number;
  medName: string;
  label: string;
  dose?: number;
  unit?: string;
  marker: MarkerType;
  color: string;
};

type MedicationClickInfo = {
  name: string;
  timeText: string;
  amountText: string;
  x: number;
  y: number;
};

const MEDICATION_DISPLAY_ORDER = [
  "propofol",
  "propofol inject",
  "etomidate",
  "ketamine",
  "midazolam",
  "dexmedetomidine",
  "fentanyl",
  "sufentanil",
  "remifentanil",
  "hydromorphone",
  "morphine",
  "methadone",
  "meperidine",
  "oxycodone",
  "lorazepam",
  "diazepam",
  "succinylcholine",
  "rocuronium",
  "vecuronium",
  "cisatracurium",
  "sugammadex",
  "neostigmine",
  "glycopyrrolate",
  "ephedrine",
  "phenylephrine",
  "epinephrine",
  "norepinephrine",
  "vasopressin",
  "dopamine",
  "dobutamine",
  "milrinone",
  "nitroglycerin",
  "nitroprusside",
  "esmolol",
  "labetalol",
  "hydralazine",
  "nicardipine",
  "clevidipine",
  "ondansetron",
  "granisetron",
  "metoclopramide",
  "promethazine",
  "prochlorperazine",
  "dexamethasone",
  "aprepitant",
  "fosaprepitant",
  "cefazolin",
  "tranexamic acid",
  "aminocaproic acid",
  "oxytocin",
  "calcium chloride",
  "calcium gluconate",
  "sodium bicarbonate",
  "amiodarone",
  "naloxone",
  "flumazenil",
  "albuterol",
  "ipratropium",
  "ipratropium/albuterol",
  "nitric oxide",
];

const ROW_HEIGHT = 25;
const PLOT_TOP_PAD = 0;
const PLOT_BOTTOM_PAD = 0;

function normalizeName(name: string) {
  return String(name ?? "").trim().toLowerCase();
}

function sortMedicationNames(names: string[]) {
  const rank = new Map(
    MEDICATION_DISPLAY_ORDER.map((name, i) => [normalizeName(name), i])
  );

  return [...names].sort((a, b) => {
    const na = normalizeName(a);
    const nb = normalizeName(b);

    const ra = [...rank.keys()].find((k) => na.includes(k));
    const rb = [...rank.keys()].find((k) => nb.includes(k));

    const va = ra ? rank.get(ra)! : Number.MAX_SAFE_INTEGER;
    const vb = rb ? rank.get(rb)! : Number.MAX_SAFE_INTEGER;

    if (va !== vb) return va - vb;
    return na.localeCompare(nb);
  });
}

function inferColor(name: string) {
  const n = normalizeName(name);

  if (
    ["propofol", "propofol inject", "etomidate", "ketamine"].some((x) =>
      n.includes(x)
    )
  ) {
    return "#ffff00";
  }

  if (["midazolam", "diazepam", "lorazepam"].some((x) => n.includes(x))) {
    return "#ff6600";
  }

  if (
    [
      "fentanyl",
      "sufentanil",
      "remifentanil",
      "hydromorphone",
      "morphine",
      "methadone",
      "meperidine",
      "oxycodone",
    ].some((x) => n.includes(x))
  ) {
    return "#85c7e3";
  }

  if (
    [
      "rocuronium",
      "vecuronium",
      "cisatracurium",
      "succinylcholine",
      "sugammadex",
      "neostigmine",
    ].some((x) => n.includes(x))
  ) {
    return "#f54029";
  }

  if (
    [
      "phenylephrine",
      "ephedrine",
      "epinephrine",
      "norepinephrine",
      "vasopressin",
      "dopamine",
      "dobutamine",
      "milrinone",
      "labetalol",
      "nicardipine",
      "clevidipine",
      "esmolol",
      "hydralazine",
      "nitroglycerin",
      "nitroprusside",
    ].some((x) => n.includes(x))
  ) {
    return "#debfd9";
  }

  if (
    [
      "ondansetron",
      "granisetron",
      "metoclopramide",
      "promethazine",
      "prochlorperazine",
      "aprepitant",
      "fosaprepitant",
    ].some((x) => n.includes(x))
  ) {
    return "#edc282";
  }

  if (
    ["glycopyrrolate", "naloxone", "flumazenil"].some((x) => n.includes(x))
  ) {
    return "#a3d963";
  }

  if (
    [
      "dexamethasone",
      "cefazolin",
      "tranexamic acid",
      "aminocaproic acid",
      "oxytocin",
      "calcium chloride",
      "calcium gluconate",
      "sodium bicarbonate",
      "amiodarone",
      "albuterol",
      "ipratropium",
      "ipratropium/albuterol",
      "nitric oxide",
    ].some((x) => n.includes(x))
  ) {
    return "#f3f4f6";
  }

  return "#e5e7eb";
}

function inferStripe(name: string) {
  const n = normalizeName(name);

  if (
    ["sugammadex", "neostigmine", "naloxone", "flumazenil"].some((x) =>
      n.includes(x)
    )
  ) {
    return "red";
  }

  return null;
}

function getEpicBaseFill() {
  return "#dff3df";
}

function getEpicBaseStroke() {
  return "#7fa487";
}

function buildRows(
  medications: MedicationPanelData | null,
  xEnd?: number
): MedRow[] {
  if (!medications) return [];

  const allNames = new Set<string>([
    ...Object.keys(medications.bolus ?? {}),
    ...Object.keys(medications.infusion ?? {}),
  ]);

  const orderedNames = sortMedicationNames([...allNames]);

  const rows = orderedNames.map((name) => {
    const rawBolus = medications.bolus[name] ?? [];
    const rawInfusion = medications.infusion[name] ?? [];

    const bolus =
      xEnd === undefined
        ? rawBolus
        : rawBolus.filter((p) => Number.isFinite(p.time) && p.time <= xEnd);

    const infusion =
      xEnd === undefined
        ? rawInfusion
        : rawInfusion
            .filter(
              (seg) =>
                Number.isFinite(seg.start) &&
                Number.isFinite(seg.end) &&
                seg.start <= xEnd
            )
            .map((seg) => ({
              ...seg,
              end: Math.min(seg.end, xEnd),
            }));

    return {
      name,
      bolus,
      infusion,
    };
  });

  const nonEmptyRows = rows.filter(
    (row) => row.bolus.length > 0 || row.infusion.length > 0
  );

  return nonEmptyRows.map((row, idx) => ({
    ...row,
    rowIndex: idx,
  }));
}

function formatMedNumber(v: number) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

function buildBolusScatter(
  rows: MedRow[],
  hiddenNames: string[]
): ScatterPoint[] {
  return rows.flatMap((row) => {
    if (hiddenNames.includes(row.name)) return [];

    return row.bolus.map((p) => ({
      x: p.time,
      y: row.rowIndex,
      medName: row.name,
      label: `${formatMedNumber(Number(p.dose))}`,
      dose: p.dose,
      unit: p.unit,
      marker: "bolus-box" as MarkerType,
      color: inferColor(row.name),
    }));
  });
}

function getMaxTime(rows: MedRow[]) {
  const times: number[] = [];

  rows.forEach((row) => {
    row.bolus.forEach((p) => {
      if (Number.isFinite(p.time)) times.push(p.time);
    });

    row.infusion.forEach((seg) => {
      if (Number.isFinite(seg.start)) times.push(seg.start);
      if (Number.isFinite(seg.end)) times.push(seg.end);
    });
  });

  if (!times.length) return 15;
  return Math.max(...times);
}

function getMedicationTotalLabel(row: MedRow) {
  if (row.bolus.length > 0) {
    const first = row.bolus[0];
    const totalDose =
      first.totalDose ??
      row.bolus.reduce(
        (sum, p) => sum + (Number.isFinite(p.dose) ? p.dose : 0),
        0
      );

    const unit = first.unit ?? "";
    const totalText = formatMedNumber(totalDose);
    return unit ? `${totalText} ${unit}` : totalText;
  }

  if (row.infusion.length > 0) {
    const first = row.infusion[0];
    const rate = Number(first.rate);
    const unit = first.unit ?? "";
    const rateText = formatMedNumber(rate);
    return unit ? `${rateText} ${unit}` : rateText;
  }

  return "";
}

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero) return String(offsetMin);

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return String(offsetMin);

  const roundedBase = new Date(base);
  const roundedMinutes = Math.floor(roundedBase.getMinutes() / 15) * 15;
  roundedBase.setMinutes(roundedMinutes, 0, 0);

  const dt = new Date(roundedBase.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function MedicationTooltip({
  active,
  payload,
  timeZero,
}: {
  active?: boolean;
  payload?: any[];
  timeZero?: string | null;
}) {
  if (!active || !payload?.length) return null;

  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="rounded border bg-white px-3 py-2 text-xs shadow">
      <div className="font-semibold">{p.medName}</div>
      <div>Time: {formatClockTime(Number(p.x), timeZero)}</div>
      <div>
        Dose: {p.label}
        {p.unit ? ` ${p.unit}` : ""}
      </div>
    </div>
  );
}

function formatMedicationTitle(
  name: string,
  startMin: number,
  endMin: number | null,
  amount: number | null | undefined,
  unit: string | null | undefined,
  timeZero?: string | null
) {
  const amountText =
    amount == null || !Number.isFinite(Number(amount))
      ? "-"
      : formatMedNumber(Number(amount));

  const unitText = unit ? ` ${unit}` : "";

  const timeText =
    endMin == null
      ? formatClockTime(startMin, timeZero)
      : `${formatClockTime(startMin, timeZero)} - ${formatClockTime(
          endMin,
          timeZero
        )}`;

  return `${name}\nTime: ${timeText}\nVolume/Dose: ${amountText}${unitText}`;
}

function makeMedicationClickInfo(
  name: string,
  startMin: number,
  endMin: number | null,
  amount: number | null | undefined,
  unit: string | null | undefined,
  x: number,
  y: number,
  timeZero?: string | null
): MedicationClickInfo {
  const amountText =
    amount == null || !Number.isFinite(Number(amount))
      ? "-"
      : `${formatMedNumber(Number(amount))}${unit ? ` ${unit}` : ""}`;

  const timeText =
    endMin == null
      ? formatClockTime(startMin, timeZero)
      : `${formatClockTime(startMin, timeZero)} - ${formatClockTime(
          endMin,
          timeZero
        )}`;

  return {
    name,
    timeText,
    amountText,
    x,
    y,
  };
}

function LegendSwatch({
  color,
  stripe,
}: {
  color: string;
  stripe?: "red" | null;
}) {
  const background =
    stripe === "red"
      ? `repeating-linear-gradient(
          -45deg,
          #ffffff 0px,
          #ffffff 4px,
          #f54029 4px,
          #f54029 8px
        )`
      : color;

  return (
    <span
      className="inline-block h-4 w-4 border"
      style={{
        background,
        borderColor: stripe === "red" ? "#d1d5db" : color,
      }}
    />
  );
}

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

function getInfusionLabelRects(rows: MedRow[], end: number, plotWidth: number) {
  const rectsByRow = new Map<
    number,
    Array<{ left: number; right: number; top: number; bottom: number }>
  >();

  for (const row of rows) {
    const rowRects: Array<{
      left: number;
      right: number;
      top: number;
      bottom: number;
    }> = [];

    for (const seg of row.infusion) {
      const x1 = minuteToX(seg.start, end, plotWidth);
      const x2 = minuteToX(Math.max(seg.end, seg.start + 0.1), end, plotWidth);

      const yTop = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.28;
      const yBottom = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.72;
      const centerY = (yTop + yBottom) / 2;

      const label =
        seg.rate !== undefined && seg.rate !== null
          ? `${formatMedNumber(seg.rate)}`
          : "";

      if (!label) continue;

      const headWidth = Math.max(34, label.length * 7 + 22);
      const labelWidth = Math.max(18, label.length * 6 + 14);

      const labelLeft = x1 + 10;
      const labelTop = centerY - 6;

      rowRects.push({
        left: labelLeft,
        right: labelLeft + labelWidth,
        top: labelTop,
        bottom: labelTop + 12,
      });

      rowRects.push({
        left: x1,
        right: x1 + headWidth,
        top: yTop,
        bottom: yBottom,
      });

      rowRects.push({
        left: x1 + headWidth - 2,
        right: x2,
        top: centerY - 4,
        bottom: centerY + 4,
      });
    }

    rectsByRow.set(row.rowIndex, rowRects);
  }

  return rectsByRow;
}

function StripeDefs() {
  return (
    <defs>
      <pattern
        id="med-stripe-red"
        patternUnits="userSpaceOnUse"
        width="6"
        height="6"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" fill="#ffffff" />
        <rect width="3" height="6" fill="#f54029" />
      </pattern>
    </defs>
  );
}

function normalizeManagementRowName(name: string | null | undefined) {
  return String(name ?? "").trim().toLowerCase();
}

function isMatchingMedicationRow(
  rowName: string,
  managementEvent?: ManagementEvent | null
) {
  if (!managementEvent) return false;
  if (String(managementEvent.chart_type ?? "").toLowerCase() !== "medication") {
    return false;
  }

  const target = normalizeManagementRowName(managementEvent.row_name);
  const current = normalizeManagementRowName(rowName);

  if (!target || !current) return false;

  return current === target || current.includes(target) || target.includes(current);
}

function BolusOverlaySvg({
  end,
  rows,
  height,
  svgWidth,
  plotWidth,
  managementEvent,
  timeZero,
  onMedicationClick,
}: {
  end: number;
  rows: MedRow[];
  height: number;
  svgWidth: number;
  plotWidth: number;
  managementEvent?: ManagementEvent | null;
  timeZero?: string | null;
  onMedicationClick?: (info: MedicationClickInfo) => void;
}) {
  const infusionRectsByRow = getInfusionLabelRects(rows, end, plotWidth);

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
    >
      <StripeDefs />

      {rows.flatMap((row) =>
        row.bolus.map((p, idx) => {
          const cx = minuteToX(p.time, end, plotWidth);
          const cy = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.5;

          const medColor = inferColor(row.name);
          const stripe = inferStripe(row.name);
          const stripeFill =
            stripe === "red" ? "url(#med-stripe-red)" : medColor;

          const baseFill = getEpicBaseFill();
          const baseStroke = getEpicBaseStroke();
          const text = `${formatMedNumber(Number(p.dose))}`;

          const boxWidth = Math.max(28, Math.min(88, text.length * 6 + 18));
          const boxHeight = 16;
          const radius = boxHeight / 2;

          const finalLeft = cx + 4;
          const finalTop = cy - boxHeight / 2;

          const defaultRect = {
            left: finalLeft,
            right: finalLeft + boxWidth,
            top: finalTop,
            bottom: finalTop + boxHeight,
          };

          const rowInfusionRects = infusionRectsByRow.get(row.rowIndex) ?? [];
          const hasOverlap = rowInfusionRects.some((r) =>
            rectsOverlap(defaultRect, r)
          );

          const shiftedTop = cy + 6;
          const actualTop = hasOverlap ? shiftedTop : finalTop;
          const textY = actualTop + boxHeight / 2 + 3.5;

          const bodyLeft = finalLeft;
          const bodyRight = finalLeft + boxWidth;

          const shouldHighlight =
            isMatchingMedicationRow(row.name, managementEvent) &&
            managementEvent?.highlight_mode === "point" &&
            Number.isFinite(managementEvent?.time_min) &&
            Math.abs(Number(p.time) - Number(managementEvent.time_min)) <= 1;

          const pathD = [
            `M ${bodyLeft} ${actualTop}`,
            `L ${bodyRight - radius} ${actualTop}`,
            `Q ${bodyRight} ${actualTop} ${bodyRight} ${actualTop + radius}`,
            `Q ${bodyRight} ${actualTop + boxHeight} ${bodyRight - radius} ${
              actualTop + boxHeight
            }`,
            `L ${bodyLeft} ${actualTop + boxHeight}`,
            "Z",
          ].join(" ");

          return (
            <g
              key={`bolus-overlay-${row.name}-${idx}-${p.time}`}
              style={{ cursor: "pointer", pointerEvents: "auto" }}
              onClick={(event) => {
                event.stopPropagation();
                onMedicationClick?.(
                  makeMedicationClickInfo(
                    row.name,
                    p.time,
                    null,
                    p.dose,
                    p.unit,
                    bodyLeft,
                    actualTop + boxHeight + 8,
                    timeZero
                  )
                );
              }}
            >
              <title>
                {formatMedicationTitle(
                  row.name,
                  p.time,
                  null,
                  p.dose,
                  p.unit,
                  timeZero
                )}
              </title>

              {hasOverlap && (
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx}
                  y2={actualTop + boxHeight / 2}
                  stroke={baseStroke}
                  strokeWidth={1}
                  opacity={0.9}
                />
              )}

              <path
                d={pathD}
                fill={baseFill}
                stroke={shouldHighlight ? "#ef4444" : baseStroke}
                strokeWidth={shouldHighlight ? 3 : 1.2}
              />

              <rect
                x={bodyLeft}
                y={actualTop}
                width={6}
                height={boxHeight}
                fill={stripeFill}
                stroke={medColor}
                strokeWidth={0.8}
              />

              <text
                x={bodyLeft + boxWidth / 2 + 1}
                y={textY}
                textAnchor="middle"
                fontSize={10}
                fill="#1f2937"
              >
                {text}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}

function InfusionOverlaySvg({
  end,
  rows,
  height,
  svgWidth,
  plotWidth,
  managementEvent,
  timeZero,
  onMedicationClick,
}: {
  end: number;
  rows: MedRow[];
  height: number;
  svgWidth: number;
  plotWidth: number;
  managementEvent?: ManagementEvent | null;
  timeZero?: string | null;
  onMedicationClick?: (info: MedicationClickInfo) => void;
}) {
  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
    >
      <StripeDefs />

      {rows.flatMap((row) =>
        row.infusion.map((seg, idx) => {
          const x1 = minuteToX(seg.start, end, plotWidth);
          const x2 = minuteToX(
            Math.max(seg.end, seg.start + 0.1),
            end,
            plotWidth
          );

          const yTop = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.28;
          const yBottom = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.72;
          const centerY = (yTop + yBottom) / 2;

          const medColor = inferColor(row.name);
          const stripe = inferStripe(row.name);
          const stripeFill =
            stripe === "red" ? "url(#med-stripe-red)" : medColor;

          const baseFill = getEpicBaseFill();
          const baseStroke = getEpicBaseStroke();
          const textColor = "#2f4a35";

          const label =
            seg.rate !== undefined && seg.rate !== null
              ? `${formatMedNumber(seg.rate)}`
              : "";

          const headHeight = yBottom - yTop;
          const headWidth = Math.max(34, label.length * 7 + 22);
          const tipWidth = 12;

          const headX = x1;
          const bodyRectW = headWidth - tipWidth;

          const lineStartX = x1 + headWidth - 2;
          const lineEndX = x2;
          const canDrawLine = lineEndX > lineStartX + 2;
          const endCapWidth = 7;
          const endCapHeight = headHeight;

          const shouldHighlight =
            isMatchingMedicationRow(row.name, managementEvent) &&
            managementEvent?.highlight_mode === "interval" &&
            Number.isFinite(managementEvent?.time_min) &&
            Number.isFinite(managementEvent?.end_time_min) &&
            Number(seg.start) <= Number(managementEvent.end_time_min) &&
            Number(seg.end) >= Number(managementEvent.time_min);

          const headPath = [
            `M ${headX} ${yTop}`,
            `L ${headX + bodyRectW} ${yTop}`,
            `L ${headX + headWidth} ${centerY}`,
            `L ${headX + bodyRectW} ${yBottom}`,
            `L ${headX} ${yBottom}`,
            "Z",
          ].join(" ");

          return (
            <g
              key={`inf-overlay-${row.name}-${idx}-${seg.start}-${seg.end}`}
              style={{ cursor: "pointer", pointerEvents: "auto" }}
              onClick={(event) => {
                event.stopPropagation();
                onMedicationClick?.(
                  makeMedicationClickInfo(
                    row.name,
                    seg.start,
                    seg.end,
                    seg.rate,
                    seg.unit,
                    headX,
                    yBottom + 8,
                    timeZero
                  )
                );
              }}
            >
              <title>
                {formatMedicationTitle(
                  row.name,
                  seg.start,
                  seg.end,
                  seg.rate,
                  seg.unit,
                  timeZero
                )}
              </title>

              {canDrawLine && (
                <line
                  x1={lineStartX}
                  y1={centerY}
                  x2={Math.max(lineStartX, lineEndX - endCapWidth)}
                  y2={centerY}
                  stroke={baseStroke}
                  strokeWidth={8}
                  opacity={0.95}
                  strokeLinecap="butt"
                />
              )}

              {canDrawLine && (
                <rect
                  x={Math.max(lineStartX, lineEndX - endCapWidth)}
                  y={centerY - endCapHeight / 2}
                  width={endCapWidth}
                  height={endCapHeight}
                  rx={2}
                  fill={baseFill}
                  stroke={baseStroke}
                  strokeWidth={1.1}
                />
              )}

              <path
                d={headPath}
                fill={baseFill}
                stroke={baseStroke}
                strokeWidth={1.1}
              />

              <rect
                x={headX}
                y={yTop}
                width={6}
                height={headHeight}
                fill={stripeFill}
                stroke={medColor}
                strokeWidth={0.8}
              />

              {label && (
                <>
                  {shouldHighlight && (
                    <ellipse
                      cx={headX + bodyRectW / 2 + 1}
                      cy={centerY}
                      rx={Math.max(14, bodyRectW / 2 - 2)}
                      ry={9}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth={2.5}
                    />
                  )}

                  <text
                    x={headX + bodyRectW / 2 + 1}
                    y={centerY + 3.5}
                    textAnchor="middle"
                    fontSize={10}
                    fill={textColor}
                    fontWeight={500}
                  >
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

function FixedAxisSpacer({ height }: { height: number }) {
  return (
    <div
      className="border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    />
  );
}

function MedicationGridSvg({
  end,
  majorTicks,
  minorTicks,
  rows,
  height,
  highlightWindow,
  plotWidth,
}: {
  end: number;
  majorTicks: number[];
  minorTicks: number[];
  rows: MedRow[];
  height: number;
  highlightWindow?: HighlightWindow | null;
  plotWidth: number;
}) {
  if (!Number.isFinite(end) || end <= 0) return null;

  return (
    <svg
      width={plotWidth}
      height={height}
      viewBox={`0 0 ${plotWidth} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
    >
      {highlightWindow && (
        <rect
          x={minuteToX(highlightWindow.startMin, end, plotWidth)}
          y={0}
          width={Math.max(
            2,
            minuteToX(highlightWindow.endMin, end, plotWidth) -
              minuteToX(highlightWindow.startMin, end, plotWidth)
          )}
          height={height}
          fill="lightblue"
          fillOpacity={0.75}
          stroke="none"
        />
      )}

      {minorTicks.map((tick) => {
        const x = minuteToX(tick, end, plotWidth);

        return (
          <line
            key={`grid-x-minor-${tick}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="#d7dbe2"
            strokeWidth={0.9}
          />
        );
      })}

      {majorTicks.map((tick) => {
        const x = minuteToX(tick, end, plotWidth);

        return (
          <line
            key={`grid-x-major-${tick}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="#9aa3b2"
            strokeWidth={1.4}
          />
        );
      })}

      {Array.from({ length: rows.length + 1 }, (_, i) => i).map((i) => {
        const y = i * ROW_HEIGHT;

        return (
          <line
            key={`grid-y-${i}`}
            x1={0}
            y1={y}
            x2={plotWidth}
            y2={y}
            stroke="#8f8f8f"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

export default function MedicationChart({
  title = "Medication Events",
  medications,
  height = 420,
  xEnd,
  xTicks,
  showXAxis = true,
  timeZero,
  embedded = false,
  highlightWindow = null,
  managementEvent = null,
  timeResolution = 15,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: MedicationChartProps) {
  const rows = useMemo(() => buildRows(medications, xEnd), [medications, xEnd]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = useRef(false);

  const [sliderValue, setSliderValue] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);
  const showHorizontalSlider = maxScrollLeft > 1;
  
  const [selectedMedicationInfo, setSelectedMedicationInfo] =
    useState<MedicationClickInfo | null>(null);

  const majorStep = useMemo(
    () => getChartMajorStep(timeResolution),
    [timeResolution]
  );

  const minorStep = useMemo(
    () => getChartMinorStep(timeResolution),
    [timeResolution]
  );

  const visibleRows = useMemo(
    () => rows.filter((row) => !hiddenNames.includes(row.name)),
    [rows, hiddenNames]
  );

  const bolusData = useMemo(
    () => buildBolusScatter(rows, hiddenNames),
    [rows, hiddenNames]
  );

  const maxTime = useMemo(() => getMaxTime(rows), [rows]);

  const computedEnd = Math.max(
    majorStep,
    Math.ceil(maxTime / majorStep) * majorStep
  );

  const end = xEnd ?? computedEnd;

  const majorTicks = useMemo(() => {
    if (timeResolution === 15 && xTicks && xTicks.length > 0) return xTicks;
    return buildChartTicks(end, majorStep);
  }, [timeResolution, xTicks, end, majorStep]);

  const minorTicks = useMemo(() => {
    return buildChartTicks(end, minorStep);
  }, [end, minorStep]);

  const fullContentHeight =
    rows.length * ROW_HEIGHT + PLOT_TOP_PAD + PLOT_BOTTOM_PAD;

  const { contentWidth, plotWidth } = useMemo(
    () => getSharedChartGeometry(end, timeResolution),
    [end, timeResolution]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (sharedScrollLeft == null) return;

    const next = Math.max(0, Math.min(maxScrollLeft, sharedScrollLeft));

    if (Math.abs(el.scrollLeft - next) > 1) {
      isSyncingFromSliderRef.current = true;
      el.scrollLeft = next;

      requestAnimationFrame(() => {
        isSyncingFromSliderRef.current = false;
      });
    }

    setSliderValue(next);
  }, [sharedScrollLeft, maxScrollLeft]);

  useEffect(() => {
    function updateScrollMetrics() {
      const el = scrollRef.current;
      if (!el) return;

      const nextMax = Math.max(0, el.scrollWidth - el.clientWidth);
      setMaxScrollLeft(nextMax);

      const nextScrollLeft = Math.max(
        0,
        Math.min(nextMax, sharedScrollLeft ?? el.scrollLeft)
      );

      if (Math.abs(el.scrollLeft - nextScrollLeft) > 1) {
        isSyncingFromSliderRef.current = true;
        el.scrollLeft = nextScrollLeft;

        requestAnimationFrame(() => {
          isSyncingFromSliderRef.current = false;
        });
      }

      setSliderValue(nextScrollLeft);
      setSelectedMedicationInfo(null);
    }

    updateScrollMetrics();

    window.addEventListener("resize", updateScrollMetrics);
    return () => {
      window.removeEventListener("resize", updateScrollMetrics);
    };
  }, [
    contentWidth,
    height,
    hiddenNames.length,
    rows.length,
    sharedScrollLeft,
  ]);

  if (!rows.length) {
    return (
      <div
        className={
          embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"
        }
      >
        {!embedded && title ? (
          <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        ) : null}
        <div className="text-sm text-gray-500">No medication data available.</div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"
      }
    >
      <style jsx>{`
        .med-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .med-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .med-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .med-slider:focus {
          outline: none;
        }

        .med-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .med-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          margin-top: -5px;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .med-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .med-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .med-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .med-slider:hover::-moz-range-thumb {
          background: #475569;
        }
      `}</style>

      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0,1fr)`,
        }}
      >
        <div className="overflow-hidden" style={{ height }}>
          <div className="border-r pr-0" style={{ height: fullContentHeight }}>
            <div>
              {rows.map((row) => {
                const isHidden = hiddenNames.includes(row.name);
                const color = inferColor(row.name);
                const stripe = inferStripe(row.name);
                const totalLabel = getMedicationTotalLabel(row);

                return (
                  <div
                    key={row.name}
                    className="relative grid items-center gap-1.5 px-2 text-sm"
                    style={{
                      height: ROW_HEIGHT,
                      boxSizing: "border-box",
                      gridTemplateColumns: "minmax(0,1fr) 68px 20px",
                      backgroundColor: "#efefef",
                      borderBottom: "1px solid #a3a3a3",
                      opacity: isHidden ? 0.45 : 1,
                    }}
                  >
                    <div className="min-w-0 truncate text-gray-900">
                      {row.name}
                    </div>

                    <div className="truncate text-right text-gray-700">
                      {totalLabel}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setHiddenNames((prev) =>
                          prev.includes(row.name)
                            ? prev.filter((x) => x !== row.name)
                            : [...prev, row.name]
                        );
                        setSelectedMedicationInfo(null);
                      }}
                      className="shrink-0 cursor-pointer"
                      title={isHidden ? `Show ${row.name}` : `Hide ${row.name}`}
                    >
                      <LegendSwatch color={color} stripe={stripe} />
                    </button>

                    <span
                      className="absolute right-[-1px] bottom-[-1px] block"
                      style={{
                        width: "8px",
                        height: "1px",
                        backgroundColor: "#a3a3a3",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-hidden" style={{ height }}>
          <FixedAxisSpacer height={fullContentHeight} />
        </div>

        <div className="min-w-0">
          <div
            className="overflow-x-hidden overflow-y-hidden"
            style={{ height }}
          >
            <div
              ref={scrollRef}
              className="med-scroll-hidden"
              style={{ overscrollBehaviorX: "none" }}
              onWheel={(e) => {
                const el = e.currentTarget;
                const absX = Math.abs(e.deltaX);
                const absY = Math.abs(e.deltaY);

                if (absX <= absY || absX < 1) return;

                const maxScroll = el.scrollWidth - el.clientWidth;
                const nextLeft = el.scrollLeft + e.deltaX;

                const atLeftEdge = el.scrollLeft <= 0;
                const atRightEdge = el.scrollLeft >= maxScroll - 1;

                const tryingGoPastLeft = atLeftEdge && e.deltaX < 0;
                const tryingGoPastRight = atRightEdge && e.deltaX > 0;

                if (tryingGoPastLeft || tryingGoPastRight) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }

                const clamped = Math.max(0, Math.min(maxScroll, nextLeft));

                e.preventDefault();
                e.stopPropagation();

                el.scrollLeft = clamped;
                setSliderValue(clamped);
                onSharedScrollLeftChange?.(clamped);
                setSelectedMedicationInfo(null);
              }}
              onScroll={(e) => {
                if (isSyncingFromSliderRef.current) return;

                const next = e.currentTarget.scrollLeft;
                setSliderValue(next);
                onSharedScrollLeftChange?.(next);
              }}
            >
             <div
  className="relative"
  style={{
    width: contentWidth,
    height,
  }}
>
  <div
    className="relative"
    style={{
      width: contentWidth,
      height: fullContentHeight,
    }}
  >
    <div className="absolute inset-0 z-0">
                  <MedicationGridSvg
                    end={end}
                    majorTicks={majorTicks}
                    minorTicks={minorTicks}
                    rows={rows}
                    height={fullContentHeight}
                    highlightWindow={highlightWindow}
                    plotWidth={plotWidth}
                  />
                </div>

                <div className="absolute inset-0 z-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{
                        top: 0,
                        right: RECHARTS_RIGHT_MARGIN,
                        left: 0,
                        bottom: 0,
                      }}
                    >
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={[0, end]}
                        ticks={majorTicks}
                        interval={0}
                        allowDecimals={false}
                        tickFormatter={(v) =>
                          formatClockTime(Number(v), timeZero)
                        }
                        tick={showXAxis ? undefined : false}
                        axisLine={showXAxis}
                        tickLine={showXAxis}
                        height={showXAxis ? 30 : 0}
                        label={
                          showXAxis
                            ? {
                                value: "Time",
                                position: "insideBottom",
                                offset: -4,
                              }
                            : undefined
                        }
                      />

                      <YAxis
                        type="number"
                        dataKey="y"
                        domain={[-0.5, rows.length - 0.5]}
                        ticks={rows.map((row) => row.rowIndex)}
                        tick={false}
                        axisLine={false}
                        tickLine={false}
                        width={0}
                        reversed
                      />

                      <ZAxis range={[30, 30]} />
                      <Tooltip content={<MedicationTooltip timeZero={timeZero} />} />

                      {minorTicks.map((tick) => (
                        <ReferenceLine
                          key={`minor-line-${tick}`}
                          x={tick}
                          stroke="transparent"
                        />
                      ))}

                      <Scatter data={bolusData} shape={() => <g />} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <div className="absolute inset-0 z-20 pointer-events-auto">
                  <InfusionOverlaySvg
                    end={end}
                    rows={visibleRows}
                    height={fullContentHeight}
                    svgWidth={contentWidth}
                    plotWidth={plotWidth}
                    managementEvent={managementEvent}
                    timeZero={timeZero}
                    onMedicationClick={setSelectedMedicationInfo}
                  />
                </div>

                <div className="absolute inset-0 z-30 pointer-events-auto">
  <BolusOverlaySvg
    end={end}
    rows={visibleRows}
    height={fullContentHeight}
    svgWidth={contentWidth}
    plotWidth={plotWidth}
    managementEvent={managementEvent}
    timeZero={timeZero}
    onMedicationClick={setSelectedMedicationInfo}
  />
</div>
</div>

{selectedMedicationInfo && (
                  <div
                    className="absolute z-40 min-w-[180px] rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 shadow-lg"
                    style={{
                      left: Math.max(
                        4,
                        Math.min(selectedMedicationInfo.x + 8, plotWidth - 210)
                      ),
                      top: Math.max(
                        4,
                        Math.min(
                          selectedMedicationInfo.y,
                          height - 82
                        )
                      ),
                      pointerEvents: "auto",
                    }}
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="font-semibold">
                        {selectedMedicationInfo.name}
                      </div>
                      <button
                        type="button"
                        className="text-base font-bold leading-none text-gray-500 hover:text-gray-900"
                        aria-label="Close medication details"
                        onClick={() => setSelectedMedicationInfo(null)}
                      >
                        ×
                      </button>
                    </div>
                    <div>Time: {selectedMedicationInfo.timeText}</div>
                    <div>Volume/Dose: {selectedMedicationInfo.amountText}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showHorizontalSlider && (
  <div className="pt-2">
    <input
      type="range"
      min={0}
      max={Math.max(0, Math.round(maxScrollLeft))}
      step={1}
      value={Math.min(
        Math.max(0, Math.round(sliderValue)),
        Math.round(maxScrollLeft)
      )}
      onChange={(e) => {
        const next = Math.max(
          0,
          Math.min(maxScrollLeft, Number(e.target.value))
        );

        setSliderValue(next);

        const el = scrollRef.current;
        if (!el) return;

        isSyncingFromSliderRef.current = true;
        el.scrollLeft = next;
        onSharedScrollLeftChange?.(next);
        setSelectedMedicationInfo(null);

        requestAnimationFrame(() => {
          isSyncingFromSliderRef.current = false;
        });
      }}
      className="med-slider"
      aria-label="Medication chart horizontal scroll"
    />
  </div>
)}
        </div>
      </div>
    </div>
  );
}