"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ZAxis,
  ReferenceLine,
} from "recharts";
import type { TimeValuePoint } from "@/lib/types";

import type { DetectVital } from "./annotation/types";
type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type HighlightWindow = {
  startMin: number;
  endMin: number;
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
  highlightWindow?: HighlightWindow | null;
  onChangeSelectedWindow?: (window: SelectedWindow | null) => void;
  onCreateEventFromWindow?: (window: SelectedWindow) => void;

  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;
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

const LEGEND_COL_WIDTH = 220;
const AXIS_COL_WIDTH = 42;
const PLOT_RIGHT = 20;
const PX_PER_15_MIN = 64;
const PX_PER_MIN = PX_PER_15_MIN / 15;

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
  if (key === "ARTS" || key === "ARTD" || key === "ARTM" || key === "NIBP_MAP") {
    return "#ffdede";
  }
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
    if ((series["NIBP_MAP"] ?? []).length) return "NIBP_MAP";
    if ((series["ARTM"] ?? []).length) return "ARTM";
    return null;
  }
  if (vital === "HR") return (series["HR"] ?? []).length ? "HR" : null;
  if (vital === "SPO2") return (series["SPO2 %"] ?? []).length ? "SPO2 %" : null;
  if (vital === "RR") return (series["RR"] ?? []).length ? "RR" : null;
  if (vital === "ETCO2") {
    if ((series["ETCO2"] ?? []).length) return "ETCO2";
    if ((series["ETCO2 (mmHg)"] ?? []).length) return "ETCO2 (mmHg)";
    return null;
  }
  if (vital === "TEMP") {
    if ((series["TEMP"] ?? []).length) return "TEMP";
    if ((series["TMP Bladder"] ?? []).length) return "TMP Bladder";
    if ((series["TMP Esophageal"] ?? []).length) return "TMP Esophageal";
    if ((series["TMP Blood"] ?? []).length) return "TMP Blood";
    if ((series["TMP Nasopharyngeal"] ?? []).length) return "TMP Nasopharyngeal";
    if ((series["TMP Rectal"] ?? []).length) return "TMP Rectal";
    return null;
  }
  return null;
}

function getExactValueAtTime(
  series: Record<string, TimeValuePoint[] | undefined>,
  key: string,
  time: number
): number | null {
  const arr = series[key] ?? [];
  if (!arr.length) return null;

  let best: TimeValuePoint | null = null;
  let bestDist = Infinity;

  for (const p of arr) {
    if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
    const d = Math.abs(p.time - time);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }

  return best ? best.value : null;
}

