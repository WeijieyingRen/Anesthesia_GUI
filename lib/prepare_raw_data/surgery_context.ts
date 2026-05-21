import type { SurgeryContext } from "@/lib/types";

const toNum = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function prepareSurgeryContextData(
  caseInfoRow: Record<string, any>,
  caseStaticRow: Record<string, any>,
  preopRow: Record<string, any>
): SurgeryContext {
  return {
    procedure_room: caseInfoRow["aims_procedure_room_name"] ?? undefined,
    procedure_service: caseInfoRow["aims_primary_procedural_service"] ?? undefined,
    admission_type: caseInfoRow["aims_admission_type"] ?? undefined,
    preoperative_diagnosis: caseInfoRow["aims_preoperative_diagnosis_text"] ?? undefined,
    actual_procedure: caseInfoRow["aims_actual_procedure_text"] ?? undefined,

    anesthesia_type: caseStaticRow["anesthesia_type"] ?? undefined,
    airway: caseStaticRow["airway"] ?? undefined,
    airway_type: caseStaticRow["airway_type"] ?? undefined,
    destination: caseStaticRow["destination"] ?? undefined,

    emergent: toNum(preopRow["emergent"]),

    arterial_line_present: toNum(caseStaticRow["arterial_line_present"]),
    central_line_present: toNum(caseStaticRow["central_line_present"]),
    pa_cath_present: toNum(caseStaticRow["pa_cath_present"]),
    lumbar_drain_present: toNum(caseStaticRow["lumbar_drain_present"]),
    blood_warmer_present: toNum(caseStaticRow["blood_warmer_present"]),
    tee_present: toNum(caseStaticRow["tee_present"]),
    tte_present: toNum(caseStaticRow["tte_present"]),
    bronchoscopy_present: toNum(caseStaticRow["bronchoscopy_present"]),
    one_lung_ventilation_present: toNum(caseStaticRow["one_lung_ventilation_present"]),
    two_lung_ventilation_present: toNum(caseStaticRow["two_lung_ventilation_present"]),
    o2_delivery_for_mac_present: toNum(caseStaticRow["o2_delivery_for_mac_present"]),
    peripheral_nerve_block_present: toNum(caseStaticRow["peripheral_nerve_block_present"]),
    nerve_block_catheter_present: toNum(caseStaticRow["nerve_block_catheter_present"]),
    neuraxial_block_present: toNum(caseStaticRow["neuraxial_block_present"]),
    spinal_block_present: toNum(caseStaticRow["spinal_block_present"]),
    epidural_block_present: toNum(caseStaticRow["epidural_block_present"]),
    anesthesia_block_epidural_present: toNum(caseStaticRow["anesthesia_block_epidural_present"]),
    intentional_hypothermia_present: toNum(caseStaticRow["intentional_hypothermia_present"]),
  };
}