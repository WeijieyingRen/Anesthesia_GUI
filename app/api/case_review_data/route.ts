import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readJsonFromDrive } from "@/lib/drive-upload";

type WorkflowMode = "annotation" | "review";

type LoadMode =
  | "empty"
  | "annotation_result"
  | "review_result";

type DataSource =
  | "annotation"
  | "review"
  | "none";

type AccessCodeLookupEntry = {
  doctorId: string;
  workflowMode: WorkflowMode;
  annotationCode: string;
  reviewCode: string | null;
};

type AccessLookupFileConfig = {
  fileName: string;
};

type LoadedSection = {
  data: Record<string, unknown>;
  objectPath: string;
  workflow: WorkflowMode;
  fileName: string;
};

type CaseStatusTaskEntry = {
  latest_path?: string | null;
  completed?: boolean;
  updated_at?: string | null;
};

type CaseStatusIndexEntry = {
  patient_id?: string;
  case_id?: string | number | null;
  display_case_id?: string | number | null;

  tasks?: {
    summary?: CaseStatusTaskEntry;
    abnormality_reasoning?: CaseStatusTaskEntry;
    management_reasoning?: CaseStatusTaskEntry;
  };
};

/*
 * Both MPOG and MOVER access-code lookup files must be loaded.
 */
const ACCESS_LOOKUP_FILES: AccessLookupFileConfig[] = [
  {
    fileName: "access_review_code.csv",
  },
  {
    fileName: "mover_access_review_code.csv",
  },
];

let accessCodeLookupPromise:
  | Promise<Map<string, AccessCodeLookupEntry>>
  | null = null;

function sanitizePathPart(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "unknown";
  }

  return (
    String(value)
      .trim()
      .replace(/[^\w.-]/g, "_") ||
    "unknown"
  );
}

function normalizeString(
  value: unknown
): string {
  return String(value ?? "").trim();
}

function normalizeLoadMode(
  value: unknown
): LoadMode {
  const text = normalizeString(value);

  if (
    text === "empty" ||
    text === "annotation_result" ||
    text === "review_result"
  ) {
    return text;
  }

  return "empty";
}

function resolveRequestedDataSource(
  loadMode: LoadMode
): DataSource {
  if (
    loadMode === "annotation_result"
  ) {
    return "annotation";
  }

  if (
    loadMode === "review_result"
  ) {
    return "review";
  }

  return "none";
}

/*
 * Load access codes from both:
 *
 * public/assigned_code/access_review_code.csv
 * public/assigned_code/mover_access_review_code.csv
 *
 * Annotation codes and review codes are both inserted into the same map.
 *
 * Regardless of whether the user logs in with an annotation code or a
 * review code, annotationCode always points to the Google Drive root.
 */
async function loadAccessCodeLookup(): Promise<
  Map<string, AccessCodeLookupEntry>
