"use client";

import { useMemo, useState } from "react";
import type {
  FluidPanelData,
  FluidBolusPoint,
  FluidInfusionSegment,
  FluidOutputPoint,
} from "@/lib/types";

const RECHARTS_LEFT_MARGIN = 8;
const RECHARTS_RIGHT_MARGIN = 20;
const RECHARTS_YAXIS_WIDTH = 35;

const PLOT_LEFT = RECHARTS_LEFT_MARGIN + RECHARTS_YAXIS_WIDTH;
const PLOT_RIGHT = RECHARTS_RIGHT_MARGIN;
const SVG_WIDTH = 1000;
const PLOT_WIDTH = SVG_WIDTH - PLOT_LEFT - PLOT_RIGHT;

type HighlightWindow = {
  startMin: number;
  endMin: number;
};

type FluidChartProps = {
  title?: string;
  fluids: FluidPanelData | null;
  height?: number;
  xEnd?: number;
  xTicks?: number[];
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;
  highlightWindow?: HighlightWindow | null;
};

type FluidRow = {
  name: string;
  bolus: FluidBolusPoint[];
  infusion: FluidInfusionSegment[];
  output: FluidOutputPoint[];
  rowIndex: number;
};

const FLUID_DISPLAY_ORDER = [
  "NS",
  "NS + KCl",
  "LR",
  "Normosol",
  "Albumin",
  "D5W",
  "D10W",
  "D5-1/2NS",
  "D5-1/2NS + KCl",
  "D5-NS",
  "D5-NS + KCl",
  "D10-NS",
  "D5-LR",
  "Hypertonic saline",
  "Hetastarch",
  "Estimated blood loss",
  "Urine output",
  "Emesis",
];

const ROW_HEIGHT = 20;
const TOP_PAD = 0;
const BOTTOM_PAD = 0;

function normalizeName(name: string) {
  return String(name ?? "").trim().toLowerCase();
}

function sortFluidNames(names: string[]) {
  const rank = new Map(
    FLUID_DISPLAY_ORDER.map((name, i) => [normalizeName(name), i])
  );

  return [...names].sort((a, b) => {
    const na = normalizeName(a);
    const nb = normalizeName(b);

    const va = rank.has(na) ? rank.get(na)! : Number.MAX_SAFE_INTEGER;
    const vb = rank.has(nb) ? rank.get(nb)! : Number.MAX_SAFE_INTEGER;

    if (va !== vb) return va - vb;
    return na.localeCompare(nb);
  });
}

function inferFluidColor(name: string) {
  const n = normalizeName(name);

  if (n.includes("albumin")) return "#f4b183";
  if (n === "lr") return "#66bb6a";
  if (n.includes("normosol")) return "#8fc7e8";
  if (n.includes("ns + kcl")) return "#bcdffb";
  if (n === "ns") return "#d9d9d9";
  if (n.includes("d5") || n.includes("d10")) return "#f2df4a";
  if (n.includes("hypertonic")) return "#e85a47";
  if (n.includes("hetastarch")) return "#d7b7db";

  if (n.includes("estimated blood loss")) return "#b91c1c";
  if (n.includes("urine output")) return "#1d4ed8";
  if (n.includes("emesis")) return "#374151";

  return "#cfcfcf";
}

function buildRows(fluids: FluidPanelData | null, xEnd?: number): FluidRow[] {
  if (!fluids) return [];

  const allNames = new Set<string>([
    ...Object.keys(fluids.bolus ?? {}),
    ...Object.keys(fluids.infusion ?? {}),
    ...Object.keys(fluids.output ?? {}),
  ]);

  const orderedNames = sortFluidNames([...allNames]);

  const rows = orderedNames.map((name) => {
    const rawBolus = fluids.bolus[name] ?? [];
    const rawInfusion = fluids.infusion[name] ?? [];
    const rawOutput = fluids.output[name] ?? [];

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

    const output =
      xEnd === undefined
        ? rawOutput
        : rawOutput.filter((p) => Number.isFinite(p.time) && p.time <= xEnd);

    return {
      name,
      bolus,
      infusion,
      output,
    };
  });

  const nonEmptyRows = rows.filter(
    (row) =>
      row.bolus.length > 0 ||
      row.infusion.length > 0 ||
      row.output.length > 0
  );

  return nonEmptyRows.map((row, idx) => ({
    ...row,
    rowIndex: idx,
  }));
}

