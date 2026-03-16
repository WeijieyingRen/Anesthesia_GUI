"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import type { TimeValuePoint } from "@/lib/types";

type TmpChartProps = {
  title?: string;
  tmp: Record<string, TimeValuePoint[]>;
  height?: number;
  xEnd: number;
  xTicks: number[];
  showXAxis?: boolean;
  timeZero?: string | null;
  embedded?: boolean;
  highlightWindow?: {
    startMin: number;
    endMin: number;
  } | null;
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

const ROW_HEIGHT = 25;

const RECHARTS_LEFT_MARGIN = 8;
const RECHARTS_RIGHT_MARGIN = 20;
const RECHARTS_YAXIS_WIDTH = 35;

const PLOT_LEFT = RECHARTS_LEFT_MARGIN + RECHARTS_YAXIS_WIDTH;
const PLOT_RIGHT = RECHARTS_RIGHT_MARGIN;
const SVG_WIDTH = 1000;
const PLOT_WIDTH = SVG_WIDTH - PLOT_LEFT - PLOT_RIGHT;

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
    key: "TMP Rectal",
    label: "Tart",
    unit: "°C",
    color: "#5d6f1f",
    marker: "ring",
  },
  {
    key: "TMP Blood",
    label: "Tblood",
    unit: "°C",
    color: "#a31212",
    marker: "diamond",
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
  "TMP Rectal": ["TMP Rectal", "Tart", "Temperature - Rectal"],
  "TMP Blood": ["TMP Blood", "Tblood", "Temperature - Blood"],
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

function buildChartRows(
  tmp: Record<string, TimeValuePoint[]>,
  xTicks: number[]
): Array<Record<string, number | null>> {
  const tickSet = new Set<number>(xTicks);
  const allTimes = new Set<number>(xTicks);

  TMP_FEATURES.forEach((feature) => {
    const aliases = TMP_KEY_ALIASES[feature.key] ?? [feature.key];
    let arr: TimeValuePoint[] = [];

    for (const name of aliases) {
      if (tmp[name]?.length) {
        arr = tmp[name];
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

    TMP_FEATURES.forEach((feature) => {
      const aliases = TMP_KEY_ALIASES[feature.key] ?? [feature.key];
      let arr: TimeValuePoint[] = [];

      for (const name of aliases) {
        if (tmp[name]?.length) {
          arr = tmp[name];
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
        TMP_FEATURES.forEach((feature) => {
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

function CustomDot({ cx, cy, stroke, payload, dataKey }: any) {
  if (
    cx == null ||
    cy == null ||
    !stroke ||
    dataKey == null ||
    payload?.[dataKey] == null
  ) {
    return null;
  }

  const feature = TMP_FEATURES.find((f) => f.key === dataKey);
  if (!feature) return null;

  return renderMarkerShape(cx, cy, stroke, feature.marker, false);
}

function CustomActiveDot({ cx, cy, stroke, payload, dataKey }: any) {
  if (
    cx == null ||
    cy == null ||
    !stroke ||
    dataKey == null ||
    payload?.[dataKey] == null
  ) {
    return null;
  }

  const feature = TMP_FEATURES.find((f) => f.key === dataKey);
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

function TmpLegend() {
  return (
    <div>
      {TMP_FEATURES.map((feature) => (
        <div
          key={feature.key}
          className="relative grid items-center gap-1.5 px-2 text-sm"
          style={{
            height: ROW_HEIGHT,
            boxSizing: "border-box",
            gridTemplateColumns: "minmax(0,1fr) 20px",
            backgroundColor: "#efefef",
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

function TmpGridSvg({
  end,
  ticks,
  height,
  highlightWindow,
}: {
  end: number;
  ticks: number[];
  height: number;
  highlightWindow?: {
    startMin: number;
    endMin: number;
  } | null;
}) {
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${SVG_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
    >
      {highlightWindow && (
        <rect
          x={PLOT_LEFT + (highlightWindow.startMin / end) * PLOT_WIDTH}
          y={0}
          width={Math.max(
            2,
            ((highlightWindow.endMin - highlightWindow.startMin) / end) * PLOT_WIDTH
          )}
          height={height}
          fill="lightblue"
          fillOpacity={0.75}
          stroke="none"
        />
      )}

      {ticks.map((tick) => {
        const x = PLOT_LEFT + (tick / end) * PLOT_WIDTH;
        return (
          <line
            key={`grid-x-${tick}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="#d1d5db"
            strokeWidth={1}
          />
        );
      })}

      {Array.from({ length: TMP_FEATURES.length + 1 }, (_, i) => i).map((i) => {
        const y = i * ROW_HEIGHT;
        return (
          <line
            key={`grid-y-${i}`}
            x1={0}
            y1={y}
            x2={PLOT_LEFT + PLOT_WIDTH}
            y2={y}
            stroke="#8f8f8f"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
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
  highlightWindow = null,
}: TmpChartProps) {
  const data = React.useMemo(() => buildChartRows(tmp, xTicks), [tmp, xTicks]);
  const fullContentHeight = TMP_FEATURES.length * ROW_HEIGHT;

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      {!embedded && title ? (
        <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
      ) : null}

      <div
        className="overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
        style={{ height: 130 }}
      >
        <div className="grid grid-cols-[220px_1fr] gap-0">
          <div className="border-r pr-0" style={{ height: fullContentHeight }}>
            <TmpLegend />
          </div>

          <div
            className="relative"
            style={{
              width: "100%",
              height: fullContentHeight,
              marginLeft: "-1px",
            }}
          >
            <TmpGridSvg
              end={xEnd}
              ticks={xTicks}
              height={fullContentHeight}
              highlightWindow={highlightWindow}
            />

            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{
                  top: 0,
                  right: RECHARTS_RIGHT_MARGIN,
                  left: RECHARTS_LEFT_MARGIN,
                  bottom: 0,
                }}
              >
                <XAxis
                  type="number"
                  dataKey="time"
                  domain={[0, xEnd]}
                  ticks={xTicks}
                  interval={0}
                  allowDecimals={false}
                  tickFormatter={(v) => formatClockTime(Number(v), timeZero)}
                  tick={showXAxis ? undefined : false}
                  axisLine={showXAxis}
                  tickLine={showXAxis}
                  height={showXAxis ? 30 : 0}
                />

                <YAxis
                  domain={[32, 40]}
                  ticks={[32, 33, 34, 35, 36, 37, 38, 39, 40]}
                  width={RECHARTS_YAXIS_WIDTH}
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />

                <Tooltip
                  formatter={(value: any, name: any) => {
                    const feature = TMP_FEATURES.find((f) => f.key === name);
                    return [
                      value != null ? Number(value).toFixed(2) : "NA",
                      feature ? feature.label : String(name),
                    ];
                  }}
                  labelFormatter={(label: any) =>
                    `Time: ${formatClockTime(Number(label), timeZero)}`
                  }
                />

                {highlightWindow ? (
                  <ReferenceArea
                    x1={highlightWindow.startMin}
                    x2={highlightWindow.endMin}
                    fill="lightblue"
                    fillOpacity={0.75}
                    strokeOpacity={0}
                  />
                ) : null}

                {TMP_FEATURES.map((feature) => {
                  const aliases = TMP_KEY_ALIASES[feature.key] ?? [feature.key];
                  const hasData = aliases.some((name) => (tmp[name] ?? []).length > 0);

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
  );
}