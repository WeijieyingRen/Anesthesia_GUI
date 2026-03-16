"use client";

import { useMemo, useState } from "react";
import type { TimeValuePoint } from "@/lib/types";

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

type GasChartProps = {
  title?: string;
  gas: Record<string, TimeValuePoint[] | undefined>;
  height?: number;
  windowSize?: number;
  xEnd?: number;
  xTicks?: number[];
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;
  highlightWindow?: HighlightWindow | null;
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

function buildRows(gas: Record<string, TimeValuePoint[] | undefined>): GasRow[] {
  const names = sortGasNames(Object.keys(gas));

  return names.map((name, idx) => ({
    name,
    values: [...(gas[name] ?? [])]
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
      .sort((a, b) => a.time - b.time),
    rowIndex: idx,
  }));
}

function maxTimeOfRows(rows: GasRow[]) {
  const vals = rows.flatMap((r) => r.values.map((p) => p.time));
  return vals.length ? Math.max(...vals) : 0;
}

function buildWindowSegments(rows: GasRow[], windowSize: number): GasWindowSegment[] {
  const segments: GasWindowSegment[] = [];

  rows.forEach((row) => {
    const rowMaxTime = row.values.length ? Math.max(...row.values.map((p) => p.time)) : 0;
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

export default function GasChart({
  title = "Gas / Vent Trends",
  gas,
  height = 320,
  windowSize = 15,
  xEnd,
  xTicks,
  showXAxis = true,
  timeZero,
  embedded = false,
  highlightWindow = null,
}: GasChartProps) {
  const rows = useMemo(() => buildRows(gas), [gas]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [zoomTarget, setZoomTarget] = useState<ZoomTarget | null>(null);

  const visibleRows = rows.filter((r) => !hiddenNames.includes(r.name));
  const visibleRowsReindexed = visibleRows.map((row, idx) => ({ ...row, rowIndex: idx }));

  const allMaxTime = maxTimeOfRows(visibleRowsReindexed);
  const computedXEnd = Math.max(windowSize, Math.ceil(allMaxTime / windowSize) * windowSize);
  const finalXEnd = xEnd ?? computedXEnd;
  const finalXTicks =
    xTicks ??
    Array.from({ length: Math.floor(finalXEnd / windowSize) + 1 }, (_, i) => i * windowSize);

  const segments = useMemo(
    () => buildWindowSegments(visibleRowsReindexed, windowSize),
    [visibleRowsReindexed, windowSize]
  );

  const contentHeight = visibleRowsReindexed.length * ROW_HEIGHT + TOP_PAD + BOTTOM_PAD;
  const viewHeight = Math.min(height, Math.max(120, contentHeight));

  const detailWidth = 760;
  const detailHeight = 220;

  const detailInfo = useMemo(() => {
    if (!zoomTarget) return null;
    return buildDetailPolyline(zoomTarget.points, detailWidth, detailHeight);
  }, [zoomTarget]);

  if (!Object.keys(gas ?? {}).length) {
    return embedded ? null : (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">No gas / vent data available.</div>
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3> : null}

      <div
  className="overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
  style={{ height: viewHeight }}
>
        <div className="grid grid-cols-[220px_1fr] gap-0">
          <div className="border-r pr-0" style={{ height: contentHeight }}>
          <div>
              {rows.map((row) => {
                const hidden = hiddenNames.includes(row.name);
                const active = visibleRowsReindexed.some((r) => r.name === row.name);
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
                    <div className="min-w-0 flex-1 truncate text-gray-900">{row.name}</div>
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

          <div style={{ width: "100%", height: contentHeight }}>
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
                    {/* 左边空白区补横线，和右边 grid 连起来 */}
                    <line
                      x1={0}
                      y1={yBottom}
                      x2={PLOT_LEFT}
                      y2={yBottom}
                      stroke="#d1d5db"
                      strokeWidth={1}
                    />

                    {/* 右边真正的 chart 网格 */}
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
                      y1={TOP_PAD + 2}
                      x2={x}
                      y2={TOP_PAD + visibleRowsReindexed.length * ROW_HEIGHT}
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

              {segments.map((seg, idx) => {
                const color = inferGasColor(seg.rowName);
                const rowTop = TOP_PAD + seg.rowIndex * ROW_HEIGHT;
                const centerY = rowTop + ROW_HEIGHT / 2;

                const segLeft = PLOT_LEFT + (seg.x0 / finalXEnd) * PLOT_WIDTH;
                const segRight = PLOT_LEFT + (seg.x1 / finalXEnd) * PLOT_WIDTH;

                const label = String(roundSmart(seg.firstValue));
                const hideVisual = isZeroValue(seg.firstValue);
                const textWidth = estimateTextWidth(label, 10);

                const textX = segLeft + 6;
                const textY = centerY + 3;

                const lineStartX = textX + textWidth + 6;
                const lineEndX = segRight - 6;
                const canDrawLine = !hideVisual && lineEndX > lineStartX + 2;

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

              {showXAxis && (
                <text
                  x={PLOT_LEFT + PLOT_WIDTH / 2}
                  y={contentHeight - 6}
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

      {zoomTarget && detailInfo && (
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">{zoomTarget.rowName} detail</div>
              <div className="text-xs text-gray-500">
                {formatClockTime(zoomTarget.x0, timeZero)} - {formatClockTime(zoomTarget.x1, timeZero)}
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