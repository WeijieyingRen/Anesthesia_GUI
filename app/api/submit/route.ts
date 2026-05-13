import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isDriveUploadEnabled, uploadJsonToDrive } from "@/lib/drive-upload";

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

  panelOpenedAt?: number | string | null;
  clickedAt?: number | string | null;

  answers?: Record<string, unknown> | null;

  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;

  annotationState?: Record<string, unknown> | null;

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

function normalizePatientId(body: SubmitBody): string {
  return sanitizePathPart(
    body.patientId ?? body.patientFolder ?? body.caseId ?? "unknown_patient"
  );
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
      fileName: "final_submission.json",
    };
  }

  if (combined.includes("summary")) {
    return {
      section: "summary",
      fileName: "summary.json",
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
      fileName: "management_reasoning.json",
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
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "abnormality_reasoning.json",
    };
  }

  return {
    section: "summary",
    fileName: "summary.json",
  };
}

async function buildDriveObjectPath(body: SubmitBody): Promise<string> {
  const doctorId = await normalizeDoctorId(body);
  const accessCode = normalizeAccessCode(body);
  const patientId = normalizePatientId(body);

  const doctorFolder = `${doctorId}_${accessCode}`;
  const target = detectStorageTarget(body);

  if (target.section === "summary") {
    return `${doctorFolder}/${patientId}/summary/${target.fileName}`;
  }

  if (target.section === "management_reasoning") {
    return `${doctorFolder}/${patientId}/management_reasoning/${target.fileName}`;
  }

  if (target.section === "case_submission") {
    return `${doctorFolder}/${patientId}/case_submission/${target.fileName}`;
  }

  if (target.section === "abnormality_reasoning") {
    if (target.episodeFolder && target.taskFolder) {
      return `${doctorFolder}/${patientId}/abnormality_reasoning/${target.episodeFolder}/${target.taskFolder}/${target.fileName}`;
    }

    if (target.episodeFolder && !target.taskFolder) {
      return `${doctorFolder}/${patientId}/abnormality_reasoning/${target.episodeFolder}/${target.fileName}`;
    }

    return `${doctorFolder}/${patientId}/abnormality_reasoning/${target.fileName}`;
  }

  throw new Error("Unsupported Drive storage target.");
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
    const cleanedAnnotationState = cleanAnnotationState(body.annotationState);

    const driveRecord = removeNullFields({
      doctor_id: doctorId,
      access_code: accessCode,
      patient_id: patientId,
      case_id: caseId ?? null,
      event_id: eventId ?? null,
      episode_id:
        body?.episodeId ?? body?.selectedEventId ?? body?.eventId ?? null,
      episode_number: body?.episodeNumber ?? null,
      episode_folder: body?.episodeFolder ?? target.episodeFolder ?? null,
      panel,
      action,
      task,
      saved_at: new Date().toISOString(),
      answers,
      annotation_state: cleanedAnnotationState,
      timing: {
        page_opened_at: pageOpenedAtIso,
        first_interaction_at: firstInteractionAtIso,
        first_typing_at: firstTypingAtIso,
        first_voice_start_at: firstVoiceStartAtIso,
        page_submitted_at: pageSubmittedAtIso,
        response_time_sec: responseTimeSec,
        time_to_first_interaction_sec: timeToFirstInteractionSec,
        typing_to_submit_sec: typingToSubmitSec,
        voice_to_submit_sec: voiceToSubmitSec,
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
