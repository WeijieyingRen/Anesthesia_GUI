"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FluidPanelData,
  FluidBolusPoint,
  FluidInfusionSegment,
  FluidOutputPoint,
} from "@/lib/types";
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

type FluidTooltip = {
  title: string;
  time: string;
  value: string;
  unit: string;
  type: string;
} | null;

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
const PANEL_PADDING = 28;

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
        ? rawBolus.filter(
            (p) => Number.isFinite(p.time) && Number.isFinite(p.dose)
          )
        : rawBolus.filter(
            (p) =>
              Number.isFinite(p.time) &&
              Number.isFinite(p.dose) &&
              p.time <= xEnd
          );

    const infusion =
      xEnd === undefined
        ? rawInfusion.filter(
            (seg) => Number.isFinite(seg.start) && Number.isFinite(seg.end)
          )
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
        ? rawOutput.filter(
            (p) => Number.isFinite(p.time) && Number.isFinite(p.dose)
          )
        : rawOutput.filter(
            (p) =>
              Number.isFinite(p.time) &&
              Number.isFinite(p.dose) &&
              p.time <= xEnd
          );

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

  const roundedBase = new Date(base);
  const roundedMinutes = Math.floor(roundedBase.getMinutes() / 15) * 15;
  roundedBase.setMinutes(roundedMinutes, 0, 0);

  const dt = new Date(roundedBase.getTime() + offsetMin * 60000);
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
  const [tooltip, setTooltip] = useState<FluidTooltip>(null);

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

  const visibleRows = useMemo(
    () => rows.filter((row) => !hiddenNames.includes(row.name)),
    [rows, hiddenNames]
  );

  const visibleRowsReindexed = useMemo(
    () => visibleRows.map((row, idx) => ({ ...row, rowIndex: idx })),
    [visibleRows]
  );

  const allMaxTime = useMemo(() => getMaxTime(rows), [rows]);

  const computedXEnd = useMemo(() => {
    return Math.max(majorStep, Math.ceil(allMaxTime / majorStep) * majorStep);
  }, [allMaxTime, majorStep]);

  const effectiveXEnd = xEnd ?? computedXEnd;

  const majorTicks = useMemo(() => {
    if (timeResolution === 15 && xTicks && xTicks.length > 0) return xTicks;
    return buildChartTicks(effectiveXEnd, majorStep);
  }, [timeResolution, xTicks, effectiveXEnd, majorStep]);

  const minorTicks = useMemo(() => {
    return buildChartTicks(effectiveXEnd, minorStep);
  }, [effectiveXEnd, minorStep]);

  const axisHeight = showXAxis ? 22 : 0;
  const sliderHeight = showHorizontalSlider ? 26 : 0;

  const contentHeight = Math.max(
    visibleRowsReindexed.length * ROW_HEIGHT,
    ROW_HEIGHT
  );

  const dynamicHeight =
    contentHeight + axisHeight + PANEL_PADDING + sliderHeight;

  const viewHeight = Math.min(height, Math.max(120, dynamicHeight));

  const { contentWidth, plotWidth } = useMemo(
    () => getSharedChartGeometry(effectiveXEnd, timeResolution),
    [effectiveXEnd, timeResolution]
  );

  function minuteToPixel(minute: number) {
    return minuteToX(minute, effectiveXEnd, plotWidth);
  }

  function showTooltip({
    title,
    type,
    time,
    value,
    unit,
  }: {
    title: string;
    type: string;
    time: string;
    value: string;
    unit: string;
  }) {
    setTooltip({
      title,
      type,
      time,
      value,
      unit,
    });
  }

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
    viewHeight,
    hiddenNames.length,
    rows.length,
    sharedScrollLeft,
  ]);

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
      className={
        embedded
          ? "relative bg-white p-0"
          : "relative rounded-2xl border bg-white p-4 shadow-sm"
      }
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
        <div className="overflow-hidden" style={{ height: viewHeight }}>
          <div className="border-r pr-0" style={{ height: contentHeight }}>
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
              className="fluid-scroll-hidden"
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
                              : `${formatFluidNumber(Number(seg.rate))} ${
                                  seg.unit ?? ""
                                }`.trim();

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
                          const isShortEvent = width < labelWidth + 6;

                          const timeText =
                            formatClockTime(seg.start, timeZero) +
                            " - " +
                            formatClockTime(seg.end, timeZero);

                          const valueText = formatFluidNumber(Number(seg.rate));
                          const unitText = String(seg.unit ?? "");

                          if (isShortEvent) {
                            const boxWidth = Math.max(
                              28,
                              Math.min(110, estimateTextWidth(label, 10) + 14)
                            );
                            const boxHeight = 16;
                            const arrowTipX = x1;
                            const arrowBaseX = x1 + 6;
                            const left = arrowBaseX;
                            const top = centerY - boxHeight / 2;
                            const textY = top + boxHeight / 2 + 4;

                            return (
                              <g
                                key={`inf-short-${row.name}-${idx}`}
                                style={{ cursor: "pointer" }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();

                                  showTooltip({
                                    title: row.name,
                                    type: "Infusion / short event",
                                    time: timeText,
                                    value: valueText,
                                    unit: unitText,
                                  });
                                }}
                              >
                                <line
                                  x1={arrowTipX}
                                  y1={centerY - 9}
                                  x2={arrowTipX}
                                  y2={centerY + 9}
                                  stroke={color}
                                  strokeWidth={1.8}
                                  opacity={1}
                                />

                                <polygon
                                  points={`${arrowTipX},${centerY} ${arrowBaseX},${
                                    centerY - 5
                                  } ${arrowBaseX},${centerY + 5}`}
                                  fill={color}
                                  stroke={color}
                                  strokeWidth={1.2}
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
                                  {label}
                                </text>
                              </g>
                            );
                          }

                          return (
                            <g
                              key={`inf-${row.name}-${idx}`}
                              style={{ cursor: "pointer" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                showTooltip({
                                  title: row.name,
                                  type: "Infusion",
                                  time: timeText,
                                  value: valueText,
                                  unit: unitText,
                                });
                              }}
                            >
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
                          const valueText = formatFluidNumber(p.dose);
                          const unitText = String(p.unit ?? "");
                          const text = String(
                            p.label ?? `${valueText} ${unitText}`.trim()
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
                            <g
                              key={`bolus-${row.name}-${idx}`}
                              style={{ cursor: "pointer" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                showTooltip({
                                  title: row.name,
                                  type: "Bolus",
                                  time: formatClockTime(p.time, timeZero),
                                  value: valueText,
                                  unit: unitText,
                                });
                              }}
                            >
                              <line
                                x1={arrowTipX}
                                y1={centerY - 9}
                                x2={arrowTipX}
                                y2={centerY + 9}
                                stroke={color}
                                strokeWidth={1.8}
                                opacity={1}
                              />

                              <polygon
                                points={`${arrowTipX},${centerY} ${arrowBaseX},${
                                  centerY - 5
                                } ${arrowBaseX},${centerY + 5}`}
                                fill={color}
                                stroke={color}
                                strokeWidth={1.2}
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
                          const valueText = formatFluidNumber(p.dose);
                          const unitText = String(p.unit ?? "");
                          const text = String(
                            p.label ?? `${valueText} ${unitText}`.trim()
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
                            <g
                              key={`output-${row.name}-${idx}`}
                              style={{ cursor: "pointer" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                showTooltip({
                                  title: row.name,
                                  type: "Output",
                                  time: formatClockTime(p.time, timeZero),
                                  value: valueText,
                                  unit: unitText,
                                });
                              }}
                            >
                              <line
                                x1={arrowTipX}
                                y1={centerY - 9}
                                x2={arrowTipX}
                                y2={centerY + 9}
                                stroke={color}
                                strokeWidth={1.8}
                                opacity={1}
                              />

                              <polygon
                                points={`${arrowTipX},${centerY} ${arrowBaseX},${
                                  centerY - 5
                                } ${arrowBaseX},${centerY + 5}`}
                                fill={color}
                                stroke={color}
                                strokeWidth={1.2}
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
                          textAnchor={
                            isFirst ? "start" : isLast ? "end" : "middle"
                          }
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
                className="fluid-slider"
                aria-label="Fluid chart horizontal scroll"
              />
            </div>
          )}
        </div>
      </div>

      {tooltip && (
        <div className="absolute right-4 top-10 z-50 w-[240px] rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 shadow-lg">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="font-semibold text-gray-900">{tooltip.title}</div>

            <button
              type="button"
              onClick={() => setTooltip(null)}
              className="leading-none text-gray-400 hover:text-gray-700"
            >
              ×
            </button>
          </div>

          <div className="space-y-0.5">
            <div>
              <span className="font-medium text-gray-600">Type:</span>{" "}
              {tooltip.type}
            </div>
            <div>
              <span className="font-medium text-gray-600">Time:</span>{" "}
              {tooltip.time}
            </div>
            <div>
              <span className="font-medium text-gray-600">Value:</span>{" "}
              {tooltip.value || "-"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Unit:</span>{" "}
              {tooltip.unit || "-"}
            </div>
          </div>
        </div>
      )}

      {showXAxis && showHorizontalSlider && (
        <div className="mt-1 text-xs text-gray-500">
          Horizontal scroll enabled for long cases.
        </div>
      )}
    </div>
  );
}