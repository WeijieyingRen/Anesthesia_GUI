"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FluidPanelData,
  FluidBolusPoint,
  FluidInfusionSegment,
  FluidOutputPoint,
} from "@/lib/types";

const LEGEND_COL_WIDTH = 220;
const AXIS_COL_WIDTH = 42;
const PLOT_RIGHT = 20;

/** 和 VitalChart 保持一致 */
const PX_PER_15_MIN = 64;

type TimeResolution = 15 | 5;

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
  timeResolution?: TimeResolution;
  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;
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

function FixedYAxisSpacer({ height }: { height: number }) {
  return (
    <div
      className="border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    />
  );
}

function getPxPerMinute(timeResolution: TimeResolution) {
  return timeResolution === 5 ? PX_PER_15_MIN / 5 : PX_PER_15_MIN / 15;
}

function getMajorStep(timeResolution: TimeResolution) {
  return timeResolution === 5 ? 5 : 15;
}

function getMinorStep(timeResolution: TimeResolution) {
  return timeResolution === 5 ? 1 : 5;
}

function buildGridTicks(end: number, step: number) {
  if (!Number.isFinite(end) || end <= 0) return [];
  const ticks: number[] = [];
  for (let t = 0; t <= end; t += step) {
    ticks.push(t);
  }
  if (ticks.length === 0 || ticks[ticks.length - 1] !== end) {
    ticks.push(end);
  }
  return ticks;
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
  timeResolution = 15,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: FluidChartProps) {
  const rows = useMemo(() => buildRows(fluids, xEnd), [fluids, xEnd]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = useRef(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);

  const visibleRows = useMemo(
    () => rows.filter((r) => !hiddenNames.includes(r.name)),
    [rows, hiddenNames]
  );

  const visibleRowsReindexed = useMemo(
    () => visibleRows.map((row, idx) => ({ ...row, rowIndex: idx })),
    [visibleRows]
  );

  const allMaxTime = useMemo(() => getMaxTime(rows), [rows]);
  const majorStep = useMemo(() => getMajorStep(timeResolution), [timeResolution]);
  const minorStep = useMemo(() => getMinorStep(timeResolution), [timeResolution]);
  const pxPerMin = useMemo(() => getPxPerMinute(timeResolution), [timeResolution]);

  const finalXEnd = useMemo(() => {
    const computed = Math.max(majorStep, Math.ceil(allMaxTime / majorStep) * majorStep);
    return xEnd ?? computed;
  }, [xEnd, allMaxTime, majorStep]);

  const majorTicks = useMemo(() => {
    if (timeResolution === 15 && xTicks && xTicks.length > 0) return xTicks;
    return buildGridTicks(finalXEnd, majorStep);
  }, [timeResolution, xTicks, finalXEnd, majorStep]);

  const minorTicks = useMemo(() => {
    return buildGridTicks(finalXEnd, minorStep);
  }, [finalXEnd, minorStep]);

  const axisHeight = showXAxis ? 22 : 0;
  const contentHeight = Math.max(visibleRowsReindexed.length * ROW_HEIGHT, ROW_HEIGHT);
  
  // 给 panel 额外加一点上下留白，不改变每行高度
  const panelPadding = 28;
  
  const dynamicHeight = contentHeight + axisHeight + panelPadding;
  const viewHeight = Math.min(dynamicHeight, 220);


  const contentPlotWidth = useMemo(() => {
    if (finalXEnd <= 0) return 800;
    return Math.max(800, Math.ceil(finalXEnd * pxPerMin));
  }, [finalXEnd, pxPerMin]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;
  const plotWidth = contentWidth - PLOT_RIGHT;

  useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
      setSliderValue(sharedScrollLeft);
    }
  }, [sharedScrollLeft, contentWidth]);

  useEffect(() => {
    function updateScrollMetrics() {
      const el = scrollRef.current;
      if (!el) return;

      const nextMax = Math.max(0, el.scrollWidth - el.clientWidth);
      setMaxScrollLeft(nextMax);
      setSliderValue(Math.min(el.scrollLeft, nextMax));
    }

    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);
    return () => {
      window.removeEventListener("resize", updateScrollMetrics);
    };
  }, [contentWidth, viewHeight, visibleRowsReindexed.length]);

  function minuteToPixel(minute: number) {
    if (!finalXEnd || finalXEnd <= 0) return 0;
    return (minute / finalXEnd) * plotWidth;
  }

  if (!rows.length) {
    return embedded ? null : (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">No fluid data available.</div>
      </div>
    );
  }

  return (
    <div
      className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}
    >
      <style jsx>{`
        .fluid-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .fluid-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .fluid-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .fluid-slider:focus {
          outline: none;
        }

        .fluid-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .fluid-slider::-webkit-slider-thumb {
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

        .fluid-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .fluid-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .fluid-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .fluid-slider:hover::-moz-range-thumb {
          background: #475569;
        }
      `}</style>
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
              const hidden = hiddenNames.includes(row.name);
              const active = visibleRows.some((r) => r.name === row.name);
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
                    boxSizing: "border-box",
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

        <FixedYAxisSpacer height={viewHeight} />

        <div className="overflow-x-hidden overflow-y-hidden">
          <div
            ref={scrollRef}
            className="fluid-scroll-hidden"
            style={{ overscrollBehaviorX: "none" }}
            onWheel={(e) => {
              const el = e.currentTarget;
              const absX = Math.abs(e.deltaX);
              const absY = Math.abs(e.deltaY);

              // 只处理“明显以横向为主”的触摸板/滚轮手势
              if (absX <= absY || absX < 1) return;

              const maxScrollLeft = el.scrollWidth - el.clientWidth;
              const nextLeft = el.scrollLeft + e.deltaX;

              const atLeftEdge = el.scrollLeft <= 0;
              const atRightEdge = el.scrollLeft >= maxScrollLeft - 1;

              const tryingGoPastLeft = atLeftEdge && e.deltaX < 0;
              const tryingGoPastRight = atRightEdge && e.deltaX > 0;

              if (tryingGoPastLeft || tryingGoPastRight) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }

              e.preventDefault();
              el.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextLeft));
            }}
            onScroll={(e) => {
              const next = e.currentTarget.scrollLeft;
              if (!isSyncingFromSliderRef.current) {
                setSliderValue(next);
              }
              onSharedScrollLeftChange?.(next);
            }}
          >
            <div
              className="relative"
              style={{
                width: contentWidth,
                height: contentHeight,
              }}
            >
              <svg
                width={contentWidth}
                height={contentHeight}
                viewBox={`0 0 ${contentWidth} ${contentHeight}`}
                preserveAspectRatio="none"
              >
              {highlightWindow && (
                <rect
                  x={minuteToPixel(highlightWindow.startMin)}
                  y={0}
                  width={Math.max(
                    2,
                    minuteToPixel(highlightWindow.endMin) -
                      minuteToPixel(highlightWindow.startMin)
                  )}
                  height={contentHeight}
                  fill="lightblue"
                  fillOpacity={0.45}
                  stroke="none"
                />
              )}

              {minorTicks.map((tick) => {
                const x = minuteToPixel(tick);
                return (
                  <line
                    key={`grid-x-minor-${tick}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={contentHeight}
                    stroke="#d7dbe2"
                    strokeWidth={0.9}
                  />
                );
              })}

              {majorTicks.map((tick) => {
                const x = minuteToPixel(tick);
                return (
                  <line
                    key={`grid-x-major-${tick}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={contentHeight}
                    stroke="#9aa3b2"
                    strokeWidth={1.4}
                  />
                );
              })}

              {Array.from(
                { length: visibleRowsReindexed.length + 1 },
                (_, i) => i
              ).map((i) => {
                const y = i * ROW_HEIGHT;
                return (
                  <line
                    key={`grid-y-${i}`}
                    x1={0}
                    y1={y}
                    x2={plotWidth}
                    y2={y}
                    stroke="#d1d5db"
                    strokeWidth={1}
                  />
                );
              })}

              {visibleRowsReindexed.map((row) => {
                const rowTop = row.rowIndex * ROW_HEIGHT;
                const centerY = rowTop + ROW_HEIGHT / 2;
                const color = inferFluidColor(row.name);

                return (
                  <g key={`data-${row.name}`}>
                    {row.infusion.map((seg, idx) => {
                      const x1 = minuteToPixel(seg.start);
                      const x2 = minuteToPixel(
                        Math.max(seg.end, seg.start + 0.1)
                      );
                      const yTop = rowTop + ROW_HEIGHT * 0.28;
                      const yBottom = rowTop + ROW_HEIGHT * 0.72;
                      const width = x2 - x1;

                      const label =
                        seg.label && String(seg.label).trim()
                          ? String(seg.label).trim()
                          : `${formatFluidNumber(seg.rate)} ${seg.unit ?? ""}`.trim();

                      const labelWidth = Math.max(
                        18,
                        estimateTextWidth(label, 10) + 10
                      );
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

                    {row.bolus.map((p, idx) => {
                      const cx = minuteToPixel(p.time);
                      const text = String(
                        p.label ??
                          `${formatFluidNumber(p.dose)} ${p.unit ?? ""}`.trim()
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

                    {row.output.map((p, idx) => {
                      const cx = minuteToPixel(p.time);
                      const outputColor = color;
                      const text = String(
                        p.label ??
                          `${formatFluidNumber(p.dose)} ${p.unit ?? ""}`.trim()
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

              {showXAxis &&
                majorTicks.map((tick, idx) => {
                  const x = minuteToPixel(tick);
                  const isFirst = idx === 0;
                  const isLast = idx === majorTicks.length - 1;

                  return (
                    <text
                      key={`tick-label-${tick}`}
                      x={x}
                      y={contentHeight - 6}
                      textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                      fontSize={10}
                      fill="#6b7280"
                    >
                      {formatClockTime(tick, timeZero)}
                    </text>
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="px-2 pt-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.round(maxScrollLeft))}
              step={1}
              value={Math.min(sliderValue, maxScrollLeft)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSliderValue(next);

                const el = scrollRef.current;
                if (!el) return;

                isSyncingFromSliderRef.current = true;
                el.scrollLeft = next;
                onSharedScrollLeftChange?.(next);

                requestAnimationFrame(() => {
                  isSyncingFromSliderRef.current = false;
                });
              }}
              className="fluid-slider"
              aria-label="Fluid chart horizontal scroll"
            />
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
