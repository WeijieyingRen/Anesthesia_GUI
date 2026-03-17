"use client";

import * as React from "react";
import type { TimelineContextData, TimelineContextEvent } from "@/lib/types";

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
};

const SVG_WIDTH = 1000;

/**
 * 为了和 VitalChart 对齐：
 * VitalChart 左边 legend 列 = 220
 * 右边 chart 的 YAxis width = 35
 * ScatterChart margin.right = 20
 *
 * 所以 plot 左边界约等于 220 + 35 = 255
 * plot 右边界留 20
 */
const PLOT_LEFT = 225;
const RIGHT_PAD = 20;
const PLOT_WIDTH = SVG_WIDTH - PLOT_LEFT - RIGHT_PAD;

const TOP_PAD = 4;
const BOTTOM_PAD = 4;
const AXIS_Y = 54;
const SVG_HEIGHT = 86;

const TOP_LABEL_Y = 40;
const BOTTOM_LABEL_Y = SVG_HEIGHT - 4;

function shortenLabel(label: string) {
  return label
    .replace("Anesthesia Start", "Anes Start")
    .replace("Anesthesia Stop", "Anes Stop")
    .replace("Procedure Start", "Proc Start")
    .replace("Procedure End", "Proc End")
    .replace("Head-of-bed Positioning", "HOB Position")
    .replace("Tourniquet Inflated", "Tourniquet On")
    .replace("Tourniquet Deflated", "Tourniquet Off")
    .replace("LMA Removed", "LMA Removed")
    .replace("LMA Inserted", "LMA Inserted")
    .replace("Block Complete", "Block Done")
    .replace("Block Handoff", "Block Handoff")
    .replace("Bed Position:", "Bed:");
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

type PackedEvent = TimelineContextEvent & {
  side: "top" | "bottom";
  level: number;
  clusterRank: number;
};

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

export default function TimelineContextPanel({
  context,
  xEnd,
  xTicks,
  episodeWindow = null,
}: TimelineContextPanelProps) {
  const packedEvents = React.useMemo(() => packEvents(context), [context]);

  if (!context) return null;
  if (!packedEvents.length) return null;

  return (
    <div className="rounded-lg border bg-white px-1 py-0.5 shadow-sm">
      <div className="overflow-x-auto">
        <svg
          width="100%"
          height={SVG_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          preserveAspectRatio="none"
        >
          {xTicks.map((tick) => {
            const x = PLOT_LEFT + (tick / xEnd) * PLOT_WIDTH;
            return (
              <line
                key={`tick-${tick}`}
                x1={x}
                y1={TOP_PAD}
                x2={x}
                y2={SVG_HEIGHT - BOTTOM_PAD}
                stroke="#E5E7EB"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
            );
          })}

          {episodeWindow && (
            <rect
              x={PLOT_LEFT + (episodeWindow.startMin / xEnd) * PLOT_WIDTH}
              y={TOP_PAD}
              width={Math.max(
                2,
                ((episodeWindow.endMin - episodeWindow.startMin) / xEnd) *
                  PLOT_WIDTH
              )}
              height={SVG_HEIGHT - TOP_PAD - BOTTOM_PAD}
              fill="#DBEAFE"
              fillOpacity={0.28}
              stroke="#60A5FA"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}
          <text
          x={12}
          y={AXIS_Y + 1}
          fontSize={15}
          fontWeight={800}
          fill="#374151"
          dominantBaseline="middle"
        >
          Timeline
        </text>

          <line
            x1={PLOT_LEFT}
            y1={AXIS_Y}
            x2={PLOT_LEFT + PLOT_WIDTH}
            y2={AXIS_Y}
            stroke="#7C8EA3"
            strokeWidth={2.1}
          />
          <polygon
            points={`${PLOT_LEFT + PLOT_WIDTH},${AXIS_Y} ${PLOT_LEFT + PLOT_WIDTH - 8},${AXIS_Y - 5} ${PLOT_LEFT + PLOT_WIDTH - 8},${AXIS_Y + 5}`}
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

            const x = PLOT_LEFT + (t / xEnd) * PLOT_WIDTH;
            const c = eventColor(event.group);
            const label = shortenLabel(event.label);

            const isPositioning = event.group === "positioning";

            const stemBase = isPositioning ? 12 : 4;
            const stemStep = isPositioning ? 6 : 6;
            const stemLen = stemBase + event.level * stemStep;

            let connectorY =
              event.side === "top" ? AXIS_Y - stemLen : AXIS_Y + stemLen;

            const labelDx =
              event.side === "top"
                ? getTopLabelDx(event.clusterRank, event.level)
                : getBottomLabelDx(event.clusterRank);

            const labelX = x + labelDx;
            const anchor = "middle";

            const labelY =
              event.side === "top"
                ? TOP_LABEL_Y
                : isPositioning
                ? BOTTOM_LABEL_Y
                : BOTTOM_LABEL_Y - 10;

            if (isPositioning && event.side === "bottom") {
              connectorY = Math.min(connectorY, labelY - 14);
            }

            return (
              <g key={`${event.event_type}-${idx}`}>
                <circle cx={x} cy={AXIS_Y} r={3} fill={c.fill} />

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
                  textAnchor={anchor}
                  fontSize={10.5}
                  fontWeight={600}
                  fill={c.text}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}