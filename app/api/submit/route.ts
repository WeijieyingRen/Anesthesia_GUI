import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import path from "path";

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
  episodeId?: string | null;

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

type CaseStatusIndexEntry = {
  completed: boolean;
  inProgress: boolean;
  case_id: string | number | null;
  updated_at: string;
};

type CaseStatusIndexFile = {
  updated_at: string;
  patients: Record<string, CaseStatusIndexEntry>;
};

const storage = new Storage();

let supabaseClient: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;
  if (supabaseClient) return supabaseClient;

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

let accessCodeDoctorMapPromise: Promise<Map<string, string>> | null = null;

async function loadAccessCodeDoctorMap(): Promise<Map<string, string>> {
  if (accessCodeDoctorMapPromise) return accessCodeDoctorMapPromise;

  accessCodeDoctorMapPromise = (async () => {
    const csvPath = path.join(process.cwd(), "public", "data", "access_code.csv");
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

function buildAnswers(body: SubmitBody): Record<string, unknown> | null {
  if (
    body.answers &&
    typeof body.answers === "object" &&
    !Array.isArray(body.answers)
  ) {
    return body.answers;
  }

  const fallbackAnswers: Record<string, unknown> = {};

  if (body.summary !== undefined) fallbackAnswers.summary = body.summary;
  if (body.result !== undefined) fallbackAnswers.result = body.result;
  if (body.response !== undefined) fallbackAnswers.response = body.response;
  if (body.notes !== undefined) fallbackAnswers.notes = body.notes;
  if (body.confidence !== undefined) fallbackAnswers.confidence = body.confidence;

  return Object.keys(fallbackAnswers).length > 0 ? fallbackAnswers : null;
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

function detectStorageTarget(body: SubmitBody): {
  section:
    | "summary"
    | "abnormality_reasoning"
    | "management_reasoning"
    | "case_submission";
  taskFolder?: "detection" | "mechanism" | "intervention";
  fileName: string;
  episodeFolder?: string;
} {
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

  if (combined.includes("abnormality")) {
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

async function buildGcsObjectPath(body: SubmitBody): Promise<string> {
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
    if (!target.episodeFolder && !target.taskFolder) {
      return `${doctorFolder}/${patientId}/abnormality_reasoning/${target.fileName}`;
    }
  
    if (!target.episodeFolder || !target.taskFolder) {
      throw new Error(
        "Episode folder or task folder missing for abnormality_reasoning."
      );
    }
  
    return `${doctorFolder}/${patientId}/abnormality_reasoning/${target.episodeFolder}/${target.taskFolder}/${target.fileName}`;
  }

  throw new Error("Unsupported storage target.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadSubmissionToGCSOnce(
  body: SubmitBody,
  data: Record<string, unknown>
): Promise<{
  objectName: string;
}> {
  const bucketName = process.env.GCS_BUCKET;

  if (!bucketName) {
    throw new Error("GCS_BUCKET not configured.");
  }

  const bucket = storage.bucket(bucketName);
  const objectName = await buildGcsObjectPath(body);

  await bucket.file(objectName).save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "no-store",
    },
  });

  return { objectName };
}

async function uploadSubmissionToGCSWithRetry(
  body: SubmitBody,
  data: Record<string, unknown>,
  options?: {
    maxAttempts?: number;
    initialDelayMs?: number;
  }
): Promise<{
  saved: true;
  objectName: string;
  attemptsUsed: number;
}> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 1000;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { objectName } = await uploadSubmissionToGCSOnce(body, data);
      return {
        saved: true,
        objectName,
        attemptsUsed: attempt,
      };
    } catch (error) {
      lastError = error;
      console.error(`GCS upload attempt ${attempt}/${maxAttempts} failed:`, error);

      if (attempt < maxAttempts) {
        const waitMs = initialDelayMs * Math.pow(2, attempt - 1);
        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `GCS upload failed after ${maxAttempts} attempts: ${lastError.message}`
      : `GCS upload failed after ${maxAttempts} attempts.`
  );
}

function isFinalCaseSubmission(body: SubmitBody): boolean {
  const hasAnnotationState =
    body.annotationState &&
    typeof body.annotationState === "object" &&
    !Array.isArray(body.annotationState);

  return Boolean(hasAnnotationState && body.caseId);
}

async function updateCaseStatusIndex(body: SubmitBody): Promise<string | null> {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) return null;

  const annotationState =
    body.annotationState && typeof body.annotationState === "object"
      ? (body.annotationState as Record<string, any>)
      : null;

  if (!annotationState) return null;

  const doctorId = await normalizeDoctorId(body);
  const accessCode = normalizeAccessCode(body);
  const patientId = normalizePatientId(body);

  const doctorFolder = `${doctorId}_${accessCode}`;
  const objectName = `${doctorFolder}/case_status_index.json`;

  const patientSummaryCompleted = Boolean(
    annotationState.patientSummaryCompleted
  );
  const managementReasoningCompleted = Boolean(
    annotationState.managementReasoningCompleted
  );

  const episodeWorkflow =
    annotationState.episodeWorkflow &&
    typeof annotationState.episodeWorkflow === "object"
      ? annotationState.episodeWorkflow
      : null;

  const episodeTaskCompletion =
    annotationState.episodeTaskCompletion &&
    typeof annotationState.episodeTaskCompletion === "object"
      ? annotationState.episodeTaskCompletion
      : {};

  const prioritizedEpisodeIds: string[] = Array.isArray(
    episodeWorkflow?.prioritizedEpisodeIds
  )
    ? episodeWorkflow.prioritizedEpisodeIds
    : [];

  const abnormalityReasoningCompleted =
    prioritizedEpisodeIds.length > 0 &&
    prioritizedEpisodeIds.every((episodeId: string) => {
      const completed = (episodeTaskCompletion as Record<string, any>)?.[episodeId];
      return Boolean(
        completed?.detect && completed?.mechanism && completed?.fluidEval
      );
    });

  const finalSubmitted =
    patientSummaryCompleted &&
    managementReasoningCompleted &&
    abnormalityReasoningCompleted;

  const inProgress =
    !finalSubmitted &&
    (patientSummaryCompleted ||
      managementReasoningCompleted ||
      prioritizedEpisodeIds.length > 0);

  const nowIso = new Date().toISOString();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  let indexData: CaseStatusIndexFile = {
    updated_at: nowIso,
    patients: {},
  };

  try {
    const [exists] = await file.exists();
    if (exists) {
      const [buf] = await file.download();
      const parsed = JSON.parse(buf.toString("utf-8"));
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.patients &&
        typeof parsed.patients === "object"
      ) {
        indexData = {
          updated_at: String(parsed.updated_at ?? nowIso),
          patients: parsed.patients as Record<string, CaseStatusIndexEntry>,
        };
      }
    }
  } catch (error) {
    console.error("Failed to read existing case_status_index.json:", error);
  }

  indexData.updated_at = nowIso;
  indexData.patients[patientId] = {
    completed: finalSubmitted,
    inProgress,
    case_id: body.caseId ?? null,
    updated_at: nowIso,
  };

  await file.save(JSON.stringify(indexData, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "no-store",
    },
  });

  return objectName;
}

