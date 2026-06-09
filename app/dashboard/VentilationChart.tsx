"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimeValuePoint } from "@/lib/types";
import {
  CHART_AXIS_WIDTH as AXIS_COL_WIDTH,
  CHART_LEGEND_WIDTH as LEGEND_COL_WIDTH,
  buildChartTicks,
  getChartMajorStep,
  getChartMinorStep,
  getSharedChartGeometry,
  minuteToX,
  type TimeResolution,
} from "@/src/components/charts/chartLayout";

type HighlightWindow = {
  startMin: number;
  endMin: number;
};

type VentilationChartProps = {
  title?: string;
  ventilation?: Record<string, TimeValuePoint[] | undefined> | null;
  height?: number;
  windowSize?: number;
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

type VentRow = {
  name: string;
  values: TimeValuePoint[];
  rowIndex: number;
};

type VentWindowSegment = {
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

const DEFAULT_VENT_ORDER = [
  "RR",
  "TV",
  "MV",
  "PEEP (cm H2O)",
  "PIP",
  "Mean PIP",
  "Plateau PIP",
];

const ROW_HEIGHT = 20;
const TOP_PAD = 0;
const BOTTOM_PAD = 0;

function sortVentNames(names: string[]) {
  return [...names].sort((a, b) => {
    const ia = DEFAULT_VENT_ORDER.indexOf(a);
    const ib = DEFAULT_VENT_ORDER.indexOf(b);
    const va = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const vb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;

    if (va !== vb) return va - vb;

    return a.localeCompare(b);
  });
}

function inferVentColor(name: string) {
  if (name === "RR") return "#4a90ff";
  if (name === "TV") return "#2563eb";
  if (name === "MV") return "#7c3aed";
  if (name === "PEEP (cm H2O)") return "#ef4444";
  if (name === "PIP") return "#f59e0b";
  if (name === "Mean PIP") return "#22c55e";
  if (name === "Plateau PIP") return "#a855f7";

  return "#14b8a6";
}

function getVentDisplayName(name: string) {
  if (name === "PEEP (cm H2O)") return "PEEP (cm H2O)";
  return name;
}

function buildRows(
  ventilation?: Record<string, TimeValuePoint[] | undefined> | null
): VentRow[] {
  const safeVentilation = ventilation ?? {};

  const names = sortVentNames(
    Object.keys(safeVentilation).filter((key) =>
      (safeVentilation[key] ?? []).some(
        (p) => Number.isFinite(p.time) && Number.isFinite(p.value)
      )
    )
  );

  return names.map((name, idx) => ({
    name,
    values: [...(safeVentilation[name] ?? [])]
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
      .sort((a, b) => a.time - b.time),
    rowIndex: idx,
  }));
}

function maxTimeOfRows(rows: VentRow[]) {
  const vals = rows.flatMap((r) => r.values.map((p) => p.time));
  return vals.length ? Math.max(...vals) : 0;
}

function buildWindowSegments(
  rows: VentRow[],
  windowSize: number
): VentWindowSegment[] {
  const segments: VentWindowSegment[] = [];

  rows.forEach((row) => {
    const rowMaxTime = row.values.length
      ? Math.max(...row.values.map((p) => p.time))
      : 0;

    const end = Math.ceil(rowMaxTime / windowSize) * windowSize;

    for (let start = 0; start < end; start += windowSize) {
      const stop = start + windowSize;
      const points = row.values.filter((p) => p.time >= start && p.time < stop);

      if (!points.length) continue;

      // 如果这个 segment 里所有值都是 0，就不显示这个 segment。
      // 但如果 firstValue 是 0、后面有非 0 值，仍然会显示。
      if (points.every((p) => p.value === 0)) continue;

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
  if (Math.abs(v) >= 100) return Math.round(v);
  if (Math.abs(v) >= 10) return Math.round(v * 10) / 10;
  if (Math.abs(v) >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
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

function estimateTextWidth(text: string, fontSize = 10) {
  return Math.max(10, text.length * (fontSize * 0.62));
}

function FixedYAxisSpacer({ height }: { height: number }) {
  return (
    <div
      className="relative border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    />
  );
}

function VentilationGridSvg({
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
  rows: VentRow[];
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

      {rows.map((row, idx) => {
        const yTop = TOP_PAD + idx * ROW_HEIGHT;
        const yBottom = yTop + ROW_HEIGHT;

        return (
          <g key={`row-${row.name}`}>
            <rect
              x={0}
              y={yTop}
              width={plotWidth}
              height={ROW_HEIGHT}
              fill="none"
              stroke="#d1d5db"
              strokeWidth={1}
            />

            <line
              x1={0}
              y1={yBottom}
              x2={plotWidth}
              y2={yBottom}
              stroke="#d1d5db"
              strokeWidth={1}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function VentilationChart({
  title = "Ventilation Trends",
  ventilation = {},
  height = 220,
  windowSize,
  xEnd,
  xTicks,
  showXAxis = true,
  timeZero,
  embedded = false,
  highlightWindow = null,
  timeResolution = 15,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: VentilationChartProps) {
  const rows = useMemo(() => buildRows(ventilation), [ventilation]);

  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [zoomTarget, setZoomTarget] = useState<ZoomTarget | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = useRef(false);

  const [sliderValue, setSliderValue] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);

  const showHorizontalSlider = maxScrollLeft > 1;

  const majorStep = useMemo(
    () => getChartMajorStep(timeResolution),
    [timeResolution]
  );

  const minorStep = useMemo(
    () => getChartMinorStep(timeResolution),
    [timeResolution]
  );

  const effectiveWindowSize = windowSize ?? majorStep;

  const visibleRows = useMemo(
    () => rows.filter((r) => !hiddenNames.includes(r.name)),
    [rows, hiddenNames]
  );

  const visibleRowsReindexed = useMemo(
    () =>
      visibleRows.map((row, idx) => ({
        ...row,
        rowIndex: idx,
      })),
    [visibleRows]
  );

  const allMaxTime = useMemo(
    () => maxTimeOfRows(visibleRowsReindexed),
    [visibleRowsReindexed]
  );

  const computedXEnd = Math.max(
    effectiveWindowSize,
    Math.ceil(allMaxTime / effectiveWindowSize) * effectiveWindowSize
  );

  const effectiveXEnd = xEnd ?? computedXEnd;

  const majorTicks = useMemo(() => {
    if (timeResolution === 15 && xTicks && xTicks.length > 0) {
      return xTicks;
    }

    return buildChartTicks(effectiveXEnd, majorStep);
  }, [timeResolution, xTicks, effectiveXEnd, majorStep]);

  const minorTicks = useMemo(() => {
    return buildChartTicks(effectiveXEnd, minorStep);
  }, [effectiveXEnd, minorStep]);

  const segments = useMemo(
    () => buildWindowSegments(visibleRowsReindexed, effectiveWindowSize),
    [visibleRowsReindexed, effectiveWindowSize]
  );

  const contentHeight =
    visibleRowsReindexed.length * ROW_HEIGHT + TOP_PAD + BOTTOM_PAD;

  const sliderHeight = showHorizontalSlider ? 26 : 0;
  const dynamicHeight = contentHeight + sliderHeight;

  const viewHeight = Math.min(height, Math.max(120, dynamicHeight));

  const { contentWidth, plotWidth } = useMemo(
    () => getSharedChartGeometry(effectiveXEnd, timeResolution),
    [effectiveXEnd, timeResolution]
  );

  const detailWidth = 760;
  const detailHeight = 220;

  const detailInfo = useMemo(() => {
    if (!zoomTarget) return null;
    return buildDetailPolyline(zoomTarget.points, detailWidth, detailHeight);
  }, [zoomTarget]);

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
    }

    updateScrollMetrics();

    window.addEventListener("resize", updateScrollMetrics);

    return () => {
      window.removeEventListener("resize", updateScrollMetrics);
    };
  }, [
    contentWidth,
    contentHeight,
    viewHeight,
    hiddenNames.length,
    rows.length,
    sharedScrollLeft,
  ]);

  if (!rows.length) {
    return embedded ? null : (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">
          No ventilation data available.
        </div>
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
        .vent-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .vent-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .vent-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .vent-slider:focus {
          outline: none;
        }

        .vent-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .vent-slider::-webkit-slider-thumb {
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

        .vent-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .vent-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .vent-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .vent-slider:hover::-moz-range-thumb {
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
        <div className="overflow-hidden" style={{ height: viewHeight }}>
          <div className="border-r pr-0" style={{ height: contentHeight }}>
            <div>
              {rows.map((row) => {
                const hidden = hiddenNames.includes(row.name);
                const active = visibleRowsReindexed.some(
                  (r) => r.name === row.name
                );
                const color = inferVentColor(row.name);

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
                      {getVentDisplayName(row.name)}
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
        </div>

        <div className="overflow-hidden" style={{ height: viewHeight }}>
          <FixedYAxisSpacer height={contentHeight} />
        </div>

        <div className="min-w-0">
          <div
            className="overflow-x-hidden overflow-y-hidden"
            style={{ height: viewHeight }}
          >
            <div
              ref={scrollRef}
              className="vent-scroll-hidden"
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
                  height: contentHeight,
                }}
              >
                <VentilationGridSvg
                  end={effectiveXEnd}
                  majorTicks={majorTicks}
                  minorTicks={minorTicks}
                  rows={visibleRowsReindexed}
                  height={contentHeight}
                  highlightWindow={highlightWindow}
                  plotWidth={plotWidth}
                />

                <svg
                  width={contentWidth}
                  height={contentHeight}
                  viewBox={`0 0 ${contentWidth} ${contentHeight}`}
                  preserveAspectRatio="none"
                  className="absolute inset-0"
                >
                  {segments.map((seg, idx) => {
                    const color = inferVentColor(seg.rowName);
                    const rowTop = TOP_PAD + seg.rowIndex * ROW_HEIGHT;
                    const centerY = rowTop + ROW_HEIGHT / 2;

                    const segLeft = minuteToX(
                      seg.x0,
                      effectiveXEnd,
                      plotWidth
                    );

                    const segRight = minuteToX(
                      seg.x1,
                      effectiveXEnd,
                      plotWidth
                    );

                    const label = String(roundSmart(seg.firstValue));
                    const textWidth = estimateTextWidth(label, 10);

                    const textX = segLeft + 6;
                    const textY = centerY + 3;

                    const lineStartX = textX + textWidth + 6;
                    const lineEndX = segRight - 6;
                    const canDrawLine = lineEndX > lineStartX + 2;

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

                        <text x={textX} y={textY} fontSize={10} fill="#111827">
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
                      const x = minuteToX(tick, effectiveXEnd, plotWidth);

                      return (
                        <text
                          key={`tick-label-${tick}`}
                          x={x + 2}
                          y={TOP_PAD + 12}
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

                  requestAnimationFrame(() => {
                    isSyncingFromSliderRef.current = false;
                  });
                }}
                className="vent-slider"
                aria-label="Ventilation chart horizontal scroll"
              />
            </div>
          )}
        </div>
      </div>

      {zoomTarget && detailInfo && (
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {getVentDisplayName(zoomTarget.rowName)} detail
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
              stroke={inferVentColor(zoomTarget.rowName)}
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
                  fill={inferVentColor(zoomTarget.rowName)}
                />
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}