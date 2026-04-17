export type AnnotationTaskKey =
  | "detect"
  | "mechanism"
  | "fluidEval";

export type PatientTaskKey =
  | "summary"
  | "preventedEpisode"
  | "contextualEvent";

export type WorkspaceTaskKey = AnnotationTaskKey | PatientTaskKey;

export type EpisodeWorkflowStage =
  | "select_all"
  | "pick_top3"
  | "annotate";

export type EpisodeAnnotateStep =
  | "detect"
  | "mechanism"
  | "fluidEval";

export type DetectVital =
  | "MAP"
  | "SBP"
  | "DBP"
  | "HR"
  | "SPO2"
  | "RR"
  | "ETCO2"
  | "TEMP";

  export type DetectedEpisodeItem = {
    id: string;
    label: string;
    vital: DetectVital;
    startMin: number;
    endMin: number;
    y1: number;
    y2: number;
    selectedForAnnotation: boolean;
  };

export type EpisodeAnnotationState = {
  stage: EpisodeWorkflowStage;
  annotateStep: EpisodeAnnotateStep;
  detectedEpisodes: DetectedEpisodeItem[];
  prioritizedEpisodeIds: string[];
  activeEpisodeId: string | null;
};

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

export type AssociatedChangeChoice = "Yes" | "No" | "Unclear";

export type ContinueAnnotationChoice =
  | "Yes, continue annotation"
  | "No, likely artifact / too minor / not useful"
  | "Unclear";

export type OnsetPattern =
  | "Sudden onset"
  | "Gradual onset"
  | "Unclear onset";

export type EpisodeCourse =
  | "Persistent / stable abnormality"
  | "Fluctuating / labile pattern"
  | "Improving / recovering"
  | "Worsening"
  | "Mixed / unclear";

export type SeverityLevel = "Mild" | "Moderate" | "Severe";

export type ConfidenceLevel = 1 | 2 | 3 | 4 | 5;

export type DetectAnnotation = {
  vital: DetectVital;
  primaryVitals: DetectVital[];

  startMin: number;
  endMin: number;

  shouldContinueAnnotation: ContinueAnnotationChoice | "";

  eventType: DetectEventType | "";
  eventTypeOther: string;

  associatedChanges: AssociatedChangeChoice | "";
  note: string;

  onsetPattern: OnsetPattern | "";
  episodeCourse: EpisodeCourse | "";

  severity: SeverityLevel | "";
  confidence: ConfidenceLevel | null;
};


export type UserActionLogItem = {
  type: string;
  ts: number;
  payload?: Record<string, any>;
};