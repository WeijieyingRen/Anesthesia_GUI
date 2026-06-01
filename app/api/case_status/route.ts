import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readJsonFromDrive } from "@/lib/drive-upload";
type AccessCodeLookupEntry = {
  doctorId: string;
  workflowMode: "annotation" | "review";
  annotationCode: string;
  reviewCode: string | null;
};

function sanitizePathPart(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

let accessCodeLookupPromise: Promise<Map<string, AccessCodeLookupEntry>> | null = null;

async function loadAccessCodeLookup(): Promise<Map<string, AccessCodeLookupEntry>> {
  if (accessCodeLookupPromise) return accessCodeLookupPromise;

  accessCodeLookupPromise = (async () => {
    const map = new Map<string, AccessCodeLookupEntry>();
    const reviewCsvPath = path.join(
      process.cwd(),
      "public",
      "assigned_code",
      "access_review_code.csv"
    );

    try {
      const raw = await fs.readFile(reviewCsvPath, "utf-8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const header = lines[0]?.split(",") ?? [];
      const doctorIdx = header.indexOf("doctor_id");
      const annotationIdx = header.indexOf("annotation_code");
      const reviewIdx = header.indexOf("review_code");

      if (doctorIdx >= 0 && annotationIdx >= 0 && reviewIdx >= 0) {
        for (const line of lines.slice(1)) {
          const cols = line.split(",");
          const doctorId = String(cols[doctorIdx] ?? "").trim();
          const annotationCode = String(cols[annotationIdx] ?? "").trim();
          const reviewCode = String(cols[reviewIdx] ?? "").trim();
          if (!doctorId || !annotationCode) continue;

          map.set(annotationCode, {
            doctorId,
            workflowMode: "annotation",
            annotationCode,
            reviewCode: reviewCode || null,
          });

          if (reviewCode) {
            map.set(reviewCode, {
              doctorId,
              workflowMode: "review",
              annotationCode,
              reviewCode,
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to load access_review_code.csv:", error);
    }

    return map;
  })();

  return accessCodeLookupPromise;
}

async function resolveAccessCodeEntry(
  accessCode: string | null | undefined
): Promise<AccessCodeLookupEntry | null> {
  if (!accessCode) return null;

  try {
    const map = await loadAccessCodeLookup();
    return map.get(String(accessCode).trim()) ?? null;
  } catch (error) {
    console.error("Failed to resolve access code from access_review_code.csv:", error);
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

    const accessEntry = await resolveAccessCodeEntry(accessCode);

    if (!accessEntry) {
      return NextResponse.json(
        { ok: false, error: "Invalid accessCode or doctor not found." },
        { status: 404 }
      );
    }

    if (!accessEntry.annotationCode) {
      return NextResponse.json(
        { ok: false, error: "Matched access code does not have an annotation assignment root." },
        { status: 404 }
      );
    }

    const sourceAccessCode = accessEntry.annotationCode;
    const sanitizedAccessCode = sanitizePathPart(sourceAccessCode);
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
      doctorId: accessEntry.doctorId,
      accessCode,
      workflowMode: accessEntry.workflowMode,
      sourceAccessCode,
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
