import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readJsonFromDrive } from "@/lib/drive-upload";

type WorkflowMode = "annotation" | "review";

type AccessCodeLookupEntry = {
  doctorId: string;
  workflowMode: WorkflowMode;
  annotationCode: string;
  reviewCode: string | null;
};

type NormalizedPatientStatus = {
  case_key?: string;
  patient_id: string;
  case_id: string | number | null;
  display_case_id: string | number | null;

  completed: boolean;
  inProgress: boolean;
  updated_at: string | null;

  status?: string | null;
  workflow?: string | null;
  last_panel?: string | null;

  raw?: any;
};

function sanitizePathPart(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

let accessCodeLookupPromise: Promise<Map<string, AccessCodeLookupEntry>> | null =
  null;

async function loadAccessCodeLookup(): Promise<
  Map<string, AccessCodeLookupEntry>
> {
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
    console.error(
      "Failed to resolve access code from access_review_code.csv:",
      error
    );
    return null;
  }
}

function normalizeOneCaseEntry({
  caseKey,
  entry,
  fallbackPatientId,
}: {
  caseKey?: string;
  entry: any;
  fallbackPatientId?: string;
}): NormalizedPatientStatus | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const patientId = String(entry.patient_id ?? fallbackPatientId ?? "").trim();

  if (!patientId) return null;

  const status = String(entry.status ?? "").trim();

  const completed =
    status === "completed" ||
    entry.completed === true ||
    entry.case_submission?.completed === true;

  // Important:
  // Do NOT use updated_at alone to infer inProgress.
  // Otherwise review can be incorrectly marked as in progress just because
  // an index file or case entry has an updated timestamp.
  const inProgress =
    !completed &&
    (status === "in_progress" ||
      entry.inProgress === true ||
      entry.in_progress === true);

  return {
    case_key: caseKey,
    patient_id: patientId,
    case_id: entry.case_id ?? null,
    display_case_id: entry.display_case_id ?? null,
    completed,
    inProgress,
    updated_at: entry.updated_at ?? entry.completed_at ?? null,
    status: entry.status ?? null,
    workflow: entry.workflow ?? null,
    last_panel: entry.last_panel ?? null,
    raw: entry,
  };
}

function normalizePatientsFromIndex(
  indexData: any
): Record<string, NormalizedPatientStatus> {
  if (!indexData || typeof indexData !== "object") return {};

  const patients: Record<string, NormalizedPatientStatus> = {};

  if (
    indexData.cases &&
    typeof indexData.cases === "object" &&
    !Array.isArray(indexData.cases)
  ) {
    for (const [caseKey, entry] of Object.entries(indexData.cases)) {
      const normalized = normalizeOneCaseEntry({
        caseKey,
        entry,
      });

      if (!normalized) continue;

      patients[normalized.patient_id] = normalized;
    }

    return patients;
  }

  if (
    indexData.patients &&
    typeof indexData.patients === "object" &&
    !Array.isArray(indexData.patients)
  ) {
    for (const [patientIdRaw, entry] of Object.entries(indexData.patients)) {
      const normalized = normalizeOneCaseEntry({
        caseKey: (entry as any)?.case_key ?? undefined,
        entry,
        fallbackPatientId: patientIdRaw,
      });

      if (!normalized) continue;

      patients[normalized.patient_id] = normalized;
    }

    return patients;
  }

  return {};
}

async function readJsonIndex(objectPath: string) {
  const found = await readJsonFromDrive({
    objectPath,
  }).catch(() => null);

  return found;
}

async function readWorkflowCaseStatusIndex(
  annotationCode: string,
  workflow: WorkflowMode
) {
  const sanitizedAnnotationCode = sanitizePathPart(annotationCode);

  const primaryIndexPath = `${sanitizedAnnotationCode}/${workflow}/case_status_index.json`;
  const primaryFound = await readJsonIndex(primaryIndexPath);

  if (primaryFound) {
    return {
      found: primaryFound,
      indexPath: primaryIndexPath,
      source: `google_drive_${workflow}_index`,
    };
  }

  // Legacy support only for old annotation status.
  // Review should NOT fall back to legacy root, otherwise annotation progress
  // may be misread as review progress.
  if (workflow === "annotation") {
    const legacyIndexPath = `${sanitizedAnnotationCode}/case_status_index.json`;
    const legacyFound = await readJsonIndex(legacyIndexPath);

    if (legacyFound) {
      return {
        found: legacyFound,
        indexPath: legacyIndexPath,
        source: "google_drive_legacy_annotation_index",
      };
    }
  }

  return {
    found: null,
    indexPath: primaryIndexPath,
    source: "none",
  };
}

