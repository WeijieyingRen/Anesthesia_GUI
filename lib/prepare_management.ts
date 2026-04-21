import type { ManagementEvent } from "@/lib/types_management";

type CsvRow = Record<string, any>;

function clean(v: any): string {
  return String(v ?? "").trim();
}

function toNumOrUndefined(v: any): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function prepareManagementEvents(rows: CsvRow[]): ManagementEvent[] {
  return rows
    .map((row) => ({
      chart_type: clean(row.chart_type) as "medication" | "gas",
      row_name: clean(row.row_name),
      event_type: clean(row.event_type),
      highlight_mode: clean(row.highlight_mode) as "point" | "interval",
      time_min: Number(row.time_min),
      end_time_min: toNumOrUndefined(row.end_time_min),
      start_time: clean(row.start_time) || undefined,
      end_time: clean(row.end_time) || undefined,
      dose: toNumOrUndefined(row.dose),
      unit: clean(row.unit) || undefined,
      route: clean(row.route) || undefined,
    }))
    .filter(
      (x) =>
        x.chart_type &&
        x.row_name &&
        x.event_type &&
        x.highlight_mode &&
        Number.isFinite(x.time_min)
    );
}