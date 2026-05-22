import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readJsonFromDrive } from "@/lib/drive-upload";

type AccessCodeRow = {
  doctor_id?: string;
  access_code?: string;
};

type LoadedSection = {
  data: Record<string, unknown>;
  objectPath: string;
  workflow: "annotation" | "review";
  fileName: string;
};

type ManifestSectionKey =
  | "summary"
  | "managementReasoning"
  | "abnormalityReasoning"
  | "caseSubmission";

type ManifestCaseEntry = {
  patientFolder?: string;
  realCaseId?: string;
  fullName?: string | null;
  workflow?: "annotation" | "review";
  updatedAt?: string;
  paths?: Partial<Record<ManifestSectionKey, string>>;
};

type CaseManifest = {
  cases?: Record<string, ManifestCaseEntry>;
};

type CaseStatusTaskEntry = {
  latest_path?: string | null;
  completed?: boolean;
  updated_at?: string | null;
};

type CaseStatusIndexEntry = {
  patient_id?: string;
  case_id?: string;
  tasks?: {
    summary?: CaseStatusTaskEntry;
    abnormality_reasoning?: CaseStatusTaskEntry;
    management_reasoning?: CaseStatusTaskEntry;
  };
};

let accessCodeDoctorMapPromise: Promise<Map<string, string>> | null = null;

function sanitizePathPart(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

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
      if (code && doctor) map.set(code, doctor);
    }

    return map;
  })();

  return accessCodeDoctorMapPromise;
}

async function resolveDoctorIdFromAccessCode(accessCode: string) {
  const map = await loadAccessCodeDoctorMap();
  return map.get(accessCode) ?? null;
}

function buildManifestCaseKey(patientId: string, caseId: string) {
  return `${sanitizePathPart(patientId)}::${sanitizePathPart(caseId)}`;
}

function extractCaseId(value: Record<string, unknown> | null | undefined) {
  const normalized = String(value?.case_id ?? value?.caseId ?? "").trim();
  return normalized || null;
}

function extractMatchedCaseIdFromSections(sections: Array<LoadedSection | null>) {
  for (const section of sections) {
    const caseId = extractCaseId(section?.data);
    if (caseId) return caseId;
  }

  return null;
}

function extractCaseStatusEntry(
  indexData: Record<string, unknown> | null | undefined,
  patientId: string,
  caseId: string
): CaseStatusIndexEntry | null {
  const cases =
    indexData?.cases &&
    typeof indexData.cases === "object" &&
    !Array.isArray(indexData.cases)
      ? (indexData.cases as Record<string, unknown>)
      : null;

  if (!cases) return null;

  const caseKey = buildManifestCaseKey(patientId, caseId);
  const entry = cases[caseKey];

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  return entry as CaseStatusIndexEntry;
}

async function loadSectionsFromCaseStatusEntry(
  entry: CaseStatusIndexEntry | null
) {
  const summaryPath = String(entry?.tasks?.summary?.latest_path ?? "").trim();
  const managementPath = String(
    entry?.tasks?.management_reasoning?.latest_path ?? ""
  ).trim();
  const abnormalityPath = String(
    entry?.tasks?.abnormality_reasoning?.latest_path ?? ""
  ).trim();

  const [summary, managementReasoning, abnormalityReasoning] =
    await Promise.all([
      summaryPath
        ? loadSectionFromManifestPath({ objectPath: summaryPath })
        : Promise.resolve(null),
      managementPath
        ? loadSectionFromManifestPath({ objectPath: managementPath })
        : Promise.resolve(null),
      abnormalityPath
        ? loadSectionFromManifestPath({ objectPath: abnormalityPath })
        : Promise.resolve(null),
    ]);

  return { summary, managementReasoning, abnormalityReasoning };
}

async function loadSectionFromManifestPath({
  objectPath,
  workflow,
}: {
  objectPath: string;
  workflow?: "annotation" | "review";
}): Promise<LoadedSection | null> {
  const found = await readJsonFromDrive({ objectPath }).catch(() => null);
  if (!found?.data || typeof found.data !== "object" || Array.isArray(found.data)) {
    return null;
  }

  return {
    data: found.data as Record<string, unknown>,
    objectPath,
    workflow: workflow === "review" ? "review" : "annotation",
    fileName: objectPath.split("/").pop() ?? "unknown.json",
  };
}

export async function GET(req: Request) {
  try {
    const t0 = Date.now();
    const { searchParams } = new URL(req.url);
    const accessCode = String(searchParams.get("accessCode") ?? "").trim();
    const patientId = String(searchParams.get("patientId") ?? "").trim();
    const caseId = String(searchParams.get("caseId") ?? "").trim();

    if (!accessCode || !patientId || !caseId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing accessCode, patientId, or caseId.",
        },
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

    const indexPath = `${sanitizePathPart(accessCode)}/case_status_index.json`;
    const indexFound = await readJsonFromDrive({ objectPath: indexPath }).catch(
      () => null
    );
    const caseStatusEntry = extractCaseStatusEntry(
      indexFound?.data,
      patientId,
      caseId
    );

    const {
      summary,
      managementReasoning,
      abnormalityReasoning,
    } = await loadSectionsFromCaseStatusEntry(caseStatusEntry);

    const matchedCaseId = extractMatchedCaseIdFromSections([
      summary,
      managementReasoning,
      abnormalityReasoning,
    ]);

    if (!matchedCaseId || matchedCaseId !== caseId) {
      return NextResponse.json({
        ok: true,
        matched: false,
        accessCode,
        patientId,
        caseId,
        summary: null,
        managementReasoning: null,
        abnormalityReasoning: null,
      });
    }

    return NextResponse.json({
      ok: true,
      matched: true,
      accessCode,
      patientId,
      caseId,
      indexPath,
      fastPathHit: Boolean(caseStatusEntry),
      elapsedMs: Date.now() - t0,
      summary,
      managementReasoning,
      abnormalityReasoning,
    });
  } catch (error) {
    console.error("case_review_data GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load case review data.",
      },
      { status: 500 }
    );
  }
}
