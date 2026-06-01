import type { PreopAssessment } from "@/lib/types";

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
): string | number | undefined => {
  for (const key of keys) {
    const value = cleanValue(row[key]);
    if (value !== undefined) return value;
  }

  return undefined;
};

const normalizeYesNo = (v: any): string | undefined => {
  const cleaned = cleanValue(v);
  if (cleaned === undefined) return undefined;

  const text = String(cleaned).trim();
  const lower = text.toLowerCase();

  if (["yes", "y", "true", "1"].includes(lower)) return "Yes";
  if (["no", "n", "false", "0"].includes(lower)) return "No";
  if (["unk", "unknown"].includes(lower)) return "Unknown";

  return text;
};

export function preparePreopData(
  preopRow: Record<string, any>
): PreopAssessment {
  return {
    // ============================================================
    // Basic preoperative risk / baseline
    // ============================================================
    asa_status: toNum(preopRow["ASA status"]),
    height: toNum(preopRow["Height"]),
    weight: toNum(preopRow["Weight"]),
    npo_since: getFirstValue(preopRow, ["NPO Since"]),
    emergent: normalizeYesNo(preopRow["emergent"]),

    // ============================================================
    // Airway assessment
    // ============================================================
    mallampati_score: getFirstValue(preopRow, ["Mallampati score"]),
    mallampati_na: normalizeYesNo(
      getFirstValue(preopRow, [
        "MALLAMPATI N/A",
        "Mallampati N/A",
        "mallampati_na",
      ])
    ),
    tm_distance: getFirstValue(preopRow, ["TM distance"]),
    thick_neck: normalizeYesNo(preopRow["thick neck"]),
    limited_cervical_rom: normalizeYesNo(
      preopRow["SHC ANE LIMITED CERVICAL ROM"]
    ),
    abnormal_oropharynx_anatomy: normalizeYesNo(
      preopRow["abnormal oropharynx anatomy"]
    ),
    airway_comments: getFirstValue(preopRow, [
      "airway comments",
      "Airway comments",
      "Airway Comments",
    ]) as string | undefined,

    // ============================================================
    // Dental / airway-related details
    // ============================================================
    no_notable_dental_hx: normalizeYesNo(preopRow["no notable dental hx"]),
    chipped_teeth: normalizeYesNo(preopRow["chipped teeth"]),
    loose_teeth: normalizeYesNo(preopRow["loose teeth"]),
    dental_hx_comments: getFirstValue(preopRow, [
      "dental hx - comments",
      "Dental hx - comments",
      "Dental Hx Comments",
    ]) as string | undefined,
    beard: normalizeYesNo(preopRow["beard"]),
    tracheostomy_present: normalizeYesNo(preopRow["tracheostomy present"]),

    // ============================================================
    // Cardiovascular exam
    // ============================================================
    irregular_rhythm: normalizeYesNo(preopRow["irregular rhythm"]),
    murmur: normalizeYesNo(preopRow["murmur"]),
    carotid_bruit: normalizeYesNo(preopRow["carotid bruit"]),
    peripheral_edema: normalizeYesNo(preopRow["peripheral edema"]),
    heart_sounds: getFirstValue(preopRow, ["Heart Sounds"]),
    cardiovascular_exam_normal: normalizeYesNo(
      preopRow["cardiovascular exam normal"]
    ),
    cardiovascular_exam_comments: getFirstValue(preopRow, [
      "cardiovascular exam comments",
      "Cardiovascular exam comments",
      "Cardiovascular Exam Comments",
    ]) as string | undefined,

    // ============================================================
    // Pulmonary exam
    // ============================================================
    pulmonary_exam_normal: normalizeYesNo(preopRow["pulmonary exam normal"]),
    breath_sounds: getFirstValue(preopRow, ["Breath Sounds"]),
    wheezes: normalizeYesNo(preopRow["wheezes"]),
    rales: normalizeYesNo(preopRow["rales"]),
    decreased_breath_sounds: normalizeYesNo(
      preopRow["decreased breath sounds"]
    ),
    pulmonary_exam_comments: getFirstValue(preopRow, [
      "pulmonary exam comments",
      "Pulmonary exam comments",
      "Pulmonary Exam Comments",
    ]) as string | undefined,
    wheezing: normalizeYesNo(preopRow["wheezing"]),

    // ============================================================
    // IV / access risk
    // ============================================================
    iv_access_difficult: normalizeYesNo(preopRow["IV access difficult"]),
    difficult_iv_placement: normalizeYesNo(preopRow["difficult IV placement"]),

    // ============================================================
    // Other selected preop findings
    // ============================================================
    level_of_consciousness: getFirstValue(preopRow, [
      "Level of Consciousness",
    ]),
    orientation_level: getFirstValue(preopRow, ["Orientation Level"]),
    ekg: getFirstValue(preopRow, ["EKG"]),
    chart_reviewed: normalizeYesNo(preopRow["chart reviewed"]),
    plan_risks_discussed_with: getFirstValue(preopRow, [
      "plan/risks discussed with",
      "Plan/risks discussed with",
      "Plan/Risks Discussed With",
    ]),

    // ============================================================
    // Anesthesia planning
    // ============================================================
    anesthesia_plan: getFirstValue(preopRow, [
      "anesthesia plan",
      "Anesthesia plan",
      "Anesthesia Plan",
      "anesthesia_plan",
    ]),

    post_op_block: normalizeYesNo(
      getFirstValue(preopRow, [
        "Post-op block",
        "post-op block",
        "Post-op Block",
        "post_op_block",
      ])
    ),

    anesthesia_plan_comments: getFirstValue(preopRow, [
      "SHC ANE ANESTHESIA PLAN COMMENTS",
      "anesthesia plan comments",
      "Anesthesia plan comments",
      "Anesthesia Plan Comments",
      "anesthesia_plan_comments",
    ]) as string | undefined,
  };
}