import Papa from "papaparse";

import { MOVER_DATASET_BASE } from "@/lib/dataset-config";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";

import type { LoadedDashboardCase } from "@/lib/loaders/dashboard-case-types";

export type CsvRow = Record<string, any>;

type CsvParseResult = {
  data: CsvRow[];
};

/* ============================================================
 * Basic helpers
 * ============================================================ */

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function toIso(value: unknown): string | undefined {
  const text = clean(value);

  if (!text) {
    return undefined;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? undefined
    : text;
}

function minutesBetween(
  startTime: unknown,
  eventTime: unknown
): number | undefined {
  const start = toIso(startTime);
  const event = toIso(eventTime);

  if (!start || !event) {
    return undefined;
  }

  const startMs = new Date(start).getTime();
  const eventMs = new Date(event).getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(eventMs)
  ) {
    return undefined;
  }

  return (eventMs - startMs) / 60000;
}

function normalizeEventName(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickFirst(
  row: CsvRow,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = clean(row[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildNormalizedIds(caseInfoRow: CsvRow) {
  const case_id = clean(
    caseInfoRow["case_id"]
  );

  const patient_id = clean(
    caseInfoRow["patient_id"]
  );

  return {
    case_id,
    patient_id,
  };
}

/* ============================================================
 * Demographic and case-info normalization
 * ============================================================ */

function parseHeightToInches(
  value: unknown
): number | undefined {
  const directNumber = toNum(value);

  if (
    directNumber !== undefined &&
    directNumber > 0
  ) {
    return directNumber;
  }

  const text = clean(value);

  if (!text) {
    return undefined;
  }

  /*
   * Supported examples:
   *
   * 5' 8
   * 5'8
   * 5' 8"
   * 5 ft 8 in
   */
  const feetInchesMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?\s*(?:"|in|inch|inches)?/i
  );

  if (feetInchesMatch) {
    const feet = Number(feetInchesMatch[1]);
    const inches = Number(
      feetInchesMatch[2] ?? 0
    );

    const totalInches =
      feet * 12 + inches;

    return Number.isFinite(totalInches) &&
      totalInches > 0
      ? totalInches
      : undefined;
  }

  /*
   * Support values such as 68 in or 68 inches.
   */
  const inchesMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:in|inch|inches)$/i
  );

  if (inchesMatch) {
    const inches = Number(inchesMatch[1]);

    return Number.isFinite(inches) &&
      inches > 0
      ? inches
      : undefined;
  }

  /*
   * Support centimeter values if they appear in another MOVER case.
   */
  const centimetersMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:cm|centimeter|centimeters)$/i
  );

  if (centimetersMatch) {
    const centimeters = Number(
      centimetersMatch[1]
    );

    if (
      Number.isFinite(centimeters) &&
      centimeters > 0
    ) {
      return centimeters / 2.54;
    }
  }

  return undefined;
}

function buildMoverNormalizedCaseInfo(
  rawCaseInfo: CsvRow
): CsvRow {
  const age = toNum(
    rawCaseInfo["age"]
  );

  const sex =
    clean(rawCaseInfo["sex"]) ||
    undefined;

  const height = parseHeightToInches(
    rawCaseInfo["height"]
  );

  /*
   * The current Dashboard formatter expects weight in ounces.
   *
   * Example:
   * 3566.16 oz ≈ 101.1 kg
   */
  const weight = toNum(
    rawCaseInfo["weight"]
  );

  const procedureService =
    clean(
      rawCaseInfo[
        "procedure_service_derived"
      ]
    ) || undefined;

  const admissionType =
    clean(
      rawCaseInfo["patient_class_nm"]
    ) ||
    clean(
      rawCaseInfo["patient_class_group"]
    ) ||
    undefined;

  const actualProcedure =
    clean(
      rawCaseInfo["primary_procedure_nm"]
    ) || undefined;

  const anesthesiaType =
    clean(
      rawCaseInfo["primary_anes_type_nm"]
    ) || undefined;

  return {
    ...rawCaseInfo,

    /*
     * Direct normalized fields.
     */
    age,
    sex,
    gender: sex,
    height,
    weight,

    procedure_service:
      procedureService,

    admission_type:
      admissionType,

    actual_procedure:
      actualProcedure,

    anesthesia_type:
      anesthesiaType,

    /*
     * Compatibility aliases for Stanford-oriented
     * shared preparation functions.
     */
    aims_age:
      age,

    aims_sex:
      sex,

    aims_gender:
      sex,

    aims_height:
      height,

    aims_height_inches:
      height,

    aims_weight:
      weight,

    aims_weight_ounces:
      weight,

    aims_primary_procedural_service:
      procedureService,

    aims_procedure_service:
      procedureService,

    aims_admission_type:
      admissionType,

    aims_actual_procedure:
      actualProcedure,

    aims_primary_procedure:
      actualProcedure,

    aims_procedure_name:
      actualProcedure,

    aims_anesthesia_type:
      anesthesiaType,
  };
}

