"use client";
import { useMemo, useRef, useState } from "react";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
  ReferenceLine,
} from "recharts";
import type { TimeValuePoint } from "@/lib/types";

type DetectVital = "MAP" | "HR" | "SPO2" | "RR" | "ETCO2" | "TEMP";

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type VitalChartProps = {
  title: string;
  series: Record<string, TimeValuePoint[] | undefined>;
  lineLabels?: Record<string, string>;
  lineColors?: Record<string, string>;
  lineMarkers?: Record<string, string>;
  lineUnits?: Record<string, string>;
  height?: number;
  yDomain?: [number, number];
  xEnd?: number;
  xTicks?: number[];
  showXAxis?: boolean;
  showTopTimeAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;

  selectedDetectVital?: DetectVital;
  onChangeSelectedDetectVital?: (vital: DetectVital) => void;

  selectedWindow?: SelectedWindow | null;
  onChangeSelectedWindow?: (window: SelectedWindow | null) => void;
  onCreateEventFromWindow?: (window: SelectedWindow) => void;
};

type MarkerType =
  | "circle"
  | "square"
  | "triangle"
  | "triangle-down"
  | "x"
  | "diamond";

type ScatterPoint = {
  time: number;
  value: number;
};

type DragMode =
  | "create"
  | "move"
  | "resize-left"
  | "resize-right"
  | "resize-top"
  | "resize-bottom"
  | null;

function buildScatterData(series: TimeValuePoint[] | undefined): ScatterPoint[] {
  return (series ?? [])
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .map((p) => ({
      time: p.time,
      value: p.value,
    }));
}

function getRowBackground(key: string) {
  if (key === "HR") return "#e4f3e4";
  if (key === "ARTS" || key === "ARTD" || key === "ARTM" || key === "NIBP_MAP")
    return "#ffdede";
  if (key === "SPO2 %") return "#e7e5ff";
  if (key === "RR") return "#e3f0ff";
  if (key === "CVP") return "#ece8ff";
  if (key === "PSI/BIS/Entropy") return "#ffd9f4";
  return "#efefef";
}

