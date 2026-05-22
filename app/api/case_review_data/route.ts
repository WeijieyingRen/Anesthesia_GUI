import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { listDriveEntries, readJsonFromDrive } from "@/lib/drive-upload";

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
  displayCaseId?: string;
  workflow?: "annotation" | "review";
  updatedAt?: string;
  paths?: Partial<Record<ManifestSectionKey, string>>;
};

type CaseManifest = {
  cases?: Record<string, ManifestCaseEntry>;
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
      if (code && doctor) {
        map.set(code, doctor);
      }
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

function parseRevision(fileName: string, baseName: string) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fileName.match(new RegExp(`^${escaped}(?:_(\\d+))?\\.json$`));
  if (!match) return null;
  return match[1] ? Number(match[1]) : 1;
}

async function loadLatestSectionFromWorkflow({
  doctorFolder,
  workflow,
  patientCaseFolder,
  section,
  baseName,
}: {
  doctorFolder: string;
  workflow: "annotation" | "review";
  patientCaseFolder: string;
  section: string;
  baseName: string;
}): Promise<LoadedSection | null> {
  const sectionPath = `${doctorFolder}/${workflow}/${patientCaseFolder}/${section}`;
  const entries = await listDriveEntries({ objectPath: sectionPath });

  const candidates = entries
    .filter((entry) => entry.name && parseRevision(entry.name, baseName) !== null)
    .sort((a, b) => {
      const aRev = parseRevision(a.name ?? "", baseName) ?? 0;
      const bRev = parseRevision(b.name ?? "", baseName) ?? 0;
      return bRev - aRev;
    });

  const latest = candidates[0];
  if (!latest?.name) return null;

  const objectPath = `${sectionPath}/${latest.name}`;
  const found = await readJsonFromDrive({ objectPath });
  if (!found) return null;

  return {
    data: found.data,
    objectPath,
    workflow,
    fileName: latest.name,
  };
}

async function loadPreferredSection(args: {
  doctorFolder: string;
  patientCaseFolder: string;
  section: string;
  baseName: string;
}): Promise<LoadedSection | null> {
  const review = await loadLatestSectionFromWorkflow({
    ...args,
    workflow: "review",
  }).catch(() => null);

  if (review) return review;

  return loadLatestSectionFromWorkflow({
    ...args,
    workflow: "annotation",
  }).catch(() => null);
}

async function loadManifestCaseEntry(
  doctorFolder: string,
  patientId: string,
  caseId: string
): Promise<ManifestCaseEntry | null> {
  const manifest = await readJsonFromDrive({
    objectPath: `${doctorFolder}/case_manifest.json`,
  }).catch(() => null);

  const cases =
    manifest?.data?.cases &&
    typeof manifest.data.cases === "object" &&
    !Array.isArray(manifest.data.cases)
      ? (manifest.data.cases as Record<string, unknown>)
      : null;

  if (!cases) return null;

  const entry = cases[buildManifestCaseKey(patientId, caseId)];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  return entry as ManifestCaseEntry;
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

  const fileName = objectPath.split("/").pop() ?? "unknown.json";

  return {
    data: found.data as Record<string, unknown>,
    objectPath,
    workflow: workflow === "review" ? "review" : "annotation",
    fileName,
  };
}

async function loadSectionsFromManifest(
  entry: ManifestCaseEntry | null
): Promise<{
  summary: LoadedSection | null;
  managementReasoning: LoadedSection | null;
  abnormalityReasoning: LoadedSection | null;
  caseSubmission: LoadedSection | null;
}> {
  const paths = entry?.paths;

  const workflow = entry?.workflow;

  const [summary, managementReasoning, abnormalityReasoning, caseSubmission] =
    await Promise.all([
      paths?.summary
        ? loadSectionFromManifestPath({
            objectPath: paths.summary,
            workflow,
          })
        : Promise.resolve(null),
      paths?.managementReasoning
        ? loadSectionFromManifestPath({
            objectPath: paths.managementReasoning,
            workflow,
          })
        : Promise.resolve(null),
      paths?.abnormalityReasoning
        ? loadSectionFromManifestPath({
            objectPath: paths.abnormalityReasoning,
            workflow,
          })
        : Promise.resolve(null),
      paths?.caseSubmission
        ? loadSectionFromManifestPath({
            objectPath: paths.caseSubmission,
            workflow,
          })
        : Promise.resolve(null),
    ]);

  return {
    summary,
    managementReasoning,
    abnormalityReasoning,
    caseSubmission,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accessCode = String(searchParams.get("accessCode") ?? "").trim();
    const doctorName = String(searchParams.get("doctorName") ?? "").trim();
    const patientId = String(searchParams.get("patientId") ?? "").trim();
    const displayCaseId = String(searchParams.get("displayCaseId") ?? "").trim();
    const caseId = String(searchParams.get("caseId") ?? "").trim();

    if (!accessCode || !patientId || !displayCaseId || !caseId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing accessCode, patientId, displayCaseId, or caseId.",
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

    const doctorFolder = `${sanitizePathPart(doctorName || doctorId)}_${sanitizePathPart(accessCode)}`;
    const patientCaseFolder = `patient_${sanitizePathPart(patientId)}_case_${sanitizePathPart(displayCaseId)}`;
    const manifestEntry = await loadManifestCaseEntry(
      doctorFolder,
      patientId,
      caseId
    );

    let { summary, managementReasoning, abnormalityReasoning, caseSubmission } =
      await loadSectionsFromManifest(manifestEntry);

    if (!caseSubmission) {
      caseSubmission = await loadPreferredSection({
        doctorFolder,
        patientCaseFolder,
        section: "case_submission",
        baseName: "case_summary",
      });
    }

    const matchedCaseId = extractCaseId(caseSubmission?.data);
    const caseMatches = matchedCaseId === caseId;

    if (!caseMatches) {
      return NextResponse.json({
        ok: true,
        doctorFolder,
        patientCaseFolder,
        matched: false,
        reason: matchedCaseId
          ? "case_id_mismatch"
          : "no_matching_case_submission",
        summary: null,
        managementReasoning: null,
        abnormalityReasoning: null,
        caseSubmission: null,
      });
    }

    if (!summary || !managementReasoning || !abnormalityReasoning) {
      const fallbackSections = await Promise.all([
        summary
          ? Promise.resolve(summary)
          : loadPreferredSection({
              doctorFolder,
              patientCaseFolder,
              section: "summary",
              baseName: "summary",
            }),
        managementReasoning
          ? Promise.resolve(managementReasoning)
          : loadPreferredSection({
              doctorFolder,
              patientCaseFolder,
              section: "management_reasoning",
              baseName: "management_reasoning",
            }),
        abnormalityReasoning
          ? Promise.resolve(abnormalityReasoning)
          : loadPreferredSection({
              doctorFolder,
              patientCaseFolder,
              section: "abnormality_reasoning",
              baseName: "abnormality_reasoning",
            }),
      ]);

      [summary, managementReasoning, abnormalityReasoning] = fallbackSections;
    }

    return NextResponse.json({
      ok: true,
      doctorFolder,
      patientCaseFolder,
      matched: true,
      summary,
      managementReasoning,
      abnormalityReasoning,
      caseSubmission,
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
