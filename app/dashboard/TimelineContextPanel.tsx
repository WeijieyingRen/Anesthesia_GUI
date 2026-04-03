"use client";

import * as React from "react";
import type { TimelineContextData, TimelineContextEvent } from "@/lib/types";

type TimeResolution = 15 | 5;

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

const LEGEND_WIDTH = 220;
const YAXIS_WIDTH = 35;
const CHART_RIGHT_MARGIN = 20;

const PX_PER_15_MIN = 64;

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

  const dt = new Date(base.getTime() + offsetMin * 60000);
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
  ]);

  return textEvents.has(event.event_type);
}

function shouldShowIconLabel(event: TimelineContextEvent) {
  return (
    event.event_type === "emergence" ||
    (event.group === "positioning" &&
      (event.label?.includes("Bed Position:") ||
        event.label?.includes("Head-of-bed Positioning")))
  );
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

  return "";
}

function getEventLegendKey(event: TimelineContextEvent) {
  if (event.event_type === "emergence") return "emergence";
  if (event.label?.includes("Head-of-bed Positioning")) return "hob_position";
  if (event.label?.includes("Bed Position:")) return "bed_position";
  return "";
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
  ].filter((e) => e.relative_min !== undefined && Number.isFinite(e.relative_min));

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
        <rect x={0} y={h * 0.35} width={w * 0.78} height={h * 0.28} rx={1.2} fill={color} />
        <rect x={0} y={0} width={w * 0.18} height={h * 0.7} rx={1.2} fill={color} />
        <line x1={w * 0.08} y1={h * 0.63} x2={w * 0.08} y2={h} stroke={color} strokeWidth={1.4} />
        <line x1={w * 0.68} y1={h * 0.63} x2={w * 0.68} y2={h} stroke={color} strokeWidth={1.4} />
      </g>
    );
  }

  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect x={0} y={h * 0.48} width={w * 0.72} height={h * 0.22} rx={1.2} fill={color} />
      <polygon
        points={`${w * 0.12},${h * 0.48} ${w * 0.38},${h * 0.18} ${w * 0.6},${h * 0.48}`}
        fill={color}
      />
      <line x1={w * 0.08} y1={h * 0.65} x2={w * 0.08} y2={h} stroke={color} strokeWidth={1.4} />
      <line x1={w * 0.62} y1={h * 0.65} x2={w * 0.62} y2={h} stroke={color} strokeWidth={1.4} />
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

  return null;
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

  return null;
}

function AxisSpacer({ height }: { height: number }) {
  return (
    <div
      className="border-r bg-white"
      style={{ width: YAXIS_WIDTH, height }}
    />
  );
}

function getPxPerMinute(timeResolution: TimeResolution) {
  return timeResolution === 5 ? PX_PER_15_MIN / 5 : PX_PER_15_MIN / 15;
}

function getMajorStep(timeResolution: TimeResolution) {
  return timeResolution === 5 ? 5 : 15;
}