function buildMoverPatientAttr(
  caseInfoRow: CsvRow
): CsvRow {
  const age = toNum(
    caseInfoRow["age"]
  );

  const sex =
    clean(caseInfoRow["sex"]) ||
    undefined;

  const height = parseHeightToInches(
    caseInfoRow["height"]
  );

  const weight = toNum(
    caseInfoRow["weight"]
  );

  return {
    case_id:
      clean(caseInfoRow["case_id"]) ||
      undefined,

    patient_id:
      clean(caseInfoRow["patient_id"]) ||
      undefined,

    age,
    sex,
    gender: sex,
    height,
    weight,

    /*
     * Additional aliases for shared demographic
     * preparation code.
     */
    aims_age:
      age,

    aims_sex:
      sex,

    aims_gender:
      sex,

    aims_height:
      height,

    aims_height_inches:
      height,

    aims_weight:
      weight,

    aims_weight_ounces:
      weight,
  };
}

/* ============================================================
 * CSV loading
 * ============================================================ */

export async function fetchCsvRowsSafe(
  folder: string,
  filename: string,
  datasetBase: string
): Promise<CsvRow[]> {
  const url =
    `${datasetBase}/${folder}/${filename}`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const text = await res.text();

  if (!text.trim()) {
    return [];
  }

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }) as CsvParseResult;

  return Array.isArray(parsed.data)
    ? parsed.data.filter(Boolean)
    : [];
}

/* ============================================================
 * Static case information
 * ============================================================ */

export function buildMoverCaseStatic(
  caseInfoRow: CsvRow,
  patientProcedureRows: CsvRow[]
): CsvRow {
  const ids = buildNormalizedIds(
    caseInfoRow
  );

  const procedureMap =
    new Map<string, CsvRow>();

  for (const row of patientProcedureRows) {
    procedureMap.set(
      normalizeEventName(
        row["event_name"]
      ),
      row
    );
  }

  const getProcedureTime = (
    ...names: string[]
  ): string | undefined => {
    for (const name of names) {
      const row = procedureMap.get(
        normalizeEventName(name)
      );

      const time = clean(
        row?.["event_time"]
      );

      if (time) {
        return time;
      }
    }

    return undefined;
  };

  const anesthesiaType =
    clean(
      caseInfoRow[
        "primary_anes_type_nm"
      ]
    ) ||
    clean(
      caseInfoRow["anesthesia_type"]
    ) ||
    undefined;

  const admissionType =
    clean(
      caseInfoRow[
        "patient_class_nm"
      ]
    ) ||
    clean(
      caseInfoRow["admission_type"]
    ) ||
    undefined;

  const actualProcedure =
    clean(
      caseInfoRow[
        "primary_procedure_nm"
      ]
    ) ||
    clean(
      caseInfoRow["actual_procedure"]
    ) ||
    undefined;

  const procedureService =
    clean(
      caseInfoRow[
        "procedure_service_derived"
      ]
    ) ||
    clean(
      caseInfoRow["procedure_service"]
    ) ||
    undefined;

  return {
    ...ids,

    anesthesia_start:
      getProcedureTime(
        "Anesthesia Start"
      ) ||
      clean(
        caseInfoRow[
          "an_start_datetime"
        ]
      ) ||
      undefined,

    anesthesia_stop:
      getProcedureTime(
        "Anesthesia Stop"
      ) ||
      clean(
        caseInfoRow[
          "an_stop_datetime"
        ]
      ) ||
      undefined,

    procedure_start:
      clean(
        caseInfoRow["in_or_dttm"]
      ) ||
      getProcedureTime(
        "Procedure Start"
      ) ||
      undefined,

    procedure_end:
      clean(
        caseInfoRow["out_or_dttm"]
      ) ||
      getProcedureTime(
        "Procedure End",
        "Case Completion"
      ) ||
      undefined,

    induction:
      getProcedureTime(
        "Induction"
      ),

    intubation:
      getProcedureTime(
        "Intubation"
      ),

    extubation:
      getProcedureTime(
        "Extubation"
      ),

    emergence:
      getProcedureTime(
        "Emergence"
      ),

    lma_inserted:
      getProcedureTime(
        "LMA Placed",
        "LMA  Placed"
      ),

    lma_removed:
      getProcedureTime(
        "LMA Removed"
      ),

    anesthesia_type:
      anesthesiaType,

    aims_anesthesia_type:
      anesthesiaType,

    airway_type:
      undefined,

    airway:
      undefined,

    admission_type:
      admissionType,

    aims_admission_type:
      admissionType,

    actual_procedure:
      actualProcedure,

    aims_actual_procedure:
      actualProcedure,

    aims_primary_procedure:
      actualProcedure,

    procedure_service:
      procedureService,

    aims_primary_procedural_service:
      procedureService,

    anesthesia_duration_min:
      toNum(
        caseInfoRow[
          "anesthesia_duration_min"
        ]
      ),
  };
}

