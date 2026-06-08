"use client";

import * as React from "react";
import type { TimelineContextData, TimelineContextEvent } from "@/lib/types";
import {
  CHART_AXIS_WIDTH as YAXIS_WIDTH,
  CHART_LEGEND_WIDTH as LEGEND_WIDTH,
  buildChartTicks,
  getChartMajorStep,
  getSharedChartGeometry,
  minuteToX as minuteToChartX,
  type TimeResolution,
} from "@/src/components/charts/chartLayout";

type TimelineContextPanelProps = {
  title?: string;
  context: TimelineContextData | null;
  xEnd: number;
  xTicks: number[];
  timeZero?: string | null;
  episodeWindow?: {
    startMin: number;
    endMin: number;
  } | null;
  timeResolution?: TimeResolution;

  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;
};

type PackedEvent = TimelineContextEvent & {
  side: "top" | "bottom";
  level: number;
  clusterRank: number;
};

const TOP_PAD = 4;
const BOTTOM_PAD = 4;
const AXIS_Y = 54;
const SVG_HEIGHT = 86;

const TIME_LABEL_Y = 16;
const TOP_LABEL_Y = 40;
const BOTTOM_LABEL_Y = SVG_HEIGHT - 4;

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

function shortenLabel(label: string) {
  return label
    .replace("Anesthesia Start", "Anes Start")
    .replace("Anesthesia Stop", "Anes Stop")
    .replace("Procedure Start", "Proc Start")
    .replace("Procedure End", "Proc End")
    .replace("Head-of-bed Positioning", "HOB Position")
    .replace("Bed Position:", "Bed:");
}

function shouldShowTextLabel(event: TimelineContextEvent) {
  const textEvents = new Set([
    "anesthesia_start",
    "anesthesia_stop",
    "procedure_start",
    "procedure_end",
    "induction",
    "intubation",
    "extubation",
    "block_start",
    "block_stop",
    "block_complete",
  ]);

  return textEvents.has(event.event_type);
}

function shouldUseBedIcon(event: TimelineContextEvent) {
  return (
    event.group === "positioning" &&
    (event.label?.includes("Bed Position:") ||
      event.label?.includes("Head-of-bed Positioning"))
  );
}

function shouldShowHeaderLabel(event: TimelineContextEvent) {
  if (shouldShowTextLabel(event)) return false;
  return Boolean((event.label ?? "").trim());
}

function getEventValueText(event: TimelineContextEvent) {
  const raw = (event.label ?? "").trim();
  if (!raw) return "";

  const parts = raw.split(":");
  if (parts.length < 2) return "";

  const value = parts.slice(1).join(":").trim();

  if (
    !value ||
    value.toLowerCase() === "nan" ||
    value.toLowerCase() === "null" ||
    value.toLowerCase() === "undefined" ||
    value === "-"
  ) {
    return "";
  }

  return value;
}

function getEventLegendLabel(event: TimelineContextEvent) {
  if (event.event_type === "emergence") return "Emergence";

  const valueText = getEventValueText(event);

  if (event.label?.includes("Head-of-bed Positioning")) {
    return valueText ? `HOB: ${valueText}` : "Head-of-bed position";
  }

  if (event.label?.includes("Bed Position:")) {
    return valueText ? `Bed: ${valueText}` : "Bed position";
  }

  return shortenLabel(event.label ?? "");
}

function getEventLegendKey(event: TimelineContextEvent) {
  if (event.event_type === "emergence") return "emergence";
  if (event.label?.includes("Head-of-bed Positioning")) return "hob_position";
  if (event.label?.includes("Bed Position:")) return "bed_position";
  return `${event.source}:${event.group}:${event.event_type}:${event.label ?? ""}`;
}

function eventColor(group: TimelineContextEvent["group"]) {
  switch (group) {
    case "milestone":
      return {
        stroke: "#5B84E8",
        text: "#23408E",
        fill: "#5B84E8",
      };
    case "airway":
      return {
        stroke: "#4FA694",
        text: "#1D5D54",
        fill: "#4FA694",
      };
    case "positioning":
      return {
        stroke: "#D39A45",
        text: "#7A4A12",
        fill: "#D39A45",
      };
    case "block":
      return {
        stroke: "#7A8FE0",
        text: "#304A8A",
        fill: "#7A8FE0",
      };
    case "surgical":
      return {
        stroke: "#C96A7D",
        text: "#7E3242",
        fill: "#C96A7D",
      };
    default:
      return {
        stroke: "#888",
        text: "#444",
        fill: "#888",
      };
  }
}

