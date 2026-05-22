import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  isDriveUploadEnabled,
  readJsonFromDrive,
  uploadJsonToDrive,
} from "@/lib/drive-upload";

type SubmitBody = {
  annotator?: { name?: string; email?: string };
  participant?: { name?: string; email?: string };
  participantInfo?: {
    name?: string;
    email?: string;
    accessCode?: string;
    doctorId?: string;
  };

  doctorId?: string | null;
  accessCode?: string | null;

  patientId?: string | null;
  patientFolder?: string | null;
  displayCaseId?: string | number | null;

  caseId?: string | number | null;
  eventId?: string | number | null;
  selectedEventId?: string | number | null;
  episodeId?: string | number | null;

  episodeNumber?: number | string | null;
  episodeFolder?: string | null;

  panel?: string | null;
  action?: string | null;
  task?: string | null;

  pageOpenedAt?: number | string | null;
  firstInteractionAt?: number | string | null;
  firstTypingAt?: number | string | null;
  firstVoiceStartAt?: number | string | null;
  submittedAt?: number | string | null;
  pageOpenedAtLocal?: string | null;
  submittedAtLocal?: string | null;
  totalDurationSec?: number | null;
  typingDurationSec?: number | null;
  voiceDurationSec?: number | null;
  localTimezone?: string | null;
  revisionNumber?: number | null;

  panelOpenedAt?: number | string | null;
  clickedAt?: number | string | null;

  answers?: Record<string, unknown> | null;

  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;

  annotationState?: Record<string, unknown> | null;
  workflowMode?: "annotation" | "review" | null;

  [key: string]: unknown;
};

type StorageTarget = {
  section:
    | "summary"
    | "abnormality_reasoning"
    | "management_reasoning"
    | "case_submission";
  taskFolder?: "detection" | "mechanism" | "intervention";
  fileName: string;
  episodeFolder?: string;
};

type ManifestSectionKey =
  | "summary"
  | "managementReasoning"
  | "abnormalityReasoning"
  | "caseSubmission";

type ManifestCaseEntry = {
  patientFolder: string;
  realCaseId: string;
  displayCaseId: string;
  workflow: "annotation" | "review";
  updatedAt: string;
  lastPanel?: string | null;
  hasSummary?: boolean;
  hasManagementReasoning?: boolean;
  hasAbnormalityReasoning?: boolean;
  hasCaseSubmission?: boolean;
  paths?: Partial<Record<ManifestSectionKey, string>>;
};

type CaseManifest = {
  participant?: {
    name?: string;
    doctorId?: string;
    accessCode?: string;
  };
  updatedAt?: string;
  cases?: Record<string, ManifestCaseEntry>;
};

let accessCodeDoctorMapPromise: Promise<Map<string, string>> | null = null;

async function loadAccessCodeDoctorMap(): Promise<Map<string, string>> {
  if (accessCodeDoctorMapPromise) return accessCodeDoctorMapPromise;

  accessCodeDoctorMapPromise = (async () => {
    const csvPath = path.join(
      process.cwd(),
      "public",
      "data",
      "access_code.csv"
    );

    const raw = await fs.readFile(csvPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter(Boolean);

    const map = new Map<string, string>();
    if (lines.length < 2) return map;

    const header = lines[0].split(",");
    const doctorIdx = header.indexOf("doctor_id");
    const codeIdx = header.indexOf("access_code");

    if (doctorIdx < 0 || codeIdx < 0) return map;

    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      const code = String(cols[codeIdx] ?? "").trim();
      const doctor = String(cols[doctorIdx] ?? "").trim();

      if (code && doctor) {
        map.set(code, doctor);
      }
    }

    return map;
  })();

  return accessCodeDoctorMapPromise;
}

function toIsoTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
}

function toTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim() !== "") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

