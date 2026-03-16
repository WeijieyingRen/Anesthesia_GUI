import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const caseId = body?.caseId ?? "unknown_case";
    const folder = body?.folder ?? "unknown_folder";

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const saveDir = path.join(process.cwd(), "saved_annotations", String(folder));
    await mkdir(saveDir, { recursive: true });

    const fileName = `${caseId}_${timestamp}.json`;
    const filePath = path.join(saveDir, fileName);

    await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");

    console.log("=== RECEIVED SUBMISSION ===");
    console.log(JSON.stringify(body, null, 2));
    console.log(`Saved to: ${filePath}`);

    return NextResponse.json({
      ok: true,
      saved: true,
      filePath,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Invalid JSON or failed to save file" },
      { status: 400 }
    );
  }
}