/* ============================================================
 * Dynamic timeline events
 * ============================================================ */

export function buildMoverCaseDynamicRows(
  caseInfoRow: CsvRow,
  patientProcedureRows: CsvRow[]
): CsvRow[] {
  const anesthesiaStart =
    caseInfoRow["an_start_datetime"];

  const ids = buildNormalizedIds(
    caseInfoRow
  );

  const rows: CsvRow[] = [];

  for (
    const row of patientProcedureRows
  ) {
    const rawName = clean(
      row["event_name"]
    );

    const eventName =
      normalizeEventName(rawName)
        .replace(/ /g, "_");

    const observationTime = clean(
      row["event_time"]
    );

    const lower =
      normalizeEventName(rawName);

    let event_group = "";

    if (
      lower.includes("intubation") ||
      lower.includes("extubation") ||
      lower.includes("lma")
    ) {
      event_group = "airway";
    } else if (
      lower.includes("tee") ||
      lower.includes("procedure") ||
      lower.includes(
        "case completion"
      )
    ) {
      event_group = "surgical";
    }

    if (
      !event_group ||
      !observationTime
    ) {
      continue;
    }

    rows.push({
      ...ids,

      event_group,

      event_name:
        eventName,

      event_label:
        rawName,

      observation_time:
        observationTime,

      relative_anesthesia_time:
        minutesBetween(
          anesthesiaStart,
          observationTime
        ),
    });
  }

  return rows;
}

/* ============================================================
 * Preoperative information
 * ============================================================ */

export function buildMoverPreopRow(
  caseInfoRow: CsvRow
): CsvRow {
  const explicitEmergentValue =
    caseInfoRow["emergent"] ??
    caseInfoRow["emergency"] ??
    caseInfoRow["emergency_flag"] ??
    caseInfoRow["emergent_flag"] ??
    null;

  const explicitEmergentText =
    clean(
      explicitEmergentValue
    ).toLowerCase();

  let emergent:
    | number
    | undefined;

  if (
    explicitEmergentValue === true ||
    explicitEmergentText === "yes" ||
    explicitEmergentText === "true" ||
    explicitEmergentText === "1"
  ) {
    emergent = 1;
  } else if (
    explicitEmergentValue === false ||
    explicitEmergentText === "no" ||
    explicitEmergentText === "false" ||
    explicitEmergentText === "0"
  ) {
    emergent = 0;
  }

  /*
   * icu_admin_flag is not used as emergent status.
   * ICU admission and emergency surgery are different concepts.
   */
  return {
    "ASA status":
      toNum(
        caseInfoRow[
          "asa_rating_c"
        ]
      ) ??
      toNum(
        caseInfoRow[
          "asa_rating"
        ]
      ),

    asa_status:
      toNum(
        caseInfoRow[
          "asa_rating_c"
        ]
      ) ??
      toNum(
        caseInfoRow[
          "asa_rating"
        ]
      ),

    emergent,
  };
}