function sanitizePathPart(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

async function resolveDoctorIdFromAccessCode(
  accessCode: string | null | undefined
): Promise<string | null> {
  if (!accessCode) return null;

  try {
    const map = await loadAccessCodeDoctorMap();
    return map.get(String(accessCode).trim()) ?? null;
  } catch (error) {
    console.error("Failed to resolve doctor_id from access_code.csv:", error);
    return null;
  }
}

async function normalizeDoctorId(body: SubmitBody): Promise<string> {
  const explicitDoctorId =
    body.doctorId ?? body.participantInfo?.doctorId ?? null;

  if (explicitDoctorId) {
    return sanitizePathPart(explicitDoctorId);
  }

  const accessCode =
    body.accessCode ?? body.participantInfo?.accessCode ?? null;

  const resolvedDoctorId = await resolveDoctorIdFromAccessCode(
    accessCode ? String(accessCode) : null
  );

  if (resolvedDoctorId) {
    return sanitizePathPart(resolvedDoctorId);
  }

  return "unknown_doctor";
}

function normalizeAccessCode(body: SubmitBody): string {
  return sanitizePathPart(
    body.accessCode ?? body.participantInfo?.accessCode ?? "unknown_code"
  );
}

function normalizeDoctorFolderName(body: SubmitBody, fallbackDoctorId: string) {
  const rawName =
    body.participantInfo?.name ??
    body.annotator?.name ??
    body.participant?.name ??
    fallbackDoctorId;

  return sanitizePathPart(rawName);
}

function buildDoctorFolderName(
  body: SubmitBody,
  fallbackDoctorId: string,
  accessCode: string
) {
  return `${normalizeDoctorFolderName(body, fallbackDoctorId)}_${accessCode}`;
}

function normalizePatientId(body: SubmitBody): string {
  return sanitizePathPart(
    body.patientId ?? body.patientFolder ?? body.caseId ?? "unknown_patient"
  );
}

function normalizeDisplayCaseId(body: SubmitBody): string {
  return sanitizePathPart(body.displayCaseId ?? "unknown_case");
}

function normalizeRealCaseId(body: SubmitBody): string {
  return sanitizePathPart(body.caseId ?? "unknown_case_id");
}

function buildPatientCaseFolderName(body: SubmitBody): string {
  const patientId = normalizePatientId(body);
  const caseId = normalizeDisplayCaseId(body);
  return `patient_${patientId}_case_${caseId}`;
}

function buildManifestCaseKey(body: SubmitBody): string {
  return `${normalizePatientId(body)}::${normalizeRealCaseId(body)}`;
}

function normalizeEpisodeFolder(body: SubmitBody): string {
  const explicitEpisodeFolder = body.episodeFolder;

  if (explicitEpisodeFolder) {
    const cleaned = sanitizePathPart(explicitEpisodeFolder);
    if (/^episode_\d+$/i.test(cleaned)) return cleaned;
    return cleaned;
  }

  const episodeNumber = body.episodeNumber;

  if (
    episodeNumber !== null &&
    episodeNumber !== undefined &&
    String(episodeNumber).trim() !== ""
  ) {
    const n = Number(episodeNumber);
    if (Number.isFinite(n) && n > 0) {
      return `episode_${Math.floor(n)}`;
    }
  }

  const raw =
    body.episodeId ?? body.selectedEventId ?? body.eventId ?? "episode_unknown";

  const cleaned = sanitizePathPart(raw);

  if (/^episode_\d+$/i.test(cleaned)) return cleaned;
  if (/^\d+$/.test(cleaned)) return `episode_${cleaned}`;

  return `episode_${cleaned}`;
}

function removeNullFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeNullFields(item)) as T;
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === null || val === undefined) continue;
      cleaned[key] = removeNullFields(val);
    }

    return cleaned as T;
  }

  return value;
}

function cleanAnnotationState(
  annotationState: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (
    !annotationState ||
    typeof annotationState !== "object" ||
    Array.isArray(annotationState)
  ) {
    return null;
  }

  const blockedKeys = new Set([
    "annotationLevel",
    "selectedTask",
    "selectedDetectVital",
    "selectedWindow",
  ]);

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(annotationState)) {
    if (blockedKeys.has(key)) continue;
    cleaned[key] = value;
  }

  return removeNullFields(cleaned);
}

function buildAnswers(body: SubmitBody): Record<string, unknown> | null {
  if (
    body.answers &&
    typeof body.answers === "object" &&
    !Array.isArray(body.answers)
  ) {
    return cleanAnswers(body.answers, body);
  }

  const fallbackAnswers: Record<string, unknown> = {};

  if (body.summary !== undefined) fallbackAnswers.summary = body.summary;
  if (body.result !== undefined) fallbackAnswers.result = body.result;
  if (body.response !== undefined) fallbackAnswers.response = body.response;
  if (body.notes !== undefined) fallbackAnswers.notes = body.notes;
  if (body.confidence !== undefined) fallbackAnswers.confidence = body.confidence;

  return Object.keys(fallbackAnswers).length > 0
    ? removeNullFields(fallbackAnswers)
    : null;
}

