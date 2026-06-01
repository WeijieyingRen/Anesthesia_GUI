import type { TimelineContextEvent } from "@/lib/types";

const STATIC_TIMELINE_EVENT_TYPES = new Set([
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
]);

const DYNAMIC_TIMELINE_EVENT_NAMES = {
  airway: new Set([
    "intubation",
    "extubation",
    "lma_inserted",
    "lma_removed",
    "extubated_awake",
    "extubated_deep",
    "one_lung_ventilation",
    "two_lung_ventilation",
    "jet_ventilation",
    "bronchoscopy",
  ]),
  position: new Set([
    "bed_position",
    "position",
    "head_of_bed_positioning",
    "table_turned_90",
    "table_turned_180",
  ]),
  surgical: new Set([
    "procedure_start",
    "procedure_end",
    "uterine_incision",
    "baby_delivered",
    "tourniquet_inflated",
    "tourniquet_deflated",
    "aortic_clamp_on",
    "aortic_clamp_off",
    "renal_clamp_on",
    "renal_clamp_off",
    "carotid_clamp_on",
    "carotid_clamp_off",
    "bypass_on",
    "bypass_off",
    "circulatory_arrest",
    "cpr",
    "defibrillation",
  ]),
} as const;

const STATIC_PRIORITY_EVENT_TYPES = new Set([
  "intubation",
  "extubation",
  "lma_inserted",
  "lma_removed",
  "procedure_start",
  "procedure_end",
  "block_start",
  "block_complete",
  "block_stop",
]);

type DynamicEventInput = {
  event_group?: string;
  event_name?: string;
};

function normalizeKey(value: string | undefined | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function shouldShowStaticTimelineEvent(eventType: string): boolean {
  return STATIC_TIMELINE_EVENT_TYPES.has(normalizeKey(eventType));
}

export function shouldShowDynamicTimelineEvent(
  event: DynamicEventInput
): boolean {
  const group = normalizeKey(event.event_group);
  const name = normalizeKey(event.event_name);

  if (!group || !name) return false;

  if (group === "airway") {
    return DYNAMIC_TIMELINE_EVENT_NAMES.airway.has(name);
  }

  if (group === "position") {
    return DYNAMIC_TIMELINE_EVENT_NAMES.position.has(name);
  }

  if (group === "surgical") {
    return DYNAMIC_TIMELINE_EVENT_NAMES.surgical.has(name);
  }

  return false;
}

export function mapDynamicTimelineGroup(
  eventGroup: string
): "airway" | "positioning" | "block" | "surgical" | null {
  const group = normalizeKey(eventGroup);

  if (group === "airway") return "airway";
  if (group === "position") return "positioning";
  if (group === "block") return "block";
  if (group === "surgical") return "surgical";

  return null;
}

export function removeDynamicEventsCoveredByStatic(
  staticEvents: TimelineContextEvent[],
  dynamicEvents: TimelineContextEvent[]
): TimelineContextEvent[] {
  const coveredStaticTypes = new Set(
    staticEvents
      .map((event) => normalizeKey(event.event_type))
      .filter((eventType) => STATIC_PRIORITY_EVENT_TYPES.has(eventType))
  );

  return dynamicEvents.filter(
    (event) => !coveredStaticTypes.has(normalizeKey(event.event_type))
  );
}
