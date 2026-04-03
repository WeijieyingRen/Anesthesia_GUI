"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { TimeValuePoint } from "@/lib/types";

type TimeResolution = 15 | 5;

type CVChartProps = {
  title?: string;
  cv: Record<string, TimeValuePoint[]>;
  xEnd: number;
  xTicks?: number[];
  height?: number;
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;
  highlightWindow?: {
    startMin: number;
    endMin: number;
  } | null;
  timeResolution?: TimeResolution;

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

type CVFeatureConfig = {
  key: string;
  label: string;
  unit: string;
  color: string;
  marker: MarkerType;
  rowBg: string;
};

const LEGEND_COL_WIDTH = 220;
const AXIS_COL_WIDTH = 42;
const PLOT_RIGHT = 20;
const PX_PER_15_MIN = 64;
const ROW_HEIGHT = 25;
const RECHARTS_RIGHT_MARGIN = 20;
const RECHARTS_YAXIS_WIDTH = 35;

const CV_FEATURES: CVFeatureConfig[] = [
  {
    key: "PAPS",
    label: "PAPS",
    unit: "mmHg",
    color: "#efc27b",
    marker: "triangle",
    rowBg: "#f5eadb",
  },
  {
    key: "PAPD",
    label: "PAPD",
    unit: "mmHg",
    color: "#efc27b",
    marker: "triangle-down",
    rowBg: "#f5eadb",
  },
  {
    key: "PAPM",
    label: "PAPM",
    unit: "mmHg",
    color: "#efc27b",
    marker: "x",
    rowBg: "#f5eadb",
  },
  {
    key: "CVP",
    label: "CVP",
    unit: "mmHg",
    color: "#7a5cff",
    marker: "square",
    rowBg: "#ece8ff",
  },
  {
    key: "Cerebral Oximetry Left",
    label: "Cerebral Oximetry Left",
    unit: "",
    color: "#e33ab5",
    marker: "square",
    rowBg: "#f7def0",
  },
  {
    key: "Cerebral Oximetry Right",
    label: "Cerebral Oximetry Right",
    unit: "",
    color: "#52b838",
    marker: "diamond",
    rowBg: "#e7f6df",
  },
  {
    key: "SVO2 %",
    label: "SVO2 (%)",
    unit: "%",
    color: "#e68b23",
    marker: "plus",
    rowBg: "#f7eadc",
  },
  {
    key: "ABPS",
    label: "ABPS",
    unit: "",
    color: "#5f8fcf",
    marker: "triangle",
    rowBg: "#e6edf8",
  },
  {
    key: "ABPD",
    label: "ABPD",
    unit: "",
    color: "#5f8fcf",
    marker: "triangle-down",
    rowBg: "#e6edf8",
  },
];

const CV_KEY_ALIASES: Record<string, string[]> = {
  PAPS: ["PAPS"],
  PAPD: ["PAPD"],
  PAPM: ["PAPM"],
  CVP: ["CVP"],
  "Cerebral Oximetry Left": ["Cerebral Oximetry Left"],
  "Cerebral Oximetry Right": ["Cerebral Oximetry Right"],
  "SVO2 %": ["SVO2 %"],
  ABPS: ["ABPS"],
  ABPD: ["ABPD"],
};

function getPxPerMinute(timeResolution: TimeResolution) {
  return timeResolution === 15 ? PX_PER_15_MIN / 15 : PX_PER_15_MIN / 5;
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

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero || !Number.isFinite(offsetMin)) return `${offsetMin}`;

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return `${offsetMin}`;

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildChartRows(
  cv: Record<string, TimeValuePoint[]>,
  xTicks: number[]
): Array<Record<string, number | null>> {
  const tickSet = new Set<number>(xTicks);
  const allTimes = new Set<number>(xTicks);

  CV_FEATURES.forEach((feature) => {
    const aliases = CV_KEY_ALIASES[feature.key] ?? [feature.key];
    let arr: TimeValuePoint[] = [];

    for (const name of aliases) {
      if (cv[name]?.length) {
        arr = cv[name];
        break;
      }
    }

    arr.forEach((p) => {
      if (Number.isFinite(p.time)) allTimes.add(p.time);
    });
  });

  const sortedTimes = Array.from(allTimes)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const rows = sortedTimes.map((time) => {
    const row: Record<string, number | null> = { time };

    CV_FEATURES.forEach((feature) => {
      const aliases = CV_KEY_ALIASES[feature.key] ?? [feature.key];
      let arr: TimeValuePoint[] = [];

      for (const name of aliases) {
        if (cv[name]?.length) {
          arr = cv[name];
          break;
        }
      }

      const matched = arr.find((p) => p.time === time);
      row[feature.key] = matched ? matched.value : null;
    });

    return row;
  });

  if (rows.length === 0 && tickSet.size > 0) {
    return Array.from(tickSet)
      .sort((a, b) => a - b)
      .map((time) => {
        const row: Record<string, number | null> = { time };
        CV_FEATURES.forEach((feature) => {
          row[feature.key] = null;
        });
        return row;
      });
  }

  return rows;
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
      return <circle cx={cx} cy={cy} r={size} fill={color} stroke={color} strokeWidth={strokeWidth} />;

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
          fill={color}
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
      return <circle cx={cx} cy={cy} r={size} fill="white" stroke={color} strokeWidth={strokeWidth} />;

    default:
      return <circle cx={cx} cy={cy} r={size} fill={color} stroke={color} strokeWidth={strokeWidth} />;
  }
}

