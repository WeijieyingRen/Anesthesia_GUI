import Papa from "papaparse";

import { STANFORD_DATASET_BASE } from "@/lib/dataset-config";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";

import type {
  CsvRow,
  LoadedDashboardCase,
} from "@/lib/loaders/dashboard-case-types";

/*
 * Clinical timestamps must preserve the wall-clock time written in the
 * Stanford source data, regardless of the annotator's browser timezone.
 *
 * Example:
 *
 *   2025-11-20 23:38:00+00:00
 *
 * becomes:
 *
 *   2025-11-20T23:38:00
 *
 * The timezone suffix is intentionally removed before clinical timestamps
 * are passed to the dashboard. This prevents browsers in California, China,
 * or India from displaying different clock times.
 *
 * This applies only to clinical timestamps loaded from the dataset.
 * Submission timestamps such as saved_at_utc and saved_at_local are handled
 * elsewhere and remain unchanged.
 */

const STANFORD_CASE_STATIC_TIME_FIELDS = [
  "anesthesia_start",
  "induction",
  "intubation",
  "procedure_start",
  "procedure_end",
  "extubation",
  "anesthesia_stop",
  "emergence",
  "anesthesia_timeout",
  "anesthesia_end",
] as const;

const STANFORD_MANAGEMENT_TIME_FIELDS = [
  "start_time",
  "end_time",
] as const;

/**
 * Convert a timezone-bearing clinical timestamp into a timezone-free
 * wall-clock timestamp.
 *
 * Examples:
 *
 * 2025-11-20 23:38:00+00:00 -> 2025-11-20T23:38:00
 * 2025-11-20T23:38:00Z      -> 2025-11-20T23:38:00
 * 2025-11-20 23:38:00       -> 2025-11-20T23:38:00
 *
 * This function deliberately does not use new Date(), because Date would
 * convert the value into the browser's local timezone.
 */
function normalizeClinicalWallTime(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const text = value.trim();

  if (!text) {
    return value;
  }

  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|[+-]\d{2}:?\d{2})?$/
  );

  if (!match) {
    return value;
  }

  const [, datePart, timePart] = match;

  return `${datePart}T${timePart}`;
}

function normalizeStanfordCaseStaticTimes(
  row: CsvRow
): CsvRow {
  const normalizedRow: CsvRow = {
    ...row,
  };

  for (const field of STANFORD_CASE_STATIC_TIME_FIELDS) {
    normalizedRow[field] = normalizeClinicalWallTime(
      normalizedRow[field]
    );
  }

  return normalizedRow;
}

function normalizeStanfordManagementTimes(
  rows: CsvRow[]
): CsvRow[] {
  return rows.map((row) => {
    const normalizedRow: CsvRow = {
      ...row,
    };

    for (const field of STANFORD_MANAGEMENT_TIME_FIELDS) {
      normalizedRow[field] = normalizeClinicalWallTime(
        normalizedRow[field]
      );
    }

    return normalizedRow;
  });
}

async function fetchRequiredCsvRows(
  folder: string,
  filename: string
): Promise<CsvRow[]> {
  const url = `${STANFORD_DATASET_BASE}/${folder}/${filename}`;
  const res = await fetch(url, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Failed to load required file ${url}: ${res.status} ${res.statusText}`
    );
  }

  const text = await res.text();

  return Papa.parse<CsvRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

async function fetchOptionalCsvRows(
  folder: string,
  filename: string
): Promise<CsvRow[]> {
  const url = `${STANFORD_DATASET_BASE}/${folder}/${filename}`;
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

  return Papa.parse<CsvRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

export async function loadStanfordDashboardCase(
  folder: string
): Promise<LoadedDashboardCase> {
  const [
    caseInfoRows,
    patientAttrRows,
    caseStaticRows,
    caseDynamicRows,
    preopRows,
    preopHistoryRows,
    labRows,
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
  ] = await Promise.all([
    fetchRequiredCsvRows(folder, "case_info.csv"),
    fetchRequiredCsvRows(
      folder,
      "patients_attributes_case.csv"
    ),
    fetchRequiredCsvRows(folder, "case_static.csv"),
    fetchRequiredCsvRows(
      folder,
      "case_dynamic_events.csv"
    ),
    fetchRequiredCsvRows(folder, "preop.csv"),
    fetchOptionalCsvRows(folder, "preop_history.csv"),
    fetchRequiredCsvRows(folder, "lab.csv"),
    fetchRequiredCsvRows(folder, "vital.csv"),
    fetchRequiredCsvRows(folder, "gas.csv"),
    fetchRequiredCsvRows(folder, "ventilation.csv"),
    fetchRequiredCsvRows(folder, "cv.csv"),
    fetchRequiredCsvRows(folder, "temperature.csv"),
    fetchRequiredCsvRows(folder, "med_bolus.csv"),
    fetchRequiredCsvRows(folder, "med_infusion.csv"),
    fetchRequiredCsvRows(folder, "fluid_in.csv"),
    fetchRequiredCsvRows(folder, "fluid_out.csv"),
    fetchRequiredCsvRows(folder, "management.csv"),
  ]);

  const caseInfo = caseInfoRows[0] ?? {};
  const patientAttr = patientAttrRows[0] ?? {};

  const caseStatic = normalizeStanfordCaseStaticTimes(
    caseStaticRows[0] ?? {}
  );

  const normalizedManagementRows =
    normalizeStanfordManagementTimes(managementRows);

  const preopRow = preopRows[0] ?? {};
  const labRow = labRows[0] ?? {};

  const caseId =
    String(caseInfo["mpog_case_id"] ?? "").trim() ||
    String(caseStatic["mpog_case_id"] ?? "").trim() ||
    folder;

  return {
    source: "stanford_mpog",

    caseId,

    caseInfo,
    patientAttr,
    caseStatic,
    caseDynamicRows,

    preopRow,
    preopHistoryRows,

    labData: prepareLabData(labRow),

    vitalRows,
    gasRows,
    ventilationRows,
    cvRows,
    temperatureRows,

    medBolusRows,
    medInfusionRows,

    fluidInRows,
    fluidOutRows,

    managementRows: normalizedManagementRows,
  };
}