function buildTicks(end: number, step: number) {
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

  const packedEvents = React.useMemo(() => packEvents(context), [context]);

  const legendEvents = React.useMemo(() => {
    const items = packedEvents.filter((event) => shouldShowIconLabel(event));
    const seen = new Set<string>();

    return items.filter((event) => {
      const key = getEventLegendKey(event);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [packedEvents]);

  const majorStep = React.useMemo(() => getMajorStep(timeResolution), [timeResolution]);
  const pxPerMin = React.useMemo(() => getPxPerMinute(timeResolution), [timeResolution]);

  const majorTicks = React.useMemo(() => {
    if (!Number.isFinite(xEnd) || xEnd <= 0) return [];
    if (timeResolution === 15 && xTicks && xTicks.length > 0) return xTicks;
    return buildTicks(xEnd, majorStep);
  }, [xEnd, xTicks, timeResolution, majorStep]);

  const topTimeSlots = React.useMemo(() => {
    if (majorTicks.length === 0) return [];

    return majorTicks.map((tick) => ({
      minute: tick,
      label: formatClockTime(tick, timeZero),
    }));
  }, [majorTicks, timeZero]);

  const contentPlotWidth = React.useMemo(() => {
    if (!xEnd || xEnd <= 0) return 800;
    return Math.max(800, Math.ceil(xEnd * pxPerMin));
  }, [xEnd, pxPerMin]);

  const contentWidth = contentPlotWidth + CHART_RIGHT_MARGIN;
  const plotWidth = contentPlotWidth;

  const minuteToX = React.useCallback(
    (minute: number) => {
      if (!Number.isFinite(xEnd) || xEnd <= 0) return 0;
      return (minute / xEnd) * plotWidth;
    },
    [xEnd, plotWidth]
  );

  React.useEffect(() => {
    if (scrollRef.current == null) return;
    if (sharedScrollLeft == null) return;

    if (Math.abs(scrollRef.current.scrollLeft - sharedScrollLeft) > 1) {
      scrollRef.current.scrollLeft = sharedScrollLeft;
    }
  }, [sharedScrollLeft]);

  if (!context) return null;
  if (!packedEvents.length) return null;
  if (!Number.isFinite(xEnd) || xEnd <= 0) return null;

  return (
    <div className="rounded-lg border bg-white px-2 py-1 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          <span
            className={`inline-block transition-transform ${isExpanded ? "rotate-90" : "rotate-0"}`}
          >
            ▶
          </span>
          <span>{title}</span>
        </button>

        {legendEvents.length > 0 && (
          <div className="flex items-center justify-end gap-4 text-xs text-gray-600">
            {legendEvents.map((event) => (
              <span key={getEventLegendKey(event)} className="inline-flex items-center">
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
          <div />
          <AxisSpacer height={SVG_HEIGHT} />

          <div
            className="overflow-x-auto overflow-y-hidden"
            ref={scrollRef}
            onScroll={(e) => {
              onSharedScrollLeftChange?.(e.currentTarget.scrollLeft);
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
                      textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
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
                      minuteToX(episodeWindow.endMin) - minuteToX(episodeWindow.startMin)
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
                  x2={minuteToX(xEnd)}
                  y2={AXIS_Y}
                  stroke="#7C8EA3"
                  strokeWidth={2.1}
                />
                <polygon
                  points={`${minuteToX(xEnd)},${AXIS_Y} ${minuteToX(xEnd) - 8},${AXIS_Y - 5} ${minuteToX(xEnd) - 8},${AXIS_Y + 5}`}
                  fill="#7C8EA3"
                />

                {packedEvents.map((event, idx) => {
                  const tRaw = event.relative_min!;
                  const t =
                    event.event_type === "anesthesia_start"
                      ? 0
                      : event.event_type === "anesthesia_stop"
                        ? xEnd
                        : tRaw;

                  const x = minuteToX(t);
                  const c = eventColor(event.group);
                  const label = shortenLabel(event.label ?? "");
                  const showTextLabel = shouldShowTextLabel(event);
                  const showIconLabel = shouldShowIconLabel(event);
                  const isPositioning = event.group === "positioning";

                  const stemBase = isPositioning ? 12 : 4;
                  const stemStep = 6;
                  const stemLen = stemBase + event.level * stemStep;

                  const connectorY =
                    event.side === "top" ? AXIS_Y - stemLen : AXIS_Y + stemLen;

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

                  const iconY = event.side === "top" ? AXIS_Y - 12 : AXIS_Y + 12;

                  return (
                    <g key={`${event.event_type}-${idx}-${event.relative_min}`}>
                      <circle cx={x} cy={AXIS_Y} r={3} fill={c.fill} />

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
                              points={`${x},${connectorY - 5} ${x - 3.5},${connectorY} ${x + 3.5},${connectorY}`}
                              fill={c.stroke}
                            />
                          )}

                          {event.side === "bottom" && (
                            <polygon
                              points={`${x},${connectorY + 5} ${x - 3.5},${connectorY} ${x + 3.5},${connectorY}`}
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
                      ) : showIconLabel ? (
                        <>
                          <TimelineMiniIcon event={event} x={x} y={iconY} color={c.text} />
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
      )}
    </div>
  );
}