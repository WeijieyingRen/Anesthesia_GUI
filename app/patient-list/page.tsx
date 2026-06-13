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
  datasetSource: DatasetSource;
  lookupFileName: string;
};

type CaseStatus =
  | "not_started"
  | "in_progress"
  | "completed";

type AssignedCase = {
  folder: string;
  source: DatasetSource;
};

interface CaseMeta {
  id: string;
  folder: string;
  source: DatasetSource;
  status: CaseStatus;
  displayCaseId: number;
}

type GameData = {
  currentPatientIndex: number;

  selectedPatients: Array<{
    id: string;
    folder: string;
    status?: CaseStatus;
    workflowMode?: WorkflowMode;
    displayCaseId?: number;
    loadMode?: LoadMode;
    source?: DatasetSource;
  }>;

  diagnoses: Array<string | null>;
  startTime: string;
};

type CaseStatusIndexEntry = {
  completed?: boolean;
  inProgress?: boolean;
  case_id?: string | number | null;
  updated_at?: string;
};

type AccessLookupConfig = {
  fileName: string;
  source: DatasetSource;
};

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

function getStatusLabel(
  status: CaseStatus,
  workflowMode: WorkflowMode
): string {
  if (workflowMode === "review") {
    if (status === "completed") {
      return "Reviewed";
    }

    if (status === "in_progress") {
      return "Review In Progress";
    }

    return "Ready for Review";
  }

  if (status === "completed") {
    return "Completed";
  }

  if (status === "in_progress") {
    return "In Progress";
  }

  return "Not Started";
}

function getStatusBadgeClass(
  status: CaseStatus
): string {
  if (status === "completed") {
    return "bg-green-100 text-green-700";
  }

  if (status === "in_progress") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-gray-100 text-gray-600";
}

function getButtonLabel(
  status: CaseStatus,
  workflowMode: WorkflowMode
): string {
  if (workflowMode === "review") {
    if (status === "completed") {
      return "Review Submitted";
    }

    if (status === "in_progress") {
      return "Continue Review";
    }

    return "Start Review";
  }

  if (status === "completed") {
    return "Review";
  }

  if (status === "in_progress") {
    return "Continue";
  }

  return "Start";
}

/**
 * case_status API 中的 key：
 *
 * MPOG:
 *   patient_1
 *
 * MOVER:
 *   mover::patient_1
 */
function getCaseStatusLookupKey(
  source: DatasetSource,
  folder: string
): string {
  return source === "mover"
    ? `mover::${folder}`
    : folder;
}

