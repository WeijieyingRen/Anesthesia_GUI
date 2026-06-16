"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DatasetSource } from "@/lib/loaders/dashboard-case-types";

type CsvRow = Record<string, any>;

type WorkflowMode = "annotation" | "review";

type LoadMode =
  | "empty"
  | "annotation_result"
  | "review_result";

type AccessCodeLookupResult = {
  doctorId: string;
  workflowMode: WorkflowMode;
  annotationCode: string;
  reviewCode: string | null;

  /*
   * 标记该 access code 属于哪个数据源。
   */
  datasetSource: DatasetSource;

  /*
   * 仅用于调试。
   */
  lookupFileName: string;
};

type AssignedCase = {
  folder: string;
  source: DatasetSource;
};

type ReviewCaseStatus =
  | "not_ready"
  | "ready_for_review"
  | "review_in_progress"
  | "reviewed";

interface ReviewCaseMeta {
  /*
   * source + folder 共同组成唯一 ID。
   *
   * 例如：
   * stanford_mpog:patient_1
   * mover:patient_1
   */
  id: string;

  folder: string;
  source: DatasetSource;

  displayCaseId: number;

  annotationCompleted: boolean;
  reviewCompleted: boolean;
  reviewInProgress: boolean;

  status: ReviewCaseStatus;

  annotationUpdatedAt?: string | null;
  reviewUpdatedAt?: string | null;

  caseId?: string | number | null;
}

type GameData = {
  currentPatientIndex: number;

  selectedPatients: Array<{
    id: string;
    folder: string;

    source?: DatasetSource;

    status?:
      | "not_started"
      | "in_progress"
      | "completed";

    workflowMode?: WorkflowMode;

    displayCaseId?: number;

    loadMode?: LoadMode;
  }>;

  diagnoses: Array<string | null>;

  startTime: string;
};

type CaseStatusIndexEntry = {
  lookup_key?: string;
  source?: DatasetSource;

  completed?: boolean;
  inProgress?: boolean;

  case_id?: string | number | null;
  updated_at?: string | null;

  reviewCompleted?: boolean;
  reviewInProgress?: boolean;
  reviewUpdatedAt?: string | null;

  annotationCompleted?: boolean;
  annotationInProgress?: boolean;
  annotationUpdatedAt?: string | null;
};

type AccessLookupConfig = {
  fileName: string;
  source: DatasetSource;
};

/*
 * 两个数据源分别使用自己的 access-review lookup 文件。
 */
const ACCESS_LOOKUP_CONFIGS: AccessLookupConfig[] = [
  {
    fileName: "access_review_code.csv",
    source: "stanford_mpog",
  },
  {
    fileName: "mover_access_review_code.csv",
    source: "mover",
  },
];

function getButtonLabel(
  status: ReviewCaseStatus
): string {
  if (status === "reviewed") {
    return "Review";
  }

  if (status === "review_in_progress") {
    return "Continue Review";
  }

  if (status === "ready_for_review") {
    return "Start";
  }

  return "Not Ready";
}

function getReviewLoadMode(
  status: ReviewCaseStatus
): LoadMode {
  /*
   * 已经提交过 review，或者 review 正在进行：
   * 加载 review result。
   */
  if (
    status === "reviewed" ||
    status === "review_in_progress"
  ) {
    return "review_result";
  }

  /*
   * annotation 已完成，但 review 尚未开始：
   * 加载 annotation result 作为 review 输入。
   */
  if (status === "ready_for_review") {
    return "annotation_result";
  }

  return "empty";
}

function resolveStoredWorkflowMode(
  parsedParticipantInfo: any
): WorkflowMode {
  return (
    parsedParticipantInfo?.workflowMode === "review" ||
    localStorage.getItem("currentWorkflowMode") ===
      "review" ||
    localStorage.getItem("loginWorkflowMode") ===
      "review"
  )
    ? "review"
    : "annotation";
}

/**
 * case_status API 返回的 patient key：
 *
 * Stanford MPOG：
 * patient_1
 *
 * MOVER：
 * mover::patient_1
 */
function getCaseStatusLookupKey(
  source: DatasetSource,
  folder: string
): string {
  return source === "mover"
    ? `mover::${folder}`
    : folder;
}

