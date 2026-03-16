import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const outDir = path.join(process.cwd(), "data", "annotations");
    await fs.mkdir(outDir, { recursive: true });

    const caseId = body?.caseId ?? "unknown_case";
    const eventId = body?.eventId ?? "unknown_event";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    const outPath = path.join(
      outDir,
      `${caseId}_${eventId}_${ts}.json`
    );

    await fs.writeFile(outPath, JSON.stringify(body, null, 2), "utf-8");

    return NextResponse.json({
      ok: true,
      savedTo: outPath,
    });
  } catch (error: any) {
    return new NextResponse(
      error?.message || "Failed to save annotation",
      { status: 500 }
    );
  }
}