> {
  if (accessCodeLookupPromise) {
    return accessCodeLookupPromise;
  }

  accessCodeLookupPromise =
    (async () => {
      const map = new Map<
        string,
        AccessCodeLookupEntry
      >();

      for (
        const config of
        ACCESS_LOOKUP_FILES
      ) {
        const csvPath = path.join(
          process.cwd(),
          "public",
          "assigned_code",
          config.fileName
        );

        let raw: string;

        try {
          raw = await fs.readFile(
            csvPath,
            "utf-8"
          );
        } catch (error) {
          console.error(
            `[case_review_data] Failed to read ${config.fileName}:`,
            error
          );

          throw error;
        }

        const lines = raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          console.warn(
            `[case_review_data] Empty lookup file: ${config.fileName}`
          );

          continue;
        }

        const header = lines[0]
          .replace(/^\uFEFF/, "")
          .split(",")
          .map((value) =>
            value.trim()
          );

        const doctorIdx =
          header.indexOf("doctor_id");

        const annotationIdx =
          header.indexOf(
            "annotation_code"
          );

        const reviewIdx =
          header.indexOf("review_code");

        if (
          doctorIdx < 0 ||
          annotationIdx < 0 ||
          reviewIdx < 0
        ) {
          throw new Error(
            `Missing required columns in ${config.fileName}. Expected doctor_id, annotation_code, and review_code.`
          );
        }

        for (
          const line of
          lines.slice(1)
        ) {
          const cols = line
            .split(",")
            .map((value) =>
              value.trim()
            );

          const doctorId =
            normalizeString(
              cols[doctorIdx]
            );

          const annotationCode =
            normalizeString(
              cols[annotationIdx]
            );

          const reviewCode =
            normalizeString(
              cols[reviewIdx]
            );

          if (
            !doctorId ||
            !annotationCode
          ) {
            continue;
          }

          const annotationEntry: AccessCodeLookupEntry =
            {
              doctorId,
              workflowMode:
                "annotation",
              annotationCode,
              reviewCode:
                reviewCode || null,
            };

          const existingAnnotationEntry =
            map.get(
              annotationCode
            );

          if (
            existingAnnotationEntry &&
            (
              existingAnnotationEntry.doctorId !==
                doctorId ||
              existingAnnotationEntry.annotationCode !==
                annotationCode ||
              existingAnnotationEntry.workflowMode !==
                "annotation"
            )
          ) {
            throw new Error(
              `Access code ${annotationCode} appears more than once with conflicting assignments across the lookup files.`
            );
          }

          map.set(
            annotationCode,
            annotationEntry
          );

          if (reviewCode) {
            const reviewEntry: AccessCodeLookupEntry =
              {
                doctorId,
                workflowMode:
                  "review",
                annotationCode,
                reviewCode,
              };

            const existingReviewEntry =
              map.get(reviewCode);

            if (
              existingReviewEntry &&
              (
                existingReviewEntry.doctorId !==
                  doctorId ||
                existingReviewEntry.annotationCode !==
                  annotationCode ||
                existingReviewEntry.workflowMode !==
                  "review"
              )
            ) {
              throw new Error(
                `Access code ${reviewCode} appears more than once with conflicting assignments across the lookup files.`
              );
            }

            map.set(
              reviewCode,
              reviewEntry
            );
          }
        }
      }

      console.log(
        "[case_review_data] access-code lookup loaded",
        {
          lookupFiles:
            ACCESS_LOOKUP_FILES.map(
              (item) =>
                item.fileName
            ),

          totalAccessCodes:
            map.size,
        }
      );

      return map;
    })();

  try {
    return await accessCodeLookupPromise;
  } catch (error) {
    /*
     * Allow a later request to retry loading if the first attempt failed.
     */
    accessCodeLookupPromise = null;
    throw error;
  }
}

async function resolveAccessCodeEntry(
  accessCode: string
): Promise<
  AccessCodeLookupEntry | null
> {
  const map =
    await loadAccessCodeLookup();

  return (
    map.get(accessCode.trim()) ??
    null
  );
}

function buildCaseKey(
  patientId: string,
  caseId: string
): string {
  return (
    `${sanitizePathPart(patientId)}::` +
    `${sanitizePathPart(caseId)}`
  );
}

function extractCaseId(
  value:
    | Record<string, unknown>
    | null
    | undefined
): string | null {
  const normalized =
    normalizeString(
      value?.case_id ??
        value?.caseId
    );

  return normalized || null;
}

function extractMatchedCaseIdFromSections(
  sections: Array<
    LoadedSection | null
  >
): string | null {
  for (const section of sections) {
    const caseId =
      extractCaseId(
        section?.data
      );

    if (caseId) {
      return caseId;
    }
  }

  return null;
}

function getCasesObject(
  indexData: any
): Record<string, unknown> | null {
  if (
    indexData?.cases &&
    typeof indexData.cases ===
      "object" &&
    !Array.isArray(
      indexData.cases
    )
  ) {
    return indexData.cases as Record<
      string,
      unknown
    >;
  }

  return null;
}

function getPatientsObject(
  indexData: any
): Record<string, unknown> | null {
  if (
    indexData?.patients &&
    typeof indexData.patients ===
      "object" &&
    !Array.isArray(
      indexData.patients
    )
  ) {
    return indexData.patients as Record<
      string,
      unknown
    >;
  }

  return null;
}

