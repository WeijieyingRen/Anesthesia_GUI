"use client";

import * as React from "react";

type FluidEvalPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  fluidInRows?: any[];
  fluidOutRows?: any[];
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

type FluidEval = {
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

function cleanText(v: any) {
  return String(v ?? "").trim();
}

function normalizeFluidName(item: any) {
  return (
    cleanText(item?.fluid_name) ||
    cleanText(item?.output_name) ||
    cleanText(item?.concept_name) ||
    cleanText(item?.name) ||
    "Unknown fluid"
  );
}

function formatDose(item: any) {
  const dose = item?.dose;
  const unit = cleanText(item?.unit);

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

function normalizeRoute(item: any) {
  return cleanText(item?.route).toLowerCase();
}

function inferFluidType(item: any): "input-bolus" | "input-infusion" | "output" {
  const unit = cleanText(item?.unit).toLowerCase();
  const ioType = Number(item?.io_type);

  if (ioType === 2) return "output";
  if (unit.includes("/hr")) return "input-infusion";
  return "input-bolus";
}

function buildFluidCandidateLabel(item: any) {
  const type = inferFluidType(item);
  const name = normalizeFluidName(item);
  const doseText = formatDose(item);

  const timeText =
    formatAbsoluteTime(item?.start_time) ||
    formatAbsoluteTime(item?.observation_time) ||
    formatAbsoluteTime(item?.end_time);

  const relStart =
    item?.relative_anesthesia_start ??
    item?.relative_anesthesia_time ??
    item?.relative_anesthesia_end;

  const relEnd = item?.relative_anesthesia_end;

  const route = cleanText(item?.route);

  let typeText = "";
  if (type === "input-bolus") typeText = "input bolus";
  if (type === "input-infusion") typeText = "input infusion";
  if (type === "output") typeText = "output";

  if (type === "input-infusion") {
    const relRange =
      Number.isFinite(Number(relStart)) && Number.isFinite(Number(relEnd))
        ? `${Math.round(Number(relStart))}-${Math.round(Number(relEnd))} min`
        : Number.isFinite(Number(relStart))
        ? `${Math.round(Number(relStart))} min`
        : "";

    const absRange =
      cleanText(item?.start_time) && cleanText(item?.end_time)
        ? `${formatAbsoluteTime(item?.start_time)}-${formatAbsoluteTime(item?.end_time)}`
        : "";

    const rangeText = absRange || relRange;

    return `${name} [${typeText}]${rangeText ? ` @ ${rangeText}` : ""}${
      doseText ? ` (${doseText})` : ""
    }${route ? ` [${route}]` : ""}`;
  }

  const singleTime =
    timeText ||
    (Number.isFinite(Number(relStart)) ? `${Math.round(Number(relStart))} min` : "");

  return `${name} [${typeText}]${singleTime ? ` @ ${singleTime}` : ""}${
    doseText ? ` (${doseText})` : ""
  }${route ? ` [${route}]` : ""}`;
}

function extractFluidsFromWindow(
  fluidInRows: any[] = [],
  fluidOutRows: any[] = [],
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

  // 1) fluid input rows
  for (const item of fluidInRows ?? []) {
    const type = inferFluidType(item);

    if (type === "input-infusion") {
      const s = Number(item?.relative_anesthesia_start);
      const e = Number(item?.relative_anesthesia_end);

      if (!Number.isFinite(s)) continue;
      const safeEnd = Number.isFinite(e) ? e : s;

      const overlaps = safeEnd >= windowStart && s <= windowEnd;
      if (!overlaps) continue;

      pushLabel(buildFluidCandidateLabel(item));
    } else {
      const t =
        Number(item?.relative_anesthesia_start) ??
        Number(item?.relative_anesthesia_time);

      if (!Number.isFinite(t)) continue;
      if (t < windowStart || t > windowEnd) continue;

      pushLabel(buildFluidCandidateLabel(item));
    }
  }

  // 2) fluid output rows
  for (const item of fluidOutRows ?? []) {
    const t =
      Number(item?.relative_anesthesia_start) ??
      Number(item?.relative_anesthesia_time);

    if (!Number.isFinite(t)) continue;
    if (t < windowStart || t > windowEnd) continue;

    pushLabel(buildFluidCandidateLabel(item));
  }

  console.log("[FluidEval] window =", {
    startMin: windowStart,
    endMin,
    windowEndWithBuffer: windowEnd,
  });
  console.log("[FluidEval] candidates =", results);

  return results;
}

function isFluidEvalComplete(evalItem?: FluidEval | null) {
  if (!evalItem) return false;
  return Boolean(
    evalItem.timing &&
      evalItem.choice &&
      evalItem.dose &&
      evalItem.overallJudgment &&
      evalItem.rationale?.trim()
  );
}

export default function FluidEvalPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 84,
  endMin = 102,
  fluidInRows = [],
  fluidOutRows = [],
  onSaveAndNextStep,
}: FluidEvalPanelProps) {
  const candidateFluids = React.useMemo(() => {
    return extractFluidsFromWindow(fluidInRows, fluidOutRows, startMin, endMin);
  }, [fluidInRows, fluidOutRows, startMin, endMin]);
  const noFluidCaptured = candidateFluids.length === 0;
  const [fluidPriorityNote, setFluidPriorityNote] = React.useState("");
  const [selectedFluid, setSelectedFluid] = React.useState("");

  const [timing, setTiming] = React.useState<TimingValue>("");
  const [choice, setChoice] = React.useState<ChoiceValue>("");
  const [dose, setDose] = React.useState<DoseValue>("");
  const [overallJudgment, setOverallJudgment] =
    React.useState<OverallJudgmentValue>("");
  const [rationale, setRationale] = React.useState("");

  const [fluidEvalMap, setFluidEvalMap] = React.useState<Record<string, FluidEval>>(
    {}
  );

  const [recordingTarget, setRecordingTarget] = React.useState<
    "priority" | "rationale" | null
  >(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);

  function buildCurrentFluidEval(): FluidEval {
    return {
      timing,
      choice,
      dose,
      overallJudgment,
      rationale,
    };
  }

  function persistCurrentFluidToMap(targetFluid?: string) {
    const fluidKey = targetFluid ?? selectedFluid;
    if (!fluidKey) return;

    setFluidEvalMap((prev) => ({
      ...prev,
      [fluidKey]: buildCurrentFluidEval(),
    }));
  }

  function loadFluidFromMap(fluidKey: string) {
    const saved = fluidEvalMap[fluidKey];

    setTiming(saved?.timing ?? "");
    setChoice(saved?.choice ?? "");
    setDose(saved?.dose ?? "");
    setOverallJudgment(saved?.overallJudgment ?? "");
    setRationale(saved?.rationale ?? "");
  }

  React.useEffect(() => {
    if (candidateFluids.length === 0) {
      setSelectedFluid("");
      setTiming("");
      setChoice("");
      setDose("");
      setOverallJudgment("");
      setRationale("");
      return;
    }

    setSelectedFluid((prev) => {
      const next =
        prev && candidateFluids.includes(prev) ? prev : candidateFluids[0];

      const saved = fluidEvalMap[next];
      setTiming(saved?.timing ?? "");
      setChoice(saved?.choice ?? "");
      setDose(saved?.dose ?? "");
      setOverallJudgment(saved?.overallJudgment ?? "");
      setRationale(saved?.rationale ?? "");

      return next;
    });
  }, [candidateFluids]);

  const completedFluidCount = React.useMemo(() => {
    return candidateFluids.filter((t) => isFluidEvalComplete(fluidEvalMap[t])).length;
  }, [candidateFluids, fluidEvalMap]);

  const currentFluidIndex = selectedFluid
    ? Math.max(0, candidateFluids.findIndex((item) => item === selectedFluid))
    : -1;

  const progressLabel =
    candidateFluids.length > 0
      ? `${completedFluidCount}/${candidateFluids.length} completed`
      : "0/0";

      function validateFluidEval() {
        if (noFluidCaptured) {
          return null;
        }
      
        if (!fluidPriorityNote.trim()) {
          return "Task 1 incomplete: please explain whether fluid intervention was needed and why.";
        }
      
        const mergedMap: Record<string, FluidEval> = {
          ...fluidEvalMap,
        };
      
        if (selectedFluid) {
          mergedMap[selectedFluid] = buildCurrentFluidEval();
        }
      
        const unfinished = candidateFluids.filter(
          (fluid) => !isFluidEvalComplete(mergedMap[fluid])
        );
      
        if (unfinished.length > 0) {
          return `You must complete all fluid evaluations before saving. Remaining: ${unfinished.length}.`;
        }
      
        return null;
      }


  async function startVoiceNote(target: "priority" | "rationale") {
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

        if (target === "priority") {
          setFluidPriorityNote(transcript);
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
      task: "fluidEval",
      caseId,
      eventId,
      eventTitle,
      episodeLabel,
      annotation: {
        startMin,
        endMin,
        fluidPriorityNote,
        selectedFluid,
        candidateFluids,
        fluidEvalMap,
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
      fluidPriorityNote,
      selectedFluid,
      candidateFluids,
      fluidEvalMap,
    ]
  );

  async function handleSaveFluidEval() {
    if (!noFluidCaptured && selectedFluid) {
      const currentEval = buildCurrentFluidEval();
      setFluidEvalMap((prev) => ({
        ...prev,
        [selectedFluid]: currentEval,
      }));
    }
  
    const validationError = validateFluidEval();
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
          skipped: noFluidCaptured,
          skipReason: noFluidCaptured
            ? "No fluid event captured within current window and following 10 minutes."
            : "",
          fluidEvalMap: noFluidCaptured
            ? {}
            : {
                ...fluidEvalMap,
                ...(selectedFluid
                  ? {
                      [selectedFluid]: buildCurrentFluidEval(),
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
      setSaveMessage(
        noFluidCaptured
          ? "No related fluid event was captured. Skipped and moved to next step."
          : "All fluid evaluations were completed and saved successfully."
      );
  
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save fluid evaluation.");
    }
  }

  function handleReset() {
    setFluidPriorityNote("");
    setSelectedFluid(candidateFluids[0] ?? "");
    setTiming("");
    setChoice("");
    setDose("");
    setOverallJudgment("");
    setRationale("");
    setFluidEvalMap({});
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 5: Evaluate whether related fluid treatment was appropriate for the
          selected event.
          {noFluidCaptured
            ? " No related fluid event was captured, so this panel can be skipped."
            : ""}
        </div>
  
        <div className="overflow-hidden rounded-xl border">
          {/* 上半部分：有 fluid 才可编辑；没抓到就整体灰掉 */}
          <div className={noFluidCaptured ? "opacity-50 pointer-events-none" : ""}>
            <TaskBlock title="Task 1. Was fluid intervention important for this event? Please explain.">
              <div className="mb-1 text-sm text-gray-600">
                {noFluidCaptured
                  ? "No related fluid event was captured in the current window and the following 10 minutes."
                  : "Consider whether fluid treatment was needed, whether it addressed the likely mechanism, and whether it was more important than medication or other interventions."}
              </div>
  
              <textarea
                value={fluidPriorityNote}
                onChange={(e) => setFluidPriorityNote(e.target.value)}
                className="min-h-[80px] w-full max-w-[520px] rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                placeholder="Fluid was important because the hypotension appeared more consistent with reduced preload or relative hypovolemia. Volume support addressed the likely cause more directly..."
              />
  
              <div className="mt-3">
                <button
                  type="button"
                  onClick={
                    recordingTarget === "priority"
                      ? stopVoiceNote
                      : () => startVoiceNote("priority")
                  }
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                    recordingTarget === "priority"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-orange-400 hover:bg-orange-500"
                  }`}
                >
                  {recordingTarget === "priority"
                    ? "Stop Recording"
                    : "Start Recording"}
                </button>
              </div>
            </TaskBlock>
  
            <TaskBlock title="Task 2. Select the fluid event being evaluated">
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
                <span>Progress</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                  {progressLabel}
                </span>
                {currentFluidIndex >= 0 && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    current {currentFluidIndex + 1}/{candidateFluids.length}
                  </span>
                )}
              </div>
  
              {candidateFluids.length === 0 ? (
                <div className="text-sm text-red-500">
                  No fluid event found within this event window and the following 10 minutes.
                </div>
              ) : (
                <select
                  value={selectedFluid}
                  onChange={(e) => {
                    if (selectedFluid) {
                      persistCurrentFluidToMap(selectedFluid);
                    }
  
                    const nextFluid = e.target.value;
                    setSelectedFluid(nextFluid);
                    loadFluidFromMap(nextFluid);
                  }}
                  className="w-full max-w-[720px] rounded-md border px-3 py-2 text-base text-gray-800 outline-none focus:border-orange-400"
                >
                  <option value="">Select fluid</option>
                  {candidateFluids.map((item) => {
                    const done = isFluidEvalComplete(fluidEvalMap[item]);
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
                    Dose / Amount
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
  
            <TaskBlock title="Task 4. Please explain your fluid evaluation" noBorder>
              <div className="mb-3 text-sm text-gray-600">
                Please provide rationale using vital trends, timing, fluid type,
                amount, rate, route, and perioperative context.
              </div>
  
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                placeholder="Describe the rationale for your fluid treatment evaluation..."
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
          </div>
  
          {/* 底部按钮区：始终可点击，所以放在灰掉区域外面 */}
          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              {noFluidCaptured
                ? "No fluid event was captured. You can skip this panel directly."
                : "All fluid events must be completed before saving."}
            </div>
  
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={noFluidCaptured}
                onClick={() => {
                  if (selectedFluid) {
                    persistCurrentFluidToMap(selectedFluid);
                    setSaveStatus("success");
                    setSaveMessage("Current fluid evaluation saved locally.");
                  }
                }}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  noFluidCaptured
                    ? "cursor-not-allowed bg-gray-300"
                    : "border border-slate-500 bg-slate-500 hover:bg-slate-600"
                }`}
              >
                Save Current Fluid
              </button>
  
              <button
                type="button"
                disabled={noFluidCaptured}
                onClick={handleReset}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  noFluidCaptured
                    ? "cursor-not-allowed bg-gray-300"
                    : "border border-gray-700 bg-gray-700 hover:bg-gray-800"
                }`}
              >
                Reset All
              </button>
  
              <button
                type="button"
                onClick={handleSaveFluidEval}
                disabled={saveStatus === "saving"}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  saveStatus === "saving"
                    ? "cursor-wait bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saveStatus === "saving"
                  ? "Saving..."
                  : noFluidCaptured
                  ? "Skip & Next Step"
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