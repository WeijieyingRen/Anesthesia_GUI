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

export type TimelineContextEvent = {
  source: "static" | "dynamic";
  group: "milestone" | "airway" | "positioning" | "block" | "surgical";
  event_type: string;
  label: string;
  raw_value?: any;
  observation_time?: string;
  relative_min?: number;
};

export type TimelineContextData = {
  case_badges: string[];
  current_stage?: string;
  milestone_events: TimelineContextEvent[];
  nearby_events: TimelineContextEvent[];
  airway_events: TimelineContextEvent[];
  positioning_events: TimelineContextEvent[];
  block_events: TimelineContextEvent[];
  surgical_events: TimelineContextEvent[];
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
  procedure_service?: string;
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
  // Basic preoperative risk / baseline
  asa_status?: number;
  height?: number;
  weight?: number;
  npo_since?: string | number;
  emergent?: string | number;

  // Airway assessment
  mallampati_score?: string | number;
  mallampati_na?: string | number;
  tm_distance?: string | number;
  thick_neck?: string | number;
  limited_cervical_rom?: string | number;
  abnormal_oropharynx_anatomy?: string | number;
  airway_comments?: string;

  // Dental / airway-related details
  no_notable_dental_hx?: string | number;
  chipped_teeth?: string | number;
  loose_teeth?: string | number;
  dental_hx_comments?: string;
  beard?: string | number;
  tracheostomy_present?: string | number;

  // Cardiovascular exam
  irregular_rhythm?: string | number;
  murmur?: string | number;
  carotid_bruit?: string | number;
  peripheral_edema?: string | number;
  heart_sounds?: string | number;
  cardiovascular_exam_normal?: string | number;
  cardiovascular_exam_comments?: string;

  // Pulmonary exam
  pulmonary_exam_normal?: string | number;
  breath_sounds?: string | number;
  wheezes?: string | number;
  rales?: string | number;
  decreased_breath_sounds?: string | number;
  pulmonary_exam_comments?: string;
  wheezing?: string | number;

  // IV / access risk
  iv_access_difficult?: string | number;
  difficult_iv_placement?: string | number;

  // Other selected preop findings
  level_of_consciousness?: string | number;
  orientation_level?: string | number;
  ekg?: string | number;
  chart_reviewed?: string | number;
  plan_risks_discussed_with?: string | number;

  // Anesthesia planning
  anesthesia_plan?: string | number;
  post_op_block?: string | number;
  anesthesia_plan_comments?: string;
}

export type PreopHistoryItem = {
  mpog_case_id?: string;
  history_category?: string;
  category?: string;
  feature_name?: string;
  feature?: string;
  feature_code?: string;
  value?: string | number;
  value_combined?: string | number;
  aims_preop_concept_desc?: string;
  aims_value_text?: string;
  aims_value_numeric?: string | number;
  rank?: string | number;
  row_count?: string | number;
  unique_case_count?: string | number;
  example_values?: string;
};

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
  raw_input_rows?: Record<string, any>[];
  raw_output_rows?: Record<string, any>[];
};