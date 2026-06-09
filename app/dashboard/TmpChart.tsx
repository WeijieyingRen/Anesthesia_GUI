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

type TmpChartProps = {
  title?: string;
  tmp: Record<string, TimeValuePoint[]>;
  height?: number;
  xEnd: number;
  xTicks?: number[];
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;

  timeResolution?: TimeResolution;

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

type TmpProbeRange = {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
};

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

  const roundedBase = new Date(base);
  const roundedMinutes = Math.floor(roundedBase.getMinutes() / 15) * 15;
  roundedBase.setMinutes(roundedMinutes, 0, 0);

  const dt = new Date(roundedBase.getTime() + offsetMin * 60000);
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
  activeFeatureKey: string
): Array<Record<string, number | null>> {
  const arr = getFeatureSeries(tmp, activeFeatureKey);

  const sortedTimes = Array.from(
    new Set(arr.map((p) => p.time).filter((t) => Number.isFinite(t)))
  ).sort((a, b) => a - b);

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
  if (
    cx == null ||
    cy == null ||
    !stroke ||
    dataKey == null ||
    payload?.[dataKey] == null
  ) {
    return null;
  }

  return renderMarkerShape(cx, cy, stroke, marker, false);
}

function CustomActiveDot({ cx, cy, stroke, payload, dataKey, marker }: any) {
  if (
    cx == null ||
    cy == null ||
    !stroke ||
    dataKey == null ||
    payload?.[dataKey] == null
  ) {
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

function TmpLegend({ activeFeatureKey }: { activeFeatureKey: string }) {
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
              <span className="ml-1 text-xs text-gray-500">
                {feature.unit}
              </span>
            </div>

            <LegendMarker color={feature.color} marker={feature.marker} />
          </div>
        );
      })}
    </div>
  );
}