function isCaseStatusEntry(
  value: unknown
): value is CaseStatusIndexEntry {
  return Boolean(
    value &&
      typeof value ===
        "object" &&
      !Array.isArray(value)
  );
}

function entryMatchesPatientAndCase({
  entry,
  fallbackPatientId,
  patientId,
  caseId,
}: {
  entry: any;
  fallbackPatientId?: string;
  patientId: string;
  caseId: string;
}): boolean {
  const entryPatientId =
    normalizeString(
      entry?.patient_id ??
        fallbackPatientId
    );

  const entryCaseId =
    normalizeString(
      entry?.case_id ??
        entry?.caseId
    );

  if (
    !entryPatientId ||
    !entryCaseId
  ) {
    return false;
  }

  return (
    entryPatientId ===
      patientId &&
    entryCaseId === caseId
  );
}

function extractCaseStatusEntry(
  indexData:
    | Record<string, unknown>
    | null
    | undefined,
  patientId: string,
  caseId: string
): CaseStatusIndexEntry | null {
  if (
    !indexData ||
    typeof indexData !==
      "object"
  ) {
    return null;
  }

  const caseKey =
    buildCaseKey(
      patientId,
      caseId
    );

  const cases =
    getCasesObject(indexData);

  if (cases) {
    const exactEntry =
      cases[caseKey];

    if (
      isCaseStatusEntry(
        exactEntry
      )
    ) {
      return exactEntry;
    }

    for (
      const entry of
      Object.values(cases)
    ) {
      if (
        !isCaseStatusEntry(
          entry
        )
      ) {
        continue;
      }

      if (
        entryMatchesPatientAndCase(
          {
            entry,
            patientId,
            caseId,
          }
        )
      ) {
        return entry;
      }
    }
  }

  const patients =
    getPatientsObject(
      indexData
    );

  if (patients) {
    const exactPatientEntry =
      patients[patientId];

    if (
      isCaseStatusEntry(
        exactPatientEntry
      ) &&
      entryMatchesPatientAndCase(
        {
          entry:
            exactPatientEntry,

          fallbackPatientId:
            patientId,

          patientId,
          caseId,
        }
      )
    ) {
      return exactPatientEntry;
    }

    for (
      const [
        patientIdRaw,
        entry,
      ] of
      Object.entries(
        patients
      )
    ) {
      if (
        !isCaseStatusEntry(
          entry
        )
      ) {
        continue;
      }

      if (
        entryMatchesPatientAndCase(
          {
            entry,

            fallbackPatientId:
              patientIdRaw,

            patientId,
            caseId,
          }
        )
      ) {
        return entry;
      }
    }
  }

  return null;
}

function inferWorkflowFromObjectPath(
  objectPath: string
): WorkflowMode {
  return objectPath.includes(
    "/review/"
  )
    ? "review"
    : "annotation";
}

async function loadSectionFromPath({
  objectPath,
}: {
  objectPath: string;
}): Promise<
  LoadedSection | null
> {
  const found =
    await readJsonFromDrive({
      objectPath,
    }).catch(() => null);

  if (
    !found?.data ||
    typeof found.data !==
      "object" ||
    Array.isArray(found.data)
  ) {
    return null;
  }

  return {
    data:
      found.data as Record<
        string,
        unknown
      >,

    objectPath,

    workflow:
      inferWorkflowFromObjectPath(
        objectPath
      ),

    fileName:
      objectPath
        .split("/")
        .pop() ??
      "unknown.json",
  };
}

async function loadSectionsFromCaseStatusEntry(
  entry:
    | CaseStatusIndexEntry
    | null
) {
  const summaryPath =
    normalizeString(
      entry?.tasks?.summary
        ?.latest_path
    );

  const abnormalityPath =
    normalizeString(
      entry?.tasks
        ?.abnormality_reasoning
        ?.latest_path
    );

  const managementPath =
    normalizeString(
      entry?.tasks
        ?.management_reasoning
        ?.latest_path
    );

  const [
    summary,
    abnormalityReasoning,
    managementReasoning,
  ] = await Promise.all([
    summaryPath
      ? loadSectionFromPath({
          objectPath:
            summaryPath,
        })
      : Promise.resolve(null),

    abnormalityPath
      ? loadSectionFromPath({
          objectPath:
            abnormalityPath,
        })
      : Promise.resolve(null),

    managementPath
      ? loadSectionFromPath({
          objectPath:
            managementPath,
        })
      : Promise.resolve(null),
  ]);

  return {
    summary,
    abnormalityReasoning,
    managementReasoning,
  };
}

