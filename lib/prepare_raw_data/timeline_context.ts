import type { TimelineContextData, TimelineContextEvent } from "@/lib/types";

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
  return !(
    v === null ||
    v === undefined ||
    v === "" ||
    v === 0 ||
    v === "0"
  );
};

const toYesNo = (v: any): boolean => Number(v) === 1;

const STATIC_STAGE_KEYS = [
  "anesthesia_start",
  "induction",
  "intubation",
  "procedure_start",
  "procedure_end",
  "extubation",
  "emergence",
  "anesthesia_stop",
] as const;

const DYNAMIC_EVENT_GROUPS: Record<string, TimelineContextEvent["group"]> = {
  lma_inserted: "airway",
  lma_removed: "airway",
  throat_pack_in: "airway",
  throat_pack_out: "airway",
  head_of_bed_positioning: "airway",

  bed_position: "positioning",
  position: "positioning",
  table_turned_90: "positioning",
  table_turned_180: "positioning",
  cooling_started: "positioning",

  block_start: "block",
  block_stop: "block",
  block_complete: "block",
  block_handoff: "block",

  aortic_clamp_on: "surgical",
  aortic_clamp_off: "surgical",
  carotid_clamp_on: "surgical",
  carotid_clamp_off: "surgical",
  renal_clamp_on: "surgical",
  renal_clamp_off: "surgical",
  artery_clamp_on: "surgical",
  tourniquet_inflated: "surgical",
  tourniquet_deflated: "surgical",
  cpr: "surgical",
  defibrillation: "surgical",
};

function formatStaticLabel(key: string): string {
  const labelMap: Record<string, string> = {
    anesthesia_start: "Anesthesia Start",
    induction: "Induction",
    intubation: "Intubation",
    procedure_start: "Procedure Start",
    procedure_end: "Procedure End",
    extubation: "Extubation",
    emergence: "Emergence",
    anesthesia_stop: "Anesthesia Stop",
    anesthesia_timeout: "Anesthesia Timeout",
  };

  return labelMap[key] ?? key;
}

function formatDynamicLabel(eventType: string, eventValue: any): string {
  const valueText =
    typeof eventValue === "string"
      ? eventValue.trim()
      : String(eventValue ?? "").trim();

  switch (eventType) {
    case "bed_position":
      return valueText ? `Bed Position: ${valueText}` : "Bed Position";
    case "position":
      return valueText ? `Position: ${valueText}` : "Position";
    case "head_of_bed_positioning":
      return valueText
        ? `Head-of-bed: ${valueText}`
        : "Head-of-bed Positioning";
    case "lma_inserted":
      return "LMA Inserted";
    case "lma_removed":
      return "LMA Removed";
    case "throat_pack_in":
      return "Throat Pack In";
    case "throat_pack_out":
      return "Throat Pack Out";
    case "block_start":
      return "Block Start";
    case "block_stop":
      return "Block Stop";
    case "block_complete":
      return "Block Complete";
    case "block_handoff":
      return "Block Handoff";
    case "cooling_started":
      return "Cooling Started";
    case "cpr":
      return "CPR";
    case "defibrillation":
      return "Defibrillation";
    case "tourniquet_inflated":
      return "Tourniquet Inflated";
    case "tourniquet_deflated":
      return "Tourniquet Deflated";
    case "aortic_clamp_on":
      return "Aortic Clamp On";
    case "aortic_clamp_off":
      return "Aortic Clamp Off";
    case "carotid_clamp_on":
      return "Carotid Clamp On";
    case "carotid_clamp_off":
      return "Carotid Clamp Off";
    case "renal_clamp_on":
      return "Renal Clamp On";
    case "renal_clamp_off":
      return "Renal Clamp Off";
    case "artery_clamp_on":
      return "Artery Clamp On";
    case "table_turned_90":
      return "Table Turned 90°";
    case "table_turned_180":
      return "Table Turned 180°";
    default:
      return valueText ? `${eventType}: ${valueText}` : eventType;
  }
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

  const staticEvents = STATIC_STAGE_KEYS
    .map((key): TimelineContextEvent | null => {
      const rawTime = caseStaticRow[key];
      if (!rawTime) return null;

      return {
        source: "static",
        group: "milestone",
        event_type: key,
        label: formatStaticLabel(key),
        raw_value: rawTime,
        observation_time: rawTime,
        relative_min: toRelativeMinute(rawTime, anesthesiaStart),
      };
    })
    .filter((x): x is TimelineContextEvent => x !== null)
    .sort((a, b) => (a.relative_min ?? 0) - (b.relative_min ?? 0));

  const dynamicEvents: TimelineContextEvent[] = [];

  for (const row of caseDynamicRows ?? []) {
    const obsTime = row["observation_time"] ?? undefined;
    const relMin = toRelativeMinute(obsTime, anesthesiaStart);

    for (const [eventType, group] of Object.entries(DYNAMIC_EVENT_GROUPS)) {
      const value = row[eventType];
      if (!hasValue(value)) continue;

      dynamicEvents.push({
        source: "dynamic",
        group,
        event_type: eventType,
        label: formatDynamicLabel(eventType, value),
        raw_value: value,
        observation_time: obsTime,
        relative_min: relMin,
      });
    }
  }

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