export function buildMoverHistoryRows(
  caseInfoRow: CsvRow
): CsvRow[] {
  const history = clean(
    caseInfoRow[
      "history_diagnosis_names"
    ]
  );

  if (!history) {
    return [];
  }

  return history
    .split(";")
    .map((item) => clean(item))
    .filter(Boolean)
    .map((item) => ({
      history_category:
        "History",

      feature_name:
        item,

      value_combined:
        item,

      case_id:
        clean(
          caseInfoRow["case_id"]
        ),
    }));
}

/* ============================================================
 * Preoperative laboratory normalization
 * ============================================================ */

function normalizeMoverLabName(
  value: unknown
): string {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<
    string,
    string
  > = {
    potassium:
      "potassium",

    chloride:
      "chloride",

    "carbon dioxide":
      "carbon dioxide",

    "carbon dioxide total":
      "carbon dioxide",

    co2:
      "carbon dioxide",

    bicarbonate:
      "hco3",

    hco3:
      "hco3",

    glucose:
      "glucose",

    creatinine:
      "creatinine",

    bun:
      "blood urea nitrogen",

    "urea nitrogen":
      "blood urea nitrogen",

    "blood urea nitrogen":
      "blood urea nitrogen",

    "calcium ionized":
      "ionized calcium",

    "ionized calcium":
      "ionized calcium",

    magnesium:
      "magnesium",

    phosphorus:
      "phosphorus",

    phosphate:
      "phosphorus",

    "anion gap":
      "anion gap",

    hemoglobin:
      "hemoglobin",

    hematocrit:
      "hematocrit",

    wbc:
      "white blood cell count",

    "wbc count":
      "white blood cell count",

    "white blood cell count":
      "white blood cell count",

    platelet:
      "platelet count",

    platelets:
      "platelet count",

    "platelet count":
      "platelet count",

    mcv:
      "mean corpuscular volume",

    "mean corpuscular volume":
      "mean corpuscular volume",

    mch:
      "mean corpuscular hemoglobin",

    "mean corpuscular hemoglobin":
      "mean corpuscular hemoglobin",

    pt:
      "prothrombin time",

    "prothrombin time":
      "prothrombin time",

    inr:
      "international normalized ratio",

    "international normalized ratio":
      "international normalized ratio",

    ptt:
      "partial thromboplastin time",

    aptt:
      "partial thromboplastin time",

    "partial thromboplastin time":
      "partial thromboplastin time",

    fibrinogen:
      "fibrinogen",

    "d dimer":
      "d-dimer",

    ast:
      "ast",

    sgot:
      "ast",

    alt:
      "alt",

    sgpt:
      "alt",

    "alkaline phosphatase":
      "alkaline phosphatase",

    albumin:
      "albumin",

    "bilirubin total":
      "total bilirubin",

    "total bilirubin":
      "total bilirubin",

    "bilirubin direct":
      "direct bilirubin",

    "direct bilirubin":
      "direct bilirubin",

    "bilirubin indirect":
      "indirect bilirubin",

    "indirect bilirubin":
      "indirect bilirubin",

    "total protein":
      "total protein",

    lactate:
      "lactate",

    ph:
      "ph",

    pco2:
      "pco2",

    po2:
      "po2",

    "base excess":
      "base excess",

    "base excess blood":
      "base excess",

    "oxygen saturation":
      "oxygen saturation",

    "oxygen saturation arterial":
      "oxygen saturation",

    "hemoglobin a1c":
      "hemoglobin a1c",

    hba1c:
      "hemoglobin a1c",

    "thyroid stimulating hormone":
      "thyroid stimulating hormone",

    tsh:
      "thyroid stimulating hormone",

    "free t4":
      "free t4",

    "free t3":
      "free t3",

    thyroxine:
      "thyroxine",
  };

  return aliases[normalized] ??
    normalized;
}

