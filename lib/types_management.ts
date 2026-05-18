export type ManagementEvent = {
  chart_type: "medication" | "gas";
  row_name: string;
  event_type: string;
  highlight_mode: "point" | "interval";
  time_min: number;
  end_time_min?: number;

  start_time?: string;
  end_time?: string;

  dose?: number;
  unit?: string;
  route?: string;

  change_from?: number;
  change_to?: number;
  change_unit?: string;
};