function getMaxTime(rows: FluidRow[]) {
  const times: number[] = [];

  rows.forEach((row) => {
    row.bolus.forEach((p) => {
      if (Number.isFinite(p.time)) times.push(p.time);
    });

    row.infusion.forEach((seg) => {
      if (Number.isFinite(seg.start)) times.push(seg.start);
      if (Number.isFinite(seg.end)) times.push(seg.end);
    });

    row.output.forEach((p) => {
      if (Number.isFinite(p.time)) times.push(p.time);
    });
  });

  if (!times.length) return 15;
  return Math.max(...times);
}

function formatFluidNumber(v: number) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

function getFluidTotalLabel(row: FluidRow) {
  if (row.bolus.length > 0) {
    const unit = row.bolus[0]?.unit ?? "";
    const totalDose = row.bolus.reduce(
      (sum, p) => sum + (Number.isFinite(p.dose) ? p.dose : 0),
      0
    );
    const totalText = formatFluidNumber(totalDose);
    return unit ? `${totalText} ${unit}` : totalText;
  }

  if (row.infusion.length > 0) {
    const first = row.infusion[0];
    const rate = Number(first.rate);
    const unit = first.unit ?? "";
    const rateText = formatFluidNumber(rate);
    return unit ? `${rateText} ${unit}` : rateText;
  }

  if (row.output.length > 0) {
    const unit = row.output[0]?.unit ?? "";
    const totalDose = row.output.reduce(
      (sum, p) => sum + (Number.isFinite(p.dose) ? p.dose : 0),
      0
    );
    const totalText = formatFluidNumber(totalDose);
    return unit ? `${totalText} ${unit}` : totalText;
  }

  return "";
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

function estimateTextWidth(text: string, fontSize = 10) {
  return Math.max(10, text.length * (fontSize * 0.62));
}

function buildInfusionRects(row: FluidRow, finalXEnd: number) {
  return row.infusion.map((seg) => {
    const x1 = PLOT_LEFT + (seg.start / finalXEnd) * PLOT_WIDTH;
    const x2 =
      PLOT_LEFT + (Math.max(seg.end, seg.start + 0.1) / finalXEnd) * PLOT_WIDTH;

    return { x1, x2, seg };
  });
}

export default function FluidChart({
  title = "Fluid Events",
  fluids,
  height = 320,
  xEnd,
  xTicks,
  showXAxis = false,
  timeZero,
  embedded = false,
  highlightWindow = null,
}: FluidChartProps) {
  const rows = useMemo(() => buildRows(fluids, xEnd), [fluids, xEnd]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);

  const visibleRows = rows.filter((r) => !hiddenNames.includes(r.name));
  const visibleRowsReindexed = visibleRows.map((row, idx) => ({
    ...row,
    rowIndex: idx,
  }));

  const allMaxTime = getMaxTime(visibleRowsReindexed);
  const computedXEnd = Math.max(15, Math.ceil(allMaxTime / 15) * 15);
  const finalXEnd = xEnd ?? computedXEnd;

  const finalXTicks =
    xTicks ??
    Array.from({ length: Math.floor(finalXEnd / 15) + 1 }, (_, i) => i * 15);

  const contentHeight =
    visibleRowsReindexed.length * ROW_HEIGHT + TOP_PAD + BOTTOM_PAD;
  const viewHeight = Math.min(height, Math.max(120, contentHeight));

  if (!rows.length) {
    return embedded ? null : (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">No fluid data available.</div>
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div
        className="overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
        style={{ height: viewHeight }}
      >
        <div className="grid grid-cols-[220px_1fr] gap-0">
          <div className="border-r pr-0" style={{ height: contentHeight }}>
            <div>
              {visibleRowsReindexed.map((row) => {
                const hidden = hiddenNames.includes(row.name);
                const active = visibleRowsReindexed.some((r) => r.name === row.name);
                const color = inferFluidColor(row.name);
                const totalLabel = getFluidTotalLabel(row);

                return (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-2 px-2 text-sm"
                    style={{
                      height: ROW_HEIGHT,
                      backgroundColor: active ? "#efefef" : "#f7f7f7",
                      opacity: hidden ? 0.45 : 1,
                      borderBottom: "1px solid #d1d5db",
                    }}
                  >
                    <div className="min-w-0 flex-1 truncate text-gray-900">
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
                      }}
                      className="h-4 w-4 shrink-0 border"
                      style={{ backgroundColor: color, borderColor: color }}
                      title={hidden ? `Show ${row.name}` : `Hide ${row.name}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              width: "100%",
              height: contentHeight,
              marginLeft: "-1px",
            }}
          >
            <svg
              width="100%"
              height={contentHeight}
              viewBox={`0 0 ${SVG_WIDTH} ${contentHeight}`}
              preserveAspectRatio="none"
            >
              {visibleRowsReindexed.map((row, idx) => {
                const yTop = TOP_PAD + idx * ROW_HEIGHT;
                const yBottom = yTop + ROW_HEIGHT;

                return (
                  <g key={`row-${row.name}`}>
                    <line
                      x1={0}
                      y1={yBottom}
                      x2={PLOT_LEFT}
                      y2={yBottom}
                      stroke="#d1d5db"
                      strokeWidth={1}
                    />

                    <rect
                      x={PLOT_LEFT}
                      y={yTop}
                      width={PLOT_WIDTH}
                      height={ROW_HEIGHT}
                      fill="none"
                      stroke="#d1d5db"
                      strokeWidth={1}
                    />
                  </g>
                );
              })}

              {highlightWindow && (
                <rect
                  x={PLOT_LEFT + (highlightWindow.startMin / finalXEnd) * PLOT_WIDTH}
                  y={TOP_PAD}
                  width={Math.max(
                    2,
                    ((highlightWindow.endMin - highlightWindow.startMin) / finalXEnd) * PLOT_WIDTH
                  )}
                  height={visibleRowsReindexed.length * ROW_HEIGHT}
                  fill="lightblue"
                  fillOpacity={0.75}
                  stroke="none"
                />
              )}

              {finalXTicks.map((tick) => {
                const x = PLOT_LEFT + (tick / finalXEnd) * PLOT_WIDTH;
                return (
                  <g key={`tick-${tick}`}>
                    <line
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={contentHeight}
                      stroke="#d1d5db"
                      strokeWidth={1}
                    />
                    {showXAxis && (
                      <text x={x + 2} y={TOP_PAD - 6} fontSize={10} fill="#6b7280">
                        {formatClockTime(tick, timeZero)}
                      </text>
                    )}
                  </g>
                );
              })}

              {visibleRowsReindexed.map((row) => {
                const rowTop = TOP_PAD + row.rowIndex * ROW_HEIGHT;
                const centerY = rowTop + ROW_HEIGHT / 2;
                const color = inferFluidColor(row.name);

                const infusionRects = buildInfusionRects(row, finalXEnd);

                return (
                  <g key={`data-${row.name}`}>
                    {/* infusion */}
                    {infusionRects.map(({ x1, x2, seg }, idx) => {
                      const yTop = rowTop + ROW_HEIGHT * 0.28;
                      const yBottom = rowTop + ROW_HEIGHT * 0.72;
                      const width = x2 - x1;

                      const label =
                        seg.label && String(seg.label).trim()
                          ? String(seg.label).trim()
                          : `${formatFluidNumber(seg.rate)} ${seg.unit ?? ""}`.trim();

                      const labelWidth = Math.max(18, estimateTextWidth(label, 10) + 10);
                      const preferredCenterX = x1 + width * 0.72;
                      const minCenterX = x1 + labelWidth / 2 + 2;
                      const maxCenterX = x2 - labelWidth / 2 - 2;
                      const labelCenterX = Math.max(
                        minCenterX,
                        Math.min(preferredCenterX, maxCenterX)
                      );
                      const showLabel = width >= labelWidth + 6 && !!label;

                      return (
                        <g key={`inf-${row.name}-${idx}`}>
                          <rect
                            x={x1}
                            y={yTop}
                            width={Math.max(2, x2 - x1)}
                            height={yBottom - yTop}
                            fill={color}
                            stroke={color}
                            strokeWidth={1}
                          />

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
                                y={yBottom - 10}
                                width={labelWidth}
                                height={12}
                                rx={2}
                                ry={2}
                                fill="white"
                                fillOpacity={0.92}
                                stroke={color}
                                strokeWidth={0.8}
                              />
                              <text
                                x={labelCenterX}
                                y={yBottom}
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
                    })}

                    {/* bolus */}
                    {row.bolus.map((p, idx) => {
                      const cx = PLOT_LEFT + (p.time / finalXEnd) * PLOT_WIDTH;
                      const text = String(
                        p.label ?? `${formatFluidNumber(p.dose)} ${p.unit ?? ""}`.trim()
                      );
                      const boxWidth = Math.max(
                        28,
                        Math.min(110, estimateTextWidth(text, 10) + 14)
                      );
                      const boxHeight = 16;
                      const arrowTipX = cx;
                      const arrowBaseX = cx + 6;
                      const left = arrowBaseX;
                      const top = centerY - boxHeight / 2;
                      const textY = top + boxHeight / 2 + 4;

                      return (
                        <g key={`bolus-${row.name}-${idx}`}>
                          <line
                            x1={arrowTipX}
                            y1={centerY - 9}
                            x2={arrowTipX}
                            y2={centerY + 9}
                            stroke={color}
                            strokeWidth={1.2}
                            opacity={0.9}
                          />

                          <polygon
                            points={`${arrowTipX},${centerY} ${arrowBaseX},${centerY - 5} ${arrowBaseX},${centerY + 5}`}
                            fill={color}
                            stroke={color}
                            strokeWidth={1}
                          />

                          <rect
                            x={left}
                            y={top}
                            width={boxWidth}
                            height={boxHeight}
                            rx={2}
                            ry={2}
                            fill="white"
                            stroke={color}
                            strokeWidth={1.5}
                          />

                          <text
                            x={left + boxWidth / 2}
                            y={textY}
                            textAnchor="middle"
                            fontSize={10}
                            fill="#1f2937"
                          >
                            {text}
                          </text>
                        </g>
                      );
                    })}

                    {/* output */}
                    {row.output.map((p, idx) => {
                      const cx = PLOT_LEFT + (p.time / finalXEnd) * PLOT_WIDTH;
                      const outputColor = color;
                      const text = String(
                        p.label ?? `${formatFluidNumber(p.dose)} ${p.unit ?? ""}`.trim()
                      );
                      const boxWidth = Math.max(
                        28,
                        Math.min(110, estimateTextWidth(text, 10) + 14)
                      );
                      const boxHeight = 16;
                      const left = cx + 6;
                      const top = centerY - boxHeight / 2;
                      const textY = top + boxHeight / 2 + 4;

                      return (
                        <g key={`output-${row.name}-${idx}`}>
                          <line
                            x1={cx}
                            y1={centerY - 9}
                            x2={cx}
                            y2={centerY + 9}
                            stroke={outputColor}
                            strokeWidth={1.2}
                            opacity={0.9}
                          />

                          <circle cx={cx} cy={centerY} r={3.5} fill={outputColor} />

                          <rect
                            x={left}
                            y={top}
                            width={boxWidth}
                            height={boxHeight}
                            rx={2}
                            ry={2}
                            fill="white"
                            stroke={outputColor}
                            strokeWidth={1.2}
                          />

                          <text
                            x={left + boxWidth / 2}
                            y={textY}
                            textAnchor="middle"
                            fontSize={10}
                            fill="#111827"
                          >
                            {text}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {showXAxis && (
                <text
                  x={PLOT_LEFT + PLOT_WIDTH / 2}
                  y={contentHeight - 4}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#6b7280"
                >
                  Time
                </text>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}