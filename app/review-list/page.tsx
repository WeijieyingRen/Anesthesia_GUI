"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CsvRow = Record<string, any>;

type WorkflowMode = "annotation" | "review";
type LoadMode = "empty" | "annotation_result" | "review_result";

type AccessCodeLookupResult = {
  doctorId: string;
  workflowMode: WorkflowMode;
  annotationCode: string;
  reviewCode: string | null;
};

type ReviewCaseStatus =
  | "not_ready"
  | "ready_for_review"
  | "review_in_progress"
  | "reviewed";

interface ReviewCaseMeta {
  id: string;
  folder: string;
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
    status?: "not_started" | "in_progress" | "completed";
    workflowMode?: "annotation" | "review";
    displayCaseId?: number;
    loadMode?: LoadMode;
  }>;
  diagnoses: Array<string | null>;
  startTime: string;
};

type CaseStatusIndexEntry = {
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

function getButtonLabel(status: ReviewCaseStatus): string {
  if (status === "reviewed") return "Review";
  if (status === "review_in_progress") return "Continue Review";
  if (status === "ready_for_review") return "Start";
  return "Not Ready";
}

function getReviewLoadMode(status: ReviewCaseStatus): LoadMode {
  if (status === "reviewed" || status === "review_in_progress") {
    return "review_result";
  }

  if (status === "ready_for_review") {
    return "annotation_result";
  }

  return "empty";
}

function resolveStoredWorkflowMode(
  parsedParticipantInfo: any
): WorkflowMode {
  return parsedParticipantInfo?.workflowMode === "review" ||
    localStorage.getItem("currentWorkflowMode") === "review" ||
    localStorage.getItem("loginWorkflowMode") === "review"
    ? "review"
    : "annotation";
}

export default function ReviewList() {
  const router = useRouter();

  const [cases, setCases] = useState<ReviewCaseMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
   * 同时读取 MPOG 和 MOVER 的 review-code lookup 文件。
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
    const reviewLookupFiles = [
      "/assigned_code/access_review_code.csv",
      "/assigned_code/mover_access_review_code.csv",
    ];

    const parsedResults = await Promise.all(
      reviewLookupFiles.map(async (filePath) => {
        const res = await fetch(filePath, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(
            `${filePath} ${res.status} ${res.statusText}`
          );
        }

        const text = await res.text();

        return Papa.parse<CsvRow>(text, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
        }).data;
      })
    );

    const rows = parsedResults.flat();
    const normalizedAccessCode = accessCode.trim();

    const matched = rows.find(
      (row) =>
        String(row["annotation_code"] ?? "").trim() ===
          normalizedAccessCode ||
        String(row["review_code"] ?? "").trim() === normalizedAccessCode
    );

    if (!matched) {
      throw new Error(
        "Invalid access code. No matching MPOG or MOVER annotation/review assignment was found."
      );
    }

    const doctorId = String(
      matched["doctor_id"] ?? ""
    ).trim();

    const annotationCode = String(
      matched["annotation_code"] ?? ""
    ).trim();

    const reviewCode =
      String(matched["review_code"] ?? "").trim() || null;

    const workflowMode: WorkflowMode =
      reviewCode && normalizedAccessCode === reviewCode
        ? "review"
        : "annotation";

    if (!doctorId) {
      throw new Error(
        "Matched doctor_id is empty in the access-review-code lookup files."
      );
    }

    if (!annotationCode) {
      throw new Error(
        "Matched annotation_code is empty in the access-review-code lookup files."
      );
    }

    if (workflowMode !== "review") {
      throw new Error(
        "This page is for review codes only. Please use the annotation case list for annotation codes."
      );
    }

    return {
      doctorId,
      workflowMode,
      annotationCode,
      reviewCode,
    };
  };

  /*
   * 同时读取 MPOG 和 MOVER assignment 文件。
   *
   * 由于已经验证：
   * 1. MOVER codes 与 MPOG codes 无交叉；
   * 2. annotation codes 与 review codes 无交叉；
   *
   * 因此可以合并两个 assignment 文件后，
   * 使用 annotation_code 唯一定位该 doctor 的病例。
   */
  const loadAssignedPatientFolders = async (
    accessInfo: AccessCodeLookupResult
  ): Promise<string[]> => {
    const assignmentFiles = [
      "/assigned_code/assigned_650_cases_by_access_code.csv",
      "/assigned_code/assigned_mover_350_cases_by_access_code.csv",
    ];

    const parsedResults = await Promise.all(
      assignmentFiles.map(async (filePath) => {
        const res = await fetch(filePath, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(
            `${filePath} ${res.status} ${res.statusText}`
          );
        }

        const text = await res.text();

        return Papa.parse<CsvRow>(text, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
        }).data;
      })
    );

    const rows = parsedResults.flat();

    const matchedRows = rows
      .filter(
        (row) =>
          String(row["annotation_code"] ?? "").trim() ===
          String(accessInfo.annotationCode ?? "").trim()
      )
      .sort((a, b) => {
        const orderA = Number(
          String(a["case_order_within_doctor"] ?? "0").trim()
        );

        const orderB = Number(
          String(b["case_order_within_doctor"] ?? "0").trim()
        );

        return orderA - orderB;
      });

    const folders = matchedRows
      .map((row) =>
        String(row["patient_folder"] ?? "").trim()
      )
      .filter(Boolean);

    if (!folders.length) {
      throw new Error(
        `No patient_folder was found in either the MPOG or MOVER assignment file for annotation_code=${accessInfo.annotationCode}`
      );
    }

    return folders;
  };

  const loadCaseStatuses = async (
    accessCode: string,
    doctorName?: string
  ): Promise<Record<string, CaseStatusIndexEntry>> => {
    try {
      const params = new URLSearchParams({ accessCode });

      if (doctorName?.trim()) {
        params.set("doctorName", doctorName.trim());
      }

      const res = await fetch(
        `/api/case_status?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        console.warn(`case_status failed: ${res.status}`);
        return {};
      }

      const data = await res.json();

      if (!data?.ok) {
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
      parsedParticipantInfo = JSON.parse(participantInfo);
    } catch {
      router.replace("/");
      return;
    }

    try {
      const parsedConsent = JSON.parse(consentInfo);

      if (!parsedConsent?.agreed) {
        router.replace("/consent");
        return;
      }
    } catch {
      router.replace("/consent");
      return;
    }

    const storedWorkflowMode =
      resolveStoredWorkflowMode(parsedParticipantInfo);

    if (storedWorkflowMode !== "review") {
      router.replace("/patient-list");
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const accessCode =
          String(
            parsedParticipantInfo?.accessCode ?? ""
          ).trim() ||
          String(
            localStorage.getItem("doctorAccessCode") ?? ""
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
          await loadAccessCodeInfo(accessCode);

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

        const [folders, statusMap] = await Promise.all([
          loadAssignedPatientFolders(accessInfo),
          loadCaseStatuses(accessCode, doctorName),
        ]);

        const metas: ReviewCaseMeta[] = folders.map(
          (folder, index) => {
            const item = statusMap[folder];

            const annotationCompleted =
              item?.annotationCompleted === true ||
              item?.completed === true;

            const reviewCompleted =
              item?.reviewCompleted === true;

            const reviewInProgress =
              !reviewCompleted &&
              item?.reviewInProgress === true;

            let status: ReviewCaseStatus = "not_ready";

            if (reviewCompleted) {
              status = "reviewed";
            } else if (reviewInProgress) {
              status = "review_in_progress";
            } else if (annotationCompleted) {
              status = "ready_for_review";
            }

            return {
              id: folder,
              folder,
              displayCaseId: index + 1,
              annotationCompleted,
              reviewCompleted,
              reviewInProgress,
              status,
              caseId: item?.case_id ?? null,
              annotationUpdatedAt:
                item?.annotationUpdatedAt ??
                item?.updated_at ??
                null,
              reviewUpdatedAt:
                item?.reviewUpdatedAt ?? null,
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
          e?.message ?? "Failed to load review cases."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const progress = useMemo(() => {
    const total = cases.length;

    const annotationCompleted = cases.filter(
      (c) => c.annotationCompleted
    ).length;

    const readyForReview = cases.filter(
      (c) => c.status === "ready_for_review"
    ).length;

    const reviewInProgress = cases.filter(
      (c) => c.status === "review_in_progress"
    ).length;

    const reviewed = cases.filter(
      (c) => c.status === "reviewed"
    ).length;

    const notReady = cases.filter(
      (c) => c.status === "not_ready"
    ).length;

    const percent =
      total > 0
        ? Math.round((reviewed / total) * 100)
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
    if (caseItem.status === "not_ready") {
      return;
    }

    const reviewableCases = cases.filter(
      (c) => c.annotationCompleted
    );

    const filteredStartIndex =
      reviewableCases.findIndex(
        (c) => c.folder === caseItem.folder
      );

    const gameData: GameData = {
      currentPatientIndex:
        filteredStartIndex >= 0
          ? filteredStartIndex
          : 0,

      selectedPatients: reviewableCases.map((c) => ({
        id: c.id,
        folder: c.folder,

        status: c.reviewCompleted
          ? "completed"
          : c.reviewInProgress
            ? "in_progress"
            : "not_started",

        workflowMode: "review",
        displayCaseId: c.displayCaseId,
        loadMode: getReviewLoadMode(c.status),
      })),

      diagnoses: Array(
        reviewableCases.length
      ).fill(null),

      startTime: new Date().toISOString(),
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

    localStorage.setItem(
      "currentDisplayCaseId",
      String(caseItem.displayCaseId)
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
              onClick={() => router.push("/")}
            >
              Back to Home
            </Button>

            <Button
              onClick={() => window.location.reload()}
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
              localStorage.removeItem("gameData");
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
                    width: `${progress.percent}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  {progress.percent}% reviewed
                </span>

                <span>
                  {progress.readyForReview} ready for
                  review
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
                  {progress.readyForReview}
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
          You have {cases.length} assigned case
          {cases.length !== 1 ? "s" : ""}.
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
                      handleStartReviewCase(c)
                    }
                    className="w-full rounded-xl text-base"
                    variant={
                      c.status === "reviewed"
                        ? "outline"
                        : "default"
                    }
                    disabled={disabled}
                  >
                    {getButtonLabel(c.status)}
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