"use client";

import * as React from "react";
import type { TimeValuePoint } from "@/lib/types";
import { submitAnnotation } from "@/lib/submit";

type GasEvalPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  gasData?: Record<string, TimeValuePoint[] | undefined>;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type TrendValue = "Increased" | "Decreased" | "Stable" | "Fluctuating" | "";
type RelevanceValue =
  | "Highly Relevant"
  | "Possibly Relevant"
  | "Not Relevant"
  | "";
type OverallGasJudgment =
  | "Appropriate"
  | "Mostly Appropriate"
  | "Mixed / Uncertain"
  | "Suboptimal"
  | "Inappropriate"
  | "";

type GasEval = {
  trend: TrendValue;
  relevance: RelevanceValue;
  overallJudgment: OverallGasJudgment;
  rationale: string;
};

function RadioPill({
  label,
  selected,
  onClick,
  selectedTone = "green",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  selectedTone?: "green" | "blue" | "orange";
}) {
  const toneClass =
    selectedTone === "green"
      ? "border-green-500 bg-green-100 text-green-700"
      : selectedTone === "blue"
      ? "border-sky-500 bg-sky-100 text-sky-700"
      : "border-orange-400 bg-orange-100 text-orange-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? toneClass
          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900"
      }`}
    >
      {label}
    </button>
  );
}

function TaskBlock({
  title,
  children,
  noBorder = false,
}: {
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={`${noBorder ? "" : "border-b"} px-4 py-4`}>
      <div className="mb-3 text-sm font-semibold text-gray-900">{title}</div>
      {children}
    </div>
  );
}

function roundSmart(v: number) {
  if (Math.abs(v) >= 10) return Math.round(v);
  if (Math.abs(v) >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

function extractGasCandidatesFromWindow(
  gasData: Record<string, TimeValuePoint[] | undefined> = {},
  startMin: number,
  endMin: number
): string[] {
  const windowStart = Number(startMin);
  const windowEnd = Number(endMin) + 10;

  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return [];

  const CLINICALLY_RELEVANT_GAS_KEYS = [
    "FiO2",
    "etMAC exhaled",
    "inSevoflurane %",
    "inIsoflurane",
    "O2 (L/Min)",
    "N2O (L/min)",
    "inN2O %",
  ];

  const results: string[] = [];

  for (const key of CLINICALLY_RELEVANT_GAS_KEYS) {
    const arr = gasData[key] ?? [];

    const points = arr
      .filter(
        (p) =>
          Number.isFinite(p.time) &&
          Number.isFinite(p.value) &&
          p.time >= windowStart &&
          p.time <= windowEnd
      )
      .sort((a, b) => a.time - b.time);

    if (!points.length) continue;

    const hasAnyNonZero = points.some((p) => Math.abs(p.value) > 1e-9);
    if (!hasAnyNonZero) continue;

    const first = points[0];
    const last = points[points.length - 1];

    const nonZeroPoints = points.filter((p) => Math.abs(p.value) > 1e-9);
    const firstNonZero = nonZeroPoints[0] ?? first;
    const lastNonZero = nonZeroPoints[nonZeroPoints.length - 1] ?? last;

    const label = `${key} @ ${Math.round(firstNonZero.time)}-${Math.round(
      lastNonZero.time
    )} min (start=${roundSmart(firstNonZero.value)}, end=${roundSmart(
      lastNonZero.value
    )})`;

    results.push(label);
  }

  return results;
}

function isGasEvalComplete(evalItem?: GasEval | null) {
  if (!evalItem) return false;
  return Boolean(
    evalItem.trend &&
      evalItem.relevance &&
      evalItem.overallJudgment &&
      evalItem.rationale?.trim()
  );
}

export default function GasEvalPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,
  gasData = {},
  annotatorName,
  onSaveAndNextStep,
}: GasEvalPanelProps) {
  const candidateGasItems = React.useMemo(() => {
    return extractGasCandidatesFromWindow(gasData, startMin, endMin);
  }, [gasData, startMin, endMin]);

  const noGasCaptured = candidateGasItems.length === 0;

  const [selectedGasItem, setSelectedGasItem] = React.useState("");
  const [trend, setTrend] = React.useState<TrendValue>("");
  const [relevance, setRelevance] = React.useState<RelevanceValue>("");
  const [overallJudgment, setOverallJudgment] =
    React.useState<OverallGasJudgment>("");
  const [rationale, setRationale] = React.useState("");

  const [gasEvalMap, setGasEvalMap] = React.useState<Record<string, GasEval>>(
    {}
  );
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const panelOpenedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  function buildCurrentEval(): GasEval {
    return {
      trend,
      relevance,
      overallJudgment,
      rationale,
    };
  }

  function persistCurrentGas() {
    if (!selectedGasItem) return;
    setGasEvalMap((prev) => ({
      ...prev,
      [selectedGasItem]: buildCurrentEval(),
    }));
  }

  function loadGasEval(item: string) {
    const saved = gasEvalMap[item];
    setTrend(saved?.trend ?? "");
    setRelevance(saved?.relevance ?? "");
    setOverallJudgment(saved?.overallJudgment ?? "");
    setRationale(saved?.rationale ?? "");
  }

  React.useEffect(() => {
    if (candidateGasItems.length === 0) {
      setSelectedGasItem("");
      setTrend("");
      setRelevance("");
      setOverallJudgment("");
      setRationale("");
      return;
    }

    setSelectedGasItem((prev) => {
      const next =
        prev && candidateGasItems.includes(prev) ? prev : candidateGasItems[0];
      const saved = gasEvalMap[next];
      setTrend(saved?.trend ?? "");
      setRelevance(saved?.relevance ?? "");
      setOverallJudgment(saved?.overallJudgment ?? "");
      setRationale(saved?.rationale ?? "");
      return next;
    });
  }, [candidateGasItems, gasEvalMap]);

  const completedCount = React.useMemo(() => {
    return candidateGasItems.filter((x) => isGasEvalComplete(gasEvalMap[x]))
      .length;
  }, [candidateGasItems, gasEvalMap]);

  function validateAllGasItems() {
    if (noGasCaptured) {
      return null;
    }

    const mergedMap = {
      ...gasEvalMap,
      ...(selectedGasItem ? { [selectedGasItem]: buildCurrentEval() } : {}),
    };

    const remaining = candidateGasItems.filter(
      (item) => !isGasEvalComplete(mergedMap[item])
    );

    if (remaining.length > 0) {
      return `You must complete all gas items before saving. Remaining: ${remaining.length}.`;
    }

    return null;
  }

  async function handleSaveGasEval() {
    const mergedGasEvalMap = noGasCaptured
      ? {}
      : {
          ...gasEvalMap,
          ...(selectedGasItem ? { [selectedGasItem]: buildCurrentEval() } : {}),
        };

    if (!noGasCaptured && selectedGasItem) {
      setGasEvalMap(mergedGasEvalMap);
    }

    const validationError = validateAllGasItems();
    if (validationError) {
      setSaveStatus("error");
      setSaveMessage(validationError);
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage("");

      await submitAnnotation({
        annotator: annotatorName ? { name: annotatorName } : undefined,
        caseId,
        eventId,
        panel: "gas_eval_panel",
        action: noGasCaptured ? "skip" : "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          gasCaptured: !noGasCaptured,
          gasSkipped: noGasCaptured,
          skipReason: noGasCaptured
            ? "No gas / ventilation feature was found within this event window and the following 10 minutes."
            : "",
          candidateGasItems,
          selectedGasItem: noGasCaptured ? "" : selectedGasItem,
          gasEvalMap: mergedGasEvalMap,
        },
      });

      setSaveStatus("success");
      setSaveMessage(
        noGasCaptured
          ? "No gas / ventilation feature was captured. Tasks 1–3 were skipped and the panel was saved successfully."
          : "All gas items were completed and saved successfully."
      );
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save gas evaluation.");
    }
  }

  function handleReset() {
    setSelectedGasItem(candidateGasItems[0] ?? "");
    setTrend("");
    setRelevance("");
    setOverallJudgment("");
    setRationale("");
    setGasEvalMap({});
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-2 text-sm font-semibold text-gray-900">
          Panel 3A: Evaluate whether gas / ventilation-related features were
          relevant for the selected event.
        </div>

        <div className="mb-4 text-sm text-gray-600">
          Assess whether this gas feature changed around the event and whether
          that change was clinically meaningful for explaining the event or
          response.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. Select the gas feature being evaluated">
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
              <span>Progress</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                {noGasCaptured
                  ? "Skipped (no gas feature captured)"
                  : `${completedCount}/${candidateGasItems.length} completed`}
              </span>
            </div>

            {noGasCaptured ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No gas / ventilation feature was found within this event window
                and the following 10 minutes. Tasks 1–3 will be skipped
                automatically.
              </div>
            ) : (
              <select
                value={selectedGasItem}
                onChange={(e) => {
                  if (selectedGasItem) persistCurrentGas();
                  const next = e.target.value;
                  setSelectedGasItem(next);
                  loadGasEval(next);
                }}
                className="w-full max-w-[760px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
              >
                <option value="">Select gas feature</option>
                {candidateGasItems.map((item) => {
                  const done = isGasEvalComplete(gasEvalMap[item]);
                  return (
                    <option key={item} value={item}>
                      {done ? "✓ " : ""}
                      {item}
                    </option>
                  );
                })}
              </select>
            )}
          </TaskBlock>

          <TaskBlock title="Task 2. Evaluate trend and relevance">
            {noGasCaptured ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                Skipped because no gas / ventilation feature was captured for
                this event window.
              </div>
            ) : (
              <>
                <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                  Trend = how the feature changed. Relevance = whether that
                  change helped explain the event clinically.
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RadioPill
                        label="Increased"
                        selected={trend === "Increased"}
                        selectedTone="green"
                        onClick={() => setTrend("Increased")}
                      />
                      <RadioPill
                        label="Decreased"
                        selected={trend === "Decreased"}
                        selectedTone="green"
                        onClick={() => setTrend("Decreased")}
                      />
                      <RadioPill
                        label="Stable"
                        selected={trend === "Stable"}
                        selectedTone="green"
                        onClick={() => setTrend("Stable")}
                      />
                      <RadioPill
                        label="Fluctuating"
                        selected={trend === "Fluctuating"}
                        selectedTone="green"
                        onClick={() => setTrend("Fluctuating")}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                      Relevance = whether the change in this gas feature was
                      clinically related to the selected event or its management.
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RadioPill
                        label="Highly Relevant"
                        selected={relevance === "Highly Relevant"}
                        selectedTone="orange"
                        onClick={() => setRelevance("Highly Relevant")}
                      />
                      <RadioPill
                        label="Possibly Relevant"
                        selected={relevance === "Possibly Relevant"}
                        selectedTone="orange"
                        onClick={() => setRelevance("Possibly Relevant")}
                      />
                      <RadioPill
                        label="Not Relevant"
                        selected={relevance === "Not Relevant"}
                        selectedTone="orange"
                        onClick={() => setRelevance("Not Relevant")}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Overall Judgment
                    </div>
                    <select
                      value={overallJudgment}
                      onChange={(e) =>
                        setOverallJudgment(e.target.value as OverallGasJudgment)
                      }
                      className="w-full max-w-[360px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                    >
                      <option value="">Select overall judgment</option>
                      <option value="Appropriate">Appropriate</option>
                      <option value="Mostly Appropriate">
                        Mostly Appropriate
                      </option>
                      <option value="Mixed / Uncertain">
                        Mixed / Uncertain
                      </option>
                      <option value="Suboptimal">Suboptimal</option>
                      <option value="Inappropriate">Inappropriate</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </TaskBlock>

          <TaskBlock title="Task 3. Please explain your gas evaluation" noBorder>
            {noGasCaptured ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                Skipped because no gas / ventilation feature was captured for
                this event window.
              </div>
            ) : (
              <>
                <div className="mb-3 text-sm text-gray-600">
                  Briefly explain why this feature was or was not clinically
                  relevant, based on timing and direction of change.
                </div>

                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Describe why this gas feature was or was not relevant to the event..."
                />
              </>
            )}
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              {noGasCaptured
                ? "No gas feature captured. This panel will be skipped automatically."
                : "All gas items must be completed before saving."}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-gray-700 bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Reset All
              </button>

              <button
                type="button"
                onClick={handleSaveGasEval}
                disabled={saveStatus === "saving"}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  saveStatus === "saving"
                    ? "cursor-wait bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saveStatus === "saving"
                  ? "Saving..."
                  : noGasCaptured
                  ? "Skip Gas Eval & Next Step"
                  : "Save All & Next Step"}
              </button>
            </div>

            {saveMessage && (
              <div
                className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
                  saveStatus === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {saveMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}