export function buildMoverLabWideRow(
  patientLabsRows: CsvRow[],
  caseInfoRow: CsvRow
): CsvRow {
  const anesthesiaStartText =
    clean(
      caseInfoRow[
        "an_start_datetime"
      ]
    );

  const anesthesiaStartMs =
    anesthesiaStartText
      ? new Date(
          anesthesiaStartText
        ).getTime()
      : Number.NaN;

  /*
   * Prefer rows explicitly marked as preoperative.
   */
  const preopRows =
    patientLabsRows.filter(
      (row) =>
        clean(
          row["lab_phase"]
        ).toLowerCase() ===
        "preop"
    );

  const candidateRows =
    preopRows.length > 0
      ? preopRows
      : patientLabsRows;

  /*
   * Exclude labs collected after anesthesia start when collection
   * timestamps are available.
   */
  const eligibleRows =
    candidateRows.filter((row) => {
      if (
        !Number.isFinite(
          anesthesiaStartMs
        )
      ) {
        return true;
      }

      const collectionTime =
        clean(
          row["collection_time"]
        );

      if (!collectionTime) {
        return true;
      }

      const collectionMs =
        new Date(
          collectionTime
        ).getTime();

      return (
        !Number.isFinite(
          collectionMs
        ) ||
        collectionMs <=
          anesthesiaStartMs
      );
    });

  /*
   * Newest preoperative result first.
   */
  const sortedRows = [
    ...eligibleRows,
  ].sort((a, b) => {
    const timeA = new Date(
      clean(
        a["collection_time"]
      )
    ).getTime();

    const timeB = new Date(
      clean(
        b["collection_time"]
      )
    ).getTime();

    const normalizedTimeA =
      Number.isFinite(timeA)
        ? timeA
        : Number.NEGATIVE_INFINITY;

    const normalizedTimeB =
      Number.isFinite(timeB)
        ? timeB
        : Number.NEGATIVE_INFINITY;

    return (
      normalizedTimeB -
      normalizedTimeA
    );
  });

  const labWideRow: CsvRow = {};

  for (const row of sortedRows) {
    const labName =
      normalizeMoverLabName(
        row["lab_name"]
      );

    const value = toNum(
      row["observation_value"]
    );

    if (
      !labName ||
      value === undefined
    ) {
      continue;
    }

    /*
     * Rows are sorted newest first, so retain the first result for
     * each laboratory test.
     */
    if (
      labWideRow[labName] ===
      undefined
    ) {
      labWideRow[labName] =
        value;
    }
  }

  return labWideRow;
}

/* ============================================================
 * Physiological time-series normalization
 * ============================================================ */

export function normalizeMoverTimeseriesRows(
  rows: CsvRow[],
  caseInfoRow: CsvRow
): CsvRow[] {
  const anesthesiaStart =
    caseInfoRow[
      "an_start_datetime"
    ];

  const ids = buildNormalizedIds(
    caseInfoRow
  );

  return rows.map((row) => {
    const relative =
      toNum(
        row[
          "relative_anesthesia_time"
        ]
      ) ??
      toNum(
        row[
          "relative_anesthesia_time_min"
        ]
      ) ??
      toNum(
        row[
          "minutes_from_anesthesia_start"
        ]
      ) ??
      minutesBetween(
        anesthesiaStart,
        row["recorded_time"] ??
          row["observation_time"]
      );

    return {
      ...row,
      ...ids,

      relative_anesthesia_time:
        relative,
    };
  });
}

/* ============================================================
 * Medication normalization
 * ============================================================ */

function normalizeMedicationLabel(
  row: CsvRow
): string {
  return (
    pickFirst(row, [
      "med_concept_desc",
      "medication",
      "display_name",
      "medication_name",
    ]) ?? ""
  );
}

