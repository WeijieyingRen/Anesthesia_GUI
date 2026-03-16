import type { TimelineStatic, TimelineEvent } from "@/lib/types";

export function prepareTimelineStaticData(
  caseStaticRow: Record<string, any>
): TimelineStatic {
  return {
    anesthesia_start: caseStaticRow["anesthesia_start"] ?? undefined,
    induction: caseStaticRow["induction"] ?? undefined,
    intubation: caseStaticRow["intubation"] ?? undefined,
    procedure_start: caseStaticRow["procedure_start"] ?? undefined,
    procedure_end: caseStaticRow["procedure_end"] ?? undefined,
    extubation: caseStaticRow["extubation"] ?? undefined,
    anesthesia_stop: caseStaticRow["anesthesia_stop"] ?? undefined,
    emergence: caseStaticRow["emergence"] ?? undefined,
    anesthesia_timeout: caseStaticRow["anesthesia_timeout"] ?? undefined,
  };
}

const DYNAMIC_EVENT_KEYS = [
  "aortic_clamp_off",
  "aortic_clamp_on",
  "artery_clamp_on",
  "bed_position",
  "block_complete",
  "block_handoff",
  "block_start",
  "block_stop",
  "carotid_clamp_off",
  "carotid_clamp_on",
  "cooling_started",
  "cpr",
  "defibrillation",
  "head_of_bed_positioning",
  "lma_inserted",
  "lma_removed",
  "position",
  "renal_clamp_off",
  "renal_clamp_on",
  "table_turned_180",
  "table_turned_90",
  "throat_pack_in",
  "throat_pack_out",
  "tourniquet_deflated",
  "tourniquet_inflated",
] as const;

export function prepareTimelineDynamicEvents(
  rows: Record<string, any>[]
): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  for (const row of rows) {
    const obsTime = row["observation_time"] ?? undefined;

    for (const key of DYNAMIC_EVENT_KEYS) {
      const value = row[key];
      if (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        value !== 0 &&
        value !== "0"
      ) {
        out.push({
          observation_time: obsTime,
          event_type: key,
          event_value: value,
        });
      }
    }
  }

  return out;
}