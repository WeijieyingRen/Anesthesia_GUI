import type { DeviceContextData } from "@/lib/types";

export function prepareDeviceContextData(
  caseStatic: Record<string, any>
): DeviceContextData {
  return {
    arterial_line_present: Boolean(caseStatic["arterial_line_present"]),
    central_line_present: Boolean(caseStatic["central_line_present"]),
    pa_cath_present: Boolean(caseStatic["pa_cath_present"]),
    lumbar_drain_present: Boolean(caseStatic["lumbar_drain_present"]),
    blood_warmer_present: Boolean(caseStatic["blood_warmer_present"]),
    tee_present: Boolean(caseStatic["tee_present"]),
    tte_present: Boolean(caseStatic["tte_present"]),
    bronchoscopy_present: Boolean(caseStatic["bronchoscopy_present"]),
    one_lung_ventilation_present: Boolean(caseStatic["one_lung_ventilation_present"]),
    two_lung_ventilation_present: Boolean(caseStatic["two_lung_ventilation_present"]),
    o2_delivery_for_mac_present: Boolean(caseStatic["o2_delivery_for_mac_present"]),
    peripheral_nerve_block_present: Boolean(caseStatic["peripheral_nerve_block_present"]),
    nerve_block_catheter_present: Boolean(caseStatic["nerve_block_catheter_present"]),
    neuraxial_block_present: Boolean(caseStatic["neuraxial_block_present"]),
    spinal_block_present: Boolean(caseStatic["spinal_block_present"]),
    epidural_block_present: Boolean(caseStatic["epidural_block_present"]),
    anesthesia_block_epidural_present: Boolean(caseStatic["anesthesia_block_epidural_present"]),
    intentional_hypothermia_present: Boolean(caseStatic["intentional_hypothermia_present"]),
  };
}