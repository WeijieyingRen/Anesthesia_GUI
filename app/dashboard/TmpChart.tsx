"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
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

type TmpChartProps = {
  title?: string;
  tmp: Record<string, TimeValuePoint[]>;
  height?: number;
  xEnd: number;
  xTicks: number[];
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;

  selectedWindow?: SelectedWindow | null;
  onChangeSelectedWindow?: (window: SelectedWindow | null) => void;
  onCreateEventFromWindow?: (window: SelectedWindow) => void;

  /** 用来和 Vital 做 scroll 同步，可选 */
  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;
};

type MarkerType =
  | "circle"
  | "square"
  | "diamond"
  | "triangle"
  | "triangle-down"
  | "x"
  | "plus"
  | "ring";

type TmpFeatureConfig = {
  key: string;
  label: string;
  unit: string;
  color: string;
  marker: MarkerType;
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

/** 必须和 VitalChart 保持一致 */
const PX_PER_15_MIN = 64;
const PX_PER_MIN = PX_PER_15_MIN / 15;

const TMP_FEATURES: TmpFeatureConfig[] = [
  {
    key: "TMP Bladder",
    label: "Tbladder",
    unit: "°C",
    color: "#c9c46b",
    marker: "x",
  },
  {
    key: "TMP Esophageal",
    label: "Tesoph",
    unit: "°C",
    color: "#8f1bb3",
    marker: "plus",
  },
  {
    key: "TMP Blood",
    label: "Tblood",
    unit: "°C",
    color: "#a31212",
    marker: "diamond",
  },
  {
    key: "TMP Rectal",
    label: "Trectal",
    unit: "°C",
    color: "#5d6f1f",
    marker: "ring",
  },
  {
    key: "TMP Nasopharyngeal",
    label: "Tnaso",
    unit: "°C",
    color: "#c98c72",
    marker: "square",
  },
];

const TMP_KEY_ALIASES: Record<string, string[]> = {
  "TMP Bladder": ["TMP Bladder", "Tbladder", "Temperature - Bladder"],
  "TMP Esophageal": ["TMP Esophageal", "Tesoph", "Temperature - Esophageal"],
  "TMP Blood": ["TMP Blood", "Tblood", "Temperature - Blood"],
  "TMP Rectal": ["TMP Rectal", "Trectal", "Tart", "Temperature - Rectal"],
  "TMP Nasopharyngeal": [
    "TMP Nasopharyngeal",
    "Tnaso",
    "Temperature - Nasopharyngeal",
  ],
};

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero) return String(offsetMin);

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return String(offsetMin);

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function pSafe(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getFeatureSeries(
  tmp: Record<string, TimeValuePoint[]>,
  featureKey: string
): TimeValuePoint[] {
  const aliases = TMP_KEY_ALIASES[featureKey] ?? [featureKey];
  for (const name of aliases) {
    if ((tmp[name] ?? []).length > 0) {
      return tmp[name];
    }
  }
  return [];
}

function getHighestPriorityFeature(
  tmp: Record<string, TimeValuePoint[]>
): TmpFeatureConfig | null {
  for (const feature of TMP_FEATURES) {
    if (getFeatureSeries(tmp, feature.key).length > 0) {
      return feature;
    }
  }
  return null;
}

function buildChartRowsForActiveFeature(
  tmp: Record<string, TimeValuePoint[]>,
  xTicks: number[],
  activeFeatureKey: string
): Array<Record<string, number | null>> {
  const allTimes = new Set<number>(xTicks);

  const arr = getFeatureSeries(tmp, activeFeatureKey);
  arr.forEach((p) => {
    if (Number.isFinite(p.time)) allTimes.add(p.time);
  });

  const sortedTimes = Array.from(allTimes)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  return sortedTimes.map((time) => {
    const row: Record<string, number | null> = { time };
    const matched = arr.find((p) => p.time === time);
    row[activeFeatureKey] = matched ? pSafe(matched.value) : null;
    return row;
  });
}

function renderMarkerShape(
  cx: number,
  cy: number,
  color: string,
  marker: MarkerType,
  active = false
) {
  const size = active ? 6 : 4.5;
  const strokeWidth = active ? 2.2 : 1.8;

  switch (marker) {
    case "circle":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={size}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );

    case "square":
      return (
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );

    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
          fill="white"
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );

    case "triangle":
      return (
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy + size} ${cx - size},${cy + size}`}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );

    case "triangle-down":
      return (
        <polygon
          points={`${cx - size},${cy - size} ${cx + size},${cy - size} ${cx},${cy + size}`}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );

    case "x":
      return (
        <g stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <line x1={cx - size} y1={cy - size} x2={cx + size} y2={cy + size} />
          <line x1={cx + size} y1={cy - size} x2={cx - size} y2={cy + size} />
        </g>
      );

    case "plus":
      return (
        <g stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <line x1={cx - size} y1={cy} x2={cx + size} y2={cy} />
          <line x1={cx} y1={cy - size} x2={cx} y2={cy + size} />
        </g>
      );

    case "ring":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={size}
          fill="white"
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );

    default:
      return (
        <circle
          cx={cx}
          cy={cy}
          r={size}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      );
  }
}

function CustomDot({ cx, cy, stroke, payload, dataKey, marker }: any) {
  if (cx == null || cy == null || !stroke || dataKey == null || payload?.[dataKey] == null) {
    return null;
  }
  return renderMarkerShape(cx, cy, stroke, marker, false);
}

function CustomActiveDot({ cx, cy, stroke, payload, dataKey, marker }: any) {
  if (cx == null || cy == null || !stroke || dataKey == null || payload?.[dataKey] == null) {
    return null;
  }
  return renderMarkerShape(cx, cy, stroke, marker, true);
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
        {renderMarkerShape(6, 6, "#ffffff", marker, true)}
      </svg>
    </span>
  );
}

function TmpLegend({
  activeFeatureKey,
}: {
  activeFeatureKey: string;
}) {
  return (
    <div className="space-y-1">
      {TMP_FEATURES.map((feature) => {
        const active = feature.key === activeFeatureKey;

        return (
          <div
            key={feature.key}
            className="flex items-center justify-between px-2 py-1 text-sm"
            style={{
              backgroundColor: active ? "#e7f0ff" : "#efefef",
            }}
          >
            <div className="min-w-0 truncate text-gray-900">
              {feature.label}
              <span className="ml-1 text-xs text-gray-500">{feature.unit}</span>
            </div>

            <LegendMarker color={feature.color} marker={feature.marker} />
          </div>
        );
      })}
    </div>
  );
}

function getNearestPointTime(arr: TimeValuePoint[], targetTime: number): number | null {
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

function getExactValueAtTime(arr: TimeValuePoint[], time: number): number | null {
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

  return best ? pSafe(best.value) : null;
}

function getWindowYBoundsForTmp(
  arr: TimeValuePoint[],
  startMin: number,
  endMin: number
): { y1: number; y2: number } | null {
  const data = arr.filter(
    (p) =>
      Number.isFinite(p.time) &&
      Number.isFinite(p.value) &&
      p.time >= startMin &&
      p.time <= endMin
  );

  const domainMin = 32;
  const domainMax = 40;
  const domainRange = domainMax - domainMin;

  if (!data.length) {
    const center = 36;
    const half = Math.max(domainRange * 0.12, 0.6);
    return {
      y1: Math.max(domainMin, center - half),
      y2: Math.min(domainMax, center + half),
    };
  }

  const values = data.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  const center = (minV + maxV) / 2;
  const rawHeight = Math.max(maxV - minV, 0.1);
  const finalHeight = Math.max(rawHeight * 1.8, 1.2);

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

export default function TmpChart({
  title = "",
  tmp,
  height = 220,
  xEnd,
  xTicks,
  showXAxis = false,
  timeZero = null,
  embedded = false,
  selectedWindow = null,
  onChangeSelectedWindow,
  onCreateEventFromWindow,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: TmpChartProps) {
  const activeFeature = React.useMemo(() => getHighestPriorityFeature(tmp), [tmp]);
  const activeFeatureKey = activeFeature?.key ?? "";

  const activeSeries = React.useMemo(
    () => (activeFeature ? getFeatureSeries(tmp, activeFeature.key) : []),
    [tmp, activeFeature]
  );

  const data = React.useMemo(() => {
    if (!activeFeatureKey) return [];
    return buildChartRowsForActiveFeature(tmp, xTicks, activeFeatureKey);
  }, [tmp, xTicks, activeFeatureKey]);

  const chartMarginTop = 10;
  const chartMarginBottom = showXAxis ? 24 : 10;

  const domainMin = 32;
  const domainMax = 40;
  const yTicks = [32, 33, 34, 35, 36, 37, 38, 39, 40];

  const effectiveXEnd = xEnd ?? 0;

  const contentPlotWidth = React.useMemo(() => {
    if (effectiveXEnd <= 0) return 800;
    return Math.max(800, Math.ceil(effectiveXEnd * PX_PER_MIN));
  }, [effectiveXEnd]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;

  const majorGridTicks = React.useMemo(() => {
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

  const minorGridTicks = React.useMemo(() => {
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

  const tmpWindow = selectedWindow?.vital === "TEMP" ? selectedWindow : null;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const chartOverlayRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
    }
  }, [sharedScrollLeft]);

  const [isDragging, setIsDragging] = React.useState(false);
  const [dragMode, setDragMode] = React.useState<DragMode>(null);
  const [hoverMode, setHoverMode] = React.useState<DragMode>(null);
  const [hoverMinute, setHoverMinute] = React.useState<number | null>(null);

  const [dragStartMin, setDragStartMin] = React.useState<number | null>(null);
  const [dragCurrentMin, setDragCurrentMin] = React.useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = React.useState<number | null>(null);

  const [moveOffsetMin, setMoveOffsetMin] = React.useState<number>(0);
  const [moveWindowWidthMin, setMoveWindowWidthMin] = React.useState<number>(0);
  const [moveOffsetY, setMoveOffsetY] = React.useState<number>(0);
  const [moveWindowHeightY, setMoveWindowHeightY] = React.useState<number>(0);

  function clampY(y: number) {
    return Math.max(domainMin, Math.min(domainMax, y));
  }

  function minuteToPixel(minute: number) {
    return minute * PX_PER_MIN;
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
    if (!tmpWindow) return null;

    const xEdgeThresholdMin = Math.max(pixelToMinute(16), 2);
    const yEdgeThresholdVal = Math.max(pixelToValue(16), 0.25);

    const { startMin, endMin, y1, y2 } = tmpWindow;

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
        tmpWindow &&
        dragCurrentMin != null
      ? Math.min(dragCurrentMin, tmpWindow.endMin - 1)
      : isDragging &&
        dragMode === "resize-right" &&
        tmpWindow &&
        dragCurrentMin != null
      ? Math.max(dragCurrentMin, tmpWindow.startMin + 1)
      : isDragging &&
        dragMode === "move" &&
        tmpWindow &&
        dragCurrentMin != null
      ? Math.max(0, Math.min(dragCurrentMin - moveOffsetMin, effectiveXEnd - moveWindowWidthMin))
      : tmpWindow?.startMin ?? null;

  const activeEndMin =
    isDragging && dragMode === "create" && dragStartMin != null && dragCurrentMin != null
      ? Math.max(dragStartMin, dragCurrentMin)
      : isDragging && dragMode === "resize-left" && tmpWindow
      ? tmpWindow.endMin
      : isDragging &&
        dragMode === "resize-right" &&
        tmpWindow &&
        dragCurrentMin != null
      ? Math.max(dragCurrentMin, tmpWindow.startMin + 1)
      : isDragging &&
        dragMode === "move" &&
        tmpWindow &&
        dragCurrentMin != null
      ? Math.max(0, Math.min(dragCurrentMin - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)) +
        moveWindowWidthMin
      : tmpWindow?.endMin ?? null;

  const autoCreateYBounds = React.useMemo(() => {
    if (
      !isDragging ||
      dragMode !== "create" ||
      activeStartMin == null ||
      activeEndMin == null ||
      activeSeries.length === 0
    ) {
      return null;
    }

    return getWindowYBoundsForTmp(activeSeries, activeStartMin, activeEndMin);
  }, [isDragging, dragMode, activeStartMin, activeEndMin, activeSeries]);

  const activeY1 =
    isDragging &&
    dragMode === "move" &&
    tmpWindow &&
    dragCurrentY != null
      ? clampY(
          Math.max(
            domainMin,
            Math.min(dragCurrentY - moveOffsetY, domainMax - moveWindowHeightY)
          )
        )
      : isDragging &&
        dragMode === "resize-bottom" &&
        tmpWindow &&
        dragCurrentY != null
      ? Math.min(clampY(dragCurrentY), tmpWindow.y2 - 0.1)
      : isDragging &&
        dragMode === "resize-top" &&
        tmpWindow
      ? tmpWindow.y1
      : isDragging &&
        dragMode === "create" &&
        autoCreateYBounds
      ? autoCreateYBounds.y1
      : tmpWindow?.y1 ?? null;

  const activeY2 =
    isDragging &&
    dragMode === "move" &&
    tmpWindow &&
    dragCurrentY != null
      ? clampY(
          Math.max(
            domainMin,
            Math.min(dragCurrentY - moveOffsetY, domainMax - moveWindowHeightY)
          )
        ) + moveWindowHeightY
      : isDragging &&
        dragMode === "resize-top" &&
        tmpWindow &&
        dragCurrentY != null
      ? Math.max(clampY(dragCurrentY), tmpWindow.y1 + 0.1)
      : isDragging &&
        dragMode === "resize-bottom" &&
        tmpWindow
      ? tmpWindow.y2
      : isDragging &&
        dragMode === "create" &&
        autoCreateYBounds
      ? autoCreateYBounds.y2
      : tmpWindow?.y2 ?? null;

  const minCreateWidthMin = Math.max(pixelToMinute(8), 2);

  const displayWindow = React.useMemo(() => {
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
      vital: "TEMP" as const,
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

  const overlayBox = React.useMemo(() => {
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

  const highlightWindowBox = React.useMemo(() => {
    if (!tmpWindow) return null;

    const left = minuteToPixel(tmpWindow.startMin);
    const right = minuteToPixel(tmpWindow.endMin);

    return {
      left,
      width: Math.max(2, right - left),
    };
  }, [tmpWindow]);

  const hoverStats = React.useMemo(() => {
    if (hoverMinute == null || activeSeries.length === 0 || !activeFeature) return null;

    const snappedTime = getNearestPointTime(activeSeries, hoverMinute);
    if (snappedTime == null) return null;

    const value = getExactValueAtTime(activeSeries, snappedTime);

    return {
      time: snappedTime,
      text: value == null ? "Value: -" : `${activeFeature.label}: ${value.toFixed(2)} °C`,
    };
  }, [hoverMinute, activeSeries, activeFeature]);

  const windowStats = React.useMemo(() => {
    const target =
      isDragging && dragMode === "create" && dragStartMin != null && dragCurrentMin != null
        ? {
            startMin: Math.min(dragStartMin, dragCurrentMin),
            endMin: Math.max(dragStartMin, dragCurrentMin),
          }
        : tmpWindow
        ? {
            startMin: tmpWindow.startMin,
            endMin: tmpWindow.endMin,
          }
        : null;

    if (!target || activeSeries.length === 0) return null;

    const dataInWindow = activeSeries.filter(
      (p) =>
        Number.isFinite(p.time) &&
        Number.isFinite(p.value) &&
        p.time >= target.startMin &&
        p.time <= target.endMin
    );

    if (!dataInWindow.length) {
      return {
        startMin: Math.round(target.startMin),
        endMin: Math.round(target.endMin),
        duration: Math.round(target.endMin - target.startMin),
        min: null,
        max: null,
      };
    }

    const vals = dataInWindow.map((p) => p.value);

    return {
      startMin: Math.round(target.startMin),
      endMin: Math.round(target.endMin),
      duration: Math.round(target.endMin - target.startMin),
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [isDragging, dragMode, dragStartMin, dragCurrentMin, tmpWindow, activeSeries]);

  const interactionCursor = React.useMemo(() => {
    if (isDragging) {
      if (dragMode === "move") return "grabbing";
      if (dragMode === "resize-left" || dragMode === "resize-right") return "ew-resize";
      if (dragMode === "resize-top" || dragMode === "resize-bottom") return "ns-resize";
      return "crosshair";
    }

    if (hoverMode === "move") return "grab";
    if (hoverMode === "resize-left" || hoverMode === "resize-right") return "ew-resize";
    if (hoverMode === "resize-top" || hoverMode === "resize-bottom") return "ns-resize";
    return activeSeries.length > 0 ? "crosshair" : "default";
  }, [isDragging, dragMode, hoverMode, activeSeries.length]);

  if (!activeFeature || activeSeries.length === 0) {
    return (
      <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
        {!embedded && title ? (
          <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        ) : null}
        <div className="px-4 py-3 text-sm text-gray-500">No temperature data available.</div>
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3> : null}

      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0, 1fr)`,
        }}
      >
        <div className="border-r pr-0">
          <TmpLegend activeFeatureKey={activeFeatureKey} />
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
              <LineChart
                data={data}
                margin={{
                  top: chartMarginTop,
                  right: PLOT_RIGHT,
                  left: 0,
                  bottom: chartMarginBottom,
                }}
              >
                <XAxis
                  type="number"
                  dataKey="time"
                  domain={[0, xEnd ?? "dataMax"]}
                  ticks={majorGridTicks}
                  interval={0}
                  allowDecimals={false}
                  tickFormatter={(v) => formatClockTime(Number(v), timeZero)}
                  tick={showXAxis ? { fontSize: 12 } : false}
                  axisLine={showXAxis}
                  tickLine={showXAxis}
                  height={showXAxis ? 30 : 0}
                />

                <YAxis hide domain={[32, 40]} allowDataOverflow />

                <Tooltip
                  formatter={(value: any) => [
                    value != null ? Number(value).toFixed(2) : "NA",
                    activeFeature.label,
                  ]}
                  labelFormatter={(label: any) =>
                    `Time: ${formatClockTime(Number(label), timeZero)}`
                  }
                />

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

                <Line
                  key={activeFeature.key}
                  type="linear"
                  dataKey={activeFeature.key}
                  stroke={activeFeature.color}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={<CustomDot marker={activeFeature.marker} />}
                  activeDot={<CustomActiveDot marker={activeFeature.marker} />}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>

            <div
              ref={chartOverlayRef}
              className="absolute inset-0 z-20"
              style={{ cursor: interactionCursor }}
              onMouseDown={(e) => {
                if (effectiveXEnd <= 0 || activeSeries.length === 0) return;

                const minute = clientXToMinute(e.clientX);
                const value = clientYToValue(e.clientY);
                const hoveredMode = getHoverMode(minute, value);

                if (tmpWindow && hoveredMode) {
                  const width = tmpWindow.endMin - tmpWindow.startMin;
                  const heightVal = tmpWindow.y2 - tmpWindow.y1;

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
                    setMoveOffsetMin(minute - tmpWindow.startMin);
                    setMoveWindowWidthMin(width);
                    setMoveOffsetY(value - tmpWindow.y1);
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
                    const bounds = getWindowYBoundsForTmp(activeSeries, s, t);
                    if (bounds) {
                      nextWindow = {
                        vital: "TEMP",
                        startMin: s,
                        endMin: t,
                        y1: bounds.y1,
                        y2: bounds.y2,
                      };
                    }
                  }
                }

                if (dragMode === "resize-left" && tmpWindow) {
                  const s = Math.round(Math.min(minute, tmpWindow.endMin - 1));
                  nextWindow = {
                    ...tmpWindow,
                    vital: "TEMP",
                    startMin: Math.max(0, s),
                  };
                }

                if (dragMode === "resize-right" && tmpWindow) {
                  const t = Math.round(Math.max(minute, tmpWindow.startMin + 1));
                  nextWindow = {
                    ...tmpWindow,
                    vital: "TEMP",
                    endMin: Math.min(effectiveXEnd, t),
                  };
                }

                if (dragMode === "resize-top" && tmpWindow) {
                  const newY2 = Math.max(value, tmpWindow.y1 + 0.1);
                  nextWindow = {
                    ...tmpWindow,
                    vital: "TEMP",
                    y2: clampY(newY2),
                  };
                }

                if (dragMode === "resize-bottom" && tmpWindow) {
                  const newY1 = Math.min(value, tmpWindow.y2 - 0.1);
                  nextWindow = {
                    ...tmpWindow,
                    vital: "TEMP",
                    y1: clampY(newY1),
                  };
                }

                if (dragMode === "move" && tmpWindow) {
                  const newStart = Math.max(
                    0,
                    Math.min(minute - moveOffsetMin, effectiveXEnd - moveWindowWidthMin)
                  );
                  const newY1 = Math.max(
                    domainMin,
                    Math.min(value - moveOffsetY, domainMax - moveWindowHeightY)
                  );

                  nextWindow = {
                    ...tmpWindow,
                    vital: "TEMP",
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
                    top: 8,
                    zIndex: 999,
                    color: "#111827",
                    lineHeight: 1.35,
                  }}
                >
                  <div>Start: {formatClockTime(windowStats.startMin, timeZero)}</div>
                  <div>End: {formatClockTime(windowStats.endMin, timeZero)}</div>
                  <div>Dur: {windowStats.duration} min</div>
                  <div>Min: {windowStats.min == null ? "-" : windowStats.min.toFixed(2)}</div>
                  <div>Max: {windowStats.max == null ? "-" : windowStats.max.toFixed(2)}</div>
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

      {showXAxis && (
        <div className="mt-1 text-xs text-gray-500">
          Horizontal scroll enabled for long cases.
        </div>
      )}
    </div>
  );
}