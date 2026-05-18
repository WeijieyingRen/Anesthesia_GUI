"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";
import type { DetectVital } from "../types";

type SaveStatus = "idle" | "saving" | "success" | "error";
type PreventedChoice = "Yes" | "No" | "Uncertain" | "";

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type PreventedEpisodePanelProps = {
  caseId?: string;
  eventId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  anesthesiaStart?: string | null;
  annotatorName?: string;
  selectedVital: DetectVital;
  onChangeSelectedVital: (vital: DetectVital) => void;
  selectedWindow: SelectedWindow | null;
  onSaveAndNextStep?: () => void;
};

const VITAL_OPTIONS: DetectVital[] = [
  "MAP",
  "HR",
  "SPO2",
  "RR",
  "ETCO2",
  "TEMP",
];

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

  const hoverClass =
    tone === "blue"
      ? "hover:border-blue-300 hover:text-blue-600"
      : "hover:border-orange-300 hover:text-orange-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? selectedClass
          : `border-gray-300 bg-white text-gray-700 ${hoverClass}`
      }`}
    >
      {label}
    </button>
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
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-white p-3 text-xs leading-5 text-gray-600 shadow-lg">
          {content}
        </div>
      )}
    </div>
  );
}

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

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero || !Number.isFinite(offsetMin)) return `${offsetMin} min`;

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return `${offsetMin} min`;

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function PreventedEpisodePanel({
  caseId = "unknown_case",
  eventId = "patient-prevented-episode",
  eventTitle = "Prevented Episode",
  episodeLabel = "Patient-level prevented episode",
  anesthesiaStart = null,
  annotatorName,
  selectedVital,
  onChangeSelectedVital,
  selectedWindow,
  onSaveAndNextStep,
}: PreventedEpisodePanelProps) {
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");
  const [choice, setChoice] = React.useState<PreventedChoice>("");
  const [description, setDescription] = React.useState("");
  const [recordingDescription, setRecordingDescription] = React.useState(false);

  const panelOpenedAtRef = React.useRef<number | null>(null);
  const recognitionRef = React.useRef<any>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  React.useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  const requiresWindow = choice === "Yes" || choice === "Uncertain";

  function validate(): string | null {
    if (choice === "") {
      return "Task 1 incomplete: please choose Yes, No, or Uncertain.";
    }

    if (requiresWindow) {
      if (!selectedVital) {
        return "Please select the primary vital.";
      }

      if (!selectedWindow) {
        return "Please mark the corresponding window on the right timeline.";
      }

      if (!description.trim()) {
        return "Task 2 incomplete: please describe what happened.";
      }
    }

    return null;
  }

  async function handleSave() {
    const validationError = validate();
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
        panel: "prevented_episode_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          preventedEpisodeExists: choice,
          vital: requiresWindow ? selectedVital : null,
          startMin: requiresWindow ? selectedWindow?.startMin ?? null : null,
          endMin: requiresWindow ? selectedWindow?.endMin ?? null : null,
          description: description.trim(),
        },
      });

      setSaveStatus("success");
      setSaveMessage("Prevented episode annotation saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save prevented episode annotation.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    setRecordingDescription(false);
  }

  async function startDescriptionVoiceNote() {
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
        setDescription(transcript);
      };

      recognition.onerror = () => {
        setRecordingDescription(false);
      };

      recognition.onend = () => {
        setRecordingDescription(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecordingDescription(true);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      setRecordingDescription(false);
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function handleReset() {
    recognitionRef.current?.stop?.();
    setRecordingDescription(false);
    setChoice("");
    setDescription("");
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[560px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Patient-level Panel: Prevented Episode
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock
            title="Task 1. Was there any abnormal trend that was corrected by intervention before progressing into a major abnormal episode?"
            tooltip={
              <>
                <div className="font-semibold text-gray-800">How to answer</div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Yes</span> if there was a clinically concerning abnormal trend that appeared to be corrected by intervention before developing into a major adverse episode.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">No</span> if no such prevented episode is evident.
                </div>
                <div className="mt-1">
                  Choose <span className="font-semibold">Uncertain</span> if you cannot determine this confidently from the available data.
                </div>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <OptionChip
                label="Yes"
                selected={choice === "Yes"}
                onClick={() => setChoice("Yes")}
              />
              <OptionChip
                label="No"
                selected={choice === "No"}
                onClick={() => setChoice("No")}
              />
              <OptionChip
                label="Uncertain"
                selected={choice === "Uncertain"}
                onClick={() => setChoice("Uncertain")}
              />
            </div>
          </TaskBlock>

          {requiresWindow && (
            <TaskBlock
              title="Select the primary vital and mark the corresponding window on the right timeline."
              tooltip={
                <>
                  <div className="font-semibold text-gray-800">How to use</div>
                  <div className="mt-1">First select the primary vital below.</div>
                  <div className="mt-1">
                    Then use the right-side timeline to mark the time window for the prevented episode.
                  </div>
                </>
              }
            >
              <div className="flex flex-wrap gap-2">
                {VITAL_OPTIONS.map((vital) => (
                  <OptionChip
                    key={vital}
                    label={vital}
                    selected={selectedVital === vital}
                    onClick={() => onChangeSelectedVital(vital)}
                    tone="blue"
                  />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[110px_90px_90px]">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Vital
                  </div>
                  <input
                    value={selectedVital}
                    readOnly
                    className="w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                  />
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Start
                  </div>
                  <input
                    value={
                      selectedWindow
                        ? formatClockTime(selectedWindow.startMin, anesthesiaStart)
                        : "-"
                    }
                    readOnly
                    className="w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                  />
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    End
                  </div>
                  <input
                    value={
                      selectedWindow
                        ? formatClockTime(selectedWindow.endMin, anesthesiaStart)
                        : "-"
                    }
                    readOnly
                    className="w-full rounded-md border bg-gray-50 px-3 py-2 text-base text-gray-800 outline-none"
                  />
                </div>
              </div>
            </TaskBlock>
          )}

          {requiresWindow && (
            <TaskBlock
              title="Task 2. Describe which intervention(s) were taken to correct or prevent the episode."
              tooltip={
                <>
                  <div className="font-semibold text-gray-800">What to include</div>
                  <div className="mt-1">
                    Briefly describe the concerning abnormal trend, the intervention, and why you believe the episode was corrected or prevented.
                  </div>
                  {choice === "Uncertain" && (
                    <div className="mt-1">
                      If uncertain, explain what makes the interpretation unclear.
                    </div>
                  )}
                </>
              }
              noBorder
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                placeholder={
                  choice === "Yes"
                    ? "Example: MAP showed a gradual downward trend, but improved after vasopressor administration before progressing into sustained hypotension."
                    : "Describe the abnormal trend and explain why it is uncertain whether this episode was prevented."
                }
              />

              <div className="mt-3">
                <button
                  type="button"
                  onClick={
                    recordingDescription
                      ? stopVoiceNote
                      : startDescriptionVoiceNote
                  }
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                    recordingDescription
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-orange-400 hover:bg-orange-500"
                  }`}
                >
                  {recordingDescription ? "Stop Recording" : "Start Recording"}
                </button>
              </div>
            </TaskBlock>
          )}

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              Complete the required fields before saving.
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
                {saveStatus === "saving" ? "Saving..." : "Save"}
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