"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";

type SaveStatus = "idle" | "saving" | "success" | "error";
type VoiceTarget = "relevanceNote" | "responseNote" | null;

type MedicationInterventionPanelProps = {
  eventId?: string;
  caseId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  annotatorName?: string;
  onSaveAndNextStep?: () => void;
};

type InterventionChoice =
  | "Phenylephrine"
  | "Ephedrine"
  | "Epinephrine"
  | "Norepinephrine"
  | "Vasopressin"
  | "Fluid bolus"
  | "Blood product"
  | "Ventilation adjustment"
  | "Airway adjustment"
  | "Anesthetic adjustment"
  | "Positioning adjustment"
  | "Other";

const INTERVENTION_OPTIONS: InterventionChoice[] = [
  "Phenylephrine",
  "Ephedrine",
  "Epinephrine",
  "Norepinephrine",
  "Vasopressin",
  "Fluid bolus",
  "Blood product",
  "Ventilation adjustment",
  "Airway adjustment",
  "Anesthetic adjustment",
  "Positioning adjustment",
  "Other",
];

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
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? "border-orange-400 bg-orange-400 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-500"
      }`}
    >
      {label}
    </button>
  );
}

function formatMinute(min: number) {
  if (!Number.isFinite(min)) return "";
  return `${Math.round(min)} min`;
}

export default function MedicationInterventionPanel({
  eventId = "evt-1",
  caseId = "unknown_case",
  eventTitle = "Event",
  episodeLabel = "Episode 1",
  startMin = 0,
  endMin = 0,
  annotatorName,
  onSaveAndNextStep,
}: MedicationInterventionPanelProps) {
  const [selectedInterventions, setSelectedInterventions] = React.useState<
    InterventionChoice[]
  >([]);
  const [otherIntervention, setOtherIntervention] = React.useState("");
  const [relevanceNote, setRelevanceNote] = React.useState("");
  const [responseNote, setResponseNote] = React.useState("");

  const [recordingTarget, setRecordingTarget] =
    React.useState<VoiceTarget>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const panelOpenedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    panelOpenedAtRef.current = Date.now();
  }, [caseId, eventId]);

  const hasOther = selectedInterventions.includes("Other");

  function toggleIntervention(option: InterventionChoice) {
    setSelectedInterventions((prev) =>
      prev.includes(option)
        ? prev.filter((x) => x !== option)
        : [...prev, option]
    );
  }

  function validatePanel(): string | null {
    if (selectedInterventions.length === 0) {
      return "Task 1 incomplete: please select at least one relevant intervention.";
    }

    if (hasOther && !otherIntervention.trim()) {
      return "Task 1 incomplete: please specify the 'Other' intervention.";
    }

    if (!relevanceNote.trim()) {
      return "Task 2 incomplete: please explain why the selected intervention(s) are relevant.";
    }

    if (!responseNote.trim()) {
      return "Task 3 incomplete: please describe the patient response and any later adjustment.";
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
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "relevanceNote") setRelevanceNote(transcript);
        if (target === "responseNote") setResponseNote(transcript);
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
        panel: "medication_intervention_panel",
        action: "submit",
        panelOpenedAt: panelOpenedAtRef.current,
        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          selectedInterventions,
          otherIntervention: otherIntervention.trim(),
          relevanceNote: relevanceNote.trim(),
          responseNote: responseNote.trim(),
        },
      });

      setSaveStatus("success");
      setSaveMessage("Intervention annotation saved successfully.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save intervention annotation.");
    }
  }

  function handleReset() {
    setSelectedInterventions([]);
    setOtherIntervention("");
    setRelevanceNote("");
    setResponseNote("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">
          Panel: Medication / intervention interpretation.
        </div>

        <div className="overflow-hidden rounded-xl border">
          <TaskBlock
            title="Task 1. Select the intervention(s) that are relevant to this abnormal event."
            tooltip={
              <>
                <div className="font-semibold text-gray-800">How to answer</div>
                <div className="mt-1">
                  Select only the interventions that are clinically relevant to
                  this abnormal event.
                </div>
                <div className="mt-1">
                  These may include medication, fluid, blood product, airway,
                  ventilation, positioning, or anesthetic adjustment.
                </div>
              </>
            }
          >
            <div className="mb-3 text-sm text-gray-600">
              Episode window: {formatMinute(startMin)} – {formatMinute(endMin)}
            </div>

            <div className="flex flex-wrap gap-2">
              {INTERVENTION_OPTIONS.map((option) => (
                <OptionChip
                  key={option}
                  label={option}
                  selected={selectedInterventions.includes(option)}
                  onClick={() => toggleIntervention(option)}
                />
              ))}
            </div>

            {hasOther && (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Specify other intervention
                </div>
                <textarea
                  value={otherIntervention}
                  onChange={(e) => setOtherIntervention(e.target.value)}
                  className="min-h-[90px] w-full max-w-[520px] rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
                  placeholder="Please specify the other intervention."
                />
              </div>
            )}
          </TaskBlock>

          <TaskBlock
  title="Task 2. Explain why the selected intervention(s) are relevant to this abnormal event, and what clinical evidence supports that interpretation."
  tooltip={
    <>
      <div className="font-semibold text-gray-800">What to include</div>
      <div className="mt-1">
        Explain why each selected intervention is clinically relevant to the abnormal event.
      </div>
      <div className="mt-1">
        Describe what physiologic problem the clinician was likely trying to address.
      </div>
      <div className="mt-1">
        Include supporting evidence from the chart, such as hypotension, tachycardia, bleeding concern, hypoxia, ETCO2 change, airway difficulty, ventilation abnormality, or temporal alignment with the event.
      </div>
    </>
  }
>
  <textarea
    value={relevanceNote}
    onChange={(e) => setRelevanceNote(e.target.value)}
    className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
    placeholder="Explain why these interventions are relevant, what problem they were likely intended to address, and what clinical evidence supports that interpretation."
  />

  <div className="mt-3">
    <button
      type="button"
      onClick={
        recordingTarget === "relevanceNote"
          ? stopVoiceNote
          : () => startVoiceNote("relevanceNote")
      }
      className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
        recordingTarget === "relevanceNote"
          ? "bg-red-500 hover:bg-red-600"
          : "bg-orange-400 hover:bg-orange-500"
      }`}
    >
      {recordingTarget === "relevanceNote"
        ? "Stop Recording"
        : "Start Recording"}
    </button>
  </div>