export function normalizeMoverMedBolusRows(
  rows: CsvRow[],
  caseInfoRow: CsvRow
): CsvRow[] {
  const anesthesiaStart =
    caseInfoRow[
      "an_start_datetime"
    ];

  const ids = buildNormalizedIds(
    caseInfoRow
  );

  return rows.map((row) => ({
    ...row,
    ...ids,

    source_table:
      "med_bolus",

    med_concept_desc:
      normalizeMedicationLabel(
        row
      ),

    relative_anesthesia_time:
      toNum(
        row[
          "relative_anesthesia_time"
        ]
      ) ??
      toNum(
        row[
          "relative_anesthesia_time_min"
        ]
      ) ??
      minutesBetween(
        anesthesiaStart,
        row["observation_time"] ??
          row["recorded_time"]
      ),
  }));
}

export function normalizeMoverMedInfusionRows(
  rows: CsvRow[],
  caseInfoRow: CsvRow
): CsvRow[] {
  const anesthesiaStart =
    caseInfoRow[
      "an_start_datetime"
    ];

  const anesthesiaStop =
    caseInfoRow[
      "an_stop_datetime"
    ];

  const ids = buildNormalizedIds(
    caseInfoRow
  );

  return rows.map((row) => {
    const observationTime =
      row["observation_time"] ??
      row["recorded_time"];

    const startTime =
      toIso(
        row["start_time"]
      ) ??
      toIso(
        row["start_datetime"]
      ) ??
      toIso(
        observationTime
      );

    const endTime =
      toIso(
        row["end_time"]
      ) ??
      toIso(
        row["end_datetime"]
      ) ??
      toIso(
        observationTime
      ) ??
      toIso(
        anesthesiaStop
      );

    const startMin =
      toNum(
        row[
          "relative_anesthesia_start"
        ]
      ) ??
      toNum(
        row[
          "relative_anesthesia_start_min"
        ]
      ) ??
      minutesBetween(
        anesthesiaStart,
        startTime
      );

    const endMin =
      toNum(
        row[
          "relative_anesthesia_end"
        ]
      ) ??
      toNum(
        row[
          "relative_anesthesia_end_min"
        ]
      ) ??
      minutesBetween(
        anesthesiaStart,
        endTime
      ) ??
      startMin;

    return {
      ...row,
      ...ids,

      source_table:
        "med_infusion",

      med_concept_desc:
        normalizeMedicationLabel(
          row
        ),

      relative_anesthesia_start:
        startMin,

      relative_anesthesia_end:
        endMin !== undefined &&
        startMin !== undefined &&
        endMin < startMin
          ? startMin
          : endMin,

      start_time:
        startTime,

      end_time:
        endTime,
    };
  });
}

/* ============================================================
 * Fluid normalization
 * ============================================================ */

function buildFluidRow(
  row: CsvRow,
  caseInfoRow: CsvRow,
  fieldName: string,
  tableName:
    | "fluid_in"
    | "fluid_out"
): CsvRow | null {
  const dose = toNum(
    row[fieldName]
  );

  if (!Number.isFinite(dose)) {
    return null;
  }

  const anesthesiaStart =
    caseInfoRow[
      "an_start_datetime"
    ];

  const ids = buildNormalizedIds(
    caseInfoRow
  );

  const recordedTime =
    toIso(
      row["recorded_time"]
    ) ??
    toIso(
      row["observation_time"]
    );

  const relative =
    toNum(
      row[
        "relative_anesthesia_start"
      ]
    ) ??
    toNum(
      row[
        "relative_anesthesia_end"
      ]
    ) ??
    toNum(
      row[
        "relative_anesthesia_time"
      ]
    ) ??
    toNum(
      row[
        "relative_anesthesia_time_min"
      ]
    ) ??
    minutesBetween(
      anesthesiaStart,
      recordedTime
    );

  return {
    ...row,
    ...ids,

    source_table:
      tableName,

    dose,

    unit:
      clean(row["unit"]) ||
      "mL",

    route:
      clean(row["route"]) ||
      undefined,

    start_time:
      recordedTime,

    end_time:
      recordedTime,

    relative_anesthesia_start:
      relative,

    relative_anesthesia_end:
      relative,

    fluid_direction:
      tableName === "fluid_in"
        ? "in"
        : "out",

    fluid_name:
      tableName === "fluid_in"
        ? fieldName
        : undefined,

    output_name:
      tableName === "fluid_out"
        ? fieldName
        : undefined,

    concept_name:
      fieldName,
  };
}