export default function ReviewList() {
  const router = useRouter();

  const [cases, setCases] = useState<
    ReviewCaseMeta[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState<
    string | null
  >(null);

  /**
   * 同时检查 MPOG 和 MOVER lookup 文件，
   * 并保留 access code 所属的数据源。
   */
  const loadAccessCodeInfo = async (
    accessCode: string
  ): Promise<AccessCodeLookupResult> => {
    const normalizedAccessCode = String(
      accessCode ?? ""
    ).trim();

    if (!normalizedAccessCode) {
      throw new Error(
        "Access code is empty."
      );
    }

    const matches: AccessCodeLookupResult[] =
      [];

    for (const config of ACCESS_LOOKUP_CONFIGS) {
      const res = await fetch(
        `/assigned_code/${config.fileName}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(
          `${config.fileName} ${res.status} ${res.statusText}`
        );
      }

      const text = await res.text();

      const parsed = Papa.parse<CsvRow>(
        text,
        {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
        }
      );

      if (parsed.errors.length > 0) {
        console.warn(
          `CSV parsing warnings in ${config.fileName}:`,
          parsed.errors
        );
      }

      const matchedRow = parsed.data.find(
        (row) => {
          const annotationCode = String(
            row["annotation_code"] ?? ""
          ).trim();

          const reviewCode = String(
            row["review_code"] ?? ""
          ).trim();

          return (
            annotationCode ===
              normalizedAccessCode ||
            reviewCode ===
              normalizedAccessCode
          );
        }
      );

      if (!matchedRow) {
        continue;
      }

      const doctorId = String(
        matchedRow["doctor_id"] ?? ""
      ).trim();

      const annotationCode = String(
        matchedRow["annotation_code"] ?? ""
      ).trim();

      const reviewCode =
        String(
          matchedRow["review_code"] ?? ""
        ).trim() || null;

      if (!doctorId) {
        throw new Error(
          `Matched doctor_id is empty in ${config.fileName}.`
        );
      }

      if (!annotationCode) {
        throw new Error(
          `Matched annotation_code is empty in ${config.fileName}.`
        );
      }

      const workflowMode: WorkflowMode =
        reviewCode !== null &&
        normalizedAccessCode === reviewCode
          ? "review"
          : "annotation";

      matches.push({
        doctorId,
        workflowMode,
        annotationCode,
        reviewCode,
        datasetSource: config.source,
        lookupFileName: config.fileName,
      });
    }

    if (matches.length === 0) {
      throw new Error(
        "Invalid access code. No matching MPOG or MOVER annotation/review assignment was found."
      );
    }

    /*
     * 同一个 access code 不应该同时出现在
     * MPOG 和 MOVER lookup 文件中。
     */
    if (matches.length > 1) {
      throw new Error(
        `Access code ${normalizedAccessCode} appears in more than one lookup file. MPOG and MOVER access codes must not overlap.`
      );
    }

    const accessInfo = matches[0];

    if (
      accessInfo.workflowMode !== "review"
    ) {
      throw new Error(
        "This page is for review codes only. Please use the annotation case list for annotation codes."
      );
    }

    return accessInfo;
  };

  /**
   * 从指定 assignment 文件中读取病例。
   */
  const loadAssignedCasesFromFile =
    async (
      fileName: string,
      source: DatasetSource,
      accessInfo: AccessCodeLookupResult
    ): Promise<AssignedCase[]> => {
      const res = await fetch(
        `/assigned_code/${fileName}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(
          `${fileName} ${res.status} ${res.statusText}`
        );
      }

      const text = await res.text();

      const parsed = Papa.parse<CsvRow>(
        text,
        {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
        }
      );

      if (parsed.errors.length > 0) {
        console.warn(
          `CSV parsing warnings in ${fileName}:`,
          parsed.errors
        );
      }

      /*
       * 使用 annotation code 筛选病例。
       *
       * review code 6924：
       * annotationCode = 8741
       *
       * 所以需要用 8741 在 assignment 文件中查询。
       */
      const matchedRows = parsed.data
        .filter((row) => {
          const rowAnnotationCode =
            String(
              row["annotation_code"] ?? ""
            ).trim();

          return (
            rowAnnotationCode ===
            accessInfo.annotationCode
          );
        })
        .sort((a, b) => {
          const orderA = Number(
            String(
              a[
                "case_order_within_doctor"
              ] ?? "0"
            ).trim()
          );

          const orderB = Number(
            String(
              b[
                "case_order_within_doctor"
              ] ?? "0"
            ).trim()
          );

          return orderA - orderB;
        });

      const assignedCases =
        matchedRows
          .map((row) => ({
            folder: String(
              row["patient_folder"] ?? ""
            ).trim(),

            source,
          }))
          .filter((item) =>
            Boolean(item.folder)
          );

      /*
       * 检查同一个数据源内是否存在重复 folder。
       */
      const uniqueCaseMap = new Map<
        string,
        AssignedCase
      >();

      for (const assignedCase of assignedCases) {
        const uniqueKey =
          `${assignedCase.source}::` +
          assignedCase.folder;

        if (uniqueCaseMap.has(uniqueKey)) {
          throw new Error(
            `Duplicate patient folder found in ${fileName}: ${assignedCase.folder}`
          );
        }

        uniqueCaseMap.set(
          uniqueKey,
          assignedCase
        );
      }

      return Array.from(
        uniqueCaseMap.values()
      );
    };

  /**
   * 根据 access code 所属的数据源，
   * 只读取对应的 assignment 文件。
   */
  const loadAssignedCases = async (
    accessInfo: AccessCodeLookupResult
  ): Promise<AssignedCase[]> => {
    const assignmentFileName =
      accessInfo.datasetSource === "mover"
        ? "assigned_mover_350_cases_by_access_code.csv"
        : "assigned_650_cases_by_access_code.csv";

    const assignedCases =
      await loadAssignedCasesFromFile(
        assignmentFileName,
        accessInfo.datasetSource,
        accessInfo
      );

    if (!assignedCases.length) {
      throw new Error(
        `No patient_folder found in ${assignmentFileName} for annotation_code=${accessInfo.annotationCode}`
      );
    }

    return assignedCases;
  };

  const loadCaseStatuses = async (
    accessCode: string,
    doctorName?: string
  ): Promise<
    Record<string, CaseStatusIndexEntry>
  > => {
    try {
      const params = new URLSearchParams({
        accessCode,
      });

      if (doctorName?.trim()) {
        params.set(
          "doctorName",
          doctorName.trim()
        );
      }

      const res = await fetch(
        `/api/case_status?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        console.warn(
          `case_status failed: ${res.status}`
        );

        return {};
      }

      const data = await res.json();

      if (!data?.ok) {
        console.warn(
          "case_status returned ok=false:",
          data
        );

        return {};
      }

      return data?.patients &&
        typeof data.patients === "object"
        ? data.patients
        : {};
    } catch (error) {
      console.error(
        "Failed to load case status index:",
        error
      );

      return {};
    }
  };

  useEffect(() => {
    const participantInfo =
      localStorage.getItem(
        "participantInfo"
      );

    const consentInfo =
      localStorage.getItem("consentInfo");

    if (!participantInfo) {
      router.replace("/");
      return;
    }

    if (!consentInfo) {
      router.replace("/consent");
      return;
    }

    let parsedParticipantInfo: any =
      null;

    try {
      parsedParticipantInfo =
        JSON.parse(participantInfo);
    } catch {
      router.replace("/");
      return;
    }

    try {
      const parsedConsent =
        JSON.parse(consentInfo);

      if (!parsedConsent?.agreed) {
        router.replace("/consent");
        return;
      }
    } catch {
      router.replace("/consent");
      return;
    }

    const storedWorkflowMode =
      resolveStoredWorkflowMode(
        parsedParticipantInfo
      );

    if (
      storedWorkflowMode !== "review"
    ) {
      router.replace("/patient-list");
      return;
    }

    void (async () => {
      try {
        setLoading(true);
        setError(null);

        const accessCode =
          String(
            parsedParticipantInfo
              ?.accessCode ?? ""
          ).trim() ||
          String(
            localStorage.getItem(
              "doctorAccessCode"
            ) ?? ""
          ).trim();

        if (!accessCode) {
          throw new Error(
            "No access code found. Please go back to the home page and enter your access code."
          );
        }

        const doctorName = String(
          parsedParticipantInfo?.name ?? ""
        ).trim();

        const accessInfo =
          await loadAccessCodeInfo(
            accessCode
          );

        /*
         * 保存当前 review session 的完整信息。
         */
        localStorage.setItem(
          "currentWorkflowMode",
          "review"
        );

        localStorage.setItem(
          "loginWorkflowMode",
          "review"
        );

        localStorage.setItem(
          "doctorAccessCode",
          accessCode
        );

        localStorage.setItem(
          "doctorId",
          accessInfo.doctorId
        );

        localStorage.setItem(
          "annotationCode",
          accessInfo.annotationCode
        );

        if (accessInfo.reviewCode) {
          localStorage.setItem(
            "reviewCode",
            accessInfo.reviewCode
          );
        } else {
          localStorage.removeItem(
            "reviewCode"
          );
        }

        /*
         * 关键：
         * 保存当前 access code 所属的数据源。
         */
        localStorage.setItem(
          "currentDatasetSource",
          accessInfo.datasetSource
        );

        localStorage.setItem(
          "datasetSource",
          accessInfo.datasetSource
        );

        const [
          assignedCases,
          statusMap,
        ] = await Promise.all([
          loadAssignedCases(accessInfo),

          loadCaseStatuses(
            accessCode,
            doctorName
          ),
        ]);

        const metas: ReviewCaseMeta[] =
          assignedCases.map(
            (assignedCase, index) => {
              const {
                folder,
                source,
              } = assignedCase;

              /*
               * Stanford:
               * patient_1
               *
               * MOVER:
               * mover::patient_1
               */
              const statusKey =
                getCaseStatusLookupKey(
                  source,
                  folder
                );

              const item =
                statusMap[statusKey];

              const annotationCompleted =
                item?.annotationCompleted ===
                  true ||
                item?.completed === true;

              const reviewCompleted =
                item?.reviewCompleted ===
                true;

              const reviewInProgress =
                !reviewCompleted &&
                item?.reviewInProgress ===
                  true;

              let status: ReviewCaseStatus =
                "not_ready";

              if (reviewCompleted) {
                status = "reviewed";
              } else if (
                reviewInProgress
              ) {
                status =
                  "review_in_progress";
              } else if (
                annotationCompleted
              ) {
                status =
                  "ready_for_review";
              }

              return {
                /*
                 * MPOG 和 MOVER 都可能存在 patient_1，
                 * 因此 id 必须包含 source。
                 */
                id: `${source}:${folder}`,

                folder,
                source,

                displayCaseId:
                  index + 1,

                annotationCompleted,
                reviewCompleted,
                reviewInProgress,

                status,

                caseId:
                  item?.case_id ??
                  null,

                annotationUpdatedAt:
                  item
                    ?.annotationUpdatedAt ??
                  item?.updated_at ??
                  null,

                reviewUpdatedAt:
                  item
                    ?.reviewUpdatedAt ??
                  null,
              };
            }
          );

        setCases(metas);
      } catch (e: any) {
        console.error(
          "Error building review case list:",
          e
        );

        setError(
          e?.message ??
            "Failed to load review cases."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const progress = useMemo(() => {
    const total = cases.length;

    const annotationCompleted =
      cases.filter(
        (c) =>
          c.annotationCompleted
      ).length;

    const readyForReview =
      cases.filter(
        (c) =>
          c.status ===
          "ready_for_review"
      ).length;

    const reviewInProgress =
      cases.filter(
        (c) =>
          c.status ===
          "review_in_progress"
      ).length;

    const reviewed = cases.filter(
      (c) =>
        c.status === "reviewed"
    ).length;

    const notReady = cases.filter(
      (c) =>
        c.status === "not_ready"
    ).length;

    const percent =
      total > 0
        ? Math.round(
            (reviewed / total) * 100
          )
        : 0;

    return {
      total,
      annotationCompleted,
      readyForReview,
      reviewInProgress,
      reviewed,
      notReady,
      percent,
    };
  }, [cases]);

  const handleStartReviewCase = (
    caseItem: ReviewCaseMeta
  ) => {
    if (
      caseItem.status === "not_ready"
    ) {
      return;
    }

    /*
     * Review 页面只把 annotation 已完成的病例
     * 放入 dashboard sequence。
     */
    const reviewableCases =
      cases.filter(
        (c) =>
          c.annotationCompleted
      );

    const filteredStartIndex =
      reviewableCases.findIndex(
        (c) =>
          c.id === caseItem.id
      );

    const gameData: GameData = {
      currentPatientIndex:
        filteredStartIndex >= 0
          ? filteredStartIndex
          : 0,

      selectedPatients:
        reviewableCases.map((c) => ({
          id: c.id,
          folder: c.folder,

          /*
           * 关键：
           * dashboard 必须知道病例来自哪个数据源。
           */
          source: c.source,

          status: c.reviewCompleted
            ? "completed"
            : c.reviewInProgress
              ? "in_progress"
              : "not_started",

          workflowMode: "review",

          displayCaseId:
            c.displayCaseId,

          loadMode:
            getReviewLoadMode(
              c.status
            ),
        })),

      diagnoses: Array(
        reviewableCases.length
      ).fill(null),

      startTime:
        new Date().toISOString(),
    };

    localStorage.setItem(
      "gameData",
      JSON.stringify(gameData)
    );

    localStorage.setItem(
      "currentWorkflowMode",
      "review"
    );

    localStorage.setItem(
      "loginWorkflowMode",
      "review"
    );

    /*
     * 关键：
     * 点击病例后，再次明确写入当前病例的数据源。
     */
    localStorage.setItem(
      "currentDatasetSource",
      caseItem.source
    );

    localStorage.setItem(
      "datasetSource",
      caseItem.source
    );

    localStorage.setItem(
      "currentDisplayCaseId",
      String(
        caseItem.displayCaseId
      )
    );

    localStorage.removeItem(
      "isUserGuideMode"
    );

    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-700" />

          <p className="text-lg">
            Loading review cases…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <div className="mb-4 text-5xl text-red-500">
            ⚠️
          </div>

          <h2 className="mb-2 text-2xl font-bold">
            Error Loading Review Cases
          </h2>

          <p className="mb-4 text-gray-600">
            {error}
          </p>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() =>
                router.push("/")
              }
            >
              Back to Home
            </Button>

            <Button
              onClick={() =>
                window.location.reload()
              }
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              Review Overview & Case List
            </h1>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem(
                "gameData"
              );

              router.push("/");
            }}
          >
            Back to Home
          </Button>
        </div>

        <div className="mb-8 rounded-3xl border bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="mb-2 text-lg font-semibold text-blue-700">
                Review Progress
              </p>

              <div className="mb-3 flex items-end gap-3">
                <span className="text-5xl font-bold text-gray-900">
                  {progress.reviewed}
                </span>

                <span className="mb-1 text-3xl font-semibold text-gray-400">
                  / {progress.total}
                </span>
              </div>

              <p className="mb-4 text-gray-600">
                cases reviewed
              </p>

              <div className="mb-2 h-4 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width:
                      `${progress.percent}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  {progress.percent}%
                  reviewed
                </span>

                <span>
                  {
                    progress.readyForReview
                  }{" "}
                  ready for review
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-500">
                  Total
                </p>

                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {progress.total}
                </p>
              </div>

              <div className="rounded-2xl bg-blue-50 p-4 text-center">
                <p className="text-sm text-blue-700">
                  Ready
                </p>

                <p className="mt-1 text-3xl font-bold text-blue-700">
                  {
                    progress.readyForReview
                  }
                </p>
              </div>

              <div className="rounded-2xl bg-green-50 p-4 text-center">
                <p className="text-sm text-green-700">
                  Reviewed
                </p>

                <p className="mt-1 text-3xl font-bold text-green-700">
                  {progress.reviewed}
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-500">
                  Not Ready
                </p>

                <p className="mt-1 text-3xl font-bold text-gray-700">
                  {progress.notReady}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 text-lg text-gray-700">
          You have {cases.length} assigned
          case
          {cases.length !== 1
            ? "s"
            : ""}
          .
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {cases.map((c, i) => {
            const disabled =
              c.status === "not_ready";

            return (
              <Card
                key={c.id}
                className={`rounded-2xl border bg-white shadow-sm transition-shadow ${
                  disabled
                    ? "opacity-70"
                    : "hover:shadow-md"
                }`}
              >
                <CardContent className="p-5">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                      Case {i + 1}
                    </h2>
                  </div>

                  <div className="mb-4 space-y-1 text-sm text-gray-600">
                    <div>
                      Annotation:{" "}
                      <span
                        className={
                          c.annotationCompleted
                            ? "font-semibold text-green-700"
                            : "font-semibold text-gray-500"
                        }
                      >
                        {c.annotationCompleted
                          ? "Completed"
                          : "Not Completed"}
                      </span>
                    </div>

                    <div>
                      Review:{" "}
                      <span
                        className={
                          c.reviewCompleted
                            ? "font-semibold text-green-700"
                            : c.reviewInProgress
                              ? "font-semibold text-amber-700"
                              : "font-semibold text-gray-500"
                        }
                      >
                        {c.reviewCompleted
                          ? "Completed"
                          : c.reviewInProgress
                            ? "In Progress"
                            : "Not Started"}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() =>
                      handleStartReviewCase(
                        c
                      )
                    }
                    className="w-full rounded-xl text-base"
                    variant={
                      c.status === "reviewed"
                        ? "outline"
                        : "default"
                    }
                    disabled={disabled}
                  >
                    {getButtonLabel(
                      c.status
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}