function CustomDot({ cx, cy, stroke, payload, dataKey }: any) {
  if (cx == null || cy == null || !stroke || dataKey == null || payload?.[dataKey] == null) {
    return null;
  }

  const feature = CV_FEATURES.find((f) => f.key === dataKey);
  if (!feature) return null;

  return renderMarkerShape(cx, cy, stroke, feature.marker, false);
}

function CustomActiveDot({ cx, cy, stroke, payload, dataKey }: any) {
  if (cx == null || cy == null || !stroke || dataKey == null || payload?.[dataKey] == null) {
    return null;
  }

  const feature = CV_FEATURES.find((f) => f.key === dataKey);
  if (!feature) return null;

  return renderMarkerShape(cx, cy, stroke, feature.marker, true);
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

function CVLegend() {
  return (
    <div className="border-r pr-0">
      {CV_FEATURES.map((feature) => (
        <div
          key={feature.key}
          className="relative grid items-center gap-1.5 px-2 text-sm"
          style={{
            height: ROW_HEIGHT,
            boxSizing: "border-box",
            gridTemplateColumns: "minmax(0,1fr) 20px",
            backgroundColor: feature.rowBg,
            borderBottom: "1px solid #a3a3a3",
          }}
        >
          <div className="min-w-0 truncate text-gray-900">
            {feature.label}
            <span className="ml-1 text-xs text-gray-500">{feature.unit}</span>
          </div>

          <LegendMarker color={feature.color} marker={feature.marker} />

          <span
            className="absolute right-[-1px] bottom-[-1px] block"
            style={{
              width: "8px",
              height: "1px",
              backgroundColor: "#a3a3a3",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function FixedYAxis({
  height,
}: {
  height: number;
}) {
  const ticks = [0, 25, 50, 75, 100, 125, 150, 175, 200];
  const domainMin = 0;
  const domainMax = 200;
  const plotHeight = Math.max(1, height);

  return (
    <div
      className="relative border-r bg-white"
      style={{ width: AXIS_COL_WIDTH, height }}
    >
      {ticks.map((tick) => {
        const ratio = (domainMax - tick) / (domainMax - domainMin);
        const top = ratio * plotHeight;

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

function CVGridSvg({
  end,
  majorTicks,
  minorTicks,
  height,
  highlightWindow,
  plotWidth,
}: {
  end: number;
  majorTicks: number[];
  minorTicks: number[];
  height: number;
  highlightWindow?: {
    startMin: number;
    endMin: number;
  } | null;
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
          y={0}
          width={Math.max(2, ((highlightWindow.endMin - highlightWindow.startMin) / end) * plotWidth)}
          height={height}
          fill="lightblue"
          fillOpacity={0.45}
          stroke="none"
        />
      )}

      {minorTicks.map((tick) => {
        const x = (tick / end) * plotWidth;
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
        const x = (tick / end) * plotWidth;
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

      {Array.from({ length: CV_FEATURES.length + 1 }, (_, i) => i).map((i) => {
        const y = i * ROW_HEIGHT;
        return (
          <line
            key={`grid-y-${i}`}
            x1={0}
            y1={y}
            x2={plotWidth}
            y2={y}
            stroke="#8f8f8f"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

export default function CVChart({
  title = "",
  cv,
  xEnd,
  xTicks,
  height = 220,
  showXAxis = false,
  timeZero = null,
  embedded = false,
  highlightWindow = null,
  timeResolution = 15,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: CVChartProps) {
  const majorStep = React.useMemo(() => getMajorStep(timeResolution), [timeResolution]);
  const minorStep = React.useMemo(() => getMinorStep(timeResolution), [timeResolution]);
  const pxPerMin = React.useMemo(() => getPxPerMinute(timeResolution), [timeResolution]);

  const majorTicks = React.useMemo(() => {
    if (timeResolution === 15 && xTicks && xTicks.length > 0) return xTicks;
    return buildGridTicks(xEnd, majorStep);
  }, [timeResolution, xTicks, xEnd, majorStep]);

  const minorTicks = React.useMemo(() => {
    return buildGridTicks(xEnd, minorStep);
  }, [xEnd, minorStep]);

  const data = React.useMemo(() => buildChartRows(cv ?? {}, majorTicks), [cv, majorTicks]);
  const fullContentHeight = CV_FEATURES.length * ROW_HEIGHT;
  const viewHeight = Math.min(height, Math.max(120, fullContentHeight));
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
    }
  }, [sharedScrollLeft]);

  const contentPlotWidth = React.useMemo(() => {
    if (xEnd <= 0) return 800;
    return Math.max(800, Math.ceil(xEnd * pxPerMin));
  }, [xEnd, pxPerMin]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;
  const plotWidth = contentPlotWidth;

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `${LEGEND_COL_WIDTH}px ${AXIS_COL_WIDTH}px minmax(0,1fr)`,
        }}
      >
        <div className="border-r pr-0" style={{ height: fullContentHeight }}>
          <CVLegend />
        </div>

        <FixedYAxis height={fullContentHeight} />

        <div className="overflow-y-auto overflow-x-hidden" style={{ height: viewHeight }}>
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden"
            onScroll={(e) => {
              onSharedScrollLeftChange?.(e.currentTarget.scrollLeft);
            }}
          >
            <div
              className="relative"
              style={{
                width: contentWidth,
                height: fullContentHeight,
              }}
            >
              <div className="absolute inset-0 z-0">
                <CVGridSvg
                  end={xEnd}
                  majorTicks={majorTicks}
                  minorTicks={minorTicks}
                  height={fullContentHeight}
                  highlightWindow={highlightWindow}
                  plotWidth={plotWidth}
                />
              </div>

              <div className="absolute inset-0 z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data}
                    margin={{
                      top: 0,
                      right: RECHARTS_RIGHT_MARGIN,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <XAxis
                      type="number"
                      dataKey="time"
                      domain={[0, xEnd]}
                      ticks={majorTicks}
                      interval={0}
                      allowDecimals={false}
                      tickFormatter={(v) => formatClockTime(Number(v), timeZero)}
                      tick={showXAxis ? undefined : false}
                      axisLine={showXAxis}
                      tickLine={showXAxis}
                      height={showXAxis ? 30 : 0}
                    />

                    <YAxis
                      domain={[0, 200]}
                      ticks={[0, 25, 50, 75, 100, 125, 150, 175, 200]}
                      interval={0}
                      width={RECHARTS_YAXIS_WIDTH}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      formatter={(value: any, name: any) => {
                        const feature = CV_FEATURES.find((f) => f.key === name);
                        return [
                          value != null ? Number(value).toFixed(2) : "NA",
                          feature ? feature.label : String(name),
                        ];
                      }}
                      labelFormatter={(label: any) =>
                        `Time: ${formatClockTime(Number(label), timeZero)}`
                      }
                    />

                    {CV_FEATURES.map((feature) => {
                      const aliases = CV_KEY_ALIASES[feature.key] ?? [feature.key];
                      const hasData = aliases.some((name) => (cv?.[name] ?? []).length > 0);

                      if (!hasData) return null;

                      return (
                        <Line
                          key={feature.key}
                          type="linear"
                          dataKey={feature.key}
                          stroke={feature.color}
                          strokeWidth={1.8}
                          connectNulls={false}
                          dot={<CustomDot />}
                          activeDot={<CustomActiveDot />}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}