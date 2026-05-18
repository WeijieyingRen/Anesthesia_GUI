"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";

type PreventionChoice = "Yes" | "No" | "Unclear" | "";
type PreventionFailureReason =
  | "Too late"
  | "Insufficient"
  | "Wrong target"
  | "Transient effect only"
  | "Ongoing deterioration despite treatment"
  | "Mixed / unclear"
  | "";

type VoiceTarget = "failureNote" | "unclearNote" | null;
type SaveStatus = "idle" | "saving" | "success" | "error";

type PreventionPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

function TaskBlock({
  title,
  children,
  noBorder = false,
  tooltip,
}: {
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className={`${noBorder ? "" : "border-b"} px-4 py-4`}>
      <div className="mb-3 flex items-center text-sm font-semibold text-gray-900">
        <span>{title}</span>
        {tooltip ? <InfoTooltip content={tooltip} /> : null}
      </div>
      {children}
    </div>
  );
}

function InfoTooltip({ content }: { content: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className="relative ml-2 inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-500 hover:border-orange-300 hover:text-orange-500"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-white p-3 text-xs leading-5 text-gray-600 shadow-lg">
          {content}
        </div>
      )}
    </div>
  );
}

function OptionChip({
  label,
  selected = false,
  onClick,
  tone = "orange",
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  tone?: "orange" | "blue";
}) {
  const selectedClass =
    tone === "blue"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-orange-400 bg-orange-400 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? selectedClass
          : "border-gray-300 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-500"
      }`}
    >
      {label}
    </button>
  );
}

export default function PreventionPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "MAP Drop",
  episodeLabel = "Episode 1",
  startMin = 0,
  endMin = 0,
  annotatorName,
  onSaveAndNextStep,
}: PreventionPanelProps) {
  const [preventionChoice, setPreventionChoice] =
    React.useState<PreventionChoice>("");
  const [failureReason, setFailureReason] =
    React.useState<PreventionFailureReason>("");
  const [failureNote, setFailureNote] = React.useState("");
  const [unclearNote, setUnclearNote] = React.useState("");

  const [recordingTarget, setRecordingTarget] =
    React.useState<VoiceTarget>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const panelOpenedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  React.useEffect(() => {
    if (preventionChoice !== "Yes") {
      setFailureReason("");
      setFailureNote("");
      if (recordingTarget === "failureNote") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
    if (preventionChoice !== "Unclear") {
      setUnclearNote("");
      if (recordingTarget === "unclearNote") {
        recognitionRef.current?.stop?.();
        setRecordingTarget(null);
      }
    }
  }, [preventionChoice, recordingTarget]);

  function validatePanel(): string | null {
    if (preventionChoice === "") {
      return "Task 1 incomplete: please choose Yes, No, or Unclear.";
    }

    if (preventionChoice === "Yes" && failureReason === "") {
      return "Task 2 incomplete: please select why the patient still progressed despite the preventive action.";
    }

    if (preventionChoice === "Unclear" && !unclearNote.trim()) {
      return "Task 3 incomplete: please describe what information is missing or unclear.";
    }

    return null;
  }

  async function startVoiceNote(target: Exclude<VoiceTarget, null>) {
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
      recognition.lang = ((typeof localStorage !== "undefined" && localStorage.getItem("speechRecognitionLanguage")) || (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hi") ? "hi-IN" : "en-US"));
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "failureNote") setFailureNote(transcript);
        if (target === "unclearNote") setUnclearNote(transcript);
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

  async function handleSave() {
    const validationError = validatePanel();
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
        panel: "prevention_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          preventionChoice,
          failureReason,
          failureNote: failureNote.trim(),
          unclearNote: unclearNote.trim(),
        },
      });

      setSaveStatus("success");
      setSaveMessage("Pre-event prevention annotation saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save prevention annotation.");
    }
  }

  function handleReset() {
    setPreventionChoice("");
    setFailureReason("");
    setFailureNote("");
    setUnclearNote("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel 2: Pre-event prevention.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock
            title="Task 1. Before this abnormal event, was there any apparent preventive action intended to avoid or mitigate deterioration?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">How to answer</div>
                <div className="mt-1">
                  Answer based on the visible charted actions and surrounding clinical context.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Yes</span> if there appears to have been an action aimed at preventing or mitigating deterioration before the event fully developed.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">No</span> if no such preventive action is apparent.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Unclear</span> if the intent or timing cannot be determined confidently.
                </div>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <OptionChip
                label="Yes"
                selected={preventionChoice === "Yes"}
                onClick={() => setPreventionChoice("Yes")}
              />
              <OptionChip
                label="No"
                selected={preventionChoice === "No"}
                onClick={() => setPreventionChoice("No")}
              />
              <OptionChip
                label="Unclear"
                selected={preventionChoice === "Unclear"}
                onClick={() => setPreventionChoice("Unclear")}
              />
            </div>
          </TaskBlock>

          {preventionChoice === "Yes" && (
            <TaskBlock
              title="Task 2. Why do you think the patient still progressed despite the preventive action?"
              tooltip={
                <>
                  <div className="font-semibold text-gray-800">What this asks</div>
                  <div className="mt-1">
                    This is not asking whether the action existed, but why it may not have prevented deterioration.
                  </div>
                </>
              }
            >
              <div className="flex flex-wrap gap-2">
                {[
                  "Too late",
                  "Insufficient",
                  "Wrong target",
                  "Transient effect only",
                  "Ongoing deterioration despite treatment",
                  "Mixed / unclear",
                ].map((reason) => (
                  <OptionChip
                    key={reason}
                    label={reason}
                    selected={failureReason === reason}
                    onClick={() =>
                      setFailureReason(reason as PreventionFailureReason)
                    }
                    tone="blue"
                  />
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Optional note
                </div>
                <textarea
                  value={failureNote}
                  onChange={(e) => setFailureNote(e.target.value)}
                  className="min-h-[100px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Briefly explain if needed."
                />

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={
                      recordingTarget === "failureNote"
                        ? stopVoiceNote
                        : () => startVoiceNote("failureNote")
                    }
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      recordingTarget === "failureNote"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-orange-400 hover:bg-orange-500"
                    }`}
                  >
                    {recordingTarget === "failureNote"
                      ? "Stop Recording"
                      : "Start Recording"}
                  </button>
                </div>
              </div>
            </TaskBlock>
          )}

          {preventionChoice === "Unclear" && (
            <TaskBlock
              title="Task 3. What information is missing or unclear?"
              tooltip={
                <>
                  <div className="font-semibold text-gray-800">Examples</div>
                  <div className="mt-1">
                    Missing timing, dose, undocumented clinical intent, missing physiologic signals, or incomplete charting.
                  </div>
                </>
              }
            >
              <textarea
                value={unclearNote}
                onChange={(e) => setUnclearNote(e.target.value)}
                className="min-h-[120px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                placeholder="Describe what information is missing or unclear."
              />

              <div className="mt-3">
                <button
                  type="button"
                  onClick={
                    recordingTarget === "unclearNote"
                      ? stopVoiceNote
                      : () => startVoiceNote("unclearNote")
                  }
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                    recordingTarget === "unclearNote"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-orange-400 hover:bg-orange-500"
                  }`}
                >
                  {recordingTarget === "unclearNote"
                    ? "Stop Recording"
                    : "Start Recording"}
                </button>
              </div>
            </TaskBlock>
          )}

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              Complete the required task(s) before saving.
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
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className={`rounded-md px-4 py-2.5 text-sm font-medium text-white ${
                  saveStatus === "saving"
                    ? "cursor-wait bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saveStatus === "saving" ? "Saving..." : "Save & Next Step"}
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