function cleanAnswers(
  answers: Record<string, unknown>,
  body: SubmitBody
): Record<string, unknown> {
  const panel = String(body.panel ?? "").toLowerCase();
  const task = String(body.task ?? "").toLowerCase();
  const combined = `${panel} ${task}`;

  const cloned: Record<string, unknown> = { ...answers };

  // For selection overview, the task block repeats allDetectedEpisodes and
  // selectedEpisodes. Keep the direct fields because they are easier to analyze.
  if (
    combined.includes("selection_overview") ||
    combined.includes("abnormality_reasoning_selection") ||
    combined.includes("checklist")
  ) {
    delete cloned.tasks;
  }

  return removeNullFields(cloned);
}

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function withRevisionSuffix(fileName: string, revisionNumber: unknown) {
  const revision = numericOrNull(revisionNumber);
  if (revision === null || revision <= 1) return fileName;

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return `${fileName}_${Math.floor(revision)}`;

  return `${fileName.slice(0, dotIndex)}_${Math.floor(revision)}${fileName.slice(dotIndex)}`;
}

function detectStorageTarget(body: SubmitBody): StorageTarget {
  const panel = String(body.panel ?? "").toLowerCase();
  const action = String(body.action ?? "").toLowerCase();
  const task = String(body.task ?? "").toLowerCase();
  const combined = `${panel} ${action} ${task}`;

  const hasAnnotationState =
    body.annotationState &&
    typeof body.annotationState === "object" &&
    !Array.isArray(body.annotationState);

  if (hasAnnotationState && !panel && !task) {
    return {
      section: "case_submission",
      fileName: "case_summary.json",
    };
  }

  if (combined.includes("case_summary")) {
    return {
      section: "case_submission",
      fileName: "case_summary.json",
    };
  }

  if (combined.includes("summary")) {
    return {
      section: "summary",
      fileName: withRevisionSuffix("summary.json", body.revisionNumber),
    };
  }

  if (
    combined.includes("selection_overview") ||
    combined.includes("abnormality_reasoning_selection") ||
    combined.includes("checklist")
  ) {
    return {
      section: "abnormality_reasoning",
      fileName: "selection_overview.json",
    };
  }

  if (combined.includes("management")) {
    return {
      section: "management_reasoning",
      fileName: withRevisionSuffix(
        "management_reasoning.json",
        body.revisionNumber
      ),
    };
  }

  if (combined.includes("detect")) {
    return {
      section: "abnormality_reasoning",
      taskFolder: "detection",
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "detection.json",
    };
  }

  if (combined.includes("mechanism")) {
    return {
      section: "abnormality_reasoning",
      taskFolder: "mechanism",
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "mechanism.json",
    };
  }

  if (combined.includes("intervention")) {
    return {
      section: "abnormality_reasoning",
      taskFolder: "intervention",
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "intervention.json",
    };
  }

  if (
    combined.includes("merged_episode_reasoning") ||
    combined.includes("abnormality")
  ) {
    return {
      section: "abnormality_reasoning",
      fileName: withRevisionSuffix(
        "abnormality_reasoning.json",
        body.revisionNumber
      ),
    };
  }

  return {
    section: "summary",
    fileName: "summary.json",
  };
}

async function resolveWorkflowMode(
  body: SubmitBody,
  doctorId: string,
  accessCode: string,
  patientId: string
): Promise<"annotation" | "review"> {
  if (body.workflowMode === "annotation" || body.workflowMode === "review") {
    return body.workflowMode;
  }

  const doctorFolder = buildDoctorFolderName(body, doctorId, accessCode);
  const existing = await readJsonFromDrive({
    objectPath: `${doctorFolder}/case_status_index.json`,
  });
  const patients =
    existing?.data?.patients &&
    typeof existing.data.patients === "object" &&
    !Array.isArray(existing.data.patients)
      ? (existing.data.patients as Record<string, unknown>)
      : {};

  const patientStatus =
    patients[patientId] &&
    typeof patients[patientId] === "object" &&
    !Array.isArray(patients[patientId])
      ? (patients[patientId] as Record<string, unknown>)
      : null;

  return patientStatus?.completed === true ? "review" : "annotation";
}

