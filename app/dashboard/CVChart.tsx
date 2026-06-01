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
  xTicks: number[],
  visibleFeatures: CVFeatureConfig[]
): Array<Record<string, number | null>> {
  const tickSet = new Set<number>(xTicks);
  const allTimes = new Set<number>(xTicks);

  visibleFeatures.forEach((feature) => {
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

    visibleFeatures.forEach((feature) => {
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
        visibleFeatures.forEach((feature) => {
          row[feature.key] = null;
        });
        return row;
      });
  }

  return rows;
}

function buildAxisTicks(domainMax: number, step: number) {
  const ticks: number[] = [];
  for (let tick = 0; tick <= domainMax; tick += step) {
    ticks.push(tick);
  }
  if (ticks[ticks.length - 1] !== domainMax) {
    ticks.push(domainMax);
  }
  return ticks;
}

function getNiceAxisStep(maxValue: number) {
  if (!Number.isFinite(maxValue) || maxValue <= 200) return 25;

  const roughStep = maxValue / 8;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  let niceStep = 10;
  if (normalized <= 1) niceStep = 1;
  else if (normalized <= 2) niceStep = 2;
  else if (normalized <= 2.5) niceStep = 2.5;
  else if (normalized <= 5) niceStep = 5;

  return niceStep * magnitude;
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

function CVLegend({
  features,
}: {
  features: CVFeatureConfig[];
}) {
  return (
    <div className="border-r pr-0">
      {features.map((feature) => (
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
  ticks,
  domainMax,
}: {
  height: number;
  ticks: number[];
  domainMax: number;
}) {
  const domainMin = 0;
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
  rowCount,
  highlightWindow,
  plotWidth,
}: {
  end: number;
  majorTicks: number[];
  minorTicks: number[];
  height: number;
  rowCount: number;
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

      {Array.from({ length: rowCount + 1 }, (_, i) => i).map((i) => {
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
  const visibleFeatures = React.useMemo(
    () =>
      CV_FEATURES.filter((feature) => {
        const aliases = CV_KEY_ALIASES[feature.key] ?? [feature.key];
        return aliases.some((name) =>
          (cv?.[name] ?? []).some(
            (point) => Number.isFinite(point?.time) && Number.isFinite(point?.value)
          )
        );
      }),
    [cv]
  );
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

  const data = React.useMemo(
    () => buildChartRows(cv ?? {}, majorTicks, visibleFeatures),
    [cv, majorTicks, visibleFeatures]
  );
  const yAxisConfig = React.useMemo(() => {
    const values = Object.values(cv ?? {})
      .flat()
      .map((point) => point?.value)
      .filter((value): value is number => Number.isFinite(value));

    const rawMax = values.length > 0 ? Math.max(...values) : 200;
    const domainMax = Math.max(200, rawMax);
    const step = getNiceAxisStep(domainMax);
    const roundedDomainMax = Math.ceil(domainMax / step) * step;

    return {
      domainMax: roundedDomainMax,
      ticks: buildAxisTicks(roundedDomainMax, step),
    };
  }, [cv]);

  if (!visibleFeatures.length) {
    return (
      <div className={embedded ? "bg-white px-4 py-3" : "rounded-2xl border bg-white p-4 shadow-sm"}>
        {!embedded && title ? (
          <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
        ) : null}
        <div className="text-sm text-gray-500">No CV data available.</div>
      </div>
    );
  }

  const fullContentHeight = visibleFeatures.length * ROW_HEIGHT;
  const viewHeight = Math.min(height, Math.max(120, fullContentHeight));
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = React.useRef(false);
  const [sliderValue, setSliderValue] = React.useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = React.useState(0);

  React.useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
      setSliderValue(sharedScrollLeft);
    }
  }, [sharedScrollLeft]);

  const contentPlotWidth = React.useMemo(() => {
    if (xEnd <= 0) return 800;
    return Math.max(800, Math.ceil(xEnd * pxPerMin));
  }, [xEnd, pxPerMin]);

  const contentWidth = contentPlotWidth + PLOT_RIGHT;
  const plotWidth = contentPlotWidth;

  React.useEffect(() => {
    function updateScrollMetrics() {
      const el = scrollRef.current;
      if (!el) return;

      const nextMax = Math.max(0, el.scrollWidth - el.clientWidth);
      setMaxScrollLeft(nextMax);
      setSliderValue(Math.min(el.scrollLeft, nextMax));
    }

    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);
    return () => {
      window.removeEventListener("resize", updateScrollMetrics);
    };
  }, [contentWidth, fullContentHeight, viewHeight]);

  return (
    <div className={embedded ? "bg-white p-0" : "rounded-2xl border bg-white p-4 shadow-sm"}>
      <style jsx>{`
        .cv-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .cv-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .cv-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .cv-slider:focus {
          outline: none;
        }

        .cv-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .cv-slider::-webkit-slider-thumb {
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

        .cv-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .cv-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .cv-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .cv-slider:hover::-moz-range-thumb {
          background: #475569;
        }
      `}</style>
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
          <CVLegend features={visibleFeatures} />
        </div>

        <FixedYAxis
          height={fullContentHeight}
          ticks={yAxisConfig.ticks}
          domainMax={yAxisConfig.domainMax}
        />

        <div className="overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]" style={{ height: viewHeight }}>
          <div className="overflow-x-hidden overflow-y-hidden">
            <div
              ref={scrollRef}
              className="cv-scroll-hidden"
              style={{ overscrollBehaviorX: "none" }}
              onWheel={(e) => {
                const el = e.currentTarget;
                const absX = Math.abs(e.deltaX);
                const absY = Math.abs(e.deltaY);

                // 只处理“明显以横向为主”的触摸板/滚轮手势
                if (absX <= absY || absX < 1) return;

                const maxScrollLeft = el.scrollWidth - el.clientWidth;
                const nextLeft = el.scrollLeft + e.deltaX;

                const atLeftEdge = el.scrollLeft <= 0;
                const atRightEdge = el.scrollLeft >= maxScrollLeft - 1;

                const tryingGoPastLeft = atLeftEdge && e.deltaX < 0;
                const tryingGoPastRight = atRightEdge && e.deltaX > 0;

                if (tryingGoPastLeft || tryingGoPastRight) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }

                e.preventDefault();
                el.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextLeft));
              }}
              onScroll={(e) => {
                const next = e.currentTarget.scrollLeft;
                if (!isSyncingFromSliderRef.current) {
                  setSliderValue(next);
                }
                onSharedScrollLeftChange?.(next);
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
                    rowCount={visibleFeatures.length}
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
                      domain={[0, yAxisConfig.domainMax]}
                      ticks={yAxisConfig.ticks}
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

                    {visibleFeatures.map((feature) => {
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
            <div className="px-2 pt-2">
              <input
                type="range"
                min={0}
                max={Math.max(0, Math.round(maxScrollLeft))}
                step={1}
                value={Math.min(sliderValue, maxScrollLeft)}
                onChange={(e) => {
                  const next = Number(e.target.value);
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
                className="cv-slider"
                aria-label="CV chart horizontal scroll"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
