import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  isDriveUploadEnabled,
  listDriveEntries,
  readJsonFromDrive,
  uploadJsonToDrive,
} from "@/lib/drive-upload";
import { DATASET_ROOT } from "@/lib/dataset-config";

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
  section: "summary" | "abnormality_reasoning" | "management_reasoning";
  fileName: string;
};

type TaskKey = "summary" | "abnormality_reasoning" | "management_reasoning";

let accessCodeDoctorMapPromise: Promise<Map<string, string>> | null = null;

async function loadAccessCodeDoctorMap(): Promise<Map<string, string>> {
  if (accessCodeDoctorMapPromise) return accessCodeDoctorMapPromise;

  accessCodeDoctorMapPromise = (async () => {
    const csvPath = path.join(
      process.cwd(),
      "public",
      DATASET_ROOT,
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

function normalizePatientId(body: SubmitBody): string {
  return sanitizePathPart(
    body.patientId ?? body.patientFolder ?? body.caseId ?? "unknown_patient"
  );
}

function normalizeRealCaseId(body: SubmitBody): string {
  return sanitizePathPart(body.caseId ?? "unknown_case_id");
}

function resolveFullName(body: SubmitBody, fallbackDoctorId: string) {
  const rawName =
    body.participantInfo?.name ??
    body.annotator?.name ??
    body.participant?.name ??
    fallbackDoctorId;

  return String(rawName ?? fallbackDoctorId).trim() || fallbackDoctorId;
}

function buildAccessCodeRoot(accessCode: string) {
  return sanitizePathPart(accessCode);
}

function buildPatientCaseFolderName(body: SubmitBody): string {
  const patientId = normalizePatientId(body);
  const caseId = normalizeRealCaseId(body);
  return `patient_${patientId}_${caseId}`;
}

function buildCaseKey(patientId: string, caseId: string | number | null) {
  return `${sanitizePathPart(patientId)}::${sanitizePathPart(
    caseId ?? "unknown_case_id"
  )}`;
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

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  return null;
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

function cleanAnswers(
  answers: Record<string, unknown>,
  body: SubmitBody
): Record<string, unknown> {
  const panel = String(body.panel ?? "").toLowerCase();
  const task = String(body.task ?? "").toLowerCase();
  const combined = `${panel} ${task}`;

  const cloned: Record<string, unknown> = { ...answers };

  if (
    combined.includes("selection_overview") ||
    combined.includes("abnormality_reasoning_selection") ||
    combined.includes("checklist")
  ) {
    delete cloned.tasks;
  }

  return removeNullFields(cloned);
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

function parseRevision(fileName: string, baseName: string) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fileName.match(new RegExp(`^${escaped}(?:_(\\d+))?\\.json$`));
  if (!match) return null;
  return match[1] ? Number(match[1]) : 1;
}

function withRevisionSuffix(fileName: string, revisionNumber: unknown) {
  const revision = numericOrNull(revisionNumber);
  if (revision === null || revision <= 1) return fileName;

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return `${fileName}_${Math.floor(revision)}`;

  return `${fileName.slice(0, dotIndex)}_${Math.floor(revision)}${fileName.slice(
    dotIndex
  )}`;
}

async function resolveRevisionedFileName(
  sectionPath: string,
  baseFileName: string,
  revisionNumber: unknown
) {
  const explicitRevision = numericOrNull(revisionNumber);
  if (explicitRevision !== null && explicitRevision > 0) {
    return withRevisionSuffix(baseFileName, explicitRevision);
  }

  try {
    const baseName = baseFileName.replace(/\.json$/i, "");
    const entries = await listDriveEntries({ objectPath: sectionPath });
    const latestRevision = entries.reduce((max, entry) => {
      const revision = entry.name ? parseRevision(entry.name, baseName) : null;
      return revision && revision > max ? revision : max;
    }, 0);

    return withRevisionSuffix(baseFileName, latestRevision + 1);
  } catch {
    return withRevisionSuffix(baseFileName, 1);
  }
}

function resolveWorkflowMode(body: SubmitBody): "annotation" | "review" {
  if (body.workflowMode === "review") return "review";
  return "annotation";
}

function detectStorageTarget(body: SubmitBody): StorageTarget {
  const panel = String(body.panel ?? "").toLowerCase();
  const task = String(body.task ?? "").toLowerCase();
  const action = String(body.action ?? "").toLowerCase();
  const combined = `${panel} ${task} ${action}`;

  if (combined.includes("summary")) {
    return {
      section: "summary",
      fileName: "summary.json",
    };
  }

  if (combined.includes("management")) {
    return {
      section: "management_reasoning",
      fileName: "management_reasoning.json",
    };
  }

  if (
    combined.includes("abnormality") ||
    combined.includes("selection_overview") ||
    combined.includes("checklist") ||
    combined.includes("detect") ||
    combined.includes("mechanism") ||
    combined.includes("intervention") ||
    combined.includes("merged_episode_reasoning")
  ) {
    return {
      section: "abnormality_reasoning",
      fileName: "abnormality_reasoning.json",
    };
  }

  return {
    section: "summary",
    fileName: "summary.json",
  };
}

function getTaskKey(target: StorageTarget): TaskKey {
  return target.section;
}

async function buildDriveObjectPath({
  body,
  accessCode,
  workflowMode,
  target,
}: {
  body: SubmitBody;
  accessCode: string;
  workflowMode: "annotation" | "review";
  target: StorageTarget;
}): Promise<string> {
  const rootFolder = buildAccessCodeRoot(accessCode);
  const patientCaseFolder = buildPatientCaseFolderName(body);

  const sectionPath = `${rootFolder}/${workflowMode}/${patientCaseFolder}/${target.section}`;

  const fileName = await resolveRevisionedFileName(
    sectionPath,
    target.fileName,
    body.revisionNumber
  );

  return `${sectionPath}/${fileName}`;
}

async function updateCaseStatusIndex({
  body,
  doctorId,
  accessCode,
  patientId,
  caseId,
  displayCaseId,
  panel,
  target,
  workflowMode,
  driveObjectPath,
}: {
  body: SubmitBody;
  doctorId: string;
  accessCode: string;
  patientId: string;
  caseId: string | number | null;
  displayCaseId?: string | number | null;
  panel: string | null;
  target: StorageTarget;
  workflowMode: "annotation" | "review";
  driveObjectPath: string;
}) {
  const rootFolder = buildAccessCodeRoot(accessCode);
  const objectPath = `${rootFolder}/case_status_index.json`;

  const existing = await readJsonFromDrive({ objectPath }).catch(() => null);

  const oldCases =
    existing?.data?.cases &&
    typeof existing.data.cases === "object" &&
    !Array.isArray(existing.data.cases)
      ? { ...(existing.data.cases as Record<string, any>) }
      : {};

  const now = new Date().toISOString();
  const fullName = resolveFullName(body, doctorId);
  const normalizedPatientId = sanitizePathPart(patientId);
  const normalizedCaseId = sanitizePathPart(caseId ?? "unknown_case_id");
  const caseKey = buildCaseKey(normalizedPatientId, normalizedCaseId);

  const previous =
    oldCases[caseKey] &&
    typeof oldCases[caseKey] === "object" &&
    !Array.isArray(oldCases[caseKey])
      ? oldCases[caseKey]
      : {};

  const previousTasks = previous.tasks ?? {};

  const tasks = {
    summary: {
      completed: Boolean(previousTasks.summary?.completed),
      latest_path: previousTasks.summary?.latest_path ?? null,
      updated_at: previousTasks.summary?.updated_at ?? null,
    },
    abnormality_reasoning: {
      completed: Boolean(previousTasks.abnormality_reasoning?.completed),
      latest_path: previousTasks.abnormality_reasoning?.latest_path ?? null,
      updated_at: previousTasks.abnormality_reasoning?.updated_at ?? null,
    },
    management_reasoning: {
      completed: Boolean(previousTasks.management_reasoning?.completed),
      latest_path: previousTasks.management_reasoning?.latest_path ?? null,
      updated_at: previousTasks.management_reasoning?.updated_at ?? null,
    },
  };

  const taskKey = getTaskKey(target);

  tasks[taskKey] = {
    completed: true,
    latest_path: driveObjectPath,
    updated_at: now,
  };

  const allCompleted =
    tasks.summary.completed &&
    tasks.abnormality_reasoning.completed &&
    tasks.management_reasoning.completed;

  oldCases[caseKey] = removeNullFields({
    ...previous,
    patient_id: normalizedPatientId,
    case_id: normalizedCaseId,
    display_case_id: displayCaseId ?? previous.display_case_id ?? null,
    full_name: fullName,
    workflow: workflowMode,
    status: allCompleted ? "completed" : "in_progress",
    completed: allCompleted,
    inProgress: !allCompleted,
    updated_at: now,
    completed_at: allCompleted ? previous.completed_at ?? now : null,
    last_panel: panel,
    tasks,
  });

  await uploadJsonToDrive({
    objectPath,
    data: removeNullFields({
      doctor_id: doctorId,
      access_code: accessCode,
      full_name: fullName,
      updated_at: now,
      cases: oldCases,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const t0 = Date.now();

    console.log(">>> NEW SUBMIT ROUTE HIT");
    console.log("SUBMIT_STORAGE_TARGET = Google Drive");
    console.log("DRIVE_ENABLED =", isDriveUploadEnabled() ? "true" : "false");
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
    const pageSubmittedAtIso = toIsoTime(body?.submittedAt ?? body?.clickedAt);

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
    const workflowMode = resolveWorkflowMode(body);
    const cleanedAnnotationState = cleanAnnotationState(body.annotationState);

    const savedAtUtc = new Date().toISOString();

    const driveObjectPath = await buildDriveObjectPath({
      body,
      accessCode,
      workflowMode,
      target,
    });

    const driveRecord = removeNullFields({
      doctor_id: doctorId,
      access_code: accessCode,
      full_name: resolveFullName(body, doctorId),
      patient_id: patientId,
      case_id: caseId ?? null,
      display_case_id: body.displayCaseId ?? null,
      event_id: eventId ?? null,
      episode_id:
        body?.episodeId ?? body?.selectedEventId ?? body?.eventId ?? null,
      episode_number: body?.episodeNumber ?? null,
      episode_folder: body?.episodeFolder ?? null,
      workflow_mode: workflowMode,
      task_key: getTaskKey(target),
      panel,
      action,
      task,
      saved_at_utc: savedAtUtc,
      saved_at_local: body.submittedAtLocal ?? null,
      answers,
      annotation_state: cleanedAnnotationState,
      timing: {
        page_opened_at_utc: pageOpenedAtIso,
        page_opened_at_local: body.pageOpenedAtLocal ?? null,
        first_interaction_at_utc: firstInteractionAtIso,
        first_typing_at_utc: firstTypingAtIso,
        first_voice_start_at_utc: firstVoiceStartAtIso,
        page_submitted_at_utc: pageSubmittedAtIso,
        page_submitted_at_local: body.submittedAtLocal ?? null,
        total_duration_sec:
          numericOrNull(body.totalDurationSec) ?? responseTimeSec,
        time_to_first_interaction_sec: timeToFirstInteractionSec,
        typing_duration_sec:
          numericOrNull(body.typingDurationSec) ?? typingToSubmitSec,
        voice_duration_sec:
          numericOrNull(body.voiceDurationSec) ?? voiceToSubmitSec,
        local_timezone: body.localTimezone ?? null,
      },
    });

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
      displayCaseId: body.displayCaseId ?? null,
      panel,
      target,
      workflowMode,
      driveObjectPath: uploaded.objectPath,
    });

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
        workflowMode,
        taskKey: getTaskKey(target),
        responseTimeSec,
        timeToFirstInteractionSec,
        typingToSubmitSec,
        voiceToSubmitSec,
        totalServerSec,
      }),
      drive: {
        saved: true,
        skipped: false,
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        folderId: uploaded.folderId,
        objectPath: uploaded.objectPath,
        webViewLink: uploaded.webViewLink ?? null,
        warning: null,
      },
      localExport: {
        objectPath: uploaded.objectPath,
        data: driveRecord,
      },
      debug_version: "access-code-index-submit-route-v4",
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
