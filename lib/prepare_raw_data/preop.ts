import type { PreopAssessment } from "@/lib/types";

const toNum = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function preparePreopData(
  preopRow: Record<string, any>
): PreopAssessment {
  return {
    asa_status: toNum(preopRow["ASA status"]),
    mallampati_score: preopRow["Mallampati score"] ?? undefined,
    npo_since: preopRow["NPO Since"] ?? undefined,
    limited_cervical_rom: preopRow["SHC ANE LIMITED CERVICAL ROM"] ?? undefined,
    tm_distance: preopRow["TM distance"] ?? undefined,
    abnormal_oropharynx_anatomy: preopRow["abnormal oropharynx anatomy"] ?? undefined,
  };
}