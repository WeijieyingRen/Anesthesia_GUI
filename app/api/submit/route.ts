import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SubmitBody = {
  annotator?: { name?: string };
  participant?: { name?: string };
  participantInfo?: { name?: string };

  caseId?: string | number | null;
  eventId?: string | number | null;
  selectedEventId?: string | number | null;

  panel?: string | null;
  action?: string | null;
  task?: string | null;

  panelOpenedAt?: number | string | null;
  clickedAt?: number | string | null;

  answers?: Record<string, unknown> | null;

  // 兼容旧数据结构，避免前端还没完全改好时直接丢失用户输入
  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;

  [key: string]: unknown;
};

function toIsoTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  // 前端常见情况：Date.now() 传 number
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // 也兼容传 ISO string
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
  // 优先使用前端显式传来的 answers
  if (
    body.answers &&
    typeof body.answers === "object" &&
    !Array.isArray(body.answers)
  ) {
    return body.answers;
  }

  // 兼容旧版提交格式：只提取少量可能属于“用户结果”的字段
  const fallbackAnswers: Record<string, unknown> = {};

  if (body.summary !== undefined) fallbackAnswers.summary = body.summary;
  if (body.result !== undefined) fallbackAnswers.result = body.result;
  if (body.response !== undefined) fallbackAnswers.response = body.response;
  if (body.notes !== undefined) fallbackAnswers.notes = body.notes;
  if (body.confidence !== undefined) fallbackAnswers.confidence = body.confidence;

  return Object.keys(fallbackAnswers).length > 0 ? fallbackAnswers : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SubmitBody;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const annotatorName =
      body?.annotator?.name ??
      body?.participant?.name ??
      body?.participantInfo?.name ??
      null;

    const caseId = body?.caseId ?? null;
    const eventId = body?.eventId ?? body?.selectedEventId ?? null;

    // action 优先，其次 task；兼容旧逻辑
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

    // 只存精简 payload，不再存整个原始 body
    const compactPayload = {
      annotator_name: annotatorName,
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

      // 保留原来的 task 列，避免你表结构里没有 action 时直接报错
      task: action,

      // 下面这些列需要你在 submissions 表中存在
      panel,
      action,
      panel_opened_at: panelOpenedAtIso,
      clicked_at: clickedAtIso,
      response_time_ms: responseTimeMs,

      // 精简后的 payload
      payload: compactPayload,
    };

    const { error } = await supabase.from("submissions").insert(insertRow);

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      saved: {
        caseId,
        eventId,
        panel,
        action,
        responseTimeMs,
      },
    });
  } catch (error) {
    console.error("Submit route error:", error);
    return NextResponse.json(
      { error: "Failed to save submission." },
      { status: 500 }
    );
  }
}