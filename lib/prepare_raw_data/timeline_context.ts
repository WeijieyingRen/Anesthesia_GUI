import type { TimelineContextData, TimelineContextEvent } from "@/lib/types";
import {
  mapDynamicTimelineGroup,
  removeDynamicEventsCoveredByStatic,
  shouldShowDynamicTimelineEvent,
  shouldShowStaticTimelineEvent,
} from "@/lib/timeline-event-config";

const toDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const toRelativeMinute = (
  eventTime: any,
  anesthesiaStart: any
): number | undefined => {
  const t = toDate(eventTime);
  const t0 = toDate(anesthesiaStart);
  if (!t || !t0) return undefined;

  const diffMin = (t.getTime() - t0.getTime()) / 60000;
  return Number.isFinite(diffMin) ? Math.round(diffMin) : undefined;
};

const hasValue = (v: any): boolean => {
  return !(v === null || v === undefined || String(v).trim() === "");
};

const toYesNo = (v: any): boolean => Number(v) === 1;

const STATIC_STAGE_KEYS = [
  "anesthesia_start",
  "anesthesia_stop",
  "procedure_start",
  "procedure_end",
  "induction",
  "intubation",
  "extubation",
  "lma_inserted",
  "lma_removed",
  "block_start",
  "block_complete",
  "block_stop",
] as const;

function formatStaticLabel(key: string): string {
  const labelMap: Record<string, string> = {
    anesthesia_start: "Anesthesia Start",
    anesthesia_stop: "Anesthesia Stop",
    procedure_start: "Procedure Start",
    procedure_end: "Procedure End",
    induction: "Induction",
    intubation: "Intubation",
    extubation: "Extubation",
    lma_inserted: "LMA Inserted",
    lma_removed: "LMA Removed",
    block_start: "Block Start",
    block_complete: "Block Complete",
    block_stop: "Block Stop",
  };

  return labelMap[key] ?? key;
}

