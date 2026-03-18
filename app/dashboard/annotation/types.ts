export type AnnotationTaskKey =
  | "detect"
  | "mechanism"
  | "gasEval"
  | "medEval"
  | "fluidEval"
  | "response";

export type PatientTaskKey = "summary";

export type WorkspaceTaskKey = AnnotationTaskKey | PatientTaskKey;

export type DetectVital = "MAP" | "HR" | "SPO2" | "RR" | "ETCO2" | "TEMP";

export type SidebarEventItem = {
  id: string;
  vital: DetectVital;
  title: string;
  episodeLabel: string;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
  completed: Record<AnnotationTaskKey, boolean>;
};

export type EventType =
  | "Hypotension"
  | "Hypertension"
  | "Hypoxia"
  | "Hypercapnia"
  | "Hypocapnia"
  | "Tachypnea"
  | "Bradypnea"
  | "Hypothermia"
  | "Hyperthermia";

export type SeverityLevel = "Mild" | "Moderate" | "Severe";

export type DetectAnnotation = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  eventType: EventType | "";
  severity: SeverityLevel | "";
  confidence: number | null;
  note: string;
};

export type UserActionLogItem = {
  type: string;
  ts: number;
  payload?: Record<string, any>;
};