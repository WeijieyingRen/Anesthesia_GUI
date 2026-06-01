import Papa from "papaparse";
import type {
  PatientDemographic,
  SurgeryContext,
  PreopAssessment,
  LabData,
} from "@/lib/types";

import { prepareDemographicData } from "@/lib/prepare_raw_data/demographic";
import { prepareSurgeryContextData } from "@/lib/prepare_raw_data/surgery_context";
import { preparePreopData } from "@/lib/prepare_raw_data/preop";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";
import {
  buildPhysiologyRowsFromPanelFiles,
  prepareVitalsDataRaw,
} from "@/lib/prepare_raw_data/vitals";
import { prepareMedicationData } from "@/lib/prepare_raw_data/medications";
import { DATASET_BASE } from "@/lib/dataset-config";

type CsvRow = Record<string, any>;

export type DashboardPatientData = {
  caseId: string;
  demographic: PatientDemographic | null;
  surgeryContext: SurgeryContext | null;
  preop: PreopAssessment | null;
  preopHistory: CsvRow[];
  lab: LabData | null;
  vitals: any;
  medications: any;
};

async function fetchCsvRows(folder: string, filename: string): Promise<CsvRow[]> {
  const url = `${DATASET_BASE}/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
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
  const url = `${DATASET_BASE}/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return [];
  }

  const text = await res.text();

  return Papa.parse<CsvRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

export async function loadDashboardPatient(
  folder: string
): Promise<DashboardPatientData> {
  const [
    caseInfoRows,
    patientAttrRows,
    caseStaticRows,
    caseDynamicRows,
    preopRows,
    preopHistoryRowsLoaded,
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
    fetchCsvRows(folder, "case_info.csv"),
    fetchCsvRows(folder, "patients_attributes_case.csv"),
    fetchCsvRows(folder, "case_static.csv"),
    fetchCsvRows(folder, "case_dynamic_events.csv"),
    fetchCsvRows(folder, "preop.csv"),
    fetchOptionalCsvRows(folder, "preop_history.csv"),
    fetchCsvRows(folder, "lab.csv"),
    fetchCsvRows(folder, "vital.csv"),
    fetchCsvRows(folder, "gas.csv"),
    fetchCsvRows(folder, "ventilation.csv"),
    fetchCsvRows(folder, "cv.csv"),
    fetchCsvRows(folder, "temperature.csv"),
    fetchCsvRows(folder, "med_bolus.csv"),
    fetchCsvRows(folder, "med_infusion.csv"),
    fetchCsvRows(folder, "fluid_in.csv"),
    fetchCsvRows(folder, "fluid_out.csv"),
    fetchCsvRows(folder, "management.csv"),
  ]);

  const caseInfo = caseInfoRows[0] ?? {};
  const patientAttr = patientAttrRows[0] ?? {};
  const caseStatic = caseStaticRows[0] ?? {};
  const preopRow = preopRows[0] ?? {};
  const labRow = labRows[0] ?? {};
  const physiologyRows = buildPhysiologyRowsFromPanelFiles({
    vitalRows,
    gasRows,
    ventilationRows,
    cvRows,
    temperatureRows,
  });
  const caseId =
    String(caseInfo["mpog_case_id"] ?? "").trim() ||
    String(caseStatic["mpog_case_id"] ?? "").trim() ||
    folder;

  return {
    caseId,
    demographic: prepareDemographicData(caseInfo, patientAttr, preopRow, caseId),
    surgeryContext: prepareSurgeryContextData(caseInfo, caseStatic, preopRow),
    preop: preparePreopData(preopRow),
    preopHistory: preopHistoryRowsLoaded,
    lab: prepareLabData(labRow),
    vitals: prepareVitalsDataRaw(physiologyRows),
    medications: prepareMedicationData(medBolusRows, medInfusionRows),
  };
}