export async function POST(req: Request) {
  try {
    const t0 = Date.now();

    console.log(">>> NEW SUBMIT ROUTE HIT");
    console.log(
      "SUPABASE_URL =",
      process.env.SUPABASE_URL ? "configured" : "missing"
    );
    console.log(
      "SUPABASE_SERVICE_ROLE_KEY =",
      process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "missing"
    );
    console.log("GCS_BUCKET =", process.env.GCS_BUCKET || "missing");

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

    const pageOpenedAtMs = toTimestampMs(body?.pageOpenedAt ?? body?.panelOpenedAt);
    const firstInteractionAtMs = toTimestampMs(body?.firstInteractionAt);
    const firstTypingAtMs = toTimestampMs(body?.firstTypingAt);
    const firstVoiceStartAtMs = toTimestampMs(body?.firstVoiceStartAt);
    const pageSubmittedAtMs = toTimestampMs(body?.submittedAt ?? body?.clickedAt);

    const pageOpenedAtIso = toIsoTime(body?.pageOpenedAt ?? body?.panelOpenedAt);
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

    const compactPayload = {
      annotator_name: annotatorName,
      annotator_email: annotatorEmail,
      doctor_id: doctorId,
      access_code: accessCode,
      patient_id: patientId,
      case_id: caseId,
      event_id: eventId,
      episode_id:
        body?.episodeId ?? body?.selectedEventId ?? body?.eventId ?? null,
      episode_number: body?.episodeNumber ?? null,
      episode_folder: body?.episodeFolder ?? target.episodeFolder ?? null,
      panel,
      action,
      task,
      storage_target: target,
      answers,
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
        panel_opened_at_legacy: toIsoTime(body?.panelOpenedAt),
        clicked_at_legacy: toIsoTime(body?.clickedAt),
      },
    };

    const insertRow = {
      annotator_name: annotatorName,
      case_id: caseId,
      event_id: eventId,
      task,
      panel,
      action,
      panel_opened_at: pageOpenedAtIso,
      clicked_at: pageSubmittedAtIso,
      response_time_sec: responseTimeSec,
      payload: compactPayload,
    };

    const gcsRecord = {
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
      annotation_state:
        body.annotationState && typeof body.annotationState === "object"
          ? body.annotationState
          : null,
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
    };

    const supabasePromise = (async () => {
      let saved = false;
      let warning: string | null = null;

      const supabase = getSupabaseClient();
      if (!supabase) {
        console.warn("Supabase env vars missing, skip Supabase save.");
        warning = "Supabase env vars missing, skipped Supabase save.";
        return { saved, warning };
      }

      try {
        const { error } = await supabase.from("submissions").insert(insertRow);

        if (error) {
          console.error("Supabase insert error:", error);
          warning = error.message;
        } else {
          saved = true;
        }
      } catch (error) {
        console.error("Supabase unexpected error:", error);
        warning =
          error instanceof Error ? error.message : "Unknown Supabase error.";
      }

      return { saved, warning };
    })();

    const gcsResult = await uploadSubmissionToGCSWithRetry(body, gcsRecord, {
      maxAttempts: 3,
      initialDelayMs: 1000,
    });

    let caseStatusIndexObjectName: string | null = null;

    if (isFinalCaseSubmission(body)) {
      try {
        caseStatusIndexObjectName = await updateCaseStatusIndex(body);
      } catch (error) {
        console.error("Failed to update case_status_index.json:", error);
      }
    }

    const supabaseResult = await supabasePromise;

    const totalServerSec = (Date.now() - t0) / 1000;
    console.log("submit route total sec =", totalServerSec);

    return NextResponse.json({
      ok: true,
      saved: {
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
      },
      supabase: {
        saved: supabaseResult.saved,
        warning: supabaseResult.warning,
      },
      gcs: {
        attempted: true,
        saved: true,
        skipped: false,
        bucket: process.env.GCS_BUCKET ?? null,
        objectName: gcsResult.objectName,
        attemptsUsed: gcsResult.attemptsUsed,
        caseStatusIndexObjectName,
        warning: null,
      },
      debug_version: "gcs-folder-structure-v13-global-case-status-index",
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