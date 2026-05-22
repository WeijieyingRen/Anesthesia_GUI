import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readJsonFromDrive } from "@/lib/drive-upload";

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

function normalizePatientsFromIndex(indexData: any) {
  if (!indexData || typeof indexData !== "object") return {};

  // New recommended structure:
  // {
  //   access_code: "8260",
  //   cases: {
  //     "patient_11::A823...": {
  //       patient_id: "patient_11",
  //       case_id: "A823...",
  //       status: "completed",
  //       ...
  //     }
  //   }
  // }
  if (
    indexData.cases &&
    typeof indexData.cases === "object" &&
    !Array.isArray(indexData.cases)
  ) {
    const patients: Record<string, any> = {};

    for (const [caseKey, entry] of Object.entries(indexData.cases)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

      const e = entry as any;
      const patientId = String(e.patient_id ?? "").trim();
      if (!patientId) continue;

      patients[patientId] = {
        ...e,
        case_key: caseKey,
        patient_id: patientId,
        case_id: e.case_id ?? null,
        completed: e.status === "completed" || Boolean(e.completed),
        inProgress:
          e.status === "in_progress" ||
          Boolean(e.inProgress) ||
          (e.status !== "completed" && Boolean(e.updated_at)),
      };
    }

    return patients;
  }

  // Backward-compatible structure:
  // {
  //   patients: {
  //     patient_11: { completed: true, ... }
  //   }
  // }
  if (
    indexData.patients &&
    typeof indexData.patients === "object" &&
    !Array.isArray(indexData.patients)
  ) {
    return indexData.patients;
  }

  return {};
}

export async function GET(req: Request) {
  try {
    const t0 = Date.now();

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

    const sanitizedAccessCode = sanitizePathPart(accessCode);
    const indexPath = `${sanitizedAccessCode}/case_status_index.json`;

    const found = await readJsonFromDrive({ objectPath: indexPath }).catch(
      () => null
    );

    const patients = normalizePatientsFromIndex(found?.data);

    const elapsedMs = Date.now() - t0;
    console.log("[case_status] loaded", indexPath, "in", elapsedMs, "ms");

    return NextResponse.json({
      ok: true,
      found: Boolean(found),
      source: found ? "google_drive_index" : "none",
      doctorId,
      accessCode,
      indexPath,
      patients,
      rawIndex: found?.data ?? null,
      elapsedMs,
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