export function normalizeMoverFluidInRows(
  rows: CsvRow[],
  caseInfoRow: CsvRow
): CsvRow[] {
  const fields = [
    "Volume",
    "Additional Intake",
    "PRBC Volume",
  ];

  const normalized: CsvRow[] = [];

  for (const row of rows) {
    for (const field of fields) {
      const normalizedRow =
        buildFluidRow(
          row,
          caseInfoRow,
          field,
          "fluid_in"
        );

      if (!normalizedRow) {
        continue;
      }

      if (
        field === "PRBC Volume"
      ) {
        normalizedRow.fluid_name =
          clean(row["PRBC"]) ||
          "PRBC";
      }

      normalized.push(
        normalizedRow
      );
    }
  }

  return normalized;
}

export function normalizeMoverFluidOutRows(
  rows: CsvRow[],
  caseInfoRow: CsvRow
): CsvRow[] {
  const fields = [
    "Urine",
    "Urine Output",
    "QBL",
    "Other Output",
  ];

  const normalized: CsvRow[] = [];

  for (const row of rows) {
    for (const field of fields) {
      const normalizedRow =
        buildFluidRow(
          row,
          caseInfoRow,
          field,
          "fluid_out"
        );

      if (normalizedRow) {
        normalized.push(
          normalizedRow
        );
      }
    }
  }

  return normalized;
}

/* ============================================================
 * Management event generation
 * ============================================================ */

export function buildMoverManagementRows(
  medBolusRows: CsvRow[],
  medInfusionRows: CsvRow[]
): CsvRow[] {
  const bolusEvents: CsvRow[] = [];

  for (const row of medBolusRows) {
    const time = toNum(
      row[
        "relative_anesthesia_time"
      ]
    );

    const label =
      normalizeMedicationLabel(
        row
      );

    if (
      !Number.isFinite(time) ||
      !label
    ) {
      continue;
    }

    bolusEvents.push({
      chart_type:
        "medication",

      row_name:
        label,

      event_type:
        "medication_bolus",

      highlight_mode:
        "point",

      time_min:
        time,

      start_time:
        clean(
          row["observation_time"]
        ) ||
        clean(
          row["start_time"]
        ) ||
        undefined,

      dose:
        toNum(row["dose"]),

      unit:
        clean(row["unit"]) ||
        undefined,

      route:
        clean(row["route"]) ||
        undefined,

      source_table:
        "med_bolus",
    });
  }

  const infusionEvents:
    CsvRow[] = [];

  for (
    const row of medInfusionRows
  ) {
    const start = toNum(
      row[
        "relative_anesthesia_start"
      ]
    );

    const end = toNum(
      row[
        "relative_anesthesia_end"
      ]
    );

    const label =
      normalizeMedicationLabel(
        row
      );

    if (
      !Number.isFinite(start) ||
      !label
    ) {
      continue;
    }

    infusionEvents.push({
      chart_type:
        "medication",

      row_name:
        label,

      event_type:
        "medication_infusion",

      highlight_mode:
        "interval",

      time_min:
        start,

      end_time_min:
        Number.isFinite(end)
          ? end
          : start,

      start_time:
        clean(
          row["start_time"]
        ) ||
        clean(
          row["observation_time"]
        ) ||
        undefined,

      end_time:
        clean(
          row["end_time"]
        ) ||
        clean(
          row["observation_time"]
        ) ||
        undefined,

      dose:
        toNum(row["dose"]),

      unit:
        clean(row["unit"]) ||
        undefined,

      route:
        clean(row["route"]) ||
        undefined,

      source_table:
        "med_infusion",
    });
  }

  return [
    ...bolusEvents,
    ...infusionEvents,
  ].sort((a, b) => {
    const timeA =
      toNum(a["time_min"]) ??
      Number.POSITIVE_INFINITY;

    const timeB =
      toNum(b["time_min"]) ??
      Number.POSITIVE_INFINITY;

    return timeA - timeB;
  });
}

