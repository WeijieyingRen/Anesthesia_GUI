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
  ReferenceArea,
} from "recharts";

import type {
  MedicationPanelData,
  MedicationBolusPoint,
  MedicationInfusionSegment,
} from "@/lib/types";

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
  marker: MarkerType;
  color: string;
};

const LEGEND_COL_WIDTH = 220;
const AXIS_COL_WIDTH = 42;
const PLOT_RIGHT = 20;

/** 跟 VitalChart 保持一致 */
const PX_PER_15_MIN = 64;
const PX_PER_MIN = PX_PER_15_MIN / 15;

const ROW_HEIGHT = 25;

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
    [
      "propofol",
      "propofol inject",
      "etomidate",
      "ketamine",
      "midazolam",
      "dexmedetomidine",
    ].some((x) => n.includes(x))
  ) {
    return "#f2df4a";
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
    return "#8fc7e8";
  }

  if (
    [
      "rocuronium",
      "vecuronium",
      "cisatracurium",
      "succinylcholine",
    ].some((x) => n.includes(x))
  ) {
    return "#e85a47";
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
      "nitroglycerin",
      "nitroprusside",
      "esmolol",
      "labetalol",
      "hydralazine",
      "nicardipine",
      "clevidipine",
    ].some((x) => n.includes(x))
  ) {
    return "#d7b7db";
  }

  if (
    [
      "ondansetron",
      "granisetron",
      "metoclopramide",
      "promethazine",
      "prochlorperazine",
      "dexamethasone",
      "aprepitant",
      "fosaprepitant",
    ].some((x) => n.includes(x))
  ) {
    return "#e6c36a";
  }

  if (
    [
      "glycopyrrolate",
      "neostigmine",
      "naloxone",
      "flumazenil",
    ].some((x) => n.includes(x))
  ) {
    return "#9fd36a";
  }

  if (
    [
      "cefazolin",
      "tranexamic acid",
      "aminocaproic acid",
      "calcium chloride",
      "calcium gluconate",
      "sodium bicarbonate",
      "oxytocin",
      "amiodarone",
      "albuterol",
      "ipratropium",
      "ipratropium/albuterol",
      "nitric oxide",
    ].some((x) => n.includes(x))
  ) {
    return "#d9d9d9";
  }

  return "#cfcfcf";
}

