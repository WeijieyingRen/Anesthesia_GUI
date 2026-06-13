import Papa from "papaparse";

import { STANFORD_DATASET_BASE } from "@/lib/dataset-config";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";

import type {
  CsvRow,
  LoadedDashboardCase,
} from "@/lib/loaders/dashboard-case-types";

async function fetchRequiredCsvRows(
  folder: string,
  filename: string
): Promise<CsvRow[]> {
  const url = `${STANFORD_DATASET_BASE}/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

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
  const res = await fetch(url, { cache: "no-store" });

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
    fetchRequiredCsvRows(folder, "patients_attributes_case.csv"),
    fetchRequiredCsvRows(folder, "case_static.csv"),
    fetchRequiredCsvRows(folder, "case_dynamic_events.csv"),
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
  const caseStatic = caseStaticRows[0] ?? {};
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

    managementRows,
  };
}