export default function PatientList() {
  const router = useRouter();

  const [cases, setCases] = useState<CaseMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    null
  );

  const [
    loginWorkflowMode,
    setLoginWorkflowMode,
  ] = useState<WorkflowMode>("annotation");

  /**
   * 同时检查 MPOG 和 MOVER 的 access-review lookup 文件。
   *
   * MPOG:
   *   access_review_code.csv
   *
   * MOVER:
   *   mover_access_review_code.csv
   */
  const loadAccessCodeInfo = async (
    accessCode: string
  ): Promise<AccessCodeLookupResult> => {
    const normalizedAccessCode =
      String(accessCode ?? "").trim();

    if (!normalizedAccessCode) {
      throw new Error("Access code is empty.");
    }

    const matches: AccessCodeLookupResult[] = [];

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

      const parsed = Papa.parse<CsvRow>(text, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0) {
        console.warn(
          `CSV parsing warnings in ${config.fileName}:`,
          parsed.errors
        );
      }

      const matchedRow = parsed.data.find((row) => {
        const annotationCode = String(
          row["annotation_code"] ?? ""
        ).trim();

        const reviewCode = String(
          row["review_code"] ?? ""
        ).trim();

        return (
          annotationCode === normalizedAccessCode ||
          reviewCode === normalizedAccessCode
        );
      });

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

    if (matches.length > 1) {
      throw new Error(
        `Access code ${normalizedAccessCode} appears in more than one lookup file. MPOG and MOVER access codes must not overlap.`
      );
    }

    return matches[0];
  };

  /**
   * 从一个 assignment 文件中读取属于当前 annotation code 的病例。
   */
  const loadAssignedCasesFromFile = async (
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

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      console.warn(
        `CSV parsing warnings in ${fileName}:`,
        parsed.errors
      );
    }

    const assignedCases = parsed.data
      .filter((row) => {
        const rowAnnotationCode = String(
          row["annotation_code"] ?? ""
        ).trim();

        return (
          rowAnnotationCode ===
          accessInfo.annotationCode
        );
      })
      .map((row) => ({
        folder: String(
          row["patient_folder"] ?? ""
        ).trim(),
        source,
      }))
      .filter((item) => Boolean(item.folder));

    const uniqueCaseMap = new Map<
      string,
      AssignedCase
    >();

    for (const assignedCase of assignedCases) {
      const uniqueKey =
        `${assignedCase.source}::${assignedCase.folder}`;

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

    return Array.from(uniqueCaseMap.values());
  };

  /**
   * 根据 access code 所属数据集，只读取对应的 assignment 文件。
   *
   * MPOG code:
   *   assigned_650_cases_by_access_code.csv
   *
   * MOVER code:
   *   assigned_mover_350_cases_by_access_code_remapped.csv
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

  const loadAllCaseStatuses = async (
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
      localStorage.getItem("participantInfo");

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

    let parsedParticipantInfo: any = null;

    try {
      parsedParticipantInfo = JSON.parse(
        participantInfo
      );
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

    /**
     * 不再在验证本次 access code 之前，
     * 根据旧 localStorage 判断 review/annotation。
     *
     * 否则之前登录过 review code 后，
     * 新的 annotation code 可能会被错误跳转到 review-list。
     */
    void (async () => {
      try {
        setLoading(true);
        setError(null);

        const accessCode =
          String(
            parsedParticipantInfo?.accessCode ??
              ""
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

        const accessInfo =
          await loadAccessCodeInfo(
            accessCode
          );

        localStorage.setItem(
          "doctorAccessCode",
          accessCode
        );

        localStorage.setItem(
          "currentWorkflowMode",
          accessInfo.workflowMode
        );

        localStorage.setItem(
          "loginWorkflowMode",
          accessInfo.workflowMode
        );

        localStorage.setItem(
          "doctorId",
          accessInfo.doctorId
        );

        localStorage.setItem(
          "currentDatasetSource",
          accessInfo.datasetSource
        );

        localStorage.setItem(
          "datasetSource",
          accessInfo.datasetSource
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

        if (
          accessInfo.workflowMode === "review"
        ) {
          router.replace("/review-list");
          return;
        }

        setLoginWorkflowMode("annotation");

        const doctorName = String(
          parsedParticipantInfo?.name ?? ""
        ).trim();

        const [
          assignedCases,
          statusMap,
        ] = await Promise.all([
          loadAssignedCases(accessInfo),

          loadAllCaseStatuses(
            accessCode,
            doctorName
          ),
        ]);

        const metas: CaseMeta[] =
          assignedCases.map(
            (
              assignedCase,
              index
            ) => {
              const {
                folder,
                source,
              } = assignedCase;

              const statusKey =
                getCaseStatusLookupKey(
                  source,
                  folder
                );

              const item =
                statusMap[statusKey];

              let status: CaseStatus =
                "not_started";

              if (
                item?.completed === true
              ) {
                status = "completed";
              } else if (
                item?.inProgress === true
              ) {
                status = "in_progress";
              }

              return {
                /**
                 * MPOG 和 MOVER 都可能存在 patient_1。
                 * 因此内部 ID 必须包含数据来源。
                 */
                id: `${source}:${folder}`,

                folder,
                source,
                status,
                displayCaseId:
                  index + 1,
              };
            }
          );

        setCases(metas);
      } catch (e: any) {
        console.error(
          "Error building case list:",
          e
        );

        setError(
          e?.message ??
            "Failed to load assigned cases"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const progress = useMemo(() => {
    const total = cases.length;

    const completed = cases.filter(
      (c) => c.status === "completed"
    ).length;

    const inProgress = cases.filter(
      (c) => c.status === "in_progress"
    ).length;

    const remaining = total - completed;

    const percent =
      total > 0
        ? Math.round(
            (completed / total) * 100
          )
        : 0;

    return {
      total,
      completed,
      inProgress,
      remaining,
      percent,
    };
  }, [cases]);

  const handleStartSingleCase = (
    caseItem: CaseMeta
  ) => {
    const startIndex =
      cases.findIndex(
        (c) => c.id === caseItem.id
      );

    const workflowMode: WorkflowMode =
      "annotation";

    const gameData: GameData = {
      currentPatientIndex:
        startIndex >= 0
          ? startIndex
          : 0,

      selectedPatients:
        cases.map((c) => ({
          id: c.id,
          folder: c.folder,
          source: c.source,
          status: c.status,
          workflowMode,

          displayCaseId:
            c.displayCaseId,

          loadMode:
            c.status === "completed"
              ? "annotation_result"
              : "empty",
        })),

      diagnoses:
        Array(cases.length).fill(null),

      startTime:
        new Date().toISOString(),
    };

    localStorage.setItem(
      "gameData",
      JSON.stringify(gameData)
    );

    localStorage.setItem(
      "currentWorkflowMode",
      workflowMode
    );

    localStorage.setItem(
      "loginWorkflowMode",
      workflowMode
    );

    localStorage.setItem(
      "currentDatasetSource",
      caseItem.source
    );

    localStorage.setItem(
      "currentDisplayCaseId",
      String(caseItem.displayCaseId)
    );

    localStorage.removeItem(
      "isUserGuideMode"
    );

    router.push("/dashboard");
  };

  const handleStartUserGuide = () => {
    const workflowMode: WorkflowMode =
      "annotation";

    const gameData: GameData = {
      currentPatientIndex: 0,

      selectedPatients: [
        {
          id: "stanford_mpog:user_guide",
          folder: "user_guide",
          status: "not_started",
          workflowMode,
          displayCaseId: 1,
          loadMode: "empty",
          source: "stanford_mpog",
        },
      ],

      diagnoses: [null],

      startTime:
        new Date().toISOString(),
    };

    localStorage.setItem(
      "gameData",
      JSON.stringify(gameData)
    );

    localStorage.setItem(
      "currentWorkflowMode",
      workflowMode
    );

    localStorage.setItem(
      "loginWorkflowMode",
      workflowMode
    );

    localStorage.setItem(
      "currentDatasetSource",
      "stanford_mpog"
    );

    localStorage.setItem(
      "isUserGuideMode",
      "true"
    );

    router.push(
      "/dashboard?guide=1"
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-700" />

          <p className="text-lg">
            Loading cases…
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
            Error Loading Cases
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

  const pageTitle =
    loginWorkflowMode === "review"
      ? "Review Overview & Case List"
      : "Annotation Overview & Case List";

  const pageSubtitle =
    loginWorkflowMode === "review"
      ? "Here are cases ready for review."
      : "Here are your assigned cases for annotation.";

  const completedLabel =
    loginWorkflowMode === "review"
      ? "cases reviewed"
      : "cases completed";

  const percentLabel =
    loginWorkflowMode === "review"
      ? `${progress.percent}% reviewed`
      : `${progress.percent}% completed`;

  const availableLabel =
    loginWorkflowMode === "review"
      ? "review"
      : "annotation";

  const completedCardLabel =
    loginWorkflowMode === "review"
      ? "Reviewed"
      : "Completed";

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              {pageTitle}
            </h1>

            <p className="mt-2 text-lg text-gray-600">
              {pageSubtitle}
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="mb-2 text-lg font-semibold text-blue-700">
                Your Progress
              </p>

              <div className="mb-3 flex items-end gap-3">
                <span className="text-5xl font-bold text-gray-900">
                  {progress.completed}
                </span>

                <span className="mb-1 text-3xl font-semibold text-gray-400">
                  / {progress.total}
                </span>
              </div>

              <p className="mb-4 text-gray-600">
                {completedLabel}
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
                  {percentLabel}
                </span>

                <span>
                  {progress.remaining} cases remaining
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-500">
                  Total
                </p>

                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {progress.total}
                </p>
              </div>

              <div className="rounded-2xl bg-green-50 p-4 text-center">
                <p className="text-sm text-green-700">
                  {completedCardLabel}
                </p>

                <p className="mt-1 text-3xl font-bold text-green-700">
                  {progress.completed}
                </p>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4 text-center">
                <p className="text-sm text-amber-700">
                  In Progress
                </p>

                <p className="mt-1 text-3xl font-bold text-amber-700">
                  {progress.inProgress}
                </p>
              </div>
            </div>
          </div>
        </div>

        {loginWorkflowMode ===
          "annotation" && (
          <div className="mb-6 rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2 text-base leading-6 text-gray-700">
  <p>
    We prepared a demo case to help you become familiar with the annotation workflow.
  </p>

  <p>
    1. Click “Start User Guide” to open the demo case.
  </p>

  <p>
    2. On the next page, click “User Guide” in the upper-right corner to view the
    step-by-step instructions.
  </p>

  <p>
    3. You may freely try the recording, writing, and saving functions. No demo
    data will be uploaded.
  </p>

  <p>
    4. When you are finished, click “Home” in the upper-right corner to return to
    the home page.
  </p>
</div>

              <Button
                type="button"
                onClick={
                  handleStartUserGuide
                }
                className="rounded-xl bg-[#ff6f61] px-6 py-2 text-base font-semibold text-white shadow-sm hover:bg-[#e85f54]"
              >
                Start User Guide
              </Button>
            </div>
          </div>
        )}

        <div className="mb-4 text-lg text-gray-700">
          You have {cases.length} case
          {cases.length !== 1
            ? "s"
            : ""}{" "}
          available for {availableLabel}.
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {cases.map((c, i) => (
            <Card
              key={c.id}
              className="rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      Case {i + 1}
                    </h2>
                  </div>

                  <div
                    className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeClass(
                      c.status
                    )}`}
                  >
                    {getStatusLabel(
                      c.status,
                      loginWorkflowMode
                    )}
                  </div>
                </div>

                <Button
                  onClick={() =>
                    handleStartSingleCase(c)
                  }
                  className="w-full rounded-xl text-base"
                  variant={
                    c.status === "completed"
                      ? "outline"
                      : "default"
                  }
                >
                  {getButtonLabel(
                    c.status,
                    loginWorkflowMode
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}