function getNearestPointTime(
  series: Record<string, TimeValuePoint[] | undefined>,
  vital: DetectVital,
  targetTime: number
): number | null {
  if (vital === "MAP") {
    const mapSeries = series["NIBP_MAP"] ?? series["ARTM"] ?? [];
    if (!mapSeries.length) return null;

    let best: TimeValuePoint | null = null;
    let bestDist = Infinity;

    for (const p of mapSeries) {
      if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
      const d = Math.abs(p.time - targetTime);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }

    return best ? best.time : null;
  }

  const key = getSelectedSeriesKey(series, vital);
  if (!key) return null;

  const arr = series[key] ?? [];
  if (!arr.length) return null;

  let best: TimeValuePoint | null = null;
  let bestDist = Infinity;

  for (const p of arr) {
    if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
    const d = Math.abs(p.time - targetTime);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }

  return best ? best.time : null;
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

function FixedYAxis({
  ticks,
  height,
  domainMin,
  domainMax,
  chartMarginTop,
  chartMarginBottom,
}: {
  ticks: number[];
  height: number;
  domainMin: number;
  domainMax: number;
  chartMarginTop: number;
  chartMarginBottom: number;
}) {
  const plotHeight = Math.max(1, height - chartMarginTop - chartMarginBottom);

  return (
    <div
      className="relative border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    >
      {ticks.map((tick) => {
        const ratio = (domainMax - tick) / (domainMax - domainMin);
        const top = chartMarginTop + ratio * plotHeight;

        return (
          <div
            key={tick}
            className="absolute right-1 -translate-y-1/2 text-[11px] text-gray-600"
            style={{ top }}
          >
            {tick}
          </div>
        );
      })}
    </div>
  );
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
  highlightWindow = null,
  onChangeSelectedWindow,
  onCreateEventFromWindow,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: VitalChartProps) {
  const keys = Object.keys(series).filter((key) =>
    (series[key] ?? []).some((x) => Number.isFinite(x.value))
  );

  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [hoverMode, setHoverMode] = useState<DragMode>(null);
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);

  const [dragStartMin, setDragStartMin] = useState<number | null>(null);
  const [dragCurrentMin, setDragCurrentMin] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);

  const [moveOffsetMin, setMoveOffsetMin] = useState<number>(0);
  const [moveWindowWidthMin, setMoveWindowWidthMin] = useState<number>(0);
  const [moveOffsetY, setMoveOffsetY] = useState<number>(0);
  const [moveWindowHeightY, setMoveWindowHeightY] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chartOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
    }
  }, [sharedScrollLeft]);

  const visibleKeys = keys.filter((key) => !hiddenKeys.includes(key));
  const effectiveXEnd = xEnd ?? 0;
  const domain = yDomain ?? [0, 200];
  const domainMin = domain[0];
  const domainMax = domain[1];

  const chartMarginTop = showTopTimeAxis ? 5 : 10;
  const chartMarginBottom = showXAxis ? 15 : 10;
  const leftLegendTopSpacer = showTopTimeAxis ? 50 : 0;

  const contentPlotWidth = useMemo(() => {
    if (effectiveXEnd <= 0) return 800;
    return Math.max(800, Math.ceil(effectiveXEnd * PX_PER_MIN));
  }, [effectiveXEnd]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;
  const plotWidth = contentWidth - PLOT_RIGHT;

  function minuteToPixel(minute: number) {
    if (!effectiveXEnd || effectiveXEnd <= 0) return 0;
    return (minute / effectiveXEnd) * plotWidth;
  }

  function clampY(y: number) {
    return Math.max(domainMin, Math.min(domainMax, y));
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
    const xInPlot = clientX - rect.left;
    const minute = xInPlot / PX_PER_MIN;

    return Math.max(0, Math.min(effectiveXEnd, minute));
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
    return px / PX_PER_MIN;
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

    const xEdgeThresholdMin = Math.max(pixelToMinute(16), 2);
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

  const minCreateWidthMin = Math.max(pixelToMinute(10), 2);

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
      vital: selectedDetectVital,
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
    selectedDetectVital,
  ]);

  const highlightWindowBox = useMemo(() => {
    if (!highlightWindow) return null;

    const left = minuteToPixel(highlightWindow.startMin);
    const right = minuteToPixel(highlightWindow.endMin);

    return {
      left,
      width: Math.max(2, right - left),
    };
  }, [highlightWindow]);

  const statsWindow = useMemo(() => {
    if (isDragging && dragMode === "create" && dragStartMin != null && dragCurrentMin != null) {
      return {
        vital: selectedDetectVital,
        startMin: Math.min(dragStartMin, dragCurrentMin),
        endMin: Math.max(dragStartMin, dragCurrentMin),
      };
    }

    if (selectedWindow) {
      return {
        vital: selectedWindow.vital,
        startMin: selectedWindow.startMin,
        endMin: selectedWindow.endMin,
      };
    }

    return null;
  }, [
    isDragging,
    dragMode,
    dragStartMin,
    dragCurrentMin,
    selectedDetectVital,
    selectedWindow,
  ]);

  const windowStats = useMemo(() => {
    if (!statsWindow) return null;

    const selectedKey = getSelectedSeriesKey(series, statsWindow.vital);
    if (!selectedKey) return null;

    const data = (series[selectedKey] ?? []).filter(
      (p) =>
        Number.isFinite(p.time) &&
        Number.isFinite(p.value) &&
        p.time >= statsWindow.startMin &&
        p.time <= statsWindow.endMin
    );

    if (!data.length) {
      return {
        startMin: Math.round(statsWindow.startMin),
        endMin: Math.round(statsWindow.endMin),
        duration: Math.round(statsWindow.endMin - statsWindow.startMin),
        min: null,
        max: null,
      };
    }

    const values = data.map((p) => p.value);

    return {
      startMin: Math.round(statsWindow.startMin),
      endMin: Math.round(statsWindow.endMin),
      duration: Math.round(statsWindow.endMin - statsWindow.startMin),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [statsWindow, series]);

  const hoverStats = useMemo(() => {
    if (hoverMinute == null) return null;

    const snappedTime = getNearestPointTime(series, selectedDetectVital, hoverMinute);
    if (snappedTime == null) return null;

    if (selectedDetectVital === "MAP") {
      const sbp =
        getExactValueAtTime(series, "NIBP_SBP", snappedTime) ??
        getExactValueAtTime(series, "ARTS", snappedTime);

      const dbp =
        getExactValueAtTime(series, "NIBP_DBP", snappedTime) ??
        getExactValueAtTime(series, "ARTD", snappedTime);

      const map =
        getExactValueAtTime(series, "NIBP_MAP", snappedTime) ??
        getExactValueAtTime(series, "ARTM", snappedTime);

      return {
        time: snappedTime,
        text:
          sbp == null || dbp == null || map == null
            ? "BP: -"
            : `BP: ${Math.round(sbp)}/${Math.round(dbp)} (${Math.round(map)})`,
      };
    }

    const key = getSelectedSeriesKey(series, selectedDetectVital);
    if (!key) return null;

    const value = getExactValueAtTime(series, key, snappedTime);

    return {
      time: snappedTime,
      text: value == null ? "Value: -" : `Value: ${value.toFixed(1)}`,
    };
  }, [hoverMinute, series, selectedDetectVital]);

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

  const minorGridTicks = useMemo(() => {
    if (!effectiveXEnd || effectiveXEnd <= 0) return [];
    const ticks: number[] = [];
    for (let t = 0; t <= effectiveXEnd; t += 5) {
      ticks.push(t);
    }
    if (ticks[ticks.length - 1] !== effectiveXEnd) {
      ticks.push(effectiveXEnd);
    }
    return ticks;
  }, [effectiveXEnd]);

  const majorGridTicks = useMemo(() => {
    if (xTicks && xTicks.length > 0) return xTicks;

    if (!effectiveXEnd || effectiveXEnd <= 0) return [];
    const ticks: number[] = [];
    for (let t = 0; t <= effectiveXEnd; t += 15) {
      ticks.push(t);
    }
    if (ticks[ticks.length - 1] !== effectiveXEnd) {
      ticks.push(effectiveXEnd);
    }
    return ticks;
  }, [xTicks, effectiveXEnd]);

  const yTicks = useMemo(
    () =>
      Array.from(
        { length: Math.floor((domainMax - domainMin) / 25) + 1 },
        (_, i) => domainMin + i * 25
      ),
    [domainMin, domainMax]
  );

  if (!keys.length) {
    return null;
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3> : null}

      <div
        className="grid gap-0"
        style={{ gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0, 1fr)` }}
      >
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
                    <span className="truncate text-gray-900">{lineLabels[key] ?? key}</span>
                    {lineUnits[key] ? <span className="text-xs text-gray-500">{lineUnits[key]}</span> : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHiddenKeys((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
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

        <FixedYAxis
          ticks={yTicks}
          height={height}
          domainMin={domainMin}
          domainMax={domainMax}
          chartMarginTop={chartMarginTop}
          chartMarginBottom={chartMarginBottom}
        />

        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden"
          style={{ height }}
          onScroll={(e) => {
            onSharedScrollLeftChange?.(e.currentTarget.scrollLeft);
          }}
        >
          <div className="relative" style={{ width: contentWidth, height }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{
                  top: chartMarginTop,
                  right: PLOT_RIGHT,
                  left: 0,
                  bottom: chartMarginBottom,
                }}
              >
                <CartesianGrid stroke="transparent" vertical={false} horizontal={false} />

                <XAxis
                  type="number"
                  dataKey="time"
                  name="time"
                  domain={[0, xEnd ?? "dataMax"]}
                  ticks={majorGridTicks}
                  interval={0}
                  allowDecimals={false}
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                  height={0}
                />

                <YAxis hide type="number" dataKey="value" domain={domain} allowDataOverflow />
                <ZAxis range={[40, 40]} />

                {minorGridTicks.map((tick) => (
                  <ReferenceLine
                    key={`x-minor-${tick}`}
                    x={tick}
                    stroke="#d7dbe2"
                    strokeWidth={0.9}
                  />
                ))}

                {majorGridTicks.map((tick) => (
                  <ReferenceLine
                    key={`x-major-${tick}`}
                    x={tick}
                    stroke="#9aa3b2"
                    strokeWidth={1.4}
                  />
                ))}

                {yTicks.map((tick) => (
                  <ReferenceLine
                    key={`y-grid-${tick}`}
                    y={tick}
                    stroke="#b0b7c3"
                    strokeWidth={1.1}
                  />
                ))}

                <ReferenceLine y={domainMin} stroke="#4b5563" strokeWidth={2.2} />

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

            {showTopTimeAxis && (
              <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 h-8">
                {majorGridTicks.map((tick, idx) => {
                  const left = minuteToPixel(tick);
                  const isFirst = idx === 0;
                  const isLast = idx === majorGridTicks.length - 1;

                  return (
                    <div
                      key={`top-tick-${tick}`}
                      className="absolute top-0 whitespace-nowrap text-xs text-gray-700"
                      style={{
                        left,
                        transform: isFirst
                          ? "translateX(0)"
                          : isLast
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                      }}
                    >
                      {formatClockTime(tick, timeZero)}
                    </div>
                  );
                })}
              </div>
            )}

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
                  setHoverMinute(minute);
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
                    vital: selectedWindow.vital,
                    startMin: Math.max(0, s),
                  };
                }

                if (dragMode === "resize-right" && selectedWindow) {
                  const t = Math.round(Math.max(minute, selectedWindow.startMin + 1));
                  nextWindow = {
                    ...selectedWindow,
                    vital: selectedWindow.vital,
                    endMin: Math.min(effectiveXEnd, t),
                  };
                }

                if (dragMode === "resize-top" && selectedWindow) {
                  const newY2 = Math.max(value, selectedWindow.y1 + 1);
                  nextWindow = {
                    ...selectedWindow,
                    vital: selectedWindow.vital,
                    y2: clampY(newY2),
                  };
                }

                if (dragMode === "resize-bottom" && selectedWindow) {
                  const newY1 = Math.min(value, selectedWindow.y2 - 1);
                  nextWindow = {
                    ...selectedWindow,
                    vital: selectedWindow.vital,
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
                    vital: selectedWindow.vital,
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
                  setHoverMinute(null);
                }
              }}
            >
              {hoverStats && !isDragging && (
                <div
                  className="pointer-events-none absolute rounded-md border bg-white px-3 py-2 text-xs shadow"
                  style={{
                    left: Math.min(minuteToPixel(hoverStats.time) + 8, contentWidth - 220),
                    top: chartMarginTop + 8,
                    zIndex: 1000,
                    color: "#111827",
                    lineHeight: 1.35,
                    maxWidth: 200,
                  }}
                >
                  <div className="font-semibold">
                    Time: {formatClockTime(hoverStats.time, timeZero)}
                  </div>
                  <div>{hoverStats.text}</div>
                </div>
              )}

              {windowStats && (
                <div
                  className="pointer-events-none absolute rounded-md border bg-white px-2 py-1 text-xs shadow"
                  style={{
                    left: 8,
                    top: 40,
                    zIndex: 999,
                    color: "#111827",
                    lineHeight: 1.35,
                  }}
                >
                  <div>Start: {formatClockTime(windowStats.startMin, timeZero)}</div>
                  <div>End: {formatClockTime(windowStats.endMin, timeZero)}</div>
                  <div>Dur: {windowStats.duration} min</div>
                  <div>Min: {windowStats.min == null ? "-" : windowStats.min.toFixed(1)}</div>
                  <div>Max: {windowStats.max == null ? "-" : windowStats.max.toFixed(1)}</div>
                </div>
              )}

              {highlightWindowBox && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: highlightWindowBox.left,
                    top: chartMarginTop,
                    width: highlightWindowBox.width,
                    height: `calc(100% - ${chartMarginTop + chartMarginBottom}px)`,
                    background: "lightblue",
                    opacity: 0.45,
                    border: "none",
                  }}
                />
              )}

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
    </div>
  );
}