</TaskBlock>

          <TaskBlock
            title="Task 3. Describe the patient response after these intervention(s), and whether any later adjustment was needed."
            tooltip={
              <>
                <div className="font-semibold text-gray-800">What to include</div>
                <div className="mt-1">
                  Describe how the patient’s physiology changed after the
                  intervention(s).
                </div>
                <div className="mt-1">
                  State whether the response suggests the intervention was
                  appropriate, insufficient, transiently effective, or
                  ineffective.
                </div>
                <div className="mt-1">
                  If the response was incomplete or poor, describe any further
                  intervention or adjustment.
                </div>
              </>
            }
          >
            <textarea
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              className="min-h-[140px] w-full rounded-md border px-3 py-3 text-base text-gray-800 outline-none focus:border-orange-400"
              placeholder="Describe what happened after the intervention(s), whether the response supported that choice, and whether the clinician made any later adjustment."
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={
                  recordingTarget === "responseNote"
                    ? stopVoiceNote
                    : () => startVoiceNote("responseNote")
                }
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  recordingTarget === "responseNote"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-orange-400 hover:bg-orange-500"
                }`}
              >
                {recordingTarget === "responseNote"
                  ? "Stop Recording"
                  : "Start Recording"}
              </button>
            </div>
          </TaskBlock>

          <div className="border-t px-4 py-4">
            <div className="mb-3 text-sm text-gray-500">
              Complete all required tasks before saving.
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