export type AnnotationTaskKey =
  | "detect"
  | "mechanism"
  | "fluidEval";

export type PatientTaskKey =
  | "summary"
  | "preventedEpisode"
  | "contextualEvent";

export type WorkspaceTaskKey = AnnotationTaskKey | PatientTaskKey;

export type DetectVital =
  | "MAP"
  | "SBP"
  | "DBP"
  | "HR"
  | "SPO2"
  | "RR"
  | "ETCO2"
  | "TEMP";

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
  | "Bradycardia"
  | "Tachycardia"
  | "Hypoxia"
  | "Hypercapnia"
  | "Hypocapnia"
  | "Tachypnea"
  | "Bradypnea"
  | "Hypothermia"
  | "Hyperthermia";

export type DetectEventType = EventType | "Others";

export type EpisodeEvolution =
  | "Sudden onset"
  | "Gradual change"
  | "Persistent abnormality"
  | "Fluctuating pattern"
  | "Recovering / resolving"
  | "Worsening"
  | "Mixed or unclear";

export type OverallCharacterization =
  | "Expected physiologic change"
  | "Expected treatment response"
  | "Transient fluctuation / likely not clinically important"
  | "Clinically significant abnormality"
  | "Recovery / correction phase"
  | "Mixed or unclear pattern"
  | "Others";

export type SeverityLevel = "Mild" | "Moderate" | "Severe";

export type DetectAnnotation = {
  vital: DetectVital;
  primaryVitals?: DetectVital[];

  startMin: number;
  endMin: number;

  note: string;

  eventType: DetectEventType | "";
  eventTypeOther: string;

  episodeEvolution: EpisodeEvolution | "";
  episodeEvolutionNote: string;

  overallCharacterization: OverallCharacterization | "";
  overallInterpretationNote: string;

  severity: SeverityLevel | "";
  confidence: number | null;
};

export type UserActionLogItem = {
  type: string;
  ts: number;
  payload?: Record<string, any>;
};