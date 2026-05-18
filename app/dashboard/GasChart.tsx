"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimeValuePoint } from "@/lib/types";
import type { ManagementEvent } from "@/lib/types_management";

const LEGEND_COL_WIDTH = 220;
const AXIS_COL_WIDTH = 42;
const PLOT_RIGHT = 20;

type TimeResolution = 15 | 5;

type HighlightWindow = {
  startMin: number;
  endMin: number;
};

type GasChartProps = {
  title?: string;
  gas?: Record<string, TimeValuePoint[] | undefined> | null;
  height?: number;
  windowSize?: number;
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

type GasRow = {
  name: string;
  values: TimeValuePoint[];
  rowIndex: number;
};

type GasWindowSegment = {
  rowName: string;
  rowIndex: number;
  x0: number;
  x1: number;
  points: TimeValuePoint[];
  firstValue: number;
};

type ZoomTarget = {
  rowName: string;
  x0: number;
  x1: number;
  points: TimeValuePoint[];
};

const DEFAULT_GAS_ORDER = [
  "FiO2",
  "O2 (L/Min)",
  "Air (L/min)",
  "N2O (L/min)",
  "inO2 %",
  "inN2O %",
  "inSevoflurane %",
  "inIsoflurane",
  "etMAC exhaled",
  "TV",
  "MV",
  "PEEP (cm H2O)",
  "PIP",
  "Mean PIP",
  "Plateau PIP",
];

const ROW_HEIGHT = 20;
const TOP_PAD = 6;
const BOTTOM_PAD = 4;

function getPxPerMinute(timeResolution: TimeResolution) {
  return timeResolution === 15 ? 64 / 15 : 64 / 5;
}

function getMajorStep(timeResolution: TimeResolution) {
  return timeResolution === 15 ? 15 : 5;
}

function getMinorStep(timeResolution: TimeResolution) {
  return timeResolution === 15 ? 5 : 1;
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

function sortGasNames(names: string[]) {
  return [...names].sort((a, b) => {
    const ia = DEFAULT_GAS_ORDER.indexOf(a);
    const ib = DEFAULT_GAS_ORDER.indexOf(b);
    const va = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const vb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (va !== vb) return va - vb;
    return a.localeCompare(b);
  });
}

function inferGasColor(name: string) {
  if (name === "FiO2") return "#2563eb";
  if (name === "O2 (L/Min)") return "#39d353";
  if (name === "Air (L/min)") return "#64748b";
  if (name === "N2O (L/min)") return "#8b5cf6";
  if (name === "inO2 %") return "#1d4ed8";
  if (name === "inN2O %") return "#7c3aed";
  if (name === "inSevoflurane %") return "#f4ea2a";
  if (name === "inIsoflurane") return "#ea580c";
  if (name === "etMAC exhaled") return "#10b981";
  if (name === "TV") return "#2563eb";
  if (name === "MV") return "#7c3aed";
  if (name === "PEEP (cm H2O)") return "#ef4444";
  if (name === "PIP") return "#f59e0b";
  if (name === "Mean PIP") return "#22c55e";
  if (name === "Plateau PIP") return "#a855f7";
  return "#14b8a6";
}

function buildRows(
  gas?: Record<string, TimeValuePoint[] | undefined> | null
): GasRow[] {
  const safeGas = gas ?? {};
  const names = sortGasNames(Object.keys(safeGas));

  const rows = names.map((name) => ({
    name,
    values: [...(safeGas[name] ?? [])]
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
      .sort((a, b) => a.time - b.time),
    rowIndex: 0,
  }));

  const nonEmptyRows = rows.filter((row) => row.values.length > 0);

  return nonEmptyRows.map((row, idx) => ({
    ...row,
    rowIndex: idx,
  }));
}

function maxTimeOfRows(rows: GasRow[]) {
  const vals = rows.flatMap((r) => r.values.map((p) => p.time));
  return vals.length ? Math.max(...vals) : 0;
}

function buildWindowSegments(
  rows: GasRow[],
  windowSize: number
): GasWindowSegment[] {
  const segments: GasWindowSegment[] = [];

  rows.forEach((row) => {
    const rowMaxTime = row.values.length
      ? Math.max(...row.values.map((p) => p.time))
      : 0;

    const end = Math.ceil(rowMaxTime / windowSize) * windowSize;

    for (let start = 0; start < end; start += windowSize) {
      const stop = start + windowSize;
      const points = row.values.filter((p) => p.time >= start && p.time < stop);
      if (!points.length) continue;

      segments.push({
        rowName: row.name,
        rowIndex: row.rowIndex,
        x0: start,
        x1: stop,
        points,
        firstValue: points[0].value,
      });
    }
  });

  return segments;
}

function roundSmart(v: number) {
  if (Math.abs(v) >= 10) return Math.round(v);
  if (Math.abs(v) >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
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

function buildDetailPolyline(
  points: TimeValuePoint[],
  width: number,
  height: number,
  padLeft = 40,
  padRight = 14,
  padTop = 14,
  padBottom = 24
) {
  if (!points.length) {
    return {
      polyline: "",
      minV: 0,
      maxV: 1,
      minT: 0,
      maxT: 1,
    };
  }

  const minT = Math.min(...points.map((p) => p.time));
  const maxT = Math.max(...points.map((p) => p.time));
  const minVRaw = Math.min(...points.map((p) => p.value));
  const maxVRaw = Math.max(...points.map((p) => p.value));

  const minV = minVRaw;
  const maxV = maxVRaw === minVRaw ? minVRaw + 1 : maxVRaw;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const polyline = points
    .map((p) => {
      const rx = (p.time - minT) / Math.max(1e-6, maxT - minT || 1);
      const ry = (p.value - minV) / Math.max(1e-6, maxV - minV);
      const x = padLeft + rx * plotW;
      const y = padTop + (1 - ry) * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  return {
    polyline,
    minV,
    maxV,
    minT,
    maxT,
  };
}

function isZeroValue(v: number) {
  return Math.abs(v) < 1e-9;
}

function estimateTextWidth(text: string, fontSize = 10) {
  return Math.max(10, text.length * (fontSize * 0.62));
}

function normalizeManagementRowName(name: string | null | undefined) {
  return String(name ?? "").trim().toLowerCase();
}

function isMatchingGasRow(rowName: string, managementEvent?: ManagementEvent | null) {
  if (!managementEvent) return false;
  if (managementEvent.chart_type !== "gas") return false;

  const target = normalizeManagementRowName(managementEvent.row_name);
  const current = normalizeManagementRowName(rowName);

  if (!target || !current) return false;

  return current === target || current.includes(target) || target.includes(current);
}

function isHighlightedGasSegment(
  seg: GasWindowSegment,
  managementEvent?: ManagementEvent | null
) {
  if (!isMatchingGasRow(seg.rowName, managementEvent)) return false;
  if (!Number.isFinite(managementEvent?.time_min)) return false;

  const highlightTime = Number(
    Number.isFinite(managementEvent?.end_time_min)
      ? managementEvent?.end_time_min
      : managementEvent?.time_min
  );

  return seg.x0 <= highlightTime && highlightTime < seg.x1;
}

function FixedAxisSpacer({ height }: { height: number }) {
  return (
    <div
      className="border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    />
  );
}

function GasGridSvg({
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
  rows: GasRow[];
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
          x={(highlightWindow.startMin / end) * plotWidth}
          y={TOP_PAD}
          width={Math.max(
            2,
            ((highlightWindow.endMin - highlightWindow.startMin) / end) * plotWidth
          )}
          height={rows.length * ROW_HEIGHT}
          fill="lightblue"
          fillOpacity={0.75}
          stroke="none"
        />
      )}

      {minorTicks.map((tick) => {
        const x = (tick / end) * plotWidth;
        return (
          <line
            key={`grid-x-minor-${tick}`}
            x1={x}
            y1={TOP_PAD}
            x2={x}
            y2={TOP_PAD + rows.length * ROW_HEIGHT}
            stroke="#d7dbe2"
            strokeWidth={0.9}
          />
        );
      })}

      {majorTicks.map((tick) => {
        const x = (tick / end) * plotWidth;
        return (
          <line
            key={`grid-x-major-${tick}`}
            x1={x}
            y1={TOP_PAD}
            x2={x}
            y2={TOP_PAD + rows.length * ROW_HEIGHT}
            stroke="#9aa3b2"
            strokeWidth={1.4}
          />
        );
      })}

      {rows.map((row, idx) => {
        const yTop = TOP_PAD + idx * ROW_HEIGHT;
        return (
          <rect
            key={`row-${row.name}`}
            x={0}
            y={yTop}
            width={plotWidth}
            height={ROW_HEIGHT}
            fill="none"
            stroke="#d1d5db"
            strokeWidth={1}
          />
        );
      })}

      {Array.from({ length: rows.length + 1 }, (_, i) => i).map((i) => {
        const y = TOP_PAD + i * ROW_HEIGHT;
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
    </svg>
  );
}

export default function GasChart({
  title = "Gas / Vent Trends",
  gas = {},
  height = 320,
  windowSize,
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
}: GasChartProps) {
  const safeGas = gas ?? {};
  const rows = useMemo(() => buildRows(safeGas), [safeGas]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [zoomTarget, setZoomTarget] = useState<ZoomTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = useRef(false);

  const [sliderValue, setSliderValue] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);

  const majorStep = useMemo(
    () => getMajorStep(timeResolution),
    [timeResolution]
  );
  const minorStep = useMemo(
    () => getMinorStep(timeResolution),
    [timeResolution]
  );
  const effectiveWindowSize = windowSize ?? majorStep;
  const pxPerMin = useMemo(
    () => getPxPerMinute(timeResolution),
    [timeResolution]
  );

  const visibleRows = rows.filter((r) => !hiddenNames.includes(r.name));
  const visibleRowsReindexed = visibleRows.map((row, idx) => ({
    ...row,
    rowIndex: idx,
  }));

  const allMaxTime = maxTimeOfRows(visibleRowsReindexed);
  const computedXEnd = Math.max(
    effectiveWindowSize,
    Math.ceil(allMaxTime / effectiveWindowSize) * effectiveWindowSize
  );
  const finalXEnd = xEnd ?? computedXEnd;

  const majorTicks = useMemo(() => {
    if (xTicks && xTicks.length > 0 && timeResolution === 15) {
      return xTicks;
    }
    return buildGridTicks(finalXEnd, majorStep);
  }, [xTicks, finalXEnd, majorStep, timeResolution]);

  const minorTicks = useMemo(() => {
    return buildGridTicks(finalXEnd, minorStep);
  }, [finalXEnd, minorStep]);

  const segments = useMemo(
    () => buildWindowSegments(visibleRowsReindexed, effectiveWindowSize),
    [visibleRowsReindexed, effectiveWindowSize]
  );

  const fullContentHeight =
    visibleRowsReindexed.length * ROW_HEIGHT + TOP_PAD + BOTTOM_PAD;

  const viewHeight = Math.min(
    height + 40,
    Math.max(160, fullContentHeight + 40)
  );

  const contentPlotWidth = useMemo(() => {
    if (finalXEnd <= 0) return 800;
    return Math.max(800, Math.ceil(finalXEnd * pxPerMin));
  }, [finalXEnd, pxPerMin]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;
  const plotWidth = contentPlotWidth;

  const detailWidth = 760;
  const detailHeight = 220;

  const detailInfo = useMemo(() => {
    if (!zoomTarget) return null;
    return buildDetailPolyline(zoomTarget.points, detailWidth, detailHeight);
  }, [zoomTarget]);

  useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
      setSliderValue(sharedScrollLeft);
    }
  }, [sharedScrollLeft]);

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
  }, [contentWidth, viewHeight, hiddenNames, rows.length]);

  if (!Object.keys(safeGas).length || rows.length === 0) {
    return embedded ? null : (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">No gas / vent data available.</div>
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      <style jsx>{`
        .gas-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .gas-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .gas-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .gas-slider:focus {
          outline: none;
        }

        .gas-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .gas-slider::-webkit-slider-thumb {
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

        .gas-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .gas-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .gas-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .gas-slider:hover::-moz-range-thumb {
          background: #475569;
        }
      `}</style>

      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div
        className="overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
        style={{ height: viewHeight }}
      >
        <div
          className="grid gap-0"
          style={{
            gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0,1fr)`,
            minHeight: fullContentHeight,
          }}
        >
          <div className="border-r pr-0" style={{ height: fullContentHeight }}>
            <div>
              {rows.map((row) => {
                const hidden = hiddenNames.includes(row.name);
                const active = visibleRowsReindexed.some(
                  (r) => r.name === row.name
                );
                const color = inferGasColor(row.name);

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

          <FixedAxisSpacer height={fullContentHeight} />

          <div className="overflow-x-hidden overflow-y-hidden">
            <div
              ref={scrollRef}
              className="gas-scroll-hidden"
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

                e.preventDefault();
                const clamped = Math.max(0, Math.min(maxScroll, nextLeft));
                el.scrollLeft = clamped;
                setSliderValue(clamped);
              }}
              onScroll={(e) => {
                const next = e.currentTarget.scrollLeft;
                if (!isSyncingFromSliderRef.current) {
                  setSliderValue(next);
                }
                onSharedScrollLeftChange?.(next);
              }}
            >
              <div style={{ width: contentWidth, height: fullContentHeight }}>
                <div
                  className="relative"
                  style={{ width: contentWidth, height: fullContentHeight }}
                >
                  <GasGridSvg
                    end={finalXEnd}
                    majorTicks={majorTicks}
                    minorTicks={minorTicks}
                    rows={visibleRowsReindexed}
                    height={fullContentHeight}
                    highlightWindow={highlightWindow}
                    plotWidth={plotWidth}
                  />

                  <svg
                    width={contentWidth}
                    height={fullContentHeight}
                    viewBox={`0 0 ${contentWidth} ${fullContentHeight}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0"
                  >
                    <g transform="translate(0,0)">
                      {segments.map((seg, idx) => {
                        const color = inferGasColor(seg.rowName);
                        const rowTop = TOP_PAD + seg.rowIndex * ROW_HEIGHT;
                        const centerY = rowTop + ROW_HEIGHT / 2;

                        const segLeft = (seg.x0 / finalXEnd) * plotWidth;
                        const segRight = (seg.x1 / finalXEnd) * plotWidth;

                        const label = String(roundSmart(seg.firstValue));
                        const hideVisual = isZeroValue(seg.firstValue);
                        const textWidth = estimateTextWidth(label, 10);
                        const shouldHighlight = isHighlightedGasSegment(
                          seg,
                          managementEvent
                        );

                        const textX = segLeft + 6;
                        const textY = centerY + 3;

                        const lineStartX = textX + textWidth + 6;
                        const lineEndX = segRight - 6;
                        const canDrawLine =
                          !hideVisual && lineEndX > lineStartX + 2;

                        const isSelected =
                          zoomTarget &&
                          zoomTarget.rowName === seg.rowName &&
                          zoomTarget.x0 === seg.x0 &&
                          zoomTarget.x1 === seg.x1;

                        return (
                          <g
                            key={`${seg.rowName}-${seg.x0}-${idx}`}
                            style={{ cursor: "zoom-in" }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setZoomTarget({
                                rowName: seg.rowName,
                                x0: seg.x0,
                                x1: seg.x1,
                                points: seg.points,
                              });
                            }}
                          >
                            <rect
                              x={segLeft}
                              y={rowTop}
                              width={Math.max(2, segRight - segLeft)}
                              height={ROW_HEIGHT}
                              fill={isSelected ? "#FFF7ED" : "transparent"}
                              stroke={isSelected ? "#FB923C" : "transparent"}
                              strokeWidth={isSelected ? 1.5 : 0}
                            />

                            {!hideVisual && (
                              <>
                                {shouldHighlight && (
                                  <ellipse
                                    cx={textX + textWidth / 2}
                                    cy={centerY}
                                    rx={Math.max(13, textWidth / 2 + 6)}
                                    ry={8}
                                    fill="none"
                                    stroke="#ef4444"
                                    strokeWidth={2.5}
                                  />
                                )}

                                <text
                                  x={textX}
                                  y={textY}
                                  fontSize={10}
                                  fill="#111827"
                                >
                                  {label}
                                </text>

                                {canDrawLine && (
                                  <line
                                    x1={lineStartX}
                                    y1={centerY}
                                    x2={lineEndX}
                                    y2={centerY}
                                    stroke={color}
                                    strokeWidth={5}
                                    strokeLinecap="butt"
                                  />
                                )}
                              </>
                            )}

                            <rect
                              x={segLeft}
                              y={rowTop}
                              width={Math.max(2, segRight - segLeft)}
                              height={ROW_HEIGHT}
                              fill="transparent"
                            />
                          </g>
                        );
                      })}

                      {showXAxis &&
                        majorTicks.map((tick) => {
                          const x = (tick / finalXEnd) * plotWidth;
                          return (
                            <text
                              key={`tick-label-${tick}`}
                              x={x + 2}
                              y={TOP_PAD - 2}
                              fontSize={10}
                              fill="#6b7280"
                            >
                              {formatClockTime(tick, timeZero)}
                            </text>
                          );
                        })}

                      {showXAxis && (
                        <text
                          x={plotWidth / 2}
                          y={fullContentHeight - 6}
                          textAnchor="middle"
                          fontSize={12}
                          fill="#6b7280"
                        >
                          Time
                        </text>
                      )}
                    </g>
                  </svg>
                </div>
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
                className="gas-slider"
                aria-label="Gas chart horizontal scroll"
              />
            </div>

            <div className="px-2 py-1 text-[11px] text-gray-500">
              Drag the bar to move left or right across the gas timeline.
            </div>
          </div>
        </div>
      </div>

      {zoomTarget && detailInfo && (
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {zoomTarget.rowName} detail
              </div>
              <div className="text-xs text-gray-500">
                {formatClockTime(zoomTarget.x0, timeZero)} -{" "}
                {formatClockTime(zoomTarget.x1, timeZero)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setZoomTarget(null)}
              className="rounded border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <svg
            width="100%"
            height={detailHeight}
            viewBox={`0 0 ${detailWidth} ${detailHeight}`}
            preserveAspectRatio="none"
          >
            <rect
              x={40}
              y={14}
              width={detailWidth - 54}
              height={detailHeight - 38}
              fill="#ffffff"
              stroke="#d1d5db"
              strokeWidth={1}
            />

            <line
              x1={40}
              y1={detailHeight - 24}
              x2={detailWidth - 14}
              y2={detailHeight - 24}
              stroke="#d1d5db"
              strokeWidth={1}
            />
            <line
              x1={40}
              y1={14}
              x2={40}
              y2={detailHeight - 24}
              stroke="#d1d5db"
              strokeWidth={1}
            />

            <text x={8} y={22} fontSize={10} fill="#6b7280">
              {roundSmart(detailInfo.maxV)}
            </text>
            <text x={8} y={detailHeight - 28} fontSize={10} fill="#6b7280">
              {roundSmart(detailInfo.minV)}
            </text>

            <text x={40} y={detailHeight - 8} fontSize={10} fill="#6b7280">
              {formatClockTime(detailInfo.minT, timeZero)}
            </text>
            <text
              x={detailWidth - 14}
              y={detailHeight - 8}
              fontSize={10}
              fill="#6b7280"
              textAnchor="end"
            >
              {formatClockTime(detailInfo.maxT, timeZero)}
            </text>

            <polyline
              points={detailInfo.polyline}
              fill="none"
              stroke={inferGasColor(zoomTarget.rowName)}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {zoomTarget.points.map((p, i) => {
              const plotW = detailWidth - 40 - 14;
              const plotH = detailHeight - 14 - 24;

              const rx =
                (p.time - detailInfo.minT) /
                Math.max(1e-6, detailInfo.maxT - detailInfo.minT || 1);
              const ry =
                (p.value - detailInfo.minV) /
                Math.max(1e-6, detailInfo.maxV - detailInfo.minV);

              const cx = 40 + rx * plotW;
              const cy = 14 + (1 - ry) * plotH;

              return (
                <circle
                  key={`${p.time}-${p.value}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  fill={inferGasColor(zoomTarget.rowName)}
                />
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