/* ============================================================
 * Main MOVER dashboard loader
 *
 * This is the only MOVER-specific entry that DashboardPage
 * should call.
 * ============================================================ */

export async function loadMoverDashboardCase(
  folder: string
): Promise<LoadedDashboardCase> {
  const [
    caseInfoRows,
    patientProcedureRows,
    patientLabsRows,

    vitalRowsRaw,
    gasRowsRaw,
    ventilationRowsRaw,
    cvRowsRaw,
    temperatureRowsRaw,

    medBolusRowsRaw,
    medInfusionRowsRaw,

    fluidInRowsRaw,
    fluidOutRowsRaw,
  ] = await Promise.all([
    fetchCsvRowsSafe(
      folder,
      "case_info.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "patient_procedure.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "patient_labs_clean.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "vital.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "gas.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "ventilation.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "cv.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "temperature.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "med_bolus.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "med_infusion.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "fluid_in.csv",
      MOVER_DATASET_BASE
    ),

    fetchCsvRowsSafe(
      folder,
      "fluid_out.csv",
      MOVER_DATASET_BASE
    ),
  ]);

  const rawCaseInfo =
    caseInfoRows[0] ?? {};

  if (
    Object.keys(rawCaseInfo)
      .length === 0
  ) {
    throw new Error(
      `MOVER case_info.csv is missing or empty for folder: ${folder}`
    );
  }

  const caseInfo =
    buildMoverNormalizedCaseInfo(
      rawCaseInfo
    );

  const patientAttr =
    buildMoverPatientAttr(
      caseInfo
    );

  const caseStatic =
    buildMoverCaseStatic(
      caseInfo,
      patientProcedureRows
    );

  const caseDynamicRows =
    buildMoverCaseDynamicRows(
      caseInfo,
      patientProcedureRows
    );

  const preopRow =
    buildMoverPreopRow(
      caseInfo
    );

  const preopHistoryRows =
    buildMoverHistoryRows(
      caseInfo
    );

  const labWideRow =
    buildMoverLabWideRow(
      patientLabsRows,
      caseInfo
    );

  const vitalRows =
    normalizeMoverTimeseriesRows(
      vitalRowsRaw,
      caseInfo
    );

  const gasRows =
    normalizeMoverTimeseriesRows(
      gasRowsRaw,
      caseInfo
    );

  const ventilationRows =
    normalizeMoverTimeseriesRows(
      ventilationRowsRaw,
      caseInfo
    );

  const cvRows =
    normalizeMoverTimeseriesRows(
      cvRowsRaw,
      caseInfo
    );

  const temperatureRows =
    normalizeMoverTimeseriesRows(
      temperatureRowsRaw,
      caseInfo
    );

  const medBolusRows =
    normalizeMoverMedBolusRows(
      medBolusRowsRaw,
      caseInfo
    );

  const medInfusionRows =
    normalizeMoverMedInfusionRows(
      medInfusionRowsRaw,
      caseInfo
    );

  const fluidInRows =
    normalizeMoverFluidInRows(
      fluidInRowsRaw,
      caseInfo
    );

  const fluidOutRows =
    normalizeMoverFluidOutRows(
      fluidOutRowsRaw,
      caseInfo
    );

  const managementRows =
    buildMoverManagementRows(
      medBolusRows,
      medInfusionRows
    );

  const caseId =
    clean(
      caseInfo["case_id"]
    ) ||
    clean(
      caseStatic["case_id"]
    ) ||
    folder;

  return {
    source: "mover",

    caseId,

    caseInfo,
    patientAttr,

    caseStatic,
    caseDynamicRows,

    preopRow,
    preopHistoryRows,

    labData:
      prepareLabData(
        labWideRow
      ),

    vitalRows,
    gasRows,
    ventilationRows,
    cvRows,
    temperatureRows,

    medBolusRows,
    medInfusionRows,

    fluidInRows,
    fluidOutRows,

    managementRows,
  };
}