async function readAnnotationCaseStatusIndex(
  sourceAccessCode: string
) {
  const sanitizedAccessCode =
    sanitizePathPart(
      sourceAccessCode
    );

  const annotationIndexPath =
    `${sanitizedAccessCode}/` +
    "annotation/" +
    "case_status_index.json";

  const annotationFound =
    await readJsonFromDrive({
      objectPath:
        annotationIndexPath,
    }).catch(() => null);

  if (
    annotationFound?.data
  ) {
    return {
      found:
        annotationFound,

      indexPath:
        annotationIndexPath,

      source:
        "google_drive_annotation_index",

      usedLegacyFallback:
        false,
    };
  }

  /*
   * Backward-compatible support for old annotation indexes.
   */
  const legacyIndexPath =
    `${sanitizedAccessCode}/` +
    "case_status_index.json";

  const legacyFound =
    await readJsonFromDrive({
      objectPath:
        legacyIndexPath,
    }).catch(() => null);

  if (
    legacyFound?.data
  ) {
    return {
      found:
        legacyFound,

      indexPath:
        legacyIndexPath,

      source:
        "google_drive_legacy_annotation_index",

      usedLegacyFallback:
        true,
    };
  }

  return {
    found: null,

    indexPath:
      annotationIndexPath,

    source: "none",

    usedLegacyFallback:
      false,
  };
}

async function readReviewCaseStatusIndex(
  sourceAccessCode: string
) {
  const sanitizedAccessCode =
    sanitizePathPart(
      sourceAccessCode
    );

  const reviewIndexPath =
    `${sanitizedAccessCode}/` +
    "review/" +
    "case_status_index.json";

  const reviewFound =
    await readJsonFromDrive({
      objectPath:
        reviewIndexPath,
    }).catch(() => null);

  if (reviewFound?.data) {
    return {
      found:
        reviewFound,

      indexPath:
        reviewIndexPath,

      source:
        "google_drive_review_index",

      usedLegacyFallback:
        false,
    };
  }

  return {
    found: null,

    indexPath:
      reviewIndexPath,

    source: "none",

    usedLegacyFallback:
      false,
  };
}

async function loadSectionsFromIndex({
  indexFound,
  patientId,
  caseId,
}: {
  indexFound: any;
  patientId: string;
  caseId: string;
}) {
  const caseStatusEntry =
    extractCaseStatusEntry(
      indexFound?.data,
      patientId,
      caseId
    );

  const sections =
    await loadSectionsFromCaseStatusEntry(
      caseStatusEntry
    );

  const loadedSections = [
    sections.summary,
    sections.abnormalityReasoning,
    sections.managementReasoning,
  ];

  const hasAnySection =
    loadedSections.some(
      Boolean
    );

  const matchedCaseId =
    extractMatchedCaseIdFromSections(
      loadedSections
    );

  return {
    caseStatusEntry,
    sections,
    hasAnySection,
    matchedCaseId,
  };
}