function shouldPutMilestoneOnBottom(event: TimelineContextEvent) {
  return event.event_type === "intubation" || event.event_type === "extubation";
}

function packSide(
  events: TimelineContextEvent[],
  side: "top" | "bottom"
): PackedEvent[] {
  const sorted = [...events].sort(
    (a, b) => (a.relative_min ?? 0) - (b.relative_min ?? 0)
  );

  const packed: PackedEvent[] = [];
  let cluster: TimelineContextEvent[] = [];

  function flushCluster() {
    if (!cluster.length) return;

    const levelLastMinute: number[] = [];

    cluster.forEach((e, idx) => {
      let level = 0;

      while (
        levelLastMinute[level] !== undefined &&
        Math.abs((e.relative_min ?? 0) - levelLastMinute[level]) < 16
      ) {
        level += 1;
      }

      levelLastMinute[level] = e.relative_min ?? 0;

      packed.push({
        ...e,
        side,
        level,
        clusterRank: idx,
      });
    });

    cluster = [];
  }

  for (const e of sorted) {
    if (!cluster.length) {
      cluster.push(e);
      continue;
    }

    const prev = cluster[cluster.length - 1];

    if (Math.abs((e.relative_min ?? 0) - (prev.relative_min ?? 0)) < 24) {
      cluster.push(e);
    } else {
      flushCluster();
      cluster.push(e);
    }
  }

  flushCluster();
  return packed;
}

function packEvents(context: TimelineContextData | null): PackedEvent[] {
  if (!context) return [];

  const milestoneTopEvents = context.milestone_events.filter(
    (e) =>
      e.relative_min !== undefined &&
      Number.isFinite(e.relative_min) &&
      !shouldPutMilestoneOnBottom(e)
  );

  const milestoneBottomEvents = context.milestone_events.filter(
    (e) =>
      e.relative_min !== undefined &&
      Number.isFinite(e.relative_min) &&
      shouldPutMilestoneOnBottom(e)
  );

  const bottomEvents = [
    ...milestoneBottomEvents,
    ...context.positioning_events,
    ...context.block_events,
    ...context.surgical_events,
    ...context.airway_events,
  ].filter(
    (e) => e.relative_min !== undefined && Number.isFinite(e.relative_min)
  );

  return [
    ...packSide(milestoneTopEvents, "top"),
    ...packSide(bottomEvents, "bottom"),
  ].sort((a, b) => (a.relative_min ?? 0) - (b.relative_min ?? 0));
}

function getTopLabelDx(_rank: number, level: number) {
  return level * 6;
}

function getBottomLabelDx(_rank: number) {
  return 0;
}

function BedIcon({
  x,
  y,
  color,
  tilted = false,
  size = 14,
}: {
  x: number;
  y: number;
  color: string;
  tilted?: boolean;
  size?: number;
}) {
  const w = size;
  const h = size * 0.55;

  if (!tilted) {
    return (
      <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
        <rect
          x={0}
          y={h * 0.35}
          width={w * 0.78}
          height={h * 0.28}
          rx={1.2}
          fill={color}
        />
        <rect
          x={0}
          y={0}
          width={w * 0.18}
          height={h * 0.7}
          rx={1.2}
          fill={color}
        />
        <line
          x1={w * 0.08}
          y1={h * 0.63}
          x2={w * 0.08}
          y2={h}
          stroke={color}
          strokeWidth={1.4}
        />
        <line
          x1={w * 0.68}
          y1={h * 0.63}
          x2={w * 0.68}
          y2={h}
          stroke={color}
          strokeWidth={1.4}
        />
      </g>
    );
  }

  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect
        x={0}
        y={h * 0.48}
        width={w * 0.72}
        height={h * 0.22}
        rx={1.2}
        fill={color}
      />
      <polygon
        points={`${w * 0.12},${h * 0.48} ${w * 0.38},${h * 0.18} ${
          w * 0.6
        },${h * 0.48}`}
        fill={color}
      />
      <line
        x1={w * 0.08}
        y1={h * 0.65}
        x2={w * 0.08}
        y2={h}
        stroke={color}
        strokeWidth={1.4}
      />
      <line
        x1={w * 0.62}
        y1={h * 0.65}
        x2={w * 0.62}
        y2={h}
        stroke={color}
        strokeWidth={1.4}
      />
    </g>
  );
}

