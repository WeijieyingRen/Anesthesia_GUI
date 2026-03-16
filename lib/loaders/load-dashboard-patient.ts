import Papa from "papaparse";
import type {
  PatientDemographic,
  SurgeryContext,
  TimelineStatic,
  TimelineEvent,
  PreopAssessment,
  LabData,
} from "@/lib/types";
import { prepareDemographicData } from "@/lib/prepare_raw_data/demographic";
import { prepareSurgeryContextData } from "@/lib/prepare_raw_data/surgery_context";
import {
  prepareTimelineStaticData,
  prepareTimelineDynamicEvents,
} from "@/lib/prepare_raw_data/timeline";
import { preparePreopData } from "@/lib/prepare_raw_data/preop";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";

import Papa from "papaparse";
import { prepareDemographicData } from "@/lib/prepare_raw_data/demographic";
import { prepareSurgeryContextData } from "@/lib/prepare_raw_data/surgery_context";
import { preparePreopData } from "@/lib/prepare_raw_data/preop";
import { prepareLabData } from "@/lib/prepare_raw_data/lab";
import { prepareVitalsDataRaw } from "@/lib/prepare_raw_data/vitals";
import { prepareMedicationData } from "@/lib/prepare_raw_data/medications";

type CsvRow = Record<string, any>;

async function fetchCsvRows(folder: string, filename: string): Promise<CsvRow[]> {
  const url = `/data/${folder}/${filename}`;
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

async function fetchTextFile(folder: string, filename: string): Promise<string> {
  const url = `/data/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }

  return (await res.text()).trim();
}

export async function loadDashboardPatient(folder: string) {
  const caseId = await fetchTextFile(folder, "case_id.txt");

  const [
    caseInfoRows,
    patientAttrRows,
    caseStaticRows,
    preopRows,
    labRows,
    phyRows,
    medBolusRows,
    medInfusionRows,
  ] = await Promise.all([
    fetchCsvRows(folder, "case_info.csv"),
    fetchCsvRows(folder, "patients_attributes_case.csv"),
    fetchCsvRows(folder, "case_static.csv"),
    fetchCsvRows(folder, "preop.csv"),
    fetchCsvRows(folder, "lab.csv"),
    fetchCsvRows(folder, "phy_data.csv"),
    fetchCsvRows(folder, "med_bolus.csv"),
    fetchCsvRows(folder, "med_infusion.csv"),
  ]);

  const caseInfo = caseInfoRows[0] ?? {};
  const patientAttr = patientAttrRows[0] ?? {};
  const caseStatic = caseStaticRows[0] ?? {};
  const preopRow = preopRows[0] ?? {};
  const labRow = labRows[0] ?? {};

  const anesthesiaStart = caseStatic["anesthesia_start"];

  return {
    caseId,
    demographic: prepareDemographicData(caseInfo, patientAttr, preopRow, caseId),
    surgeryContext: prepareSurgeryContextData(caseInfo, caseStatic, preopRow),
    preop: preparePreopData(preopRow),
    lab: prepareLabData(labRow),
    vitals: prepareVitalsDataRaw(phyRows),
    medications: prepareMedicationData(medBolusRows, medInfusionRows, anesthesiaStart),
  };
}

type Row = Record<string, any>;

async function fetchCsvRows(folder: string, filename: string): Promise<Row[]> {
  const url = `/data/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return Papa.parse<Row>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
}

async function fetchTextFile(folder: string, filename: string): Promise<string> {
  const url = `/data/${folder}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.text()).trim();
}

export type DashboardPatientData = {
  caseId: string;
  demographic: PatientDemographic | null;
  surgeryContext: SurgeryContext | null;
  timelineStatic: TimelineStatic | null;
  timelineEvents: TimelineEvent[];
  preop: PreopAssessment | null;
  lab: LabData | null;
};

export async function loadDashboardPatient(folder: string): Promise<DashboardPatientData> {
  const caseId = await fetchTextFile(folder, "case_id.txt");

  const [
    caseStaticRows,
    caseDynamicRows,
    caseInfoRows,
    preopRows,
    labRows,
    patientAttrRows,
  ] = await Promise.all([
    fetchCsvRows(folder, "case_static.csv"),
    fetchCsvRows(folder, "case_dynamic_events.csv"),
    fetchCsvRows(folder, "case_info.csv"),
    fetchCsvRows(folder, "preop.csv"),
    fetchCsvRows(folder, "lab.csv"),
    fetchCsvRows(folder, "patients_attributes_case.csv"),
  ]);

  const caseStatic = caseStaticRows[0] ?? {};
  const caseInfo = caseInfoRows[0] ?? {};
  const preopRow = preopRows[0] ?? {};
  const labRow = labRows[0] ?? {};
  const patientAttr = patientAttrRows[0] ?? {};

  return {
    caseId,
    demographic: prepareDemographicData(caseInfo, patientAttr, preopRow, caseId),
    surgeryContext: prepareSurgeryContextData(caseInfo, caseStatic, preopRow),
    timelineStatic: prepareTimelineStaticData(caseStatic),
    timelineEvents: prepareTimelineDynamicEvents(caseDynamicRows),
    preop: preparePreopData(preopRow),
    lab: prepareLabData(labRow),
  };
}