async function buildDriveObjectPath(body: SubmitBody): Promise<string> {
  const doctorId = await normalizeDoctorId(body);
  const accessCode = normalizeAccessCode(body);
  const patientId = normalizePatientId(body);
  const patientCaseFolder = buildPatientCaseFolderName(body);

  const doctorFolder = buildDoctorFolderName(body, doctorId, accessCode);
  const target = detectStorageTarget(body);
  const workflowMode = await resolveWorkflowMode(
    body,
    doctorId,
    accessCode,
    patientId
  );

  if (target.section === "summary") {
    return `${doctorFolder}/${workflowMode}/${patientCaseFolder}/summary/${target.fileName}`;
  }

  if (target.section === "management_reasoning") {
    return `${doctorFolder}/${workflowMode}/${patientCaseFolder}/management_reasoning/${target.fileName}`;
  }

  if (target.section === "case_submission") {
    return `${doctorFolder}/${workflowMode}/${patientCaseFolder}/case_submission/${target.fileName}`;
  }

  if (target.section === "abnormality_reasoning") {
    if (target.episodeFolder && target.taskFolder) {
      return `${doctorFolder}/${workflowMode}/${patientCaseFolder}/abnormality_reasoning/${target.episodeFolder}/${target.taskFolder}/${target.fileName}`;
    }

    if (target.episodeFolder && !target.taskFolder) {
      return `${doctorFolder}/${workflowMode}/${patientCaseFolder}/abnormality_reasoning/${target.episodeFolder}/${target.fileName}`;
    }

    return `${doctorFolder}/${workflowMode}/${patientCaseFolder}/abnormality_reasoning/${target.fileName}`;
  }

  throw new Error("Unsupported Drive storage target.");
}

function getManifestSectionKey(
  target: StorageTarget
): ManifestSectionKey | null {
  if (target.section === "summary") return "summary";
  if (target.section === "management_reasoning") return "managementReasoning";
  if (target.section === "abnormality_reasoning" && !target.taskFolder) {
    return "abnormalityReasoning";
  }
  if (target.section === "case_submission") return "caseSubmission";
  return null;
}

async function updateCaseManifest({
  body,
  doctorId,
  accessCode,
  driveObjectPath,
  workflowMode,
  target,
  savedAtUtc,
}: {
  body: SubmitBody;
  doctorId: string;
  accessCode: string;
  driveObjectPath: string;
  workflowMode: "annotation" | "review";
  target: StorageTarget;
  savedAtUtc: string;
}) {
  const doctorFolder = buildDoctorFolderName(body, doctorId, accessCode);
  const objectPath = `${doctorFolder}/case_manifest.json`;
  const existing = await readJsonFromDrive({ objectPath });
  const manifest =
    existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
      ? (existing.data as CaseManifest)
      : {};

  const cases =
    manifest.cases && typeof manifest.cases === "object" && !Array.isArray(manifest.cases)
      ? { ...manifest.cases }
      : {};

  const caseKey = buildManifestCaseKey(body);
  const previous =
    cases[caseKey] &&
    typeof cases[caseKey] === "object" &&
    !Array.isArray(cases[caseKey])
      ? (cases[caseKey] as ManifestCaseEntry)
      : null;

  const sectionKey = getManifestSectionKey(target);
  const nextPaths = {
    ...(previous?.paths ?? {}),
  };

  if (sectionKey) {
    nextPaths[sectionKey] = driveObjectPath;
  }

  cases[caseKey] = removeNullFields({
    ...previous,
    patientFolder: normalizePatientId(body),
    realCaseId: normalizeRealCaseId(body),
    displayCaseId: normalizeDisplayCaseId(body),
    workflow: workflowMode,
    updatedAt: savedAtUtc,
    lastPanel: body.panel ?? null,
    hasSummary:
      sectionKey === "summary" ? true : previous?.hasSummary ?? false,
    hasManagementReasoning:
      sectionKey === "managementReasoning"
        ? true
        : previous?.hasManagementReasoning ?? false,
    hasAbnormalityReasoning:
      sectionKey === "abnormalityReasoning"
        ? true
        : previous?.hasAbnormalityReasoning ?? false,
    hasCaseSubmission:
      sectionKey === "caseSubmission"
        ? true
        : previous?.hasCaseSubmission ?? false,
    paths: Object.keys(nextPaths).length > 0 ? nextPaths : undefined,
  });

  await uploadJsonToDrive({
    objectPath,
    data: removeNullFields({
      participant: {
        name:
          body.participantInfo?.name ??
          body.annotator?.name ??
          body.participant?.name ??
          null,
        doctorId,
        accessCode,
      },
      updatedAt: savedAtUtc,
      cases,
    }),
  });
}

