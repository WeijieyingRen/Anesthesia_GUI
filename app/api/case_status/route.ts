import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

type AccessCodeRow = {
  doctor_id?: string;
  access_code?: string;
};

function sanitizePathPart(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

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

      const row: AccessCodeRow = {
        doctor_id: cols[doctorIdx],
        access_code: cols[codeIdx],
      };

      const code = String(row.access_code ?? "").trim();
      const doctor = String(row.doctor_id ?? "").trim();

      if (code && doctor) {
        map.set(code, doctor);
      }
    }

    return map;
  })();

  return accessCodeDoctorMapPromise;
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

function buildDoctorFolder(doctorId: string, accessCode: string) {
  return `${sanitizePathPart(doctorId)}_${sanitizePathPart(accessCode)}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accessCode = String(searchParams.get("accessCode") ?? "").trim();

    if (!accessCode) {
      return NextResponse.json(
        { ok: false, error: "Missing accessCode." },
        { status: 400 }
      );
    }

    const doctorId = await resolveDoctorIdFromAccessCode(accessCode);

    if (!doctorId) {
      return NextResponse.json(
        { ok: false, error: "Invalid accessCode or doctor not found." },
        { status: 404 }
      );
    }

    const doctorFolder = buildDoctorFolder(doctorId, accessCode);

    return NextResponse.json({
      ok: true,
      found: false,
      source: "local_access_code_only",
      doctorId,
      accessCode,
      doctorFolder,
      patients: {},
      raw: null,
    });
  } catch (error) {
    console.error("case_status GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to read case status.",
      },
      { status: 500 }
    );
  }
}