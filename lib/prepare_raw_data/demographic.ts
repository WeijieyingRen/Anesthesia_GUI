import type { PatientDemographic } from "@/lib/types";

const toNum = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function prepareDemographicData(
  caseInfoRow: Record<string, any>,
  patientAttrRow: Record<string, any>,
  preopRow: Record<string, any>,
  caseId: string
): PatientDemographic {
  return {
    id: caseId,
    age: toNum(caseInfoRow["aims_patient_age_years"]),
    sex: patientAttrRow["aims_sex"] ?? undefined,
    race: patientAttrRow["aims_race_text"] ?? undefined,
    height: toNum(preopRow["Height"]),
    weight: toNum(preopRow["Weight"]),
  };
}