function EmergenceIcon({
  x,
  y,
  color,
  size = 13,
}: {
  x: number;
  y: number;
  color: string;
  size?: number;
}) {
  const r = size / 2;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={0} cy={0} r={r * 0.28} fill={color} />
      <line x1={0} y1={-r} x2={0} y2={-r * 0.42} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={0} y1={r * 0.42} x2={0} y2={r} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-r} y1={0} x2={-r * 0.42} y2={0} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={r * 0.42} y1={0} x2={r} y2={0} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-r * 0.72} y1={-r * 0.72} x2={-r * 0.32} y2={-r * 0.32} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={r * 0.32} y1={r * 0.32} x2={r * 0.72} y2={r * 0.72} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={r * 0.72} y1={-r * 0.72} x2={r * 0.32} y2={-r * 0.32} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-r * 0.32} y1={r * 0.32} x2={-r * 0.72} y2={r * 0.72} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}

type GenericSymbolType =
  | "circle"
  | "triangle"
  | "diamond"
  | "square"
  | "star"
  | "pentagon";

function getEventSymbolType(event: TimelineContextEvent): GenericSymbolType {
  switch (event.event_type) {
    case "lma_inserted":
    case "lma_removed":
    case "one_lung_ventilation":
    case "two_lung_ventilation":
    case "jet_ventilation":
      return "triangle";
    case "extubated_awake":
    case "extubated_deep":
    case "bronchoscopy":
      return "circle";
    case "block_start":
    case "block_complete":
    case "block_stop":
      return "square";
    case "table_turned_90":
    case "table_turned_180":
      return "diamond";
    case "uterine_incision":
    case "baby_delivered":
    case "tourniquet_inflated":
    case "tourniquet_deflated":
    case "aortic_clamp_on":
    case "aortic_clamp_off":
    case "renal_clamp_on":
    case "renal_clamp_off":
    case "carotid_clamp_on":
    case "carotid_clamp_off":
    case "bypass_on":
    case "bypass_off":
    case "circulatory_arrest":
    case "cpr":
    case "defibrillation":
      return "star";
    default:
      return event.group === "positioning" ? "pentagon" : "circle";
  }
}

function GenericEventSymbol({
  x,
  y,
  color,
  type,
  size = 12,
}: {
  x: number;
  y: number;
  color: string;
  type: GenericSymbolType;
  size?: number;
}) {
  const r = size / 2;

  switch (type) {
    case "triangle":
      return (
        <polygon
          points={`${x},${y - r} ${x + r * 0.92},${y + r * 0.82} ${
            x - r * 0.92
          },${y + r * 0.82}`}
          fill={color}
        />
      );
    case "diamond":
      return (
        <polygon
          points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
          fill={color}
        />
      );
    case "square":
      return (
        <rect
          x={x - r}
          y={y - r}
          width={size}
          height={size}
          rx={2}
          fill={color}
        />
      );
    case "star": {
      const outer = r;
      const inner = r * 0.48;
      const points = Array.from({ length: 10 }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI) / 5;
        const radius = index % 2 === 0 ? outer : inner;

        return `${x + Math.cos(angle) * radius},${
          y + Math.sin(angle) * radius
        }`;
      }).join(" ");

      return <polygon points={points} fill={color} />;
    }
    case "pentagon": {
      const points = Array.from({ length: 5 }, (_, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
        return `${x + Math.cos(angle) * r},${y + Math.sin(angle) * r}`;
      }).join(" ");

      return <polygon points={points} fill={color} />;
    }
    case "circle":
    default:
      return <circle cx={x} cy={y} r={r} fill={color} />;
  }
}

function TimelineMiniIcon({
  event,
  x,
  y,
  color,
}: {
  event: TimelineContextEvent;
  x: number;
  y: number;
  color: string;
}) {
  if (event.event_type === "emergence") {
    return <EmergenceIcon x={x} y={y} color={color} />;
  }

  if (event.label?.includes("Head-of-bed Positioning")) {
    return <BedIcon x={x} y={y} color={color} tilted />;
  }

  if (event.label?.includes("Bed Position:")) {
    return <BedIcon x={x} y={y} color={color} tilted={false} />;
  }

  return (
    <GenericEventSymbol
      x={x}
      y={y}
      color={color}
      type={getEventSymbolType(event)}
      size={10}
    />
  );
}

