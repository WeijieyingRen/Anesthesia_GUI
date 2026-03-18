import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();

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
    const task = body?.task ?? "session";

    const { error } = await supabase.from("submissions").insert({
      annotator_name: annotatorName,
      case_id: caseId,
      event_id: eventId,
      task,
      payload: body,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Submit route error:", error);
    return NextResponse.json(
      { error: "Failed to save submission." },
      { status: 500 }
    );
  }
}