function inferStripe(name: string) {
  const n = normalizeName(name);
  if (n.includes("sugammadex")) return "red";
  return null;
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
      xEnd == null
        ? rawBolus
        : rawBolus.filter(
            (p) => Number.isFinite(p.time) && Number(p.time) <= xEnd
          );

    const infusion =
      xEnd == null
        ? rawInfusion
        : rawInfusion
            .filter(
              (seg) =>
                Number.isFinite(seg.start) &&
                Number.isFinite(seg.end) &&
                Number(seg.start) <= xEnd
            )
            .map((seg) => ({
              ...seg,
              end: Math.min(Number(seg.end), xEnd),
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

function buildBolusScatter(rows: MedRow[], hiddenNames: string[]): ScatterPoint[] {
  return rows.flatMap((row) => {
    if (hiddenNames.includes(row.name)) return [];

    return row.bolus.map((p) => ({
      x: p.time,
      y: row.rowIndex,
      medName: row.name,
      label: p.label ?? `${p.dose} ${p.unit ?? ""}`.trim(),
      marker: "bolus-box" as const,
      color: inferColor(row.name),
    }));
  });
}

function getMaxTime(rows: MedRow[]) {
  const times: number[] = [];

  rows.forEach((row) => {
    row.bolus.forEach((p) => {
      if (Number.isFinite(p.time)) times.push(Number(p.time));
    });

    row.infusion.forEach((seg) => {
      if (Number.isFinite(seg.start)) times.push(Number(seg.start));
      if (Number.isFinite(seg.end)) times.push(Number(seg.end));
    });
  });

  if (!times.length) return 15;
  return Math.max(...times);
}

function formatMedNumber(v: number) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

function getMedicationTotalLabel(row: MedRow) {
  if (row.bolus.length > 0) {
    const first = row.bolus[0];
    const totalDose =
      first.totalDose ??
      row.bolus.reduce((sum, p) => sum + (Number.isFinite(p.dose) ? p.dose : 0), 0);

    const unit = first.unit ?? "";
    const totalText = formatMedNumber(Number(totalDose));
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

function MedicationTooltip({
  active,
  payload,
  labelFormatter,
}: {
  active?: boolean;
  payload?: any[];
  labelFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;

  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="rounded border bg-white px-3 py-2 text-xs shadow">
      <div className="font-semibold">{p.medName}</div>
      <div>Time: {labelFormatter ? labelFormatter(p.x) : `${p.x} min`}</div>
      <div>{p.label}</div>
    </div>
  );
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
          #e85a47 4px,
          #e85a47 8px
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

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero) return String(offsetMin);

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return String(offsetMin);

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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

function getInfusionLabelRects(
  rows: MedRow[],
  end: number
) {
  const rectsByRow = new Map<
    number,
    Array<{ left: number; right: number; top: number; bottom: number }>
  >();

  for (const row of rows) {
    const rowRects: Array<{ left: number; right: number; top: number; bottom: number }> = [];

    for (const seg of row.infusion) {
      const x1 = (Number(seg.start) / end) * 100;
      const x2 = (Math.max(Number(seg.end), Number(seg.start) + 0.1) / end) * 100;

      const yTop = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.28;
      const yBottom = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.72;

      const widthPercent = x2 - x1;
      const label =
        seg.rate !== undefined && seg.rate !== null
          ? `${formatMedNumber(Number(seg.rate))}`
          : "";

      const labelWidth = Math.max(18, label.length * 6 + 10);
      const labelHeight = 12;

      if (widthPercent <= 0 || !label) continue;

      rowRects.push({
        left: x1,
        right: x2,
        top: yTop,
        bottom: yBottom + labelHeight,
      });
    }

    rectsByRow.set(row.rowIndex, rowRects);
  }

  return rectsByRow;
}

function InfusionOverlay({
  rows,
  end,
  contentPlotWidth,
}: {
  rows: MedRow[];
  end: number;
  contentPlotWidth: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{ width: contentPlotWidth }}
    >
      <svg width={contentPlotWidth} height="100%" preserveAspectRatio="none">
        {rows.flatMap((row) =>
          row.infusion.map((seg, idx) => {
            const x1 = (Number(seg.start) / end) * contentPlotWidth;
            const x2 =
              (Math.max(Number(seg.end), Number(seg.start) + 0.1) / end) *
              contentPlotWidth;

            const yTop = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.28;
            const yBottom = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.72;

            const width = x2 - x1;
            const color = inferColor(row.name);

            const label =
              seg.rate !== undefined && seg.rate !== null
                ? `${formatMedNumber(Number(seg.rate))}`
                : "";

            const labelWidth = Math.max(18, label.length * 6 + 10);
            const labelHeight = 12;

            const preferredCenterX = x1 + width * 0.72;
            const minCenterX = x1 + labelWidth / 2 + 2;
            const maxCenterX = x2 - labelWidth / 2 - 2;
            const labelCenterX = Math.max(minCenterX, Math.min(preferredCenterX, maxCenterX));

            const labelY = yBottom - 1;
            const showLabel = width >= labelWidth + 6 && !!label;

            return (
              <g key={`inf-overlay-${row.name}-${idx}-${seg.start}-${seg.end}`}>
                <line
                  x1={x1}
                  y1={yTop}
                  x2={x1}
                  y2={yBottom}
                  stroke="#ffffff"
                  strokeWidth={1.2}
                  opacity={0.98}
                />

                <line
                  x1={x2}
                  y1={yTop}
                  x2={x2}
                  y2={yBottom}
                  stroke="#ffffff"
                  strokeWidth={1.2}
                  opacity={0.98}
                />

                {showLabel && (
                  <>
                    <rect
                      x={labelCenterX - labelWidth / 2}
                      y={labelY - 9}
                      width={labelWidth}
                      height={labelHeight}
                      rx={2}
                      ry={2}
                      fill="white"
                      fillOpacity={0.92}
                      stroke={color}
                      strokeWidth={0.8}
                    />
                    <text
                      x={labelCenterX}
                      y={labelY}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#374151"
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
    </div>
  );
}

function BolusOverlay({
  rows,
  end,
  contentPlotWidth,
}: {
  rows: MedRow[];
  end: number;
  contentPlotWidth: number;
}) {
  const infusionRectsByRow = getInfusionLabelRects(rows, end);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      style={{ width: contentPlotWidth }}
    >
      <svg width={contentPlotWidth} height="100%" preserveAspectRatio="none">
        {rows.flatMap((row) =>
          row.bolus.map((p, idx) => {
            const cx = (Number(p.time) / end) * contentPlotWidth;
            const cy = row.rowIndex * ROW_HEIGHT + ROW_HEIGHT * 0.5;

            const color = inferColor(row.name);
            const text = String(p.label ?? `${p.dose} ${p.unit ?? ""}`.trim());

            const boxWidth = Math.max(28, Math.min(88, text.length * 6 + 14));
            const boxHeight = 16;

            const arrowTipX = cx;
            const arrowBaseX = cx + 6;

            const defaultLeft = arrowBaseX;
            const defaultTop = cy - boxHeight / 2;

            const defaultRect = {
              left: defaultLeft,
              right: defaultLeft + boxWidth,
              top: defaultTop,
              bottom: defaultTop + boxHeight,
            };

            const rowInfusionRects = infusionRectsByRow.get(row.rowIndex) ?? [];
            const hasOverlap = rowInfusionRects.some((r) => rectsOverlap(defaultRect, r));

            const shiftedTop = cy + 6;
            const finalLeft = defaultLeft;
            const finalTop = hasOverlap ? shiftedTop : defaultTop;
            const textY = finalTop + boxHeight / 2 + 4;

            return (
              <g key={`bolus-overlay-${row.name}-${idx}-${p.time}`}>
                <line
                  x1={arrowTipX}
                  y1={cy - 9}
                  x2={arrowTipX}
                  y2={cy + 9}
                  stroke={color}
                  strokeWidth={1.2}
                  opacity={0.9}
                />

                <polygon
                  points={`${arrowTipX},${cy} ${arrowBaseX},${cy - 5} ${arrowBaseX},${cy + 5}`}
                  fill={color}
                  stroke={color}
                  strokeWidth={1}
                />

                {hasOverlap && (
                  <line
                    x1={arrowBaseX}
                    y1={cy}
                    x2={arrowBaseX}
                    y2={finalTop + boxHeight / 2}
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.9}
                  />
                )}

                <rect
                  x={finalLeft}
                  y={finalTop}
                  width={boxWidth}
                  height={boxHeight}
                  rx={2}
                  ry={2}
                  fill="#dff7f3"
                  stroke={color}
                  strokeWidth={1.5}
                />

                <text
                  x={finalLeft + boxWidth / 2}
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
    </div>
  );
}

function FixedYAxisSpacer({ height }: { height: number }) {
  return (
    <div
      className="border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    />
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
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: MedicationChartProps) {
  const rows = useMemo(() => buildRows(medications, xEnd), [medications, xEnd]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
    }
  }, [sharedScrollLeft]);

  const visibleRows = useMemo(
    () => rows.filter((row) => !hiddenNames.includes(row.name)),
    [rows, hiddenNames]
  );

  const visibleRowsReindexed = useMemo(
    () => visibleRows.map((row, idx) => ({ ...row, rowIndex: idx })),
    [visibleRows]
  );

  const bolusData = useMemo(
    () => buildBolusScatter(visibleRowsReindexed, []),
    [visibleRowsReindexed]
  );

  const maxTime = useMemo(() => getMaxTime(rows), [rows]);
  const end = xEnd ?? Math.max(15, Math.ceil(maxTime / 15) * 15);

  const ticks =
    xTicks ??
    Array.from({ length: Math.floor(end / 15) + 1 }, (_, i) => i * 15);

  const contentHeight = visibleRowsReindexed.length * ROW_HEIGHT;
  const viewHeight = Math.min(height, Math.max(120, contentHeight));

  const contentPlotWidth = useMemo(() => {
    if (end <= 0) return 800;
    return Math.max(800, Math.ceil(end * PX_PER_MIN));
  }, [end]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;

  if (!rows.length) {
    return embedded ? null : (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">No medication data available.</div>
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0, 1fr)`,
        }}
      >
        <div className="border-r pr-0" style={{ height: viewHeight }}>
          <div>
            {rows.map((row) => {
              const isHidden = hiddenNames.includes(row.name);
              const color = inferColor(row.name);
              const stripe = inferStripe(row.name);
              const totalLabel = getMedicationTotalLabel(row);
              const active = visibleRows.some((r) => r.name === row.name);

              return (
                <div
                  key={row.name}
                  className="relative grid items-center gap-1.5 px-2 text-sm"
                  style={{
                    height: ROW_HEIGHT,
                    boxSizing: "border-box",
                    gridTemplateColumns: "minmax(0,1fr) 68px 20px",
                    backgroundColor: active ? "#efefef" : "#f7f7f7",
                    opacity: isHidden ? 0.45 : 1,
                    borderBottom: "1px solid #a3a3a3",
                  }}
                >
                  <div className="min-w-0 truncate text-gray-900">{row.name}</div>

                  <div className="truncate text-right text-gray-700">{totalLabel}</div>

                  <button
                    type="button"
                    onClick={() => {
                      setHiddenNames((prev) =>
                        prev.includes(row.name)
                          ? prev.filter((x) => x !== row.name)
                          : [...prev, row.name]
                      );
                    }}
                    className="shrink-0 cursor-pointer"
                    title={isHidden ? `Show ${row.name}` : `Hide ${row.name}`}
                  >
                    <LegendSwatch color={color} stripe={stripe} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <FixedYAxisSpacer height={viewHeight} />

        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden"
          style={{ height: viewHeight }}
          onScroll={(e) => {
            onSharedScrollLeftChange?.(e.currentTarget.scrollLeft);
          }}
        >
          <div className="relative" style={{ width: contentWidth, height: contentHeight }}>
            <div className="absolute inset-0 z-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{
                    top: 0,
                    right: PLOT_RIGHT,
                    left: 0,
                    bottom: showXAxis ? 24 : 0,
                  }}
                >
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, end]}
                    ticks={ticks}
                    interval={0}
                    allowDecimals={false}
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                    height={0}
                  />

                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[-0.5, Math.max(0, visibleRowsReindexed.length - 0.5)]}
                    ticks={visibleRowsReindexed.map((row) => row.rowIndex)}
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                    reversed
                    width={0}
                  />

                  <ZAxis range={[30, 30]} />

                  {highlightWindow ? (
                    <ReferenceArea
                      x1={highlightWindow.startMin}
                      x2={highlightWindow.endMin}
                      y1={-0.5}
                      y2={Math.max(0, visibleRowsReindexed.length - 0.5)}
                      fill="lightblue"
                      fillOpacity={0.45}
                      strokeOpacity={0}
                    />
                  ) : null}

                  {visibleRowsReindexed.flatMap((row) =>
                    row.infusion.map((seg, idx) => (
                      <ReferenceArea
                        key={`inf-${row.name}-${idx}-${seg.start}-${seg.end}`}
                        x1={Number(seg.start)}
                        x2={Math.max(Number(seg.end), Number(seg.start) + 0.1)}
                        y1={row.rowIndex - 0.17}
                        y2={row.rowIndex + 0.17}
                        fill={inferColor(row.name)}
                        fillOpacity={1}
                        stroke={inferColor(row.name)}
                        strokeWidth={1}
                      />
                    ))
                  )}

                  <Tooltip
                    content={
                      <MedicationTooltip
                        labelFormatter={(v) => formatClockTime(v, timeZero)}
                      />
                    }
                  />

                  <Scatter
                    data={bolusData}
                    shape={(_props: any) => <g />}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div className="absolute inset-0 z-10 pointer-events-none">
              <svg width={contentPlotWidth} height={contentHeight} preserveAspectRatio="none">
                {ticks.map((tick) => {
                  const x = tick * PX_PER_MIN;
                  return (
                    <line
                      key={`grid-x-${tick}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={contentHeight}
                      stroke="#d1d5db"
                      strokeWidth={1}
                    />
                  );
                })}

                {Array.from({ length: visibleRowsReindexed.length + 1 }, (_, i) => i).map((i) => {
                  const y = i * ROW_HEIGHT;
                  return (
                    <line
                      key={`grid-y-${i}`}
                      x1={0}
                      y1={y}
                      x2={contentPlotWidth}
                      y2={y}
                      stroke="#8f8f8f"
                      strokeWidth={0.8}
                    />
                  );
                })}

                {showXAxis &&
                  ticks.map((tick, idx) => {
                    const x = tick * PX_PER_MIN;
                    const isFirst = idx === 0;
                    const isLast = idx === ticks.length - 1;

                    return (
                      <text
                        key={`tick-label-${tick}`}
                        x={x}
                        y={contentHeight - 6}
                        textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                        fontSize={10}
                        fill="#6b7280"
                      >
                        {formatClockTime(Number(tick), timeZero)}
                      </text>
                    );
                  })}
              </svg>
            </div>

            <InfusionOverlay
              rows={visibleRowsReindexed}
              end={end}
              contentPlotWidth={contentPlotWidth}
            />

            <BolusOverlay
              rows={visibleRowsReindexed}
              end={end}
              contentPlotWidth={contentPlotWidth}
            />

            <div className="absolute inset-0 z-40">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{
                    top: 0,
                    right: PLOT_RIGHT,
                    left: 0,
                    bottom: showXAxis ? 24 : 0,
                  }}
                >
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, end]}
                    ticks={ticks}
                    interval={0}
                    allowDecimals={false}
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                    height={0}
                  />

                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[-0.5, Math.max(0, visibleRowsReindexed.length - 0.5)]}
                    ticks={visibleRowsReindexed.map((row) => row.rowIndex)}
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                    reversed
                    width={0}
                  />

                  <ZAxis range={[30, 30]} />

                  <Tooltip
                    content={
                      <MedicationTooltip
                        labelFormatter={(v) => formatClockTime(v, timeZero)}
                      />
                    }
                  />

                  <Scatter
                    data={bolusData}
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null || !payload) return <g />;

                      return (
                        <rect
                          x={cx - 10}
                          y={cy - 10}
                          width={20}
                          height={20}
                          fill="transparent"
                          stroke="transparent"
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {showXAxis && (
        <div className="mt-1 text-xs text-gray-500">
          Horizontal scroll enabled for long cases.
        </div>
      )}
    </div>
  );
}