function LegendIcon({
  event,
  color = "#374151",
}: {
  event: TimelineContextEvent;
  color?: string;
}) {
  if (event.event_type === "emergence") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" className="mr-1 inline-block align-[-2px]">
        <EmergenceIcon x={7} y={7} color={color} size={12} />
      </svg>
    );
  }

  if (event.label?.includes("Head-of-bed Positioning")) {
    return (
      <svg width="16" height="14" viewBox="0 0 16 14" className="mr-1 inline-block align-[-2px]">
        <BedIcon x={8} y={7} color={color} tilted size={13} />
      </svg>
    );
  }

  if (event.label?.includes("Bed Position:")) {
    return (
      <svg width="16" height="14" viewBox="0 0 16 14" className="mr-1 inline-block align-[-2px]">
        <BedIcon x={8} y={7} color={color} tilted={false} size={13} />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="mr-1 inline-block align-[-2px]">
      <GenericEventSymbol
        x={7}
        y={7}
        color={color}
        type={getEventSymbolType(event)}
        size={11}
      />
    </svg>
  );
}

function AxisSpacer({ height }: { height: number }) {
  return (
    <div className="border-r bg-white" style={{ width: YAXIS_WIDTH, height }} />
  );
}

export default function TimelineContextPanel({
  title = "Timeline and Events",
  context,
  xEnd,
  xTicks,
  timeZero,
  episodeWindow = null,
  timeResolution = 15,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: TimelineContextPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const isSyncingFromSliderRef = React.useRef(false);

  const [sliderValue, setSliderValue] = React.useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = React.useState(0);

  const packedEvents = React.useMemo(() => packEvents(context), [context]);
  const effectiveXEnd = xEnd ?? 0;

  const legendEvents = React.useMemo(() => {
    const items = packedEvents.filter((event) => shouldShowHeaderLabel(event));
    const seen = new Set<string>();

    return items.filter((event) => {
      const key = getEventLegendKey(event);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [packedEvents]);

  const majorStep = React.useMemo(
    () => getChartMajorStep(timeResolution),
    [timeResolution]
  );

  const majorTicks = React.useMemo(() => {
    if (!Number.isFinite(effectiveXEnd) || effectiveXEnd <= 0) return [];
    if (timeResolution === 15 && xTicks && xTicks.length > 0) return xTicks;
    return buildChartTicks(effectiveXEnd, majorStep);
  }, [effectiveXEnd, xTicks, timeResolution, majorStep]);

  const topTimeSlots = React.useMemo(() => {
    if (majorTicks.length === 0) return [];

    return majorTicks.map((tick) => ({
      minute: tick,
      label: formatClockTime(tick, timeZero),
    }));
  }, [majorTicks, timeZero]);

  const { contentWidth, plotWidth } = React.useMemo(
    () => getSharedChartGeometry(effectiveXEnd, timeResolution),
    [effectiveXEnd, timeResolution]
  );

  const minuteToX = React.useCallback(
    (minute: number) => {
      return minuteToChartX(minute, effectiveXEnd, plotWidth);
    },
    [effectiveXEnd, plotWidth]
  );

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (sharedScrollLeft == null) return;

    const nextMax = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = Math.max(0, Math.min(nextMax, sharedScrollLeft));

    setMaxScrollLeft(nextMax);

    if (Math.abs(el.scrollLeft - next) > 1) {
      isSyncingFromSliderRef.current = true;
      el.scrollLeft = next;

      requestAnimationFrame(() => {
        isSyncingFromSliderRef.current = false;
      });
    }

    setSliderValue(next);
  }, [sharedScrollLeft, contentWidth, isExpanded]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateScrollMetrics() {
      const currentEl = scrollRef.current;
      if (!currentEl) return;

      const nextMax = Math.max(
        0,
        currentEl.scrollWidth - currentEl.clientWidth
      );

      setMaxScrollLeft(nextMax);

      const nextScrollLeft = Math.max(
        0,
        Math.min(nextMax, sharedScrollLeft ?? currentEl.scrollLeft)
      );

      if (Math.abs(currentEl.scrollLeft - nextScrollLeft) > 1) {
        isSyncingFromSliderRef.current = true;
        currentEl.scrollLeft = nextScrollLeft;

        requestAnimationFrame(() => {
          isSyncingFromSliderRef.current = false;
        });
      }

      setSliderValue(nextScrollLeft);
    }

    updateScrollMetrics();

    const resizeObserver = new ResizeObserver(updateScrollMetrics);
    resizeObserver.observe(el);

    window.addEventListener("resize", updateScrollMetrics);

    requestAnimationFrame(updateScrollMetrics);
    setTimeout(updateScrollMetrics, 0);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollMetrics);
    };
  }, [contentWidth, isExpanded, sharedScrollLeft]);

  if (!context) return null;
  if (!packedEvents.length) return null;
  if (!Number.isFinite(effectiveXEnd) || effectiveXEnd <= 0) return null;

  return (
    <div className="bg-white p-0">
      <style jsx>{`
        .timeline-scroll-hidden {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .timeline-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .timeline-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
        }

        .timeline-slider:focus {
          outline: none;
        }

        .timeline-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .timeline-slider::-webkit-slider-thumb {
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

        .timeline-slider:hover::-webkit-slider-thumb {
          background: #475569;
        }

        .timeline-slider::-moz-range-track {
          height: 8px;
          background: #d1d5db;
          border-radius: 9999px;
        }

        .timeline-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #64748b;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .timeline-slider:hover::-moz-range-thumb {
          background: #475569;
        }
      `}</style>

      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          <span
            className={`inline-block transition-transform ${
              isExpanded ? "rotate-90" : "rotate-0"
            }`}
          >
            ▶
          </span>
          <span>{title}</span>
        </button>

        {legendEvents.length > 0 && (
          <div className="flex items-center justify-end gap-4 text-xs text-gray-600">
            {legendEvents.map((event) => (
              <span
                key={getEventLegendKey(event)}
                className="inline-flex items-center"
              >
                <LegendIcon event={event} color="#374151" />
                {getEventLegendLabel(event)}
              </span>
            ))}
          </div>
        )}
      </div>

      {isExpanded && (
        <div
          className="grid gap-0"
          style={{
            gridTemplateColumns: `${LEGEND_WIDTH}px ${YAXIS_WIDTH}px minmax(0,1fr)`,
          }}
        >
          <div className="border-r bg-white" style={{ height: SVG_HEIGHT }} />
          <AxisSpacer height={SVG_HEIGHT} />

          <div className="min-w-0">
            <div
              className="overflow-x-hidden overflow-y-hidden"
              style={{ height: SVG_HEIGHT }}
            >
              <div
                ref={scrollRef}
                className="timeline-scroll-hidden"
                style={{ overscrollBehaviorX: "none" }}
                onWheel={(e) => {
                  const el = e.currentTarget;
                  const absX = Math.abs(e.deltaX);
                  const absY = Math.abs(e.deltaY);

                  if (absX <= absY || absX < 1) return;

                  const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
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
                  setMaxScrollLeft(maxScroll);
                  setSliderValue(clamped);
                  onSharedScrollLeftChange?.(clamped);
                }}
                onScroll={(e) => {
                  if (isSyncingFromSliderRef.current) return;

                  const next = e.currentTarget.scrollLeft;
                  const nextMax = Math.max(
                    0,
                    e.currentTarget.scrollWidth - e.currentTarget.clientWidth
                  );

                  setMaxScrollLeft(nextMax);
                  setSliderValue(next);
                  onSharedScrollLeftChange?.(next);
                }}
              >
                <div style={{ width: contentWidth, height: SVG_HEIGHT }}>
                  <svg
                    width={contentWidth}
                    height={SVG_HEIGHT}
                    viewBox={`0 0 ${contentWidth} ${SVG_HEIGHT}`}
                    preserveAspectRatio="none"
                  >
                    {majorTicks.map((tick) => {
                      const x = minuteToX(tick);

                      return (
                        <line
                          key={`tick-${tick}`}
                          x1={x}
                          y1={TOP_PAD}
                          x2={x}
                          y2={SVG_HEIGHT - BOTTOM_PAD}
                          stroke="#C7CED8"
                          strokeWidth={1.2}
                          strokeDasharray="3 4"
                        />
                      );
                    })}

                    {topTimeSlots.map((slot, idx) => {
                      const x = minuteToX(slot.minute);
                      const isFirst = idx === 0;
                      const isLast = idx === topTimeSlots.length - 1;

                      return (
                        <text
                          key={`time-label-${idx}`}
                          x={x}
                          y={TIME_LABEL_Y}
                          textAnchor={
                            isFirst ? "start" : isLast ? "end" : "middle"
                          }
                          fontSize={11}
                          fontWeight={600}
                          fill="#4B5563"
                        >
                          {slot.label}
                        </text>
                      );
                    })}

                    {episodeWindow && (
                      <rect
                        x={minuteToX(episodeWindow.startMin)}
                        y={TOP_PAD}
                        width={Math.max(
                          2,
                          minuteToX(episodeWindow.endMin) -
                            minuteToX(episodeWindow.startMin)
                        )}
                        height={SVG_HEIGHT - TOP_PAD - BOTTOM_PAD}
                        fill="#DBEAFE"
                        fillOpacity={0.28}
                        stroke="#60A5FA"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                    )}

                    <line
                      x1={0}
                      y1={AXIS_Y}
                      x2={minuteToX(effectiveXEnd)}
                      y2={AXIS_Y}
                      stroke="#7C8EA3"
                      strokeWidth={2.1}
                    />

                    <polygon
                      points={`${minuteToX(effectiveXEnd)},${AXIS_Y} ${
                        minuteToX(effectiveXEnd) - 8
                      },${AXIS_Y - 5} ${
                        minuteToX(effectiveXEnd) - 8
                      },${AXIS_Y + 5}`}
                      fill="#7C8EA3"
                    />

                    {packedEvents.map((event, idx) => {
                      const x = minuteToX(event.relative_min!);
                      const c = eventColor(event.group);
                      const label = shortenLabel(event.label ?? "");
                      const showTextLabel = shouldShowTextLabel(event);
                      const isBedIconEvent = shouldUseBedIcon(event);
                      const isPositioning = event.group === "positioning";

                      const stemBase = isPositioning ? 12 : 4;
                      const stemStep = 6;
                      const stemLen = stemBase + event.level * stemStep;

                      const connectorY =
                        event.side === "top"
                          ? AXIS_Y - stemLen
                          : AXIS_Y + stemLen;

                      const labelDx =
                        event.side === "top"
                          ? getTopLabelDx(event.clusterRank, event.level)
                          : getBottomLabelDx(event.clusterRank);

                      const labelX = x + labelDx;
                      const labelY =
                        event.side === "top"
                          ? TOP_LABEL_Y
                          : isPositioning
                            ? BOTTOM_LABEL_Y
                            : BOTTOM_LABEL_Y - 10;

                      return (
                        <g
                          key={`${event.event_type}-${idx}-${event.relative_min}`}
                        >
                          {!isBedIconEvent ? (
                            <circle cx={x} cy={AXIS_Y} r={3} fill={c.fill} />
                          ) : null}

                          {showTextLabel && (
                            <>
                              <line
                                x1={x}
                                y1={AXIS_Y}
                                x2={x}
                                y2={connectorY}
                                stroke={c.stroke}
                                strokeWidth={1.1}
                              />

                              {event.side === "top" && (
                                <polygon
                                  points={`${x},${connectorY - 5} ${
                                    x - 3.5
                                  },${connectorY} ${x + 3.5},${connectorY}`}
                                  fill={c.stroke}
                                />
                              )}

                              {event.side === "bottom" && (
                                <polygon
                                  points={`${x},${connectorY + 5} ${
                                    x - 3.5
                                  },${connectorY} ${x + 3.5},${connectorY}`}
                                  fill={c.stroke}
                                />
                              )}
                            </>
                          )}

                          {showTextLabel ? (
                            <>
                              <line
                                x1={x}
                                y1={connectorY}
                                x2={labelX}
                                y2={connectorY}
                                stroke={c.stroke}
                                strokeWidth={1}
                              />

                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                fontSize={10.5}
                                fontWeight={600}
                                fill={c.text}
                              >
                                {label}
                              </text>

                              <title>{event.label}</title>
                            </>
                          ) : shouldShowHeaderLabel(event) ? (
                            <>
                              <TimelineMiniIcon
                                event={event}
                                x={x}
                                y={AXIS_Y}
                                color={c.text}
                              />
                              <title>{event.label}</title>
                            </>
                          ) : null}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>

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
                className="timeline-slider"
                aria-label="Timeline and event horizontal scroll"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}