function formatDynamicLabel(eventType: string, eventLabel: any): string {
  const labelText = String(eventLabel ?? "").trim();
  if (labelText) return labelText;

  return eventType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferCurrentStage(
  staticEvents: TimelineContextEvent[],
  episodeStartMin?: number,
  episodeEndMin?: number
): string | undefined {
  if (
    episodeStartMin === undefined ||
    episodeEndMin === undefined ||
    !Number.isFinite(episodeStartMin) ||
    !Number.isFinite(episodeEndMin)
  ) {
    return undefined;
  }

  const center = (episodeStartMin + episodeEndMin) / 2;

  const timeOf = (key: string) =>
    staticEvents.find((e) => e.event_type === key)?.relative_min;

  const induction = timeOf("induction");
  const intubation = timeOf("intubation");
  const procedureStart = timeOf("procedure_start");
  const procedureEnd = timeOf("procedure_end");
  const extubation = timeOf("extubation");
  const anesthesiaStop = timeOf("anesthesia_stop");

  if (induction !== undefined && center < induction) return "Pre-induction";
  if (
    induction !== undefined &&
    intubation !== undefined &&
    center >= induction &&
    center <= intubation
  ) {
    return "Induction / Peri-intubation";
  }
  if (
    intubation !== undefined &&
    procedureStart !== undefined &&
    center > intubation &&
    center < procedureStart
  ) {
    return "Post-intubation / Pre-procedure";
  }
  if (
    procedureStart !== undefined &&
    procedureEnd !== undefined &&
    center >= procedureStart &&
    center <= procedureEnd
  ) {
    return "Intraoperative Procedure";
  }
  if (
    procedureEnd !== undefined &&
    extubation !== undefined &&
    center > procedureEnd &&
    center <= extubation
  ) {
    return "Post-procedure / Pre-extubation";
  }
  if (
    extubation !== undefined &&
    anesthesiaStop !== undefined &&
    center >= extubation &&
    center <= anesthesiaStop
  ) {
    return "Emergence / Post-extubation";
  }
  if (anesthesiaStop !== undefined && center > anesthesiaStop) {
    return "Post-anesthesia";
  }

  return "Perioperative";
}

export function prepareTimelineContextData(
  caseStaticRow: Record<string, any>,
  caseDynamicRows: Record<string, any>[],
  episodeStartMin?: number,
  episodeEndMin?: number,
  nearbyWindowMin = 15
): TimelineContextData {
  const anesthesiaStart = caseStaticRow["anesthesia_start"] ?? undefined;
  const visualizationStart =
    caseStaticRow["__visualization_start"] ??
    caseStaticRow["anesthesia_start"] ??
    undefined;

  const visualizationOffsetMin =
    toRelativeMinute(anesthesiaStart, visualizationStart) ?? 0;

  const staticEvents = STATIC_STAGE_KEYS
    .map((key): TimelineContextEvent | null => {
      const rawTime = caseStaticRow[key];
      if (!shouldShowStaticTimelineEvent(key)) return null;
      if (!hasValue(rawTime)) return null;
      if (!toDate(rawTime)) return null;

      return {
        source: "static",
        group: "milestone",
        event_type: key,
        label: formatStaticLabel(key),
        raw_value: rawTime,
        observation_time: rawTime,
        relative_min: toRelativeMinute(rawTime, visualizationStart),
      };
    })
    .filter((x): x is TimelineContextEvent => x !== null)
    .sort((a, b) => (a.relative_min ?? 0) - (b.relative_min ?? 0));

  const dynamicEventsBeforeConflictRemoval: TimelineContextEvent[] = [];

  for (const row of caseDynamicRows ?? []) {
    const eventGroup = String(row["event_group"] ?? "").trim();
    const eventType = String(row["event_name"] ?? "").trim();
    const eventValue = row["event_value"];
    const eventLabel = row["event_label"];
    const observationTime = String(row["observation_time"] ?? "").trim() || undefined;
    const group = mapDynamicTimelineGroup(eventGroup);

    if (!group) continue;
    if (!shouldShowDynamicTimelineEvent({ event_group: eventGroup, event_name: eventType })) {
      continue;
    }

    const relativeMinRaw = Number(row["relative_anesthesia_time"]);
    const relativeMin = Number.isFinite(relativeMinRaw)
      ? relativeMinRaw + visualizationOffsetMin
      : toRelativeMinute(observationTime, visualizationStart);

    dynamicEventsBeforeConflictRemoval.push({
      source: "dynamic",
      group,
      event_type: eventType,
      label: formatDynamicLabel(eventType, eventLabel),
      raw_value: eventValue,
      observation_time: observationTime,
      relative_min: relativeMin,
    });
  }

  const dynamicEvents = removeDynamicEventsCoveredByStatic(
    staticEvents,
    dynamicEventsBeforeConflictRemoval
  );

  dynamicEvents.sort((a, b) => (a.relative_min ?? 0) - (b.relative_min ?? 0));

  const caseBadges = [
    caseStaticRow["anesthesia_type"]
      ? `Anesthesia: ${caseStaticRow["anesthesia_type"]}`
      : null,
    caseStaticRow["airway_type"]
      ? `Airway Type: ${caseStaticRow["airway_type"]}`
      : null,
    caseStaticRow["airway"] ? `Airway: ${caseStaticRow["airway"]}` : null,
    toYesNo(caseStaticRow["arterial_line_present"]) ? "A-line" : null,
    toYesNo(caseStaticRow["central_line_present"]) ? "Central line" : null,
    toYesNo(caseStaticRow["pa_cath_present"]) ? "PA cath" : null,
    toYesNo(caseStaticRow["lumbar_drain_present"]) ? "Lumbar drain" : null,
    toYesNo(caseStaticRow["blood_warmer_present"]) ? "Blood warmer" : null,
    toYesNo(caseStaticRow["tee_present"]) ? "TEE" : null,
    toYesNo(caseStaticRow["tte_present"]) ? "TTE" : null,
    toYesNo(caseStaticRow["bronchoscopy_present"]) ? "Bronchoscopy" : null,
    toYesNo(caseStaticRow["one_lung_ventilation_present"])
      ? "One-lung ventilation"
      : null,
    toYesNo(caseStaticRow["two_lung_ventilation_present"])
      ? "Two-lung ventilation"
      : null,
    toYesNo(caseStaticRow["o2_delivery_for_mac_present"])
      ? "O₂ delivery for MAC"
      : null,
    toYesNo(caseStaticRow["peripheral_nerve_block_present"])
      ? "Peripheral nerve block"
      : null,
    toYesNo(caseStaticRow["nerve_block_catheter_present"])
      ? "Nerve block catheter"
      : null,
    toYesNo(caseStaticRow["neuraxial_block_present"])
      ? "Neuraxial block"
      : null,
    toYesNo(caseStaticRow["spinal_block_present"]) ? "Spinal block" : null,
    toYesNo(caseStaticRow["epidural_block_present"]) ? "Epidural block" : null,
    toYesNo(caseStaticRow["anesthesia_block_epidural_present"])
      ? "Anesthesia epidural"
      : null,
    toYesNo(caseStaticRow["intentional_hypothermia_present"])
      ? "Intentional hypothermia"
      : null,
  ].filter((x): x is string => Boolean(x));

  let nearbyEvents = dynamicEvents;

  if (
    episodeStartMin !== undefined &&
    episodeEndMin !== undefined &&
    Number.isFinite(episodeStartMin) &&
    Number.isFinite(episodeEndMin)
  ) {
    const left = episodeStartMin - nearbyWindowMin;
    const right = episodeEndMin + nearbyWindowMin;

    nearbyEvents = dynamicEvents.filter((e) => {
      const t = e.relative_min;
      return t !== undefined && t >= left && t <= right;
    });
  }

  return {
    case_badges: caseBadges,
    current_stage: inferCurrentStage(
      staticEvents,
      episodeStartMin,
      episodeEndMin
    ),
    milestone_events: staticEvents,
    nearby_events: nearbyEvents,
    airway_events: nearbyEvents.filter((e) => e.group === "airway"),
    positioning_events: nearbyEvents.filter((e) => e.group === "positioning"),
    block_events: nearbyEvents.filter((e) => e.group === "block"),
    surgical_events: nearbyEvents.filter((e) => e.group === "surgical"),
  };
}