function mergeAnnotationAndReviewStatuses({
  annotationPatients,
  reviewPatients,
}: {
  annotationPatients: Record<string, NormalizedPatientStatus>;
  reviewPatients: Record<string, NormalizedPatientStatus>;
}) {
  const allPatientIds = new Set<string>([
    ...Object.keys(annotationPatients),
    ...Object.keys(reviewPatients),
  ]);

  const merged: Record<string, any> = {};

  for (const patientId of allPatientIds) {
    const annotation = annotationPatients[patientId] ?? null;
    const review = reviewPatients[patientId] ?? null;

    const annotationCompleted = Boolean(annotation?.completed);
    const annotationInProgress = Boolean(annotation?.inProgress);

    const reviewCompleted = Boolean(review?.completed);
    const reviewInProgress = Boolean(review?.inProgress);

    merged[patientId] = {
      patient_id: patientId,

      case_id: annotation?.case_id ?? review?.case_id ?? null,
      display_case_id:
        annotation?.display_case_id ?? review?.display_case_id ?? null,

      // Backward-compatible fields for /patient-list.
      // These must always reflect annotation status only.
      completed: annotationCompleted,
      inProgress: annotationInProgress,

      // Explicit annotation progress.
      annotationCompleted,
      annotationInProgress,
      annotationUpdatedAt: annotation?.updated_at ?? null,
      annotationStatus: annotation?.status ?? null,
      annotationWorkflow: annotation?.workflow ?? null,
      annotationLastPanel: annotation?.last_panel ?? null,
      annotationCaseKey: annotation?.case_key ?? null,

      // Explicit review progress.
      reviewCompleted,
      reviewInProgress,
      reviewUpdatedAt: review?.updated_at ?? null,
      reviewStatus: review?.status ?? null,
      reviewWorkflow: review?.workflow ?? null,
      reviewLastPanel: review?.last_panel ?? null,
      reviewCaseKey: review?.case_key ?? null,

      // Combined review-list state.
      readyForReview: annotationCompleted && !reviewCompleted,
      reviewAvailable: annotationCompleted,

      rawAnnotation: annotation?.raw ?? null,
      rawReview: review?.raw ?? null,
    };
  }

  return merged;
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
        {
          ok: false,
          error:
            "Matched access code does not have an annotation assignment root.",
        },
        { status: 404 }
      );
    }

    // Important:
    // Both annotation code and review code are normalized to the same
    // annotation root. Example:
    // annotation code 2413 -> 2413/annotation and 2413/review
    // review code xxxx     -> 2413/annotation and 2413/review
    const sourceAccessCode = accessEntry.annotationCode;

    const [annotationIndex, reviewIndex] = await Promise.all([
      readWorkflowCaseStatusIndex(sourceAccessCode, "annotation"),
      readWorkflowCaseStatusIndex(sourceAccessCode, "review"),
    ]);

    const annotationPatients = normalizePatientsFromIndex(
      annotationIndex.found?.data
    );

    const reviewPatients = normalizePatientsFromIndex(reviewIndex.found?.data);

    const patients = mergeAnnotationAndReviewStatuses({
      annotationPatients,
      reviewPatients,
    });

    const elapsedMs = Date.now() - t0;

    console.log("[case_status] loaded indexes in", elapsedMs, "ms", {
      annotationFound: Boolean(annotationIndex.found),
      reviewFound: Boolean(reviewIndex.found),
      annotationSource: annotationIndex.source,
      reviewSource: reviewIndex.source,
      loginWorkflowMode: accessEntry.workflowMode,
      sourceAccessCode,
      annotationIndexPath: annotationIndex.indexPath,
      reviewIndexPath: reviewIndex.indexPath,
    });

    return NextResponse.json({
      ok: true,

      found: Boolean(annotationIndex.found || reviewIndex.found),

      doctorId: accessEntry.doctorId,
      accessCode,
      workflowMode: accessEntry.workflowMode,

      // Normalized root used to read both annotation/review status.
      sourceAccessCode,

      annotationIndex: {
        found: Boolean(annotationIndex.found),
        source: annotationIndex.source,
        indexPath: annotationIndex.indexPath,
        rawIndex: annotationIndex.found?.data ?? null,
      },

      reviewIndex: {
        found: Boolean(reviewIndex.found),
        source: reviewIndex.source,
        indexPath: reviewIndex.indexPath,
        rawIndex: reviewIndex.found?.data ?? null,
      },

      // Backward-compatible aliases.
      // Old patient-list code can still read these as annotation status.
      source: annotationIndex.source,
      indexPath: annotationIndex.indexPath,
      rawIndex: annotationIndex.found?.data ?? null,

      patients,
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