export async function GET(
  req: Request
) {
  try {
    const t0 = Date.now();

    const {
      searchParams,
    } = new URL(req.url);

    const accessCode =
      normalizeString(
        searchParams.get(
          "accessCode"
        )
      );

    const patientId =
      normalizeString(
        searchParams.get(
          "patientId"
        )
      );

    const caseId =
      normalizeString(
        searchParams.get(
          "caseId"
        )
      );

    const loadMode =
      normalizeLoadMode(
        searchParams.get(
          "loadMode"
        )
      );

    const requestedDataSource =
      resolveRequestedDataSource(
        loadMode
      );

    if (
      !accessCode ||
      !patientId ||
      !caseId
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "Missing accessCode, patientId, or caseId.",
        },
        {
          status: 400,
        }
      );
    }

    const accessEntry =
      await resolveAccessCodeEntry(
        accessCode
      );

    if (!accessEntry) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "Invalid accessCode or doctor not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * The Google Drive storage root is always annotationCode.
     *
     * Example:
     *
     * annotationCode = 9424
     * reviewCode     = another paired code
     *
     * Annotation:
     * 9424/annotation/...
     *
     * Review:
     * 9424/review/...
     *
     * Therefore, a user who logs in with a review code must still
     * read data under the paired annotation-code root.
     */
    const sourceAccessCode =
      accessEntry.annotationCode;

    if (
      requestedDataSource ===
      "none"
    ) {
      return NextResponse.json({
        ok: true,
        matched: false,

        reason:
          "empty_load_mode",

        accessCode,

        workflowMode:
          accessEntry.workflowMode,

        loadMode,
        requestedDataSource,
        sourceAccessCode,

        selectedDataSource:
          "none",

        reviewResultFound:
          false,

        annotationResultFound:
          false,

        patientId,
        caseId,

        indexPath: "",
        source: "none",

        usedLegacyFallback:
          false,

        fastPathHit:
          false,

        reviewDebug: null,
        annotationDebug: null,

        summary: null,

        abnormalityReasoning:
          null,

        managementReasoning:
          null,

        elapsedMs:
          Date.now() - t0,
      });
    }

    let selectedIndexPath =
      "";

    let selectedSource =
      "none";

    let selectedUsedLegacyFallback =
      false;

    let selectedCaseStatusEntry:
      | CaseStatusIndexEntry
      | null = null;

    let selectedSections: {
      summary:
        | LoadedSection
        | null;

      abnormalityReasoning:
        | LoadedSection
        | null;

      managementReasoning:
        | LoadedSection
        | null;
    } = {
      summary: null,

      abnormalityReasoning:
        null,

      managementReasoning:
        null,
    };

    let selectedDataSource:
      DataSource = "none";

    let reviewResultFound =
      false;

    let annotationResultFound =
      false;

    let reviewDebug:
      | Record<
          string,
          unknown
        >
      | null = null;

    let annotationDebug:
      | Record<
          string,
          unknown
        >
      | null = null;

    if (
      requestedDataSource ===
      "review"
    ) {
      const {
        found:
          reviewIndexFound,

        indexPath:
          reviewIndexPath,

        source:
          reviewSource,

        usedLegacyFallback:
          reviewUsedLegacyFallback,
      } =
        await readReviewCaseStatusIndex(
          sourceAccessCode
        );

      const reviewLoad =
        await loadSectionsFromIndex(
          {
            indexFound:
              reviewIndexFound,

            patientId,
            caseId,
          }
        );

      reviewResultFound =
        Boolean(
          reviewLoad.caseStatusEntry &&
            reviewLoad.hasAnySection
        );

      reviewDebug = {
        indexPath:
          reviewIndexPath,

        source:
          reviewSource,

        fastPathHit:
          Boolean(
            reviewLoad.caseStatusEntry
          ),

        hasAnySection:
          reviewLoad.hasAnySection,

        matchedCaseId:
          reviewLoad.matchedCaseId,
      };

      selectedIndexPath =
        reviewIndexPath;

      selectedSource =
        reviewSource;

      selectedUsedLegacyFallback =
        reviewUsedLegacyFallback;

      selectedCaseStatusEntry =
        reviewLoad.caseStatusEntry;

      selectedSections =
        reviewLoad.sections;

      selectedDataSource =
        reviewResultFound
          ? "review"
          : "none";
    }

    if (
      requestedDataSource ===
      "annotation"
    ) {
      const {
        found:
          annotationIndexFound,

        indexPath:
          annotationIndexPath,

        source:
          annotationSource,

        usedLegacyFallback:
          annotationUsedLegacyFallback,
      } =
        await readAnnotationCaseStatusIndex(
          sourceAccessCode
        );

      const annotationLoad =
        await loadSectionsFromIndex(
          {
            indexFound:
              annotationIndexFound,

            patientId,
            caseId,
          }
        );

      annotationResultFound =
        Boolean(
          annotationLoad.caseStatusEntry &&
            annotationLoad.hasAnySection
        );

      annotationDebug = {
        indexPath:
          annotationIndexPath,

        source:
          annotationSource,

        fastPathHit:
          Boolean(
            annotationLoad.caseStatusEntry
          ),

        hasAnySection:
          annotationLoad.hasAnySection,

        matchedCaseId:
          annotationLoad.matchedCaseId,
      };

      selectedIndexPath =
        annotationIndexPath;

      selectedSource =
        annotationSource;

      selectedUsedLegacyFallback =
        annotationUsedLegacyFallback;

      selectedCaseStatusEntry =
        annotationLoad.caseStatusEntry;

      selectedSections =
        annotationLoad.sections;

      selectedDataSource =
        annotationResultFound
          ? "annotation"
          : "none";
    }

    const {
      summary,
      abnormalityReasoning,
      managementReasoning,
    } = selectedSections;

    const indexPath =
      selectedIndexPath;

    const source =
      selectedSource;

    const usedLegacyFallback =
      selectedUsedLegacyFallback;

    const caseStatusEntry =
      selectedCaseStatusEntry;

    const loadedSections = [
      summary,
      abnormalityReasoning,
      managementReasoning,
    ];

    const matchedCaseId =
      extractMatchedCaseIdFromSections(
        loadedSections
      );

    const hasAnySection =
      loadedSections.some(
        Boolean
      );

    if (
      !caseStatusEntry ||
      !hasAnySection
    ) {
      return NextResponse.json({
        ok: true,
        matched: false,

        reason:
          !caseStatusEntry
            ? "case_not_found_in_index"
            : "case_found_but_no_panel_sections_loaded",

        accessCode,

        workflowMode:
          accessEntry.workflowMode,

        loadMode,
        requestedDataSource,
        sourceAccessCode,
        selectedDataSource,

        reviewResultFound,
        annotationResultFound,

        patientId,
        caseId,

        indexPath,
        source,

        usedLegacyFallback,

        fastPathHit:
          Boolean(
            caseStatusEntry
          ),

        reviewDebug,
        annotationDebug,

        summary: null,

        abnormalityReasoning:
          null,

        managementReasoning:
          null,

        elapsedMs:
          Date.now() - t0,
      });
    }

    if (
      matchedCaseId &&
      matchedCaseId !== caseId
    ) {
      return NextResponse.json({
        ok: true,
        matched: false,

        reason:
          "case_id_mismatch",

        accessCode,

        workflowMode:
          accessEntry.workflowMode,

        loadMode,
        requestedDataSource,
        sourceAccessCode,
        selectedDataSource,

        reviewResultFound,
        annotationResultFound,

        patientId,
        caseId,
        matchedCaseId,

        indexPath,
        source,

        usedLegacyFallback,

        fastPathHit:
          Boolean(
            caseStatusEntry
          ),

        reviewDebug,
        annotationDebug,

        summary: null,

        abnormalityReasoning:
          null,

        managementReasoning:
          null,

        elapsedMs:
          Date.now() - t0,
      });
    }

    return NextResponse.json({
      ok: true,
      matched: true,

      accessCode,

      workflowMode:
        accessEntry.workflowMode,

      loadMode,
      requestedDataSource,
      sourceAccessCode,
      selectedDataSource,

      reviewResultFound,
      annotationResultFound,

      patientId,
      caseId,

      matchedCaseId:
        matchedCaseId ??
        caseId,

      indexPath,
      source,

      usedLegacyFallback,

      fastPathHit:
        Boolean(
          caseStatusEntry
        ),

      reviewDebug,
      annotationDebug,

      elapsedMs:
        Date.now() - t0,

      summary,
      abnormalityReasoning,
      managementReasoning,
    });
  } catch (error) {
    console.error(
      "case_review_data GET error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Failed to load case review data.",
      },
      {
        status: 500,
      }
    );
  }
}