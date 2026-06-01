import type { SurgeryContext } from "@/lib/types";

const cleanValue = (v: any): string | number | undefined => {
  if (v === null || v === undefined) return undefined;

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return undefined;
    return v;
  }

  const text = String(v).trim();

  if (
    text === "" ||
    text === "-" ||
    text.toLowerCase() === "nan" ||
    text.toLowerCase() === "null" ||
    text.toLowerCase() === "none" ||
    text.toLowerCase() === "undefined"
  ) {
    return undefined;
  }

  return text;
};

const toNum = (v: any): number | undefined => {
  const cleaned = cleanValue(v);
  if (cleaned === undefined) return undefined;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const getFirstValue = (
  row: Record<string, any>,
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = cleanValue(row[key]);
    if (value !== undefined) return String(value);
  }

  return undefined;
};

export function prepareSurgeryContextData(
  caseInfoRow: Record<string, any>,
  caseStaticRow: Record<string, any>,
  preopRow: Record<string, any>
): SurgeryContext {
  return {
    procedure_room: getFirstValue(caseInfoRow, [
      "aims_procedure_room_name",
      "procedure_room",
    ]),

    procedure_service: getFirstValue(caseInfoRow, [
      "aims_primary_procedural_service",
      "procedure_service",
      "department",
    ]),

    admission_type: getFirstValue(caseInfoRow, [
      "aims_admission_type",
      "admission_type",
    ]),

    preoperative_diagnosis: getFirstValue(caseInfoRow, [
      "aims_preoperative_diagnosis_text",
      "preoperative_diagnosis",
    ]),

    actual_procedure: getFirstValue(caseInfoRow, [
      "aims_actual_procedure_text",
      "actual_procedure",
    ]),

    anesthesia_type: getFirstValue(caseStaticRow, [
      "anesthesia_type_primary",
      "anesthesia_type_raw",
      "anesthesia_type",
    ]),

    airway: getFirstValue(caseStaticRow, ["airway"]),

    airway_type: getFirstValue(caseStaticRow, ["airway_type"]),

    destination: getFirstValue(caseStaticRow, ["destination"]),

    emergent: toNum(preopRow["emergent"]),

    arterial_line_present: toNum(caseStaticRow["has_arterial_line"]),
    central_line_present: toNum(caseStaticRow["has_central_line"]),
    pa_cath_present: toNum(caseStaticRow["has_pa_cath"]),
    lumbar_drain_present: toNum(caseStaticRow["has_lumbar_drain"]),
    blood_warmer_present: toNum(caseStaticRow["has_blood_warmer"]),
    tee_present: toNum(caseStaticRow["has_tee"]),
    tte_present: toNum(caseStaticRow["has_tte"]),
    bronchoscopy_present: toNum(caseStaticRow["has_bronchoscopy"]),

    one_lung_ventilation_present: toNum(
      caseStaticRow["has_one_lung_ventilation"]
    ),

    two_lung_ventilation_present: toNum(
      caseStaticRow["has_two_lung_ventilation"]
    ),

    o2_delivery_for_mac_present: toNum(
      caseStaticRow["o2_delivery_for_mac_present"] ??
        caseStaticRow["has_o2_delivery_for_mac"]
    ),

    peripheral_nerve_block_present: toNum(
      caseStaticRow["has_peripheral_nerve_block"]
    ),

    nerve_block_catheter_present: toNum(
      caseStaticRow["has_nerve_block_catheter"]
    ),

    neuraxial_block_present: toNum(caseStaticRow["has_neuraxial_block"]),

    spinal_block_present: toNum(caseStaticRow["has_spinal_block"]),

    epidural_block_present: toNum(caseStaticRow["has_epidural_block"]),

    anesthesia_block_epidural_present: toNum(
      caseStaticRow["has_anesthesia_block_epidural"]
    ),

    intentional_hypothermia_present: toNum(
      caseStaticRow["has_intentional_hypothermia"]
    ),
  };
}