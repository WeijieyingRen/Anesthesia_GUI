import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";

type SubmitBody = {
  annotator?: { name?: string; email?: string };
  participant?: { name?: string; email?: string };
  participantInfo?: { name?: string; email?: string };

  caseId?: string | number | null;
  eventId?: string | number | null;
  selectedEventId?: string | number | null;

  panel?: string | null;
  action?: string | null;
  task?: string | null;

  panelOpenedAt?: number | string | null;
  clickedAt?: number | string | null;

  answers?: Record<string, unknown> | null;

  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;

  [key: string]: unknown;
};

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

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

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

function getTimestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function normalizeCategoryAndPanel(panel: unknown) {
  const p = sanitizePathPart(panel).toLowerCase();

  if (p.includes("summary")) {
    return {
      category: "summary",
      leaf: "summary_panel",
      filePrefix: "summary",
    };
  }

  if (p.includes("abnormality") || p.includes("detect")) {
    return {
      category: "episode_level",
      leaf: "abnormality_detection",
      filePrefix: "episode",
    };
  }

  if (p.includes("mechanism")) {
    return {
      category: "episode_level",
      leaf: "mechanism",
      filePrefix: "episode",
    };
  }

  if (p.includes("intervention")) {
    return {
      category: "episode_level",
      leaf: "intervention",
      filePrefix: "episode",
    };
  }

  if (p.includes("prevented")) {
    return {
      category: "other_events",
      leaf: "prevented_episode",
      filePrefix: "event",
    };
  }

  if (p.includes("context")) {
    return {
      category: "other_events",
      leaf: "contextual_event",
      filePrefix: "event",
    };
  }

  return {
    category: "misc",
    leaf: p || "unknown_panel",
    filePrefix: "record",
  };
}

/**
 * 演示模式友好：
 * - 若没配 GCS_BUCKET，直接跳过，不抛错
 * - 返回 skipped 状态
 */
async function uploadSubmissionToGCS(
  data: Record<string, unknown>
): Promise<
  | {
      attempted: true;
      saved: true;
      skipped: false;
      objectName: string;
      warning: null;
    }
  | {
      attempted: false;
      saved: false;
      skipped: true;
      objectName: null;
      warning: string;
    }
  | {
      attempted: true;
      saved: false;
      skipped: false;
      objectName: null;
      warning: string;
    }
> {
  const bucketName = process.env.GCS_BUCKET;
  const rootPrefix = process.env.GCS_PREFIX || "anesthesialens";

  if (!bucketName) {
    return {
      attempted: false,
      saved: false,
      skipped: true,
      objectName: null,
      warning: "GCS_BUCKET not configured, skipped GCS upload.",
    };
  }

  try {
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    const annotatorEmail = sanitizePathPart(data.annotator_email);
    const caseId = sanitizePathPart(data.case_id);
    const eventId = sanitizePathPart(data.event_id);

    const { category, leaf, filePrefix } = normalizeCategoryAndPanel(data.panel);
    const timestamp = getTimestampForFilename();

    const fileName =
      category === "summary"
        ? `${filePrefix}_${timestamp}.json`
        : `${filePrefix}_${eventId}_${timestamp}.json`;

    const objectName =
      `${rootPrefix}/${annotatorEmail}/${caseId}/` +
      `${category}/${leaf}/${fileName}`;

    await bucket.file(objectName).save(JSON.stringify(data, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
      },
    });

    return {
      attempted: true,
      saved: true,
      skipped: false,
      objectName,
      warning: null,
    };
  } catch (error) {
    console.error("GCS upload error:", error);
    return {
      attempted: true,
      saved: false,
      skipped: false,
      objectName: null,
      warning:
        error instanceof Error ? error.message : "Unknown GCS upload error.",
    };
  }
}

export async function POST(req: Request) {
  try {
    console.log(">>> NEW SUBMIT ROUTE HIT");
    console.log("SUPABASE_URL =", process.env.SUPABASE_URL ? "configured" : "missing");
    console.log(
      "SUPABASE_SERVICE_ROLE_KEY =",
      process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "missing"
    );
    console.log("GCS_BUCKET =", process.env.GCS_BUCKET || "missing");
    console.log("GCS_PREFIX =", process.env.GCS_PREFIX || "missing");

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

    const action = body?.action ?? body?.task ?? "session";
    const panel = body?.panel ?? null;

    const panelOpenedAtMs = toTimestampMs(body?.panelOpenedAt);
    const clickedAtMs = toTimestampMs(body?.clickedAt);

    const panelOpenedAtIso = toIsoTime(body?.panelOpenedAt);
    const clickedAtIso = toIsoTime(body?.clickedAt);

    const responseTimeMs =
      panelOpenedAtMs !== null && clickedAtMs !== null
        ? Math.max(0, clickedAtMs - panelOpenedAtMs)
        : null;

    const answers = buildAnswers(body);

    const compactPayload = {
      annotator_name: annotatorName,
      annotator_email: annotatorEmail,
      case_id: caseId,
      event_id: eventId,
      panel,
      action,
      answers,
      timing: {
        panel_opened_at: panelOpenedAtIso,
        clicked_at: clickedAtIso,
        response_time_ms: responseTimeMs,
      },
    };

    const insertRow = {
      annotator_name: annotatorName,
      case_id: caseId,
      event_id: eventId,
      task: action,
      panel,
      action,
      panel_opened_at: panelOpenedAtIso,
      clicked_at: clickedAtIso,
      response_time_ms: responseTimeMs,
      payload: compactPayload,
    };

    let supabaseSaved = false;
    let supabaseWarning: string | null = null;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from("submissions").insert(insertRow);

        if (error) {
          console.error("Supabase insert error:", error);
          supabaseWarning = error.message;
        } else {
          supabaseSaved = true;
        }
      } catch (error) {
        console.error("Supabase unexpected error:", error);
        supabaseWarning =
          error instanceof Error ? error.message : "Unknown Supabase error.";
      }
    } else {
      console.warn("Supabase env vars missing, skip Supabase save.");
      supabaseWarning = "Supabase env vars missing, skipped Supabase save.";
    }

    const gcsRecord = {
      annotator_name: annotatorName,
      annotator_email: annotatorEmail,
      case_id: caseId,
      event_id: eventId,
      panel,
      action,

      saved_at: new Date().toISOString(),
      source: "nextjs-submit-route",
      compact_payload: compactPayload,
      insert_row: insertRow,
      raw_body: body,
      supabase_saved: supabaseSaved,
      supabase_warning: supabaseWarning,
    };

    const gcsResult = await uploadSubmissionToGCS(gcsRecord);

    /**
     * 关键改动：
     * demo 模式下，只要主流程跑通，就返回 ok: true
     * 即便 Supabase / GCS 都没配，也不报 500
     */
    return NextResponse.json({
      ok: true,
      saved: {
        caseId,
        eventId,
        panel,
        action,
        responseTimeMs,
      },
      supabase: {
        saved: supabaseSaved,
        warning: supabaseWarning,
      },
      gcs: {
        attempted: gcsResult.attempted,
        saved: gcsResult.saved,
        skipped: gcsResult.skipped,
        bucket: process.env.GCS_BUCKET ?? null,
        objectName: gcsResult.objectName,
        warning: gcsResult.warning,
      },
      demo_mode:
        !process.env.SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !process.env.GCS_BUCKET,
      debug_version: "gcs-optional-demo-friendly-v2",
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