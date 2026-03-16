"use client";

import * as React from "react";

type MedEvalPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  medications?: any;
  medBolusRows?: any[];
  medInfusionRows?: any[];
  onSaveAndNextStep?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type TimingValue = "Appropriate" | "Delayed" | "Too Early" | "";
type ChoiceValue = "Appropriate" | "Suboptimal" | "Inappropriate" | "";
type DoseValue = "Too Low" | "Reasonable" | "Too High" | "";
type OverallJudgmentValue =
  | "Appropriate"
  | "Mostly Appropriate"
  | "Mixed / Uncertain"
  | "Suboptimal"
  | "Inappropriate"
  | "";

type TreatmentEval = {
  timing: TimingValue;
  choice: ChoiceValue;
  dose: DoseValue;
  overallJudgment: OverallJudgmentValue;
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
      className={`rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
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

function normalizeMedicationName(item: any) {
  return (
    item?.medication ??
    item?.med_concept_desc ??
    item?.name ??
    item?.label ??
    "Unknown medication"
  );
}

function formatDose(item: any) {
  const dose = item?.dose;
  const unit = item?.unit ?? "";

  if (dose === undefined || dose === null || String(dose).trim() === "") {
    return "";
  }

  return `${dose}${unit ? ` ${unit}` : ""}`;
}

function formatAbsoluteTime(rawTime: any) {
  if (!rawTime) return "";

  const dt = new Date(rawTime);
  if (Number.isNaN(dt.getTime())) return "";

  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function extractTreatmentsFromWindow(
  medBolusRows: any[] = [],
  medInfusionRows: any[] = [],
  startMin: number,
  endMin: number
): string[] {
  const windowStart = Number(startMin);
  const windowEnd = Number(endMin) + 10;

  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) {
    return [];
  }

  const results: string[] = [];
  const seen = new Set<string>();

  function pushLabel(label: string) {
    if (!seen.has(label)) {
      seen.add(label);
      results.push(label);
    }
  }

  // 1) bolus
  const matchedBolus: any[] = [];

  for (const item of medBolusRows ?? []) {
    const t = Number(item?.relative_anesthesia_time);
    if (!Number.isFinite(t)) continue;
    if (t < windowStart || t > windowEnd) continue;

    matchedBolus.push(item);

    const name = normalizeMedicationName(item);
    const doseText = formatDose(item);
    const absTime = formatAbsoluteTime(item?.observation_time);

    const label = absTime
      ? doseText
        ? `${name} @ ${absTime} (${doseText})`
        : `${name} @ ${absTime}`
      : doseText
      ? `${name} @ ${Math.round(t)} min (${doseText})`
      : `${name} @ ${Math.round(t)} min`;

    pushLabel(label);
  }

  // 2) infusion: group by medication name
  const infusionGroups = new Map<string, any[]>();

  for (const item of medInfusionRows ?? []) {
    const s = Number(item?.relative_anesthesia_start);
    const e = Number(item?.relative_anesthesia_end);

    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;

    const overlaps = e >= windowStart && s <= windowEnd;
    if (!overlaps) continue;

    const name = normalizeMedicationName(item);

    if (!infusionGroups.has(name)) {
      infusionGroups.set(name, []);
    }
    infusionGroups.get(name)!.push(item);
  }

  const matchedInfusionSummary: any[] = [];

  for (const [name, segments] of infusionGroups.entries()) {
    const sorted = [...segments].sort(
      (a, b) =>
        Number(a?.relative_anesthesia_start ?? 0) -
        Number(b?.relative_anesthesia_start ?? 0)
    );

    const firstSeg = sorted[0];
    const lastSeg = sorted[sorted.length - 1];

    const displayStart =
      formatAbsoluteTime(firstSeg?.start_time) ||
      `${Math.round(Number(firstSeg?.relative_anesthesia_start))} min`;

    const displayEnd =
      formatAbsoluteTime(lastSeg?.end_time) ||
      `${Math.round(Number(lastSeg?.relative_anesthesia_end))} min`;

    const segmentDescriptions = sorted.map((seg) => {
      const segStart =
        formatAbsoluteTime(seg?.start_time) ||
        `${Math.round(Number(seg?.relative_anesthesia_start))} min`;

      const segEnd =
        formatAbsoluteTime(seg?.end_time) ||
        `${Math.round(Number(seg?.relative_anesthesia_end))} min`;

      const doseText = formatDose(seg);

      return doseText
        ? `${segStart}-${segEnd}: ${doseText}`
        : `${segStart}-${segEnd}`;
    });

    const label = `${name} @ ${displayStart}-${displayEnd} [${segmentDescriptions.join(
      "; "
    )}]`;

    matchedInfusionSummary.push({
      name,
      segments: sorted.map((seg) => ({
        relStart: seg?.relative_anesthesia_start,
        relEnd: seg?.relative_anesthesia_end,
        start_time: seg?.start_time,
        end_time: seg?.end_time,
        dose: seg?.dose,
        unit: seg?.unit,
      })),
    });

    pushLabel(label);
  }

  console.log("[MedEval] window =", {
    startMin: windowStart,
    endMin,
    windowEndWithBuffer: windowEnd,
  });

  console.log(
    "[MedEval] matched bolus =",
    matchedBolus.map((x) => ({
      medication: x?.medication,
      rel: x?.relative_anesthesia_time,
      observation_time: x?.observation_time,
      dose: x?.dose,
      unit: x?.unit,
    }))
  );

  console.log("[MedEval] matched infusion grouped =", matchedInfusionSummary);

  return results;
}

function isTreatmentEvalComplete(evalItem?: TreatmentEval | null) {
  if (!evalItem) return false;
  return Boolean(
    evalItem.timing &&
      evalItem.choice &&
      evalItem.dose &&
      evalItem.overallJudgment &&
      evalItem.rationale?.trim()
  );
}

export default function MedEvalPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,
  medBolusRows = [],
  medInfusionRows = [],
  onSaveAndNextStep,
}: MedEvalPanelProps) {
  const candidateTreatments = React.useMemo(() => {
    return extractTreatmentsFromWindow(
      medBolusRows,
      medInfusionRows,
      startMin,
      endMin
    );
  }, [medBolusRows, medInfusionRows, startMin, endMin]);

  const [interventionNote, setInterventionNote] = React.useState("");
  const [selectedTreatment, setSelectedTreatment] = React.useState("");

  // 当前编辑框内容
  const [timing, setTiming] = React.useState<TimingValue>("");
  const [choice, setChoice] = React.useState<ChoiceValue>("");
  const [dose, setDose] = React.useState<DoseValue>("");
  const [overallJudgment, setOverallJudgment] =
    React.useState<OverallJudgmentValue>("");
  const [rationale, setRationale] = React.useState("");

  // 每个 treatment 独立保存一份评价
  const [treatmentEvalMap, setTreatmentEvalMap] = React.useState<
    Record<string, TreatmentEval>
  >({});

  const [recordingTarget, setRecordingTarget] = React.useState<
    "intervention" | "rationale" | null
  >(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);

  function buildCurrentTreatmentEval(): TreatmentEval {
    return {
      timing,
      choice,
      dose,
      overallJudgment,
      rationale,
    };
  }

  function persistCurrentTreatmentToMap(targetTreatment?: string) {
    const treatmentKey = targetTreatment ?? selectedTreatment;
    if (!treatmentKey) return;

    setTreatmentEvalMap((prev) => ({
      ...prev,
      [treatmentKey]: buildCurrentTreatmentEval(),
    }));
  }

  function loadTreatmentFromMap(treatmentKey: string) {
    const saved = treatmentEvalMap[treatmentKey];

    setTiming(saved?.timing ?? "");
    setChoice(saved?.choice ?? "");
    setDose(saved?.dose ?? "");
    setOverallJudgment(saved?.overallJudgment ?? "");
    setRationale(saved?.rationale ?? "");
  }

  React.useEffect(() => {
    if (candidateTreatments.length === 0) {
      setSelectedTreatment("");
      setTiming("");
      setChoice("");
      setDose("");
      setOverallJudgment("");
      setRationale("");
      return;
    }

    setSelectedTreatment((prev) => {
      const next =
        prev && candidateTreatments.includes(prev)
          ? prev
          : candidateTreatments[0];

      const saved = treatmentEvalMap[next];
      setTiming(saved?.timing ?? "");
      setChoice(saved?.choice ?? "");
      setDose(saved?.dose ?? "");
      setOverallJudgment(saved?.overallJudgment ?? "");
      setRationale(saved?.rationale ?? "");

      return next;
    });
  }, [candidateTreatments]);

  const completedTreatmentCount = React.useMemo(() => {
    return candidateTreatments.filter((t) =>
      isTreatmentEvalComplete(treatmentEvalMap[t])
    ).length;
  }, [candidateTreatments, treatmentEvalMap]);

  const currentTreatmentIndex = selectedTreatment
    ? Math.max(
        0,
        candidateTreatments.findIndex((item) => item === selectedTreatment)
      )
    : -1;

  const treatmentProgressLabel =
    candidateTreatments.length > 0
      ? `${completedTreatmentCount}/${candidateTreatments.length} completed`
      : "0/0";

  function validateMedEval() {
    if (!interventionNote || interventionNote.trim() === "") {
      return "Task 1 incomplete: please describe whether intervention was needed and what was most important.";
    }

    if (candidateTreatments.length === 0) {
      return "Task 2 incomplete: no treatment was captured for this event window.";
    }

    // 先把当前 treatment 的编辑内容视为已填写，合并进临时 map 再校验
    const mergedMap: Record<string, TreatmentEval> = {
      ...treatmentEvalMap,
    };

    if (selectedTreatment) {
      mergedMap[selectedTreatment] = buildCurrentTreatmentEval();
    }

    const unfinished = candidateTreatments.filter(
      (treatment) => !isTreatmentEvalComplete(mergedMap[treatment])
    );

    if (unfinished.length > 0) {
      return `You must complete all treatments before saving. Remaining: ${unfinished.length}.`;
    }

    return null;
  }

  async function startVoiceNote(target: "intervention" | "rationale") {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSaveStatus("error");
      setSaveMessage(
        "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      );
      return;
    }

    try {
      recognitionRef.current?.stop?.();

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "intervention") {
          setInterventionNote(transcript);
        } else {
          setRationale(transcript);
        }
      };

      recognition.onerror = () => {
        setRecordingTarget(null);
      };

      recognition.onend = () => {
        setRecordingTarget(null);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecordingTarget(target);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      setRecordingTarget(null);
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    setRecordingTarget(null);
  }

  const payload = React.useMemo(
    () => ({
      task: "medEval",
      caseId,
      eventId,
      eventTitle,
      episodeLabel,
      annotation: {
        startMin,
        endMin,
        interventionNote,
        selectedTreatment,
        candidateTreatments,
        treatmentEvalMap,
      },
      submittedAt: new Date().toISOString(),
    }),
    [
      caseId,
      eventId,
      eventTitle,
      episodeLabel,
      startMin,
      endMin,
      interventionNote,
      selectedTreatment,
      candidateTreatments,
      treatmentEvalMap,
    ]
  );

  async function handleSaveMedEval() {
    // 先把当前 treatment 存进去
    if (selectedTreatment) {
      const currentEval = buildCurrentTreatmentEval();
      setTreatmentEvalMap((prev) => ({
        ...prev,
        [selectedTreatment]: currentEval,
      }));
    }

    const validationError = validateMedEval();
    if (validationError) {
      setSaveStatus("error");
      setSaveMessage(validationError);
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage("");

      const finalPayload = {
        ...payload,
        annotation: {
          ...payload.annotation,
          treatmentEvalMap: {
            ...treatmentEvalMap,
            ...(selectedTreatment
              ? {
                  [selectedTreatment]: buildCurrentTreatmentEval(),
                }
              : {}),
          },
        },
      };

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalPayload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed with status ${res.status}`);
      }

      setSaveStatus("success");
      setSaveMessage("All treatments were completed and saved successfully.");

      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save med evaluation.");
    }
  }

  function handleReset() {
    setInterventionNote("");
    setSelectedTreatment(candidateTreatments[0] ?? "");
    setTiming("");
    setChoice("");
    setDose("");
    setOverallJudgment("");
    setRationale("");
    setTreatmentEvalMap({});
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 3: Evaluate whether related medication treatment was appropriate
          for the selected event.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock title="Task 1. What was the most important intervention and explain the reason?">
            <div className="mb-1 text-sm text-gray-600">
              For example medication, fluid, positioning, airway / ventilation
              adjustment, or observation only and explain the reason.
            </div>

            <textarea
              value={interventionNote}
              onChange={(e) => setInterventionNote(e.target.value)}
              className="min-h-[80px] w-full max-w-[520px] rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              placeholder="Fluid was more important than medication. Vasopressor was secondary because the hypotension was more consistent with reduced preload or relative hypovolemia, and restoring intravascular volume addressed the underlying cause more directly, while the vasopressor mainly provided temporary blood pressure support."
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={
                  recordingTarget === "intervention"
                    ? stopVoiceNote
                    : () => startVoiceNote("intervention")
                }
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  recordingTarget === "intervention"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recordingTarget === "intervention"
                  ? "Stop Recording"
                  : "Start Recording"}
              </button>
            </div>
          </TaskBlock>

          <TaskBlock title="Task 2. Select the treatment being evaluated">
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
              <span>Progress</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                {treatmentProgressLabel}
              </span>
              {currentTreatmentIndex >= 0 && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  current {currentTreatmentIndex + 1}/{candidateTreatments.length}
                </span>
              )}
            </div>

            {candidateTreatments.length === 0 ? (
              <div className="text-sm text-red-500">
                No medication found within this event window and the following 10
                minutes.
              </div>
            ) : (
              <select
                value={selectedTreatment}
                onChange={(e) => {
                  // 切换前先保存当前 treatment
                  if (selectedTreatment) {
                    persistCurrentTreatmentToMap(selectedTreatment);
                  }

                  const nextTreatment = e.target.value;
                  setSelectedTreatment(nextTreatment);
                  loadTreatmentFromMap(nextTreatment);
                }}
                className="w-full max-w-[720px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
              >
                <option value="">Select treatment</option>
                {candidateTreatments.map((item) => {
                  const done = isTreatmentEvalComplete(treatmentEvalMap[item]);
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

          <TaskBlock title="Task 3. Evaluate timing, treatment choice, dose, and overall judgment">
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Evaluate Timing
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RadioPill
                    label="Appropriate"
                    selected={timing === "Appropriate"}
                    selectedTone="green"
                    onClick={() => setTiming("Appropriate")}
                  />
                  <RadioPill
                    label="Delayed"
                    selected={timing === "Delayed"}
                    selectedTone="green"
                    onClick={() => setTiming("Delayed")}
                  />
                  <RadioPill
                    label="Too Early"
                    selected={timing === "Too Early"}
                    selectedTone="green"
                    onClick={() => setTiming("Too Early")}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Choice
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RadioPill
                    label="Appropriate"
                    selected={choice === "Appropriate"}
                    selectedTone="orange"
                    onClick={() => setChoice("Appropriate")}
                  />
                  <RadioPill
                    label="Suboptimal"
                    selected={choice === "Suboptimal"}
                    selectedTone="orange"
                    onClick={() => setChoice("Suboptimal")}
                  />
                  <RadioPill
                    label="Inappropriate"
                    selected={choice === "Inappropriate"}
                    selectedTone="orange"
                    onClick={() => setChoice("Inappropriate")}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Dose
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RadioPill
                    label="Too Low"
                    selected={dose === "Too Low"}
                    selectedTone="blue"
                    onClick={() => setDose("Too Low")}
                  />
                  <RadioPill
                    label="Reasonable"
                    selected={dose === "Reasonable"}
                    selectedTone="blue"
                    onClick={() => setDose("Reasonable")}
                  />
                  <RadioPill
                    label="Too High"
                    selected={dose === "Too High"}
                    selectedTone="blue"
                    onClick={() => setDose("Too High")}
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
                    setOverallJudgment(e.target.value as OverallJudgmentValue)
                  }
                  className="w-full max-w-[360px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  <option value="">Select overall judgment</option>
                  <option value="Appropriate">Appropriate</option>
                  <option value="Mostly Appropriate">Mostly Appropriate</option>
                  <option value="Mixed / Uncertain">Mixed / Uncertain</option>
                  <option value="Suboptimal">Suboptimal</option>
                  <option value="Inappropriate">Inappropriate</option>
                </select>
              </div>
            </div>
          </TaskBlock>

          <TaskBlock title="Task 4. Please explain your treatment evaluation" noBorder>
            <div className="mb-3 text-sm text-gray-600">
              Please provide rationale using waveform trends, timing,
              medications, and perioperative context.
            </div>

            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              placeholder="Describe the rationale for your medical treatment evaluation..."
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={
                  recordingTarget === "rationale"
                    ? stopVoiceNote
                    : () => startVoiceNote("rationale")
                }
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  recordingTarget === "rationale"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recordingTarget === "rationale"
                  ? "Stop Recording"
                  : "Start Recording"}
              </button>
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              All treatments must be completed before saving.
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (selectedTreatment) {
                    persistCurrentTreatmentToMap(selectedTreatment);
                    setSaveStatus("success");
                    setSaveMessage("Current treatment evaluation saved locally.");
                  }
                }}
                className="rounded-md border border-slate-500 bg-slate-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-600"
              >
                Save Current Treatment
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-gray-700 bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Reset All
              </button>

              <button
                type="button"
                onClick={handleSaveMedEval}
                disabled={saveStatus === "saving"}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  saveStatus === "saving"
                    ? "cursor-wait bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saveStatus === "saving"
                  ? "Saving..."
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