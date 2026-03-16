import type { LabData } from "@/lib/types";

const toNum = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function prepareLabData(labRow: Record<string, any>): LabData {
  return {
    sodium: toNum(labRow["sodium"]),
    potassium: toNum(labRow["potassium"]),
    chloride: toNum(labRow["chloride"]),
    co2: toNum(labRow["co2"]),
    glucose: toNum(labRow["glucose"]),
    creatinine: toNum(labRow["creatinine"]),
    blood_urea_nitrogen: toNum(labRow["blood urea nitrogen"]),
    ionized_calcium: toNum(labRow["ionized calcium"]),
    magnesium: toNum(labRow["magnesium"]),
    phosphorus: toNum(labRow["phosphorus"]),
    anion_gap: toNum(labRow["anion gap"]),
    hemoglobin: toNum(labRow["hemoglobin"]),
    hematocrit: toNum(labRow["hematocrit"]),
    white_blood_cell_count: toNum(labRow["white blood cell count"]),
    platelet_count: toNum(labRow["platelet count"]),
    mean_corpuscular_volume: toNum(labRow["mean corpuscular volume"]),
    mean_corpuscular_hemoglobin: toNum(labRow["mean corpuscular hemoglobin"]),
    prothrombin_time: toNum(labRow["prothrombin time"]),
    international_normalized_ratio: toNum(labRow["international normalized ratio"]),
    partial_thromboplastin_time: toNum(labRow["partial thromboplastin time"]),
    fibrinogen: toNum(labRow["fibrinogen"]),
    d_dimer: toNum(labRow["d-dimer"]),
    ast: toNum(labRow["ast"]),
    alt: toNum(labRow["alt"]),
    alkaline_phosphatase: toNum(labRow["alkaline phosphatase"]),
    albumin: toNum(labRow["albumin"]),
    total_bilirubin: toNum(labRow["total bilirubin"]),
    direct_bilirubin: toNum(labRow["direct bilirubin"]),
    indirect_bilirubin: toNum(labRow["indirect bilirubin"]),
    total_protein: toNum(labRow["total protein"]),
    lactate: toNum(labRow["lactate"]),
    ph: toNum(labRow["ph"]),
    pco2: toNum(labRow["pco2"]),
    po2: toNum(labRow["po2"]),
    hco3: toNum(labRow["hco3"]),
    base_excess: toNum(labRow["base excess"]),
    oxygen_saturation: toNum(labRow["oxygen saturation"]),
    hemoglobin_a1c: toNum(labRow["hemoglobin a1c"]),
    thyroid_stimulating_hormone: toNum(labRow["thyroid stimulating hormone"]),
    free_t4: toNum(labRow["free t4"]),
    free_t3: toNum(labRow["free t3"]),
    thyroxine: toNum(labRow["thyroxine"]),
  };
}