function EpicMarker({
  cx,
  cy,
  fill,
  marker = "circle",
  size = 8,
}: {
  cx?: number;
  cy?: number;
  fill?: string;
  marker?: MarkerType;
  size?: number;
}) {
  if (cx == null || cy == null) return null;

  const color = fill ?? "#000000";
  const r = size / 2;

  if (marker === "circle") {
    return <circle cx={cx} cy={cy} r={r * 0.7} fill={color} stroke={color} />;
  }

  if (marker === "square") {
    return (
      <rect
        x={cx - r * 0.75}
        y={cy - r * 0.75}
        width={size * 0.75}
        height={size * 0.75}
        fill={color}
        stroke={color}
      />
    );
  }

  if (marker === "triangle") {
    const s = 5;
    return (
      <g>
        <line
          x1={cx - s}
          y1={cy + s * 0.2}
          x2={cx}
          y2={cy - s}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy - s}
          x2={cx + s}
          y2={cy + s * 0.2}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (marker === "triangle-down") {
    const s = 5;
    return (
      <g>
        <line
          x1={cx - s}
          y1={cy - s * 0.2}
          x2={cx}
          y2={cy + s}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy + s}
          x2={cx + s}
          y2={cy - s * 0.2}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (marker === "diamond") {
    const points = `${cx},${cy - r} ${cx - r},${cy} ${cx},${cy + r} ${cx + r},${cy}`;
    return <polygon points={points} fill={color} stroke={color} />;
  }

  if (marker === "x") {
    return (
      <g>
        <line
          x1={cx - r}
          y1={cy - r}
          x2={cx + r}
          y2={cy + r}
          stroke={color}
          strokeWidth={2}
        />
        <line
          x1={cx - r}
          y1={cy + r}
          x2={cx + r}
          y2={cy - r}
          stroke={color}
          strokeWidth={2}
        />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={r * 0.7} fill={color} stroke={color} />;
}

function LegendMarker({
  color,
  marker,
}: {
  color: string;
  marker: MarkerType;
}) {
  return (
    <span
      className="flex h-5 w-5 items-center justify-center"
      style={{ backgroundColor: color }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        {marker === "circle" && (
          <circle cx="6" cy="6" r="2.5" fill="#ffffff" stroke="#ffffff" />
        )}

        {marker === "square" && (
          <rect x="3.5" y="3.5" width="5" height="5" fill="#ffffff" stroke="#ffffff" />
        )}

        {marker === "triangle" && (
          <>
            <line x1="2" y1="7" x2="6" y2="2" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="6" y1="2" x2="10" y2="7" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}

        {marker === "triangle-down" && (
          <>
            <line x1="2" y1="5" x2="6" y2="10" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="6" y1="10" x2="10" y2="5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}

        {marker === "x" && (
          <>
            <line x1="3.5" y1="3.5" x2="8.5" y2="8.5" stroke="#ffffff" strokeWidth="1.8" />
            <line x1="3.5" y1="8.5" x2="8.5" y2="3.5" stroke="#ffffff" strokeWidth="1.8" />
          </>
        )}

        {marker === "diamond" && (
          <polygon points="6,2.5 3,6 6,9.5 9,6" fill="#ffffff" stroke="#ffffff" />
        )}
      </svg>
    </span>
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

function getSelectedSeriesKey(
  series: Record<string, TimeValuePoint[] | undefined>,
  vital: DetectVital
): string | null {
  if (vital === "MAP") {
    if (series["ARTM"]) return "ARTM";
    if (series["NIBP_MAP"]) return "NIBP_MAP";
    return null;
  }

  if (vital === "HR") {
    if (series["HR"]) return "HR";
    return null;
  }

  if (vital === "SPO2") {
    if (series["SPO2 %"]) return "SPO2 %";
    return null;
  }

  if (vital === "RR") {
    if (series["RR"]) return "RR";
    return null;
  }

  if (vital === "ETCO2") {
    if (series["ETCO2"]) return "ETCO2";
    if (series["ETCO2 (mmHg)"]) return "ETCO2 (mmHg)";
    return null;
  }

  if (vital === "TEMP") {
    if (series["TEMP"]) return "TEMP";
    if (series["TMP Bladder"]) return "TMP Bladder";
    if (series["TMP Esophageal"]) return "TMP Esophageal";
    if (series["TMP Blood"]) return "TMP Blood";
    if (series["TMP Nasopharyngeal"]) return "TMP Nasopharyngeal";
    if (series["TMP Rectal"]) return "TMP Rectal";
    return null;
  }

  return null;
}

function getWindowYBounds(
  series: Record<string, TimeValuePoint[] | undefined>,
  selectedVital: DetectVital,
  startMin: number,
  endMin: number,
  yDomain?: [number, number]
): { y1: number; y2: number } | null {
  const key = getSelectedSeriesKey(series, selectedVital);
  if (!key) return null;

  const data = (series[key] ?? []).filter(
    (p) =>
      Number.isFinite(p.time) &&
      Number.isFinite(p.value) &&
      p.time >= startMin &&
      p.time <= endMin
  );

  const domainMin = yDomain?.[0] ?? 0;
  const domainMax = yDomain?.[1] ?? 200;
  const domainRange = domainMax - domainMin;

  if (!data.length) {
    const center = (domainMin + domainMax) / 2;
    const half = Math.max(domainRange * 0.08, 12);
    return {
      y1: Math.max(domainMin, center - half),
      y2: Math.min(domainMax, center + half),
    };
  }

  const values = data.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  const center = (minV + maxV) / 2;
  const rawHeight = Math.max(maxV - minV, 1);

  const minBoxHeight = Math.max(domainRange * 0.14, 18);
  const finalHeight = Math.max(rawHeight * 1.5, minBoxHeight);

  let y1 = center - finalHeight / 2;
  let y2 = center + finalHeight / 2;

  if (y1 < domainMin) {
    y2 += domainMin - y1;
    y1 = domainMin;
  }

  if (y2 > domainMax) {
    y1 -= y2 - domainMax;
    y2 = domainMax;
  }

  y1 = Math.max(domainMin, y1);
  y2 = Math.min(domainMax, y2);

  return { y1, y2 };
}

export default function VitalChart({
  title,
  series,
  lineLabels = {},
  lineColors = {},
  lineMarkers = {},
  lineUnits = {},
  height = 420,
  yDomain,
  xEnd,
  xTicks,
  showXAxis = true,
  showTopTimeAxis = false,
  timeZero,
  embedded = false,
  selectedDetectVital = "MAP",
  onChangeSelectedDetectVital,
  selectedWindow = null,
  onChangeSelectedWindow,
  onCreateEventFromWindow,
}: VitalChartProps) {
  const keys = Object.keys(series).filter((key) =>
    (series[key] ?? []).some((x) => Number.isFinite(x.value))
  );

  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [hoverMode, setHoverMode] = useState<DragMode>(null);

  const [dragStartMin, setDragStartMin] = useState<number | null>(null);
  const [dragCurrentMin, setDragCurrentMin] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);

  const [moveOffsetMin, setMoveOffsetMin] = useState<number>(0);
  const [moveWindowWidthMin, setMoveWindowWidthMin] = useState<number>(0);
  const [moveOffsetY, setMoveOffsetY] = useState<number>(0);
  const [moveWindowHeightY, setMoveWindowHeightY] = useState<number>(0);

  const chartOverlayRef = useRef<HTMLDivElement | null>(null);

  const visibleKeys = keys.filter((key) => !hiddenKeys.includes(key));
  const effectiveXEnd = xEnd ?? 0;
  const domain = yDomain ?? [0, 200];
  const domainMin = domain[0];
  const domainMax = domain[1];

  const chartMarginTop = showTopTimeAxis ? 5 : 10;
  const chartMarginBottom = showXAxis ? 15 : 10;
  const leftLegendTopSpacer = showTopTimeAxis ? 50 : 0;

  function clampY(y: number) {
    return Math.max(domainMin, Math.min(domainMax, y));
  }

  function minuteToPixel(minute: number) {
    const el = chartOverlayRef.current;
    if (!el || effectiveXEnd <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return (minute / effectiveXEnd) * rect.width;
  }

  function valueToPixel(value: number) {
    const el = chartOverlayRef.current;
    if (!el) return 0;

    const rect = el.getBoundingClientRect();
    const plotHeight = Math.max(1, rect.height - chartMarginTop - chartMarginBottom);
    const ratio = (domainMax - value) / (domainMax - domainMin);
    return chartMarginTop + ratio * plotHeight;
  }

  function clientXToMinute(clientX: number) {
    const el = chartOverlayRef.current;
    if (!el || effectiveXEnd <= 0) return 0;

    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * effectiveXEnd;
  }

  function clientYToValue(clientY: number) {
    const el = chartOverlayRef.current;
    if (!el) return domainMin;

    const rect = el.getBoundingClientRect();
    const plotTop = rect.top + chartMarginTop;
    const plotBottom = rect.bottom - chartMarginBottom;
    const plotHeight = Math.max(1, plotBottom - plotTop);

    const ratio = Math.max(0, Math.min(1, (clientY - plotTop) / plotHeight));
    const value = domainMax - ratio * (domainMax - domainMin);
    return clampY(value);
  }

  function pixelToMinute(px: number) {
    const el = chartOverlayRef.current;
    if (!el || effectiveXEnd <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return (px / rect.width) * effectiveXEnd;
  }

  function pixelToValue(py: number) {
    const el = chartOverlayRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const plotHeight = Math.max(1, rect.height - chartMarginTop - chartMarginBottom);
    return (py / plotHeight) * (domainMax - domainMin);
  }

  function getHoverMode(minute: number, value: number): DragMode {
    if (!selectedWindow) return null;

    const xEdgeThresholdMin = Math.max(pixelToMinute(16), 3);
    const yEdgeThresholdVal = Math.max(pixelToValue(16), 6);

    const { startMin, endMin, y1, y2 } = selectedWindow;

    const withinX = minute >= startMin && minute <= endMin;
    const withinY = value >= y1 && value <= y2;

    const nearLeft =
      Math.abs(minute - startMin) <= xEdgeThresholdMin &&
      value >= y1 &&
      value <= y2;

    const nearRight =
      Math.abs(minute - endMin) <= xEdgeThresholdMin &&
      value >= y1 &&
      value <= y2;

    const nearTop =
      Math.abs(value - y2) <= yEdgeThresholdVal &&
      minute >= startMin &&
      minute <= endMin;

    const nearBottom =
      Math.abs(value - y1) <= yEdgeThresholdVal &&
      minute >= startMin &&
      minute <= endMin;

    if (nearLeft) return "resize-left";
    if (nearRight) return "resize-right";
    if (nearTop) return "resize-top";
    if (nearBottom) return "resize-bottom";
    if (withinX && withinY) return "move";

    return null;
  }

  const activeStartMin =
    isDragging && dragMode === "create" && dragStartMin != null && dragCurrentMin != null
      ? Math.min(dragStartMin, dragCurrentMin)
      : isDragging &&
          dragMode === "resize-left" &&
          selectedWindow &&
          dragCurrentMin != null
        ? Math.min(dragCurrentMin, selectedWindow.endMin - 1)
        : isDragging &&
            dragMode === "resize-right" &&
            selectedWindow &&
            dragCurrentMin != null
          ? Math.max(dragCurrentMin, selectedWindow.startMin + 1)
          : isDragging &&
              dragMode === "move" &&
              selectedWindow &&
              dragCurrentMin != null
            ? Math.max(
                0,
                Math.min(dragCurrentMin - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)
              )
            : selectedWindow?.startMin ?? null;

  const activeEndMin =
    isDragging && dragMode === "create" && dragStartMin != null && dragCurrentMin != null
      ? Math.max(dragStartMin, dragCurrentMin)
      : isDragging &&
          dragMode === "resize-left" &&
          selectedWindow
        ? selectedWindow.endMin
        : isDragging &&
            dragMode === "resize-right" &&
            selectedWindow &&
            dragCurrentMin != null
          ? Math.max(dragCurrentMin, selectedWindow.startMin + 1)
          : isDragging &&
              dragMode === "move" &&
              selectedWindow &&
              dragCurrentMin != null
            ? Math.max(
                0,
                Math.min(dragCurrentMin - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)
              ) + moveWindowWidthMin
            : selectedWindow?.endMin ?? null;

  const autoCreateYBounds = useMemo(() => {
    if (
      !isDragging ||
      dragMode !== "create" ||
      activeStartMin == null ||
      activeEndMin == null
    ) {
      return null;
    }

    return getWindowYBounds(
      series,
      selectedDetectVital,
      activeStartMin,
      activeEndMin,
      yDomain
    );
  }, [isDragging, dragMode, activeStartMin, activeEndMin, series, selectedDetectVital, yDomain]);

  const activeY1 =
    isDragging &&
    dragMode === "move" &&
    selectedWindow &&
    dragCurrentY != null
      ? clampY(
          Math.max(
            domainMin,
            Math.min(dragCurrentY - moveOffsetY, domainMax - moveWindowHeightY)
          )
        )
      : isDragging &&
          dragMode === "resize-bottom" &&
          selectedWindow &&
          dragCurrentY != null
        ? Math.min(clampY(dragCurrentY), selectedWindow.y2 - 1)
        : isDragging &&
            dragMode === "resize-top" &&
            selectedWindow
          ? selectedWindow.y1
          : isDragging &&
              dragMode === "create" &&
              autoCreateYBounds
            ? autoCreateYBounds.y1
            : selectedWindow?.y1 ?? null;

  const activeY2 =
    isDragging &&
    dragMode === "move" &&
    selectedWindow &&
    dragCurrentY != null
      ? clampY(
          Math.max(
            domainMin,
            Math.min(dragCurrentY - moveOffsetY, domainMax - moveWindowHeightY)
          )
        ) + moveWindowHeightY
      : isDragging &&
          dragMode === "resize-top" &&
          selectedWindow &&
          dragCurrentY != null
        ? Math.max(clampY(dragCurrentY), selectedWindow.y1 + 1)
        : isDragging &&
            dragMode === "resize-bottom" &&
            selectedWindow
          ? selectedWindow.y2
          : isDragging &&
              dragMode === "create" &&
              autoCreateYBounds
            ? autoCreateYBounds.y2
            : selectedWindow?.y2 ?? null;

  const minCreateWidthMin = Math.max(pixelToMinute(6), 2);

  const displayWindow = useMemo(() => {
    if (
      activeStartMin == null ||
      activeEndMin == null ||
      activeY1 == null ||
      activeY2 == null
    ) {
      return null;
    }

    const width = activeEndMin - activeStartMin;
    const heightVal = activeY2 - activeY1;

    if (isDragging && dragMode === "create" && width < minCreateWidthMin) {
      return null;
    }

    if (width <= 0 || heightVal <= 0) {
      return null;
    }

    return {
      startMin: activeStartMin,
      endMin: activeEndMin,
      y1: activeY1,
      y2: activeY2,
    };
  }, [
    activeStartMin,
    activeEndMin,
    activeY1,
    activeY2,
    isDragging,
    dragMode,
    minCreateWidthMin,
  ]);

  const overlayBox = useMemo(() => {
    if (!displayWindow) return null;

    const left = minuteToPixel(displayWindow.startMin);
    const right = minuteToPixel(displayWindow.endMin);
    const top = valueToPixel(displayWindow.y2);
    const bottom = valueToPixel(displayWindow.y1);

    return {
      left,
      top,
      width: Math.max(2, right - left),
      height: Math.max(2, bottom - top),
    };
  }, [displayWindow]);

  const interactionCursor = useMemo(() => {
    if (isDragging) {
      if (dragMode === "move") return "grabbing";
      if (dragMode === "resize-left" || dragMode === "resize-right") return "ew-resize";
      if (dragMode === "resize-top" || dragMode === "resize-bottom") return "ns-resize";
      return "crosshair";
    }

    if (hoverMode === "move") return "grab";
    if (hoverMode === "resize-left" || hoverMode === "resize-right") return "ew-resize";
    if (hoverMode === "resize-top" || hoverMode === "resize-bottom") return "ns-resize";
    return "crosshair";
  }, [isDragging, dragMode, hoverMode]);

  const topTimeSlots = useMemo(() => {
    if (!showTopTimeAxis || !xTicks || xTicks.length < 2) return [];

    return xTicks.slice(0, -1).map((tick, idx) => {
      const nextTick = xTicks[idx + 1];
      const center = (tick + nextTick) / 2;

      return {
        center,
        label: formatClockTime(tick, timeZero),
      };
    });
  }, [showTopTimeAxis, xTicks, timeZero]);

  if (!keys.length) {
    return null;
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div className="grid grid-cols-[220px_1fr] gap-0">
        <div className="border-r pr-0">
          <div style={{ height: leftLegendTopSpacer }} />
          <div className="space-y-1">
            {keys.map((key) => {
              const color = lineColors[key] ?? "#000000";
              const marker = (lineMarkers[key] as MarkerType) ?? "circle";
              const isHidden = hiddenKeys.includes(key);

              return (
                <div
                  key={key}
                  className="flex items-center justify-between px-2 py-1 text-sm"
                  style={{
                    backgroundColor: getRowBackground(key),
                    opacity: isHidden ? 0.45 : 1,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-gray-900">
                      {lineLabels[key] ?? key}
                    </span>
                    {lineUnits[key] ? (
                      <span className="text-xs text-gray-500">{lineUnits[key]}</span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHiddenKeys((prev) =>
                        prev.includes(key)
                          ? prev.filter((k) => k !== key)
                          : [...prev, key]
                      );
                    }}
                    className="cursor-pointer transition hover:scale-105"
                    title={isHidden ? `Show ${lineLabels[key] ?? key}` : `Hide ${lineLabels[key] ?? key}`}
                  >
                    <LegendMarker color={color} marker={marker} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative" style={{ width: "100%", height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{
                top: chartMarginTop,
                right: 20,
                left: 0,
                bottom: chartMarginBottom,
              }}
            >
              <CartesianGrid stroke="#cfcfcf" vertical={false} horizontal />

              <XAxis
                type="number"
                dataKey="time"
                name="time"
                domain={[0, xEnd ?? "dataMax"]}
                ticks={xTicks}
                interval={0}
                allowDecimals={false}
                tick={false}
                axisLine={false}
                tickLine={false}
                height={0}
              />

              <YAxis
                type="number"
                dataKey="value"
                domain={domain}
                allowDataOverflow
                ticks={Array.from(
                  { length: Math.floor((domainMax - domainMin) / 25) + 1 },
                  (_, i) => domainMin + i * 25
                )}
                width={35}
              />

              <ZAxis range={[40, 40]} />

              {showTopTimeAxis &&
                topTimeSlots.map((slot) => (
                  <ReferenceLine
                    key={`top-time-${slot.center}`}
                    x={slot.center}
                    strokeOpacity={0}
                    label={{
                      value: slot.label,
                      position: "insideTop",
                      offset: 10,
                      fill: "#4b5563",
                      fontSize: 16,
                    }}
                  />
                ))}

              {(xTicks ?? []).map((tick) => (
                <ReferenceLine
                  key={`x-grid-${tick}`}
                  x={tick}
                  stroke="#b8b8b8"
                  strokeWidth={1.1}
                />
              ))}

              <ReferenceLine y={domainMin} stroke="#4b5563" strokeWidth={2.2} />

              <Tooltip labelFormatter={(label) => `Time: ${label} min`} />

              {visibleKeys.map((key) => (
                <Scatter
                  key={key}
                  name={lineLabels[key] ?? key}
                  data={buildScatterData(series[key])}
                  fill={lineColors[key] ?? "#000000"}
                  shape={(props: any) => (
                    <EpicMarker
                      cx={props.cx}
                      cy={props.cy}
                      fill={lineColors[key] ?? "#000000"}
                      marker={(lineMarkers[key] as MarkerType) ?? "circle"}
                      size={8}
                    />
                  )}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>

          <div
            ref={chartOverlayRef}
            className="absolute inset-0 z-20"
            style={{ cursor: interactionCursor }}
            onMouseDown={(e) => {
              if (effectiveXEnd <= 0) return;

              const minute = clientXToMinute(e.clientX);
              const value = clientYToValue(e.clientY);
              const hoveredMode = getHoverMode(minute, value);

              if (selectedWindow && hoveredMode) {
                const width = selectedWindow.endMin - selectedWindow.startMin;
                const heightVal = selectedWindow.y2 - selectedWindow.y1;

                if (hoveredMode === "resize-left") {
                  setIsDragging(true);
                  setDragMode("resize-left");
                  setDragCurrentMin(minute);
                  setDragCurrentY(null);
                  return;
                }

                if (hoveredMode === "resize-right") {
                  setIsDragging(true);
                  setDragMode("resize-right");
                  setDragCurrentMin(minute);
                  setDragCurrentY(null);
                  return;
                }

                if (hoveredMode === "resize-top") {
                  setIsDragging(true);
                  setDragMode("resize-top");
                  setDragCurrentY(value);
                  setDragCurrentMin(null);
                  return;
                }

                if (hoveredMode === "resize-bottom") {
                  setIsDragging(true);
                  setDragMode("resize-bottom");
                  setDragCurrentY(value);
                  setDragCurrentMin(null);
                  return;
                }

                if (hoveredMode === "move") {
                  setIsDragging(true);
                  setDragMode("move");
                  setDragCurrentMin(minute);
                  setDragCurrentY(value);
                  setMoveOffsetMin(minute - selectedWindow.startMin);
                  setMoveWindowWidthMin(width);
                  setMoveOffsetY(value - selectedWindow.y1);
                  setMoveWindowHeightY(heightVal);
                  return;
                }
              }

              setIsDragging(true);
              setDragMode("create");
              setDragStartMin(minute);
              setDragCurrentMin(minute);
              setDragCurrentY(null);
            }}
            onMouseMove={(e) => {
              const minute = clientXToMinute(e.clientX);
              const value = clientYToValue(e.clientY);

              if (!isDragging) {
                setHoverMode(getHoverMode(minute, value));
                return;
              }

              setDragCurrentMin(minute);
              setDragCurrentY(value);
            }}
            onMouseUp={(e) => {
              if (!isDragging) return;

              const minute = clientXToMinute(e.clientX);
              const value = clientYToValue(e.clientY);

              let nextWindow: SelectedWindow | null = null;

              if (dragMode === "create") {
                const start = dragStartMin ?? minute;
                const s = Math.round(Math.min(start, minute));
                const t = Math.round(Math.max(start, minute));

                if (t > s) {
                  const bounds = getWindowYBounds(series, selectedDetectVital, s, t, yDomain);
                  if (bounds) {
                    nextWindow = {
                      vital: selectedDetectVital,
                      startMin: s,
                      endMin: t,
                      y1: bounds.y1,
                      y2: bounds.y2,
                    };
                  }
                }
              }

              if (dragMode === "resize-left" && selectedWindow) {
                const s = Math.round(Math.min(minute, selectedWindow.endMin - 1));
                nextWindow = {
                  ...selectedWindow,
                  vital: selectedDetectVital,
                  startMin: Math.max(0, s),
                };
              }

              if (dragMode === "resize-right" && selectedWindow) {
                const t = Math.round(Math.max(minute, selectedWindow.startMin + 1));
                nextWindow = {
                  ...selectedWindow,
                  vital: selectedDetectVital,
                  endMin: Math.min(effectiveXEnd, t),
                };
              }

              if (dragMode === "resize-top" && selectedWindow) {
                const newY2 = Math.max(value, selectedWindow.y1 + 1);
                nextWindow = {
                  ...selectedWindow,
                  vital: selectedDetectVital,
                  y2: clampY(newY2),
                };
              }

              if (dragMode === "resize-bottom" && selectedWindow) {
                const newY1 = Math.min(value, selectedWindow.y2 - 1);
                nextWindow = {
                  ...selectedWindow,
                  vital: selectedDetectVital,
                  y1: clampY(newY1),
                };
              }

              if (dragMode === "move" && selectedWindow) {
                const newStart = Math.max(
                  0,
                  Math.min(minute - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)
                );
                const newY1 = Math.max(
                  domainMin,
                  Math.min(value - moveOffsetY, domainMax - moveWindowHeightY)
                );

                nextWindow = {
                  ...selectedWindow,
                  vital: selectedDetectVital,
                  startMin: Math.round(newStart),
                  endMin: Math.round(newStart + moveWindowWidthMin),
                  y1: newY1,
                  y2: newY1 + moveWindowHeightY,
                };
              }

              if (nextWindow) {
                onChangeSelectedWindow?.(nextWindow);
                if (dragMode === "create") {
                  onCreateEventFromWindow?.(nextWindow);
                }
              }

              setIsDragging(false);
              setDragMode(null);
              setHoverMode(null);
              setDragStartMin(null);
              setDragCurrentMin(null);
              setDragCurrentY(null);
              setMoveOffsetMin(0);
              setMoveWindowWidthMin(0);
              setMoveOffsetY(0);
              setMoveWindowHeightY(0);
            }}
            onMouseLeave={() => {
              if (!isDragging) {
                setHoverMode(null);
              }
            }}
          >
            {overlayBox && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: overlayBox.left,
                  top: overlayBox.top,
                  width: overlayBox.width,
                  height: overlayBox.height,
                  background: "rgba(250, 230, 40, 0.22)",
                  border: "4px solid #e6d200",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.95) inset",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -18,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#f97316",
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1,
                    textShadow: "0 0 3px white",
                  }}
                >
                  ◀
                </div>

                <div
                  style={{
                    position: "absolute",
                    right: -18,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#f97316",
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1,
                    textShadow: "0 0 3px white",
                  }}
                >
                  ▶
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: -6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 12,
                    height: 28,
                    borderRadius: 6,
                    background: "#f97316",
                    border: "2px solid white",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: -6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 12,
                    height: 28,
                    borderRadius: 6,
                    background: "#f97316",
                    border: "2px solid white",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -6,
                    transform: "translateX(-50%)",
                    width: 28,
                    height: 12,
                    borderRadius: 6,
                    background: "#f97316",
                    border: "2px solid white",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: -6,
                    transform: "translateX(-50%)",
                    width: 28,
                    height: 12,
                    borderRadius: 6,
                    background: "#f97316",
                    border: "2px solid white",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}