function getExactValueAtTime(
  arr: TimeValuePoint[],
  time: number
): number | null {
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

  const domainMin = 28;
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

function getProbeRangesInWindow(
  tmp: Record<string, TimeValuePoint[]>,
  startMin: number,
  endMin: number
): TmpProbeRange[] {
  return TMP_FEATURES.map((feature) => {
    const arr = getFeatureSeries(tmp, feature.key);
    const values = arr
      .filter(
        (p) =>
          Number.isFinite(p.time) &&
          Number.isFinite(p.value) &&
          p.time >= startMin &&
          p.time <= endMin
      )
      .map((p) => p.value);

    if (!values.length) {
      return {
        key: feature.key,
        label: feature.label,
        min: null,
        max: null,
      };
    }

    return {
      key: feature.key,
      label: feature.label,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
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
  timeResolution = 15,
  selectedWindow = null,
  highlightWindow = null,
  onChangeSelectedWindow,
  onCreateEventFromWindow,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: TmpChartProps) {
  const activeFeature = React.useMemo(
    () => getHighestPriorityFeature(tmp),
    [tmp]
  );

  const activeFeatureKey = activeFeature?.key ?? "";

  const activeSeries = React.useMemo(
    () => (activeFeature ? getFeatureSeries(tmp, activeFeature.key) : []),
    [tmp, activeFeature]
  );

  const data = React.useMemo(() => {
    if (!activeFeatureKey) return [];
    return buildChartRowsForActiveFeature(tmp, activeFeatureKey);
  }, [tmp, activeFeatureKey]);

  const viewConfig = React.useMemo(
    () => ({
      majorStep: getChartMajorStep(timeResolution),
      minorStep: getChartMinorStep(timeResolution),
    }),
    [timeResolution]
  );

  const chartMarginTop = 10;
  const chartMarginBottom = showXAxis ? 24 : 10;

  const domainMin = 28;
  const domainMax = 40;
  const yTicks = [28, 30, 32, 34, 36, 38, 40];

  const effectiveXEnd = xEnd ?? 0;

  const { contentWidth, plotWidth } = React.useMemo(
    () => getSharedChartGeometry(effectiveXEnd, timeResolution),
    [effectiveXEnd, timeResolution]
  );

  const majorGridTicks = React.useMemo(() => {
    if (!effectiveXEnd || effectiveXEnd <= 0) return [];

    if (timeResolution === 15 && xTicks && xTicks.length > 0) {
      return xTicks;
    }

    return buildChartTicks(effectiveXEnd, viewConfig.majorStep);
  }, [timeResolution, xTicks, effectiveXEnd, viewConfig.majorStep]);

  const minorGridTicks = React.useMemo(() => {
    if (!effectiveXEnd || effectiveXEnd <= 0) return [];
    return buildChartTicks(effectiveXEnd, viewConfig.minorStep);
  }, [effectiveXEnd, viewConfig.minorStep]);

  const tmpWindow = selectedWindow?.vital === "TEMP" ? selectedWindow : null;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const chartOverlayRef = React.useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = React.useRef(false);

  const [sliderValue, setSliderValue] = React.useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = React.useState(0);
  const showHorizontalSlider = maxScrollLeft > 1;

  React.useEffect(() => {
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

  React.useEffect(() => {
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
    height,
    activeFeatureKey,
    sharedScrollLeft,
  ]);

  const [isDragging, setIsDragging] = React.useState(false);
  const [dragMode, setDragMode] = React.useState<DragMode>(null);
  const [hoverMode, setHoverMode] = React.useState<DragMode>(null);
  const [hoverMinute, setHoverMinute] = React.useState<number | null>(null);

  const [dragStartMin, setDragStartMin] = React.useState<number | null>(null);
  const [dragCurrentMin, setDragCurrentMin] = React.useState<number | null>(
    null
  );
  const [dragCurrentY, setDragCurrentY] = React.useState<number | null>(null);

  const [moveOffsetMin, setMoveOffsetMin] = React.useState<number>(0);
  const [moveWindowWidthMin, setMoveWindowWidthMin] = React.useState<number>(0);
  const [moveOffsetY, setMoveOffsetY] = React.useState<number>(0);
  const [moveWindowHeightY, setMoveWindowHeightY] = React.useState<number>(0);

  function clampY(y: number) {
    return Math.max(domainMin, Math.min(domainMax, y));
  }

  function minuteToPixel(minute: number) {
    return minuteToX(minute, effectiveXEnd, plotWidth);
  }

  function valueToPixel(value: number) {
    const el = chartOverlayRef.current;
    if (!el) return 0;

    const rect = el.getBoundingClientRect();
    const plotHeight = Math.max(
      1,
      rect.height - chartMarginTop - chartMarginBottom
    );
    const ratio = (domainMax - value) / (domainMax - domainMin);
    return chartMarginTop + ratio * plotHeight;
  }

  function clientXToMinute(clientX: number) {
    const el = chartOverlayRef.current;
    if (!el || effectiveXEnd <= 0 || plotWidth <= 0) return 0;

    const rect = el.getBoundingClientRect();
    const xInPlot = clientX - rect.left;
    const clampedX = Math.max(0, Math.min(xInPlot, plotWidth));
    const minute = (clampedX / plotWidth) * effectiveXEnd;

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
    if (!effectiveXEnd || effectiveXEnd <= 0 || plotWidth <= 0) return 0;
    return (px / plotWidth) * effectiveXEnd;
  }

  function pixelToValue(py: number) {
    const el = chartOverlayRef.current;
    if (!el) return 0;

    const rect = el.getBoundingClientRect();
    const plotHeight = Math.max(
      1,
      rect.height - chartMarginTop - chartMarginBottom
    );

    return (py / plotHeight) * (domainMax - domainMin);
  }

  function resetDragState() {
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
    isDragging &&
    dragMode === "create" &&
    dragStartMin != null &&
    dragCurrentMin != null
      ? Math.min(dragStartMin, dragCurrentMin)
      : isDragging &&
          dragMode === "resize-left" &&
          tmpWindow &&
          dragCurrentMin != null
        ? Math.min(dragCurrentMin, tmpWindow.endMin - 1)
        : isDragging &&
            dragMode === "resize-right" &&
            tmpWindow
          ? tmpWindow.startMin
          : isDragging &&
              dragMode === "move" &&
              tmpWindow &&
              dragCurrentMin != null
            ? Math.max(
                0,
                Math.min(
                  dragCurrentMin - moveOffsetMin,
                  effectiveXEnd - moveWindowWidthMin
                )
              )
            : tmpWindow?.startMin ?? null;

  const activeEndMin =
    isDragging &&
    dragMode === "create" &&
    dragStartMin != null &&
    dragCurrentMin != null
      ? Math.max(dragStartMin, dragCurrentMin)
      : isDragging &&
          dragMode === "resize-left" &&
          tmpWindow
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
            ? Math.max(
                0,
                Math.min(
                  dragCurrentMin - moveOffsetMin,
                  effectiveXEnd - moveWindowWidthMin
                )
              ) + moveWindowWidthMin
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
            Math.min(
              dragCurrentY - moveOffsetY,
              domainMax - moveWindowHeightY
            )
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
            Math.min(
              dragCurrentY - moveOffsetY,
              domainMax - moveWindowHeightY
            )
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
    if (!highlightWindow) return null;

    const left = minuteToPixel(highlightWindow.startMin);
    const right = minuteToPixel(highlightWindow.endMin);

    return {
      left,
      width: Math.max(2, right - left),
    };
  }, [highlightWindow]);

  const hoverStats = React.useMemo(() => {
    if (hoverMinute == null || activeSeries.length === 0 || !activeFeature) {
      return null;
    }

    const value = getExactValueAtTime(activeSeries, hoverMinute);

    return {
      time: hoverMinute,
      text:
        value == null
          ? "Value: -"
          : `${activeFeature.label}: ${value.toFixed(2)} °C`,
    };
  }, [hoverMinute, activeSeries, activeFeature]);

  const windowStats = React.useMemo(() => {
    const target =
      isDragging &&
      dragMode === "create" &&
      dragStartMin != null &&
      dragCurrentMin != null
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

    if (!target) return null;

    return {
      startMin: Math.round(target.startMin),
      endMin: Math.round(target.endMin),
      duration: Math.round(target.endMin - target.startMin),
      probeRanges: getProbeRangesInWindow(tmp, target.startMin, target.endMin),
    };
  }, [isDragging, dragMode, dragStartMin, dragCurrentMin, tmpWindow, tmp]);

  const interactionCursor = React.useMemo(() => {
    if (isDragging) {
      if (dragMode === "move") return "grabbing";
      if (dragMode === "resize-left" || dragMode === "resize-right") {
        return "ew-resize";
      }
      if (dragMode === "resize-top" || dragMode === "resize-bottom") {
        return "ns-resize";
      }
      return "crosshair";
    }

    if (hoverMode === "move") return "grab";
    if (hoverMode === "resize-left" || hoverMode === "resize-right") {
      return "ew-resize";
    }
    if (hoverMode === "resize-top" || hoverMode === "resize-bottom") {
      return "ns-resize";
    }

    return activeSeries.length > 0 ? "crosshair" : "default";
  }, [isDragging, dragMode, hoverMode, activeSeries.length]);

  if (!activeFeature || activeSeries.length === 0) {
    return (
      <div
        className={
          embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"
        }
      >
        {!embedded && title ? (
          <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        ) : null}
        <div className="px-4 py-3 text-sm text-gray-500">
          No temperature data available.
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
        .tmp-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .tmp-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .tmp-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .tmp-slider:focus {
          outline: none;
        }

        .tmp-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .tmp-slider::-webkit-slider-thumb {
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

        .tmp-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .tmp-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .tmp-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .tmp-slider:hover::-moz-range-thumb {
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

        <div className="min-w-0">
          <div
            className="overflow-x-hidden overflow-y-hidden"
            style={{ height }}
          >
            <div
              ref={scrollRef}
              className="tmp-scroll-hidden"
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
                      domain={[0, effectiveXEnd]}
                      ticks={majorGridTicks}
                      interval={0}
                      allowDecimals={false}
                      tickFormatter={(v) =>
                        formatClockTime(Number(v), timeZero)
                      }
                      tick={showXAxis ? { fontSize: 12 } : false}
                      axisLine={showXAxis}
                      tickLine={showXAxis}
                      height={showXAxis ? 30 : 0}
                    />

                    <YAxis hide domain={[domainMin, domainMax]} allowDataOverflow />

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

                    <ReferenceLine
                      y={domainMin}
                      stroke="#4b5563"
                      strokeWidth={2.2}
                    />

                    <Line
                      key={activeFeature.key}
                      type="linear"
                      dataKey={activeFeature.key}
                      stroke={activeFeature.color}
                      strokeWidth={2}
                      connectNulls={false}
                      dot={<CustomDot marker={activeFeature.marker} />}
                      activeDot={
                        <CustomActiveDot marker={activeFeature.marker} />
                      }
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div
                  ref={chartOverlayRef}
                  className="absolute inset-0 z-20"
                  style={{ cursor: interactionCursor }}
                  onMouseDown={(e) => {
                    if (effectiveXEnd <= 0 || activeSeries.length === 0) {
                      return;
                    }

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
                        const bounds = getWindowYBoundsForTmp(
                          activeSeries,
                          s,
                          t
                        );

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
                      const s = Math.round(
                        Math.min(minute, tmpWindow.endMin - 1)
                      );

                      nextWindow = {
                        ...tmpWindow,
                        vital: "TEMP",
                        startMin: Math.max(0, s),
                      };
                    }

                    if (dragMode === "resize-right" && tmpWindow) {
                      const t = Math.round(
                        Math.max(minute, tmpWindow.startMin + 1)
                      );

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
                        Math.min(
                          minute - moveOffsetMin,
                          effectiveXEnd - moveWindowWidthMin
                        )
                      );

                      const newY1 = Math.max(
                        domainMin,
                        Math.min(
                          value - moveOffsetY,
                          domainMax - moveWindowHeightY
                        )
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
                      if (dragMode === "create") {
                        onCreateEventFromWindow?.(nextWindow);
                      } else {
                        onChangeSelectedWindow?.(nextWindow);
                      }
                    }

                    resetDragState();
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
                        left: Math.min(
                          minuteToPixel(hoverStats.time) + 8,
                          contentWidth - 220
                        ),
                        top: chartMarginTop + 8,
                        zIndex: 1000,
                        color: "#111827",
                        lineHeight: 1.35,
                        maxWidth: 220,
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
                        maxWidth: 240,
                      }}
                    >
                      <div>
                        Start: {formatClockTime(windowStats.startMin, timeZero)}
                      </div>
                      <div>
                        End: {formatClockTime(windowStats.endMin, timeZero)}
                      </div>
                      <div>Dur: {windowStats.duration} min</div>

                      {windowStats.probeRanges.map((item) => (
                        <div key={item.key}>
                          {item.label}:{" "}
                          {item.min == null || item.max == null
                            ? "-"
                            : `${item.min.toFixed(2)} ~ ${item.max.toFixed(
                                2
                              )}`}
                        </div>
                      ))}
                    </div>
                  )}

                  {highlightWindowBox && (
                    <div
                      className="pointer-events-none absolute"
                      style={{
                        left: highlightWindowBox.left,
                        top: chartMarginTop,
                        width: highlightWindowBox.width,
                        height: `calc(100% - ${
                          chartMarginTop + chartMarginBottom
                        }px)`,
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
      aria-label="Temperature chart horizontal scroll"
      className="tmp-slider"
    />
  </div>
)}
        </div>
      </div>

      {showXAxis && showHorizontalSlider && (
  <div className="mt-1 text-xs text-gray-500">
    Horizontal scroll enabled for long cases.
  </div>
)}
    </div>
  );
}