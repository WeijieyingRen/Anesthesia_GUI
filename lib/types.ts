export interface PatientDemographic {
  id: string;
  age?: number;
  sex?: string;
  race?: string;
  height?: number;
  weight?: number;
  bmi?: number;
}

export type TimelineStatic = {
  anesthesia_start?: string;
  induction?: string;
  intubation?: string;
  procedure_start?: string;
  procedure_end?: string;
  extubation?: string;
  anesthesia_stop?: string;
  emergence?: string;
  anesthesia_timeout?: string;
};

export type TimelineEvent = {
  observation_time?: string;
  event_type: string;
  event_value: any;
};

export interface SurgeryContext {
  procedure_room?: string;
  department?: string;
  admission_type?: string;
  preoperative_diagnosis?: string;
  actual_procedure?: string;
  anesthesia_type?: string;
  airway?: string;
  airway_type?: string;
  destination?: string;
  emergent?: number;

  arterial_line_present?: number;
  central_line_present?: number;
  pa_cath_present?: number;
  lumbar_drain_present?: number;
  blood_warmer_present?: number;
  tee_present?: number;
  tte_present?: number;
  bronchoscopy_present?: number;
  one_lung_ventilation_present?: number;
  two_lung_ventilation_present?: number;
  o2_delivery_for_mac_present?: number;
  peripheral_nerve_block_present?: number;
  nerve_block_catheter_present?: number;
  neuraxial_block_present?: number;
  spinal_block_present?: number;
  epidural_block_present?: number;
  anesthesia_block_epidural_present?: number;
  intentional_hypothermia_present?: number;
}

export interface PreopAssessment {
  asa_status?: number;
  mallampati_score?: string | number;
  npo_since?: string;
  limited_cervical_rom?: string | number;
  tm_distance?: string | number;
  abnormal_oropharynx_anatomy?: string | number;
}

export interface LabData {
  sodium?: number;
  potassium?: number;
  chloride?: number;
  co2?: number;
  glucose?: number;
  creatinine?: number;
  blood_urea_nitrogen?: number;
  ionized_calcium?: number;
  magnesium?: number;
  phosphorus?: number;
  anion_gap?: number;
  hemoglobin?: number;
  hematocrit?: number;
  white_blood_cell_count?: number;
  platelet_count?: number;
  mean_corpuscular_volume?: number;
  mean_corpuscular_hemoglobin?: number;
  prothrombin_time?: number;
  international_normalized_ratio?: number;
  partial_thromboplastin_time?: number;
  fibrinogen?: number;
  d_dimer?: number;
  ast?: number;
  alt?: number;
  alkaline_phosphatase?: number;
  albumin?: number;
  total_bilirubin?: number;
  direct_bilirubin?: number;
  indirect_bilirubin?: number;
  total_protein?: number;
  lactate?: number;
  ph?: number;
  pco2?: number;
  po2?: number;
  hco3?: number;
  base_excess?: number;
  oxygen_saturation?: number;
  hemoglobin_a1c?: number;
  thyroid_stimulating_hormone?: number;
  free_t4?: number;
  free_t3?: number;
  thyroxine?: number;
}

export type TimeValuePoint = {
  time: number;
  value: number;
};

export type VitalPanelData = {
  main: Record<string, TimeValuePoint[]>;
  gas: Record<string, TimeValuePoint[]>;
  ventilation: Record<string, TimeValuePoint[]>;
  hemodynamics: Record<string, TimeValuePoint[]>;
  cv: Record<string, TimeValuePoint[]>;
  depth: Record<string, TimeValuePoint[]>;
  tmp: Record<string, TimeValuePoint[]>;
  other: Record<string, TimeValuePoint[]>;
};

export type MedicationBolusPoint = {
  time: number;
  dose: number;
  unit?: string;
  label: string;
  totalDose?: number;
};

export type MedicationInfusionSegment = {
  start: number;
  end: number;
  rate: number;
  unit?: string;
  label?: string;
};

export type MedicationPanelData = {
  bolus: Record<string, MedicationBolusPoint[]>;
  infusion: Record<string, MedicationInfusionSegment[]>;
};

export type FluidBolusPoint = {
  time: number;
  dose: number;
  unit?: string;
  label: string;
  absoluteTime?: string;
  rawName?: string;
  conceptName?: string;
  route?: string;
};

export type FluidInfusionSegment = {
  start: number;
  end: number;
  rate: number;
  unit?: string;
  label: string;
  absoluteStartTime?: string;
  absoluteEndTime?: string;
  rawName?: string;
  conceptName?: string;
  route?: string;
};

export type FluidOutputPoint = {
  time: number;
  dose: number;
  unit?: string;
  label: string;
  absoluteTime?: string;
  rawName?: string;
  conceptName?: string;
  route?: string;
};

export type FluidPanelData = {
  bolus: Record<string, FluidBolusPoint[]>;
  infusion: Record<string, FluidInfusionSegment[]>;
  output: Record<string, FluidOutputPoint[]>;
};