async function updateCaseStatusIndex({
  body,
  doctorId,
  accessCode,
  patientId,
  caseId,
  panel,
}: {
  body: SubmitBody;
  doctorId: string;
  accessCode: string;
  patientId: string;
  caseId: string | number | null;
  panel: string | null;
}) {
  const doctorFolder = buildDoctorFolderName(body, doctorId, accessCode);
  const objectPath = `${doctorFolder}/case_status_index.json`;
  const existing = await readJsonFromDrive({ objectPath });
  const patients =
    existing?.data?.patients &&
    typeof existing.data.patients === "object" &&
    !Array.isArray(existing.data.patients)
      ? { ...(existing.data.patients as Record<string, unknown>) }
      : {};

  const previous =
    patients[patientId] &&
    typeof patients[patientId] === "object" &&
    !Array.isArray(patients[patientId])
      ? (patients[patientId] as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();
  const isCaseSummary = String(panel ?? "").toLowerCase().includes("case_summary");

  patients[patientId] = removeNullFields({
    ...previous,
    patient_id: patientId,
    case_id: caseId ?? previous.case_id ?? null,
    inProgress: isCaseSummary ? false : true,
    completed: isCaseSummary ? true : previous.completed === true,
    updated_at: now,
    completed_at: isCaseSummary ? now : previous.completed_at ?? null,
    last_panel: panel,
  });

  await uploadJsonToDrive({
    objectPath,
    data: removeNullFields({
      doctor_id: doctorId,
      access_code: accessCode,
      updated_at: now,
      patients,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const t0 = Date.now();

    console.log(">>> NEW SUBMIT ROUTE HIT");
    console.log("SUBMIT_STORAGE_TARGET = Google Drive");
    console.log(
      "DRIVE_ENABLED =",
      isDriveUploadEnabled() ? "true" : "false"
    );
    console.log(
      "DRIVE_FOLDER_ID =",
      process.env.DRIVE_FOLDER_ID ? "configured" : "missing"
    );
    console.log(
      "GOOGLE_APPLICATION_CREDENTIALS =",
      process.env.GOOGLE_APPLICATION_CREDENTIALS ? "configured" : "missing"
    );
    console.log(
      "DRIVE_SERVICE_ACCOUNT_KEY =",
      process.env.DRIVE_SERVICE_ACCOUNT_KEY ? "configured" : "missing"
    );

    const body = (await req.json()) as SubmitBody;

    const annotatorName =
      body?.annotator?.name ??
      body?.participant?.name ??
      body?.participantInfo?.name ??
      null;

    const annotatorEmail =
      body?.annotator?.email ??
      body?.participant?.email ??
      body?.participantInfo?.email ??
      "unknown_user";

    const caseId = body?.caseId ?? null;
    const eventId = body?.eventId ?? body?.selectedEventId ?? null;

    const action = body?.action ?? "session";
    const task = body?.task ?? null;
    const panel = body?.panel ?? null;

    const pageOpenedAtMs = toTimestampMs(
      body?.pageOpenedAt ?? body?.panelOpenedAt
    );
    const firstInteractionAtMs = toTimestampMs(body?.firstInteractionAt);
    const firstTypingAtMs = toTimestampMs(body?.firstTypingAt);
    const firstVoiceStartAtMs = toTimestampMs(body?.firstVoiceStartAt);
    const pageSubmittedAtMs = toTimestampMs(
      body?.submittedAt ?? body?.clickedAt
    );

    const pageOpenedAtIso = toIsoTime(
      body?.pageOpenedAt ?? body?.panelOpenedAt
    );
    const firstInteractionAtIso = toIsoTime(body?.firstInteractionAt);
    const firstTypingAtIso = toIsoTime(body?.firstTypingAt);
    const firstVoiceStartAtIso = toIsoTime(body?.firstVoiceStartAt);
    const pageSubmittedAtIso = toIsoTime(
      body?.submittedAt ?? body?.clickedAt
    );

    const responseTimeSec =
      pageOpenedAtMs !== null && pageSubmittedAtMs !== null
        ? Math.max(0, (pageSubmittedAtMs - pageOpenedAtMs) / 1000)
        : null;

    const timeToFirstInteractionSec =
      pageOpenedAtMs !== null && firstInteractionAtMs !== null
        ? Math.max(0, (firstInteractionAtMs - pageOpenedAtMs) / 1000)
        : null;

    const typingToSubmitSec =
      firstTypingAtMs !== null && pageSubmittedAtMs !== null
        ? Math.max(0, (pageSubmittedAtMs - firstTypingAtMs) / 1000)
        : null;

    const voiceToSubmitSec =
      firstVoiceStartAtMs !== null && pageSubmittedAtMs !== null
        ? Math.max(0, (pageSubmittedAtMs - firstVoiceStartAtMs) / 1000)
        : null;

    const answers = buildAnswers(body);

    const doctorId = await normalizeDoctorId(body);
    const accessCode = normalizeAccessCode(body);
    const patientId = normalizePatientId(body);
    const target = detectStorageTarget(body);
    const workflowMode = await resolveWorkflowMode(
      body,
      doctorId,
      accessCode,
      patientId
    );
    const cleanedAnnotationState = cleanAnnotationState(body.annotationState);
    const panelKey = String(panel ?? "").toLowerCase();
    const shouldOmitEventFields =
      panelKey.includes("abnormality_reasoning") ||
      panelKey.includes("management_reasoning");

    const savedAtUtc = new Date().toISOString();
    const driveRecord = removeNullFields({
      doctor_id: doctorId,
      access_code: accessCode,
      patient_id: patientId,
      case_id: caseId ?? null,
      ...(shouldOmitEventFields
        ? {}
        : {
            event_id: eventId ?? null,
            episode_id:
              body?.episodeId ?? body?.selectedEventId ?? body?.eventId ?? null,
            episode_number: body?.episodeNumber ?? null,
            episode_folder: body?.episodeFolder ?? target.episodeFolder ?? null,
          }),
      panel,
      saved_at_utc: savedAtUtc,
      saved_at_local: body.submittedAtLocal ?? null,
      answers,
      annotation_state: cleanedAnnotationState,
      timing: {
        page_opened_at_utc: pageOpenedAtIso,
        page_opened_at_local: body.pageOpenedAtLocal ?? null,
        page_submitted_at_utc: pageSubmittedAtIso,
        page_submitted_at_local: body.submittedAtLocal ?? null,
        total_duration_sec:
          numericOrNull(body.totalDurationSec) ?? responseTimeSec,
        typing_duration_sec:
          numericOrNull(body.typingDurationSec) ?? typingToSubmitSec,
        voice_duration_sec:
          numericOrNull(body.voiceDurationSec) ?? voiceToSubmitSec,
        local_timezone: body.localTimezone ?? null,
      },
    });

    const driveObjectPath = await buildDriveObjectPath(body);

    if (!isDriveUploadEnabled()) {
      throw new Error(
        "Google Drive save is required, but DRIVE_ENABLED is not true."
      );
    }

    const uploaded = await uploadJsonToDrive({
      objectPath: driveObjectPath,
      data: driveRecord,
    });

    await updateCaseStatusIndex({
      body,
      doctorId,
      accessCode,
      patientId,
      caseId,
      panel,
    });

    await updateCaseManifest({
      body,
      doctorId,
      accessCode,
      driveObjectPath,
      workflowMode,
      target,
      savedAtUtc,
    });

    const driveResult = {
      saved: true,
      skipped: false,
      fileId: uploaded.fileId,
      fileName: uploaded.fileName,
      folderId: uploaded.folderId,
      objectPath: uploaded.objectPath,
      webViewLink: uploaded.webViewLink ?? null,
      warning: null,
    };

    const totalServerSec = (Date.now() - t0) / 1000;
    console.log("submit route total sec =", totalServerSec);

    return NextResponse.json({
      ok: true,
      saved: removeNullFields({
        doctorId,
        accessCode,
        patientId,
        caseId,
        eventId,
        panel,
        action,
        task,
        responseTimeSec,
        timeToFirstInteractionSec,
        typingToSubmitSec,
        voiceToSubmitSec,
        totalServerSec,
      }),
      drive: driveResult,
      localExport: {
        objectPath: uploaded.objectPath,
        data: driveRecord,
      },
      debug_version: "google-drive-required-submit-route-v3",
    });
  } catch (error) {
    console.error("Submit route error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save submission.",
      },
      { status: 500 }
    );
  }
}
