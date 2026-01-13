// types.ts — minimal shapes for vitals-only
export type RawPatientData = {
  id?: string | number;

  patient?: PatientMeta;   // 👈 新增（术前信息）

  vitals?: {
    values?: Record<string, any>;
  };
};

export type CaseTime = {
  casestart?: number;
  caseend?: number;
  anestart?: number;
  aneend?: number;
  opstart?: number;
  opend?: number;
};


export interface DataPoint {
  time: number;   // minute index
  value: number;
}

export type TimePoint = { time: number; value: number };

export type GasesData = {
  fio2: TimePoint[];
  feo2: TimePoint[];
  inco2: TimePoint[];
};

// ---------- Ventilation ----------
export type VentilationData = {
  vent_rr: TimePoint[];
  vent_tv: TimePoint[];
  vent_mv: TimePoint[];
  vent_peep: TimePoint[];
  vent_pip: TimePoint[];
  vent_pplat: TimePoint[];
  vent_compliance: TimePoint[];
};

// ---------- Hemodynamics ----------
export type HemodynamicsData = {
  hemo_co: TimePoint[];
  hemo_ci: TimePoint[];
  hemo_svr: TimePoint[];
  hemo_cvp: TimePoint[];
  hemo_svv: TimePoint[];
};

// ---------- Depth of anesthesia ----------
export type DepthData = {
  depth_bis: TimePoint[];
  depth_sr: TimePoint[];
  depth_mac: TimePoint[];
};

export type MedGroup = Record<string, TimePoint[]>;

export type MedsData = {
  pressors?: MedGroup;
  vasodilators?: MedGroup;
  inotropes?: MedGroup;
  sedatives?: MedGroup;
  opioids?: MedGroup;
  nmbas?: MedGroup;
};

export type VitalsData = {
  patient?: PatientMeta;   // ✅ 加这一行

  SBP: TimePoint[];
  DBP: TimePoint[];
  MAP: TimePoint[];
  HR: TimePoint[];
  SpO2: TimePoint[];
  ETCO2: TimePoint[];

  gases?: GasesData;
  meds?: MedsData;
  ventilation?: VentilationData;
  hemodynamics?: HemodynamicsData;
  depth?: DepthData;

  currentValues: {
    SBP: number | null;
    DBP: number | null;
    MAP: number | null;
    HR: number | null;
    SpO2: number | null;
    ETCO2: number | null;
  };
};

export interface DiagnosisEntry {
  patientId: string;

  // old fields: for single medication events (legacy)
  minute?: number;
  type?:
    | "pressors"
    | "anticholinergic"
    | "opioids"
    | "antihypertensives"
    | "sedatives";
  confidence?: number;
  timestamp?: string;

  // new field: for grouped patient records (used in current build)
  records?: Record<string, number[]>; 
}

// ---------- PatientMeta ----------
export interface PatientMeta {
  id: string;
  file?: string;
  //demongraphic data
  age?: number;
  weight?: number;
  sex?: string;
  height?: number;
  bmi?: number;

  //contextual data
  asa?: number;
  emop?: number;
  department?: string;
  optype?: string;
  opname?: string;
  approach?: string;
  position?: string;
  ane_type?: string;
  dx?: string;

  //preoperative data
  preop_htn?: number;
  preop_dm?: number;
  preop_ecg?: number;
  preop_pft?: number;
}

export interface PreopData {
  // comorbidities / exams
  preop_htn?: number | boolean;
  preop_dm?: number | boolean;
  preop_ecg?: string | number;
  preop_pft?: string | number;

  // hematology
  preop_hb?: number;
  preop_plt?: number;

  // coagulation
  preop_pt?: number;
  preop_aptt?: number;

  // electrolytes / chemistry
  preop_na?: number;
  preop_k?: number;
  preop_gluc?: number;
  preop_alb?: number;

  // liver
  preop_ast?: number;
  preop_alt?: number;

  // renal
  preop_bun?: number;
  preop_cr?: number;

  // blood gas
  preop_ph?: number;
  preop_hco3?: number;
  preop_be?: number;
  preop_pao2?: number;
  preop_paco2?: number;
  preop_sao2?: number;
}


export interface GameData {
  currentPatientIndex: number;
  selectedPatients: PatientMeta[];
  diagnoses: DiagnosisEntry[]; // many entries per patient
  startTime: string;
}

// ---------- ParticipantInfo (optional) ----------
export interface ParticipantInfo {
  name: string;
  salutation?: string;
  department?: string;
  timestamp: string;
}

// ---------- Airway ----------
export type AirwayData = {
  cormack?: number | string;
  airway?: string;
  tubesize?: number;
  dltubesize?: number;
  lmasize?: number;
};

// ---------- Access / Lines ----------
export type AccessData = {
  iv1?: string;
  iv2?: string;
  aline1?: string;
  aline2?: string;
  cline1?: string;
  cline2?: string;
};

// ---------- Fluids / Blood / Transfusion ----------
export type FluidsBloodData = {
  intraop_ebl?: number;
  intraop_uo?: number;
  intraop_crystalloid?: number;
  intraop_colloid?: number;
  intraop_rbc?: number;
  intraop_ffp?: number;
};

// ---------- Intraoperative Bolus / Total-dose Medications ----------
export type IntraopBolusData = {
  intraop_ppf?: number;
  intraop_mdz?: number;
  intraop_ftn?: number;
  intraop_rocu?: number;
  intraop_vecu?: number;
  intraop_eph?: number;
  intraop_phe?: number;
  intraop_epi?: number;
  intraop_ca?: number;
};

// ---------- Extended Patient Context ----------
export interface PatientContext {
  caseTime?: CaseTime;  
  airway?: AirwayData;
  access?: AccessData;
  fluids_blood?: FluidsBloodData;
  intraop_bolus?: IntraopBolusData;
}
