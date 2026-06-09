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
import {
  CHART_AXIS_WIDTH as AXIS_COL_WIDTH,
  CHART_LEGEND_WIDTH as LEGEND_COL_WIDTH,
  CHART_RIGHT_MARGIN as PLOT_RIGHT,
  buildChartTicks,
  getChartMajorStep,
  getChartMinorStep,
  getSharedChartGeometry,
  minuteToX,
  type TimeResolution,
} from "@/src/components/charts/chartLayout";

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
  timeResolution?: TimeResolution;
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

type HoverStats = {
  time: number;
  bpText: string;
  hr: number | null;
  spo2: number | null;
  rr: number | null;
  etco2: number | null;
  temp: number | null;
};
const EDGE_HANDLE_PX = 16;
const HANDLE_BORDER_PX = 4;
const MIN_PREVIEW_BOX_PX = 18;
const HOVER_PANEL_WIDTH = 112;

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

  const roundedBase = new Date(base);
  const roundedMinutes = Math.floor(roundedBase.getMinutes() / 15) * 15;
  roundedBase.setMinutes(roundedMinutes, 0, 0);

  const dt = new Date(roundedBase.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatHoverValue(value: number | null, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
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

function getSelectedSeriesKeys(
  series: Record<string, TimeValuePoint[] | undefined>,
  vital: DetectVital
): string[] {
  if (vital === "MAP") {
    return ["NIBP_SBP", "NIBP_DBP", "NIBP_MAP", "ARTS", "ARTD", "ARTM"].filter(
      (key) => (series[key] ?? []).length > 0
    );
  }

  if (vital === "HR") {
    return (series["HR"] ?? []).length ? ["HR"] : [];
  }

  if (vital === "SPO2") {
    return (series["SPO2 %"] ?? []).length ? ["SPO2 %"] : [];
  }

  if (vital === "RR") {
    return (series["RR"] ?? []).length ? ["RR"] : [];
  }

  if (vital === "ETCO2") {
    return ["ETCO2", "ETCO2 (mmHg)"].filter((key) => (series[key] ?? []).length > 0);
  }

  if (vital === "TEMP") {
    return [
      "TEMP",
      "TMP Bladder",
      "TMP Esophageal",
      "TMP Blood",
      "TMP Nasopharyngeal",
      "TMP Rectal",
    ].filter((key) => (series[key] ?? []).length > 0);
  }

  return [];
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
    <div className="relative border-r bg-white" style={{ width: AXIS_COL_WIDTH, height }}>
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
  height = 1000,
  yDomain,
  xEnd,
  xTicks,
  showXAxis = true,
  showTopTimeAxis = false,
  timeZero,
  embedded = false,
  timeResolution = 15,
  selectedDetectVital = "MAP",
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
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragCurrentMin, setDragCurrentMin] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);

  const [moveOffsetMin, setMoveOffsetMin] = useState<number>(0);
  const [moveWindowWidthMin, setMoveWindowWidthMin] = useState<number>(0);
  const [moveOffsetY, setMoveOffsetY] = useState<number>(0);
  const [moveWindowHeightY, setMoveWindowHeightY] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chartOverlayRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = useRef(false);

  const [sliderValue, setSliderValue] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);
  const showHorizontalSlider = maxScrollLeft > 1;
  const [scrollViewportWidth, setScrollViewportWidth] = useState(0);
  const viewConfig = useMemo(() => {
    return {
      majorStep: getChartMajorStep(timeResolution),
      minorStep: getChartMinorStep(timeResolution),
    };
  }, [timeResolution]);

  const visibleKeys = keys.filter((key) => !hiddenKeys.includes(key));
  const keysSignature = keys.join("|");

  const scatterDataByKey = useMemo(() => {
    const out: Record<string, ScatterPoint[]> = {};

    for (const key of keys) {
      out[key] = buildScatterData(series[key]);
    }

    return out;
  }, [series, keysSignature]);

  const effectiveXEnd = xEnd ?? 0;
  const domain = yDomain ?? [0, 200];
  const domainMin = domain[0];
  const domainMax = domain[1];

  const chartMarginTop = showTopTimeAxis ? 5 : 10;
  const chartMarginBottom = showXAxis ? 15 : 10;
  const leftLegendTopSpacer = showTopTimeAxis ? 50 : 0;

  const { contentWidth, plotWidth } = useMemo(
    () => getSharedChartGeometry(effectiveXEnd, timeResolution),
    [effectiveXEnd, timeResolution]
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
      setScrollViewportWidth(el.clientWidth);

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
    height,
    hiddenKeys.length,
    keys.length,
    sharedScrollLeft,
  ]);
  function minuteToPixel(minute: number) {
    return minuteToX(minute, effectiveXEnd, plotWidth);
  }

  function clampY(y: number) {
    return Math.max(domainMin, Math.min(domainMax, y));
  }

  function clampMinute(minute: number) {
    return Math.max(0, Math.min(effectiveXEnd, Math.round(minute)));
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
    if (!el || effectiveXEnd <= 0 || plotWidth <= 0) return 0;

    const rect = el.getBoundingClientRect();
    const rawX = clientX - rect.left;
    const xInPlot = Math.max(0, Math.min(rawX, plotWidth));
    return (xInPlot / plotWidth) * effectiveXEnd;
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
    if (effectiveXEnd <= 0 || plotWidth <= 0) return 0;
    return (px / plotWidth) * effectiveXEnd;
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

    const xEdgeThresholdMin = Math.max(pixelToMinute(EDGE_HANDLE_PX), 2);
    const yEdgeThresholdVal = Math.max(pixelToValue(EDGE_HANDLE_PX), 6);

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

  function resetDragState() {
    setIsDragging(false);
    setDragMode(null);
    setHoverMode(null);
    setDragStartMin(null);
    setDragStartY(null);
    setDragCurrentMin(null);
    setDragCurrentY(null);
    setMoveOffsetMin(0);
    setMoveWindowWidthMin(0);
    setMoveOffsetY(0);
    setMoveWindowHeightY(0);
  }

  function finishDrag(clientX: number, clientY: number) {
    const minute = clientXToMinute(clientX);
    const value = clientYToValue(clientY);

    let nextWindow: SelectedWindow | null = null;

    if (dragMode === "create") {
      const start = dragStartMin ?? minute;
      const startY = dragStartY ?? value;

      const s = clampMinute(Math.min(start, minute));
      const t = clampMinute(Math.max(start, minute));

      const y1 = clampY(Math.min(startY, value));
      const y2 = clampY(Math.max(startY, value));

      if (t > s && y2 > y1) {
        nextWindow = {
          vital: selectedDetectVital,
          startMin: s,
          endMin: t,
          y1,
          y2,
        };
      }
    }

    if (dragMode === "resize-left" && selectedWindow) {
      const s = Math.min(clampMinute(minute), selectedWindow.endMin - 1);
      nextWindow = {
        ...selectedWindow,
        startMin: Math.max(0, s),
      };
    }

    if (dragMode === "resize-right" && selectedWindow) {
      const t = Math.max(clampMinute(minute), selectedWindow.startMin + 1);
      nextWindow = {
        ...selectedWindow,
        endMin: Math.min(effectiveXEnd, t),
      };
    }

    if (dragMode === "resize-top" && selectedWindow) {
      const newY2 = Math.max(value, selectedWindow.y1 + 1);
      nextWindow = {
        ...selectedWindow,
        y2: clampY(newY2),
      };
    }

    if (dragMode === "resize-bottom" && selectedWindow) {
      const newY1 = Math.min(value, selectedWindow.y2 - 1);
      nextWindow = {
        ...selectedWindow,
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
        startMin: clampMinute(newStart),
        endMin: clampMinute(newStart + moveWindowWidthMin),
        y1: newY1,
        y2: newY1 + moveWindowHeightY,
      };
    }

    if (nextWindow) {
      if (dragMode === "create") {
        onCreateEventFromWindow?.(nextWindow);
      } else {
        onChangeSelectedWindow?.(nextWindow);
      }
    }

    resetDragState();
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
          selectedWindow
        ? selectedWindow.startMin
        : isDragging &&
            dragMode === "move" &&
            selectedWindow &&
            dragCurrentMin != null
          ? Math.max(
              0,
              Math.min(dragCurrentMin - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)
            )
          : selectedWindow?.startMin ?? null;

          const minPreviewWidthMin = Math.max(pixelToMinute(MIN_PREVIEW_BOX_PX), 1);

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
        ? Math.max(dragCurrentMin, selectedWindow.startMin + minPreviewWidthMin)
        : isDragging &&
            dragMode === "move" &&
            selectedWindow &&
            dragCurrentMin != null
          ? Math.max(
              0,
              Math.min(dragCurrentMin - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)
            ) + moveWindowWidthMin
          : selectedWindow?.endMin ?? null;


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
              dragStartY != null &&
              dragCurrentY != null
            ? Math.min(dragStartY, dragCurrentY)
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
              dragStartY != null &&
              dragCurrentY != null
            ? Math.max(dragStartY, dragCurrentY)
            : selectedWindow?.y2 ?? null;

  const minCreateWidthMin = 0.5;

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
  }, [highlightWindow, plotWidth, effectiveXEnd]);

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
  }, [isDragging, dragMode, dragStartMin, dragCurrentMin, selectedDetectVital, selectedWindow]);

  const windowStats = useMemo(() => {
    if (!statsWindow) return null;

    const startMin = Math.round(statsWindow.startMin);
    const endMin = Math.round(statsWindow.endMin);
    const duration = Math.round(statsWindow.endMin - statsWindow.startMin);

    const getRangeForKey = (key: string) => {
      const data = (series[key] ?? []).filter(
        (p) =>
          Number.isFinite(p.time) &&
          Number.isFinite(p.value) &&
          p.time >= statsWindow.startMin &&
          p.time <= statsWindow.endMin
      );

      if (!data.length) return null;

      const values = data.map((p) => p.value);
      return {
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };

    if (statsWindow.vital === "MAP") {
      const sbp = getRangeForKey("ARTS") ?? getRangeForKey("NIBP_SBP");
      const dbp = getRangeForKey("ARTD") ?? getRangeForKey("NIBP_DBP");
      const map = getRangeForKey("ARTM") ?? getRangeForKey("NIBP_MAP");

      return {
        vital: "MAP" as const,
        startMin,
        endMin,
        duration,
        sbp,
        dbp,
        map,
      };
    }

    const selectedKeys = getSelectedSeriesKeys(series, statsWindow.vital);
    if (!selectedKeys.length) {
      return {
        vital: statsWindow.vital,
        startMin,
        endMin,
        duration,
        min: null,
        max: null,
      };
    }

    const data = selectedKeys.flatMap((key) =>
      (series[key] ?? []).filter(
        (p) =>
          Number.isFinite(p.time) &&
          Number.isFinite(p.value) &&
          p.time >= statsWindow.startMin &&
          p.time <= statsWindow.endMin
      )
    );

    if (!data.length) {
      return {
        vital: statsWindow.vital,
        startMin,
        endMin,
        duration,
        min: null,
        max: null,
      };
    }

    const values = data.map((p) => p.value);

    return {
      vital: statsWindow.vital,
      startMin,
      endMin,
      duration,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [statsWindow, series]);

  const hoverStats = useMemo<HoverStats | null>(() => {
    if (hoverMinute == null) return null;

    const queryTime = hoverMinute;

    const sbp =
      getExactValueAtTime(series, "NIBP_SBP", queryTime) ??
      getExactValueAtTime(series, "ARTS", queryTime);

    const dbp =
      getExactValueAtTime(series, "NIBP_DBP", queryTime) ??
      getExactValueAtTime(series, "ARTD", queryTime);

    const map =
      getExactValueAtTime(series, "NIBP_MAP", queryTime) ??
      getExactValueAtTime(series, "ARTM", queryTime);

    const hr = getExactValueAtTime(series, "HR", queryTime);

    const spo2 =
      getExactValueAtTime(series, "SPO2 %", queryTime) ??
      getExactValueAtTime(series, "SPO2", queryTime);

    const rr = getExactValueAtTime(series, "RR", queryTime);

    const etco2 =
      getExactValueAtTime(series, "ETCO2", queryTime) ??
      getExactValueAtTime(series, "ETCO2 (mmHg)", queryTime);

    const temp =
      getExactValueAtTime(series, "TEMP", queryTime) ??
      getExactValueAtTime(series, "TMP Bladder", queryTime) ??
      getExactValueAtTime(series, "TMP Esophageal", queryTime) ??
      getExactValueAtTime(series, "TMP Blood", queryTime) ??
      getExactValueAtTime(series, "TMP Nasopharyngeal", queryTime) ??
      getExactValueAtTime(series, "TMP Rectal", queryTime);

    const bpText =
      sbp == null || dbp == null || map == null
        ? "-"
        : `${Math.round(sbp)}/${Math.round(dbp)} (${Math.round(map)})`;

    return {
      time: queryTime,
      bpText,
      hr,
      spo2,
      rr,
      etco2,
      temp,
    };
  }, [hoverMinute, series]);

  

  const hoverPanelPosition = useMemo(() => {
    const viewportWidth =
      scrollViewportWidth || scrollRef.current?.clientWidth || HOVER_PANEL_WIDTH + 24;
  
    return {
      left: Math.max(8, viewportWidth - HOVER_PANEL_WIDTH - 8),
      top: showTopTimeAxis ? 28 : chartMarginTop + 8,
    };
  }, [scrollViewportWidth, showTopTimeAxis, chartMarginTop]);

  const overlayBox = useMemo(() => {
    if (!displayWindow) return null;

    const left = Math.round(minuteToPixel(displayWindow.startMin));
    const right = Math.round(minuteToPixel(displayWindow.endMin));
    const top = Math.round(valueToPixel(displayWindow.y2));
    const bottom = Math.round(valueToPixel(displayWindow.y1));

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }, [displayWindow, plotWidth, effectiveXEnd, chartMarginTop, chartMarginBottom, domainMin, domainMax]);

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

  useEffect(() => {
    function handleWindowMouseMove(e: MouseEvent) {
      if (!chartOverlayRef.current) return;

      const minute = clientXToMinute(e.clientX);
      const value = clientYToValue(e.clientY);

      if (!isDragging) {
        setHoverMode(getHoverMode(minute, value));
        setHoverMinute(minute);
        return;
      }

      setDragCurrentMin(minute);
      setDragCurrentY(value);
    }

    function handleWindowMouseUp(e: MouseEvent) {
      if (!isDragging) return;
      finishDrag(e.clientX, e.clientY);
    }

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [
    isDragging,
    dragMode,
    dragStartMin,
    dragStartY,
    moveOffsetMin,
    moveWindowWidthMin,
    moveOffsetY,
    moveWindowHeightY,
    selectedWindow,
    selectedDetectVital,
    effectiveXEnd,
    domainMin,
    domainMax,
    onChangeSelectedWindow,
    onCreateEventFromWindow,
  ]);

  const minorGridTicks = useMemo(() => {
    if (!effectiveXEnd || effectiveXEnd <= 0) return [];
    return buildChartTicks(effectiveXEnd, viewConfig.minorStep);
  }, [effectiveXEnd, viewConfig.minorStep]);

  const majorGridTicks = useMemo(() => {
    if (!effectiveXEnd || effectiveXEnd <= 0) return [];

    if (timeResolution === 15 && xTicks && xTicks.length > 0) {
      return xTicks;
    }

    return buildChartTicks(effectiveXEnd, viewConfig.majorStep);
  }, [timeResolution, xTicks, effectiveXEnd, viewConfig.majorStep]);

  const yTicks = useMemo(
    () =>
      Array.from(
        { length: Math.floor((domainMax - domainMin) / 25) + 1 },
        (_, i) => domainMin + i * 25
      ),
    [domainMin, domainMax]
  );

  if (!keys.length) return null;
  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      <style jsx>{`
        .vital-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
  
        .vital-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
  
        .vital-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }
  
        .vital-slider:focus {
          outline: none;
        }
  
        .vital-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }
  
        .vital-slider::-webkit-slider-thumb {
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
  
        .vital-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }
  
        .vital-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }
  
        .vital-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }
  
        .vital-slider:hover::-moz-range-thumb {
          background: #475569;
        }
      `}</style>     {!embedded && title ? <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3> : null}

      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0, 1fr)`,
        }}
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
                    <span className="truncate text-gray-900">
                      {lineLabels[key] ?? key}
                    </span>
                    {lineUnits[key] ? (
                      <span className="text-xs text-gray-500">
                        {lineUnits[key]}
                      </span>
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
                    title={
                      isHidden
                        ? `Show ${lineLabels[key] ?? key}`
                        : `Hide ${lineLabels[key] ?? key}`
                    }
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
<div className="relative min-w-0">
  <div
    ref={scrollRef}
    className="vital-scroll-hidden"
    style={{ overscrollBehaviorX: "none" }}
    onWheel={(e) => {
      const el = e.currentTarget;
    
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
    
      if (absY >= absX) {
        return;
      }
    
      const delta = e.deltaX;
      if (Math.abs(delta) < 1) return;
    
      const maxScroll = el.scrollWidth - el.clientWidth;
      const nextLeft = el.scrollLeft + delta;
    
      const atLeftEdge = el.scrollLeft <= 0;
      const atRightEdge = el.scrollLeft >= maxScroll - 1;
    
      const tryingGoPastLeft = atLeftEdge && delta < 0;
      const tryingGoPastRight = atRightEdge && delta > 0;
    
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
            domain={[0, effectiveXEnd]}
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
            <ReferenceLine key={`x-minor-${tick}`} x={tick} stroke="#d7dbe2" strokeWidth={0.9} />
          ))}

          {majorGridTicks.map((tick) => (
            <ReferenceLine key={`x-major-${tick}`} x={tick} stroke="#9aa3b2" strokeWidth={1.4} />
          ))}

          {yTicks.map((tick) => (
            <ReferenceLine key={`y-grid-${tick}`} y={tick} stroke="#b0b7c3" strokeWidth={1.1} />
          ))}

          <ReferenceLine y={domainMin} stroke="#4b5563" strokeWidth={2.2} />

          {visibleKeys.map((key) => (
            <Scatter
              key={key}
              name={lineLabels[key] ?? key}
              data={scatterDataByKey[key] ?? []}
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
        className="absolute z-20"
        style={{
          left: 0,
          top: 0,
          width: contentWidth,
          height,
          cursor: interactionCursor,
          overflow: "visible",
        }}
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
          setDragStartY(value);
          setDragCurrentMin(minute);
          setDragCurrentY(value);
        }}
        onMouseLeave={() => {
          if (!isDragging) {
            setHoverMode(null);
            setHoverMinute(null);
          }
        }}
      >
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
              overflow: "visible",
              zIndex: 40,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxSizing: "border-box",
                background: "rgba(250, 230, 40, 0.22)",
                border: `${HANDLE_BORDER_PX}px solid #e6d200`,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.95) inset",
                willChange: "left, top, width, height",
                transform: "translateZ(0)",
              }}
            />

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

  {hoverStats && !isDragging && (
    <div
      className="pointer-events-none absolute rounded-md border border-gray-200 px-1.5 py-1 text-[10px] shadow"
      style={{
        left: hoverPanelPosition.left,
        top: hoverPanelPosition.top,
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.62)",
        color: "#111827",
        lineHeight: 1.22,
        width: "max-content",
        minWidth: 104,
        maxWidth: HOVER_PANEL_WIDTH,
        backdropFilter: "blur(2px)",
      }}
    >
      <div className="mb-0.5 font-semibold">
        Time: {formatClockTime(hoverStats.time, timeZero)}
      </div>
      <div>BP: {hoverStats.bpText}</div>
      <div>HR: {formatHoverValue(hoverStats.hr, 0)}</div>
      <div>SpO2: {formatHoverValue(hoverStats.spo2, 0)}</div>
      <div>RR: {formatHoverValue(hoverStats.rr, 0)}</div>
      <div>ETCO2: {formatHoverValue(hoverStats.etco2, 0)}</div>
      <div>TEMP: {formatHoverValue(hoverStats.temp, 1)}</div>
    </div>
  )}
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
      className="vital-slider"
      aria-label="Vital chart horizontal scroll"
    />
  </div>
)}

</div>

      </div>
    </div>
  );
}

   
