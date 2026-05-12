"use client";

import { useEffect, useRef, useState } from "react";
import type { ManagementEvent } from "@/lib/types_management";
import { submitAnnotation } from "@/lib/submit";

type Props = {
  caseId: string;
  managementEvent: ManagementEvent | null;
  patientIndex: number;
  patientId?: string;
  patientFolder?: string;
  anesthesiaStart?: string | null;
  onSaveSuccess?: () => void;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type QuestionTiming = {
  startedAt: string | null;
  firstInteractionAt: string | null;
  firstTypingAt: string | null;
  firstVoiceStartAt: string | null;
  submittedAt: string | null;
};

function makeEmptyQuestionTiming(nowIso?: string): QuestionTiming {
  return {
    startedAt: nowIso ?? null,
    firstInteractionAt: null,
    firstTypingAt: null,
    firstVoiceStartAt: null,
    submittedAt: null,
  };
}

function formatAbsoluteTime(time?: string) {
  if (!time) return "-";

  const normalized = String(time).replace(" ", "T");
  const dt = new Date(normalized);

  if (Number.isNaN(dt.getTime())) return time;

  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function formatAbsoluteTimeFromOffset(
  offsetMin?: number,
  anesthesiaStart?: string | null
) {
  if (!Number.isFinite(offsetMin) || !anesthesiaStart) return "-";

  const base = new Date(anesthesiaStart);
  if (Number.isNaN(base.getTime())) return "-";

  const dt = new Date(base.getTime() + Number(offsetMin) * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function getDisplayTime(
  managementEvent: ManagementEvent,
  anesthesiaStart?: string | null
) {
  if (managementEvent.start_time) {
    return formatAbsoluteTime(managementEvent.start_time);
  }

  return formatAbsoluteTimeFromOffset(managementEvent.time_min, anesthesiaStart);
}

function sanitizeFilePart(value: unknown) {
  return String(value ?? "unknown")
    .trim()
    .replace(/[^\w.-]/g, "_");
}

const MANAGEMENT_REASONING_PROMPT = {
  instruction:
    "Please interpret the highlighted medication event in the surrounding intraoperative context. Answer in the structured bullet format below.",
  requestedElements: [
    "1. Clinical purpose: What was the most likely clinical purpose of this medication event at this moment? For example, induction/emergence, anesthesia maintenance, analgesia or surgical stimulation, hemodynamic management, ventilation/airway management, neuromuscular blockade/reversal, prophylaxis/routine care, treatment of an abnormal event, or another purpose.",
    "2. Supporting context: What surrounding evidence supports your interpretation, including vital-sign trends, medication timing, nearby medications, ventilation or gas changes, procedural phase, or surgical context?",
    "3. Expected effect and observed response: What effect would be expected from this medication, and was the subsequent patient response consistent with that expectation?",
    "4. Uncertainty and alternatives: How confident are you in this interpretation? If uncertain, what alternative purposes, missing information, or reasonable alternative management should be considered?",
    "5. Counterfactual: What might have happened if this medication had not been given?",
  ],
};

export default function ManagementReasoningPanel({
  caseId,
  managementEvent,
  patientIndex,
  patientId,
  patientFolder,
  anesthesiaStart,
  onSaveSuccess,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [recording, setRecording] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const [openGuideSections, setOpenGuideSections] = useState({
    goal: false,
    instructions: false,
  });

  const [managementInstructionsOpen, setManagementInstructionsOpen] =
    useState(true);

  const recognitionRef = useRef<any>(null);
  const voiceBaseTextRef = useRef("");

  const pageOpenedAtRef = useRef<string | null>(null);
  const firstInteractionAtRef = useRef<string | null>(null);
  const firstTypingAtRef = useRef<string | null>(null);
  const firstVoiceStartAtRef = useRef<string | null>(null);

  const taskTimingRef = useRef<QuestionTiming>(makeEmptyQuestionTiming());

  useEffect(() => {
    const nowIso = new Date().toISOString();

    pageOpenedAtRef.current = nowIso;
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;

    taskTimingRef.current = makeEmptyQuestionTiming(nowIso);
  }, [caseId, managementEvent?.row_name, managementEvent?.time_min]);

  useEffect(() => {
    setAnswer("");
    setRecording(false);
    voiceBaseTextRef.current = "";
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
    setManagementInstructionsOpen(true);
  }, [
    managementEvent?.row_name,
    managementEvent?.time_min,
    managementEvent?.start_time,
  ]);

  function markTyping() {
    const nowIso = new Date().toISOString();

    if (!taskTimingRef.current.firstInteractionAt) {
      taskTimingRef.current.firstInteractionAt = nowIso;
    }

    if (!taskTimingRef.current.firstTypingAt) {
      taskTimingRef.current.firstTypingAt = nowIso;
    }

    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = nowIso;
    }

    if (!firstTypingAtRef.current) {
      firstTypingAtRef.current = nowIso;
    }
  }

  function markVoiceStart() {
    const nowIso = new Date().toISOString();

    if (!taskTimingRef.current.firstInteractionAt) {
      taskTimingRef.current.firstInteractionAt = nowIso;
    }

    if (!taskTimingRef.current.firstVoiceStartAt) {
      taskTimingRef.current.firstVoiceStartAt = nowIso;
    }

    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = nowIso;
    }

    if (!firstVoiceStartAtRef.current) {
      firstVoiceStartAtRef.current = nowIso;
    }
  }

  async function startVoiceNote() {
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

      markVoiceStart();
      voiceBaseTextRef.current = answer.trim();

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((result: any) => result[0].transcript)
          .join("")
          .trim();

        if (!transcript) return;

        const base = voiceBaseTextRef.current;
        setAnswer(base ? `${base}\n\n${transcript}` : transcript);
      };

      recognition.onerror = () => {
        setRecording(false);
        setSaveStatus("error");
        setSaveMessage("Speech recognition failed.");
      };

      recognition.onend = () => {
        setRecording(false);
        voiceBaseTextRef.current = "";
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecording(true);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      setRecording(false);
      voiceBaseTextRef.current = "";
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    setRecording(false);
    voiceBaseTextRef.current = "";
  }

  function validateBeforeSave() {
    if (!managementEvent) {
      return "No management event selected.";
    }

    const cleaned = answer.trim();

    if (!cleaned) {
      return "Please complete the management reasoning text before saving.";
    }

    return null;
  }

  async function handleSave() {
    const validationError = validateBeforeSave();

    if (validationError) {
      setSaveStatus("error");
      setSaveMessage(validationError);
      return;
    }

    if (!managementEvent) return;

    try {
      setSaveStatus("saving");
      setSaveMessage("");

      let participantInfo: any = {};

      try {
        const raw = localStorage.getItem("participantInfo");
        participantInfo = raw ? JSON.parse(raw) : {};
      } catch {
        participantInfo = {};
      }

      const doctorId =
        String(
          participantInfo?.doctorId ?? localStorage.getItem("doctorId") ?? ""
        ).trim() || null;

      const accessCode =
        String(
          participantInfo?.accessCode ??
            localStorage.getItem("doctorAccessCode") ??
            ""
        ).trim() || null;

      const submittedAt = new Date().toISOString();
      taskTimingRef.current.submittedAt = submittedAt;

      const managementEventId =
        sanitizeFilePart(
          (managementEvent as any).event_id ??
            `${managementEvent.row_name ?? "management"}_${
              managementEvent.time_min ?? "unknown"
            }`
        ) || "management_event_unknown";

      await submitAnnotation({
        doctorId,
        accessCode,

        caseId,
        patientId: patientId ?? patientFolder ?? null,
        patientFolder: patientFolder ?? patientId ?? null,

        eventId: managementEventId,
        episodeId: managementEventId,
        episodeFolder: managementEventId,

        panel: "management_reasoning_panel",
        action: "submit",
        task: "management_reasoning",

        pageOpenedAt: pageOpenedAtRef.current,
        firstInteractionAt: firstInteractionAtRef.current,
        firstTypingAt: firstTypingAtRef.current,
        firstVoiceStartAt: firstVoiceStartAtRef.current,
        submittedAt,

        answers: {
          patientIndex,
          managementEvent: {
            id: managementEventId,
            row_name: managementEvent.row_name ?? null,
            event_type: managementEvent.event_type ?? null,
            time_min: managementEvent.time_min ?? null,
            start_time: managementEvent.start_time ?? null,
            display_time: getDisplayTime(managementEvent, anesthesiaStart),
            dose: managementEvent.dose ?? null,
            unit: managementEvent.unit ?? null,
            route: managementEvent.route ?? null,
          },
          prompt: MANAGEMENT_REASONING_PROMPT,
          tasks: {
            medication_centered_management_reasoning: {
              question:
                "Please interpret this medication event using the requested structured bullet points.",
              answer: answer.trim(),
              timing: { ...taskTimingRef.current },
            },
          },
        },
      });

      setSaveStatus("success");
      setSaveMessage("Management reasoning saved successfully.");
      onSaveSuccess?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(error?.message || "Failed to save management reasoning.");
    }
  }

  if (!managementEvent) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="text-xl font-bold text-gray-900">
          Patient-level Panel: Management Reasoning
        </h3>
        <p className="mt-4 text-sm text-gray-500">
          No management event available.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-blue-900">
          <button
            type="button"
            onClick={() =>
              setOpenGuideSections((prev) => ({
                ...prev,
                goal: !prev.goal,
              }))
            }
            className="flex w-full items-center gap-3 border-b border-blue-100 bg-blue-100 px-4 py-3 text-left text-sm font-semibold text-blue-950"
          >
            <span className="text-xl font-bold leading-none text-blue-700">
              {openGuideSections.goal ? "▾" : "▸"}
            </span>
            <span>Goal of Annotation</span>
          </button>

          {openGuideSections.goal && (
            <div className="p-4 text-sm leading-6 text-blue-900">
              <p>
                The goal of this annotation is to interpret the highlighted
                medication event in the context of the surrounding intraoperative
                situation. The medication may reflect treatment of an abnormal
                event, routine/background care, anesthesia maintenance,
                analgesia, hemodynamic management, airway or ventilation
                management, prophylaxis, or another management purpose.
              </p>

              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>Patient physiology and vital sign changes.</li>
                <li>Surgical stimulus or procedural workflow.</li>
                <li>Transitions in anesthetic state.</li>
                <li>Nearby medications, fluids, gas, or ventilation changes.</li>
                <li>The likely downstream effect on the course of the case.</li>
                <li>Uncertainty or missing information if the purpose is unclear.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-blue-900">
          <button
            type="button"
            onClick={() =>
              setOpenGuideSections((prev) => ({
                ...prev,
                instructions: !prev.instructions,
              }))
            }
            className="flex w-full items-center gap-3 border-b border-blue-100 bg-blue-100 px-4 py-3 text-left text-sm font-semibold text-blue-950"
          >
            <span className="text-sm font-semibold text-rose-950">
              {openGuideSections.instructions ? "▾" : "▸"}
            </span>
            <span>Annotation Instructions</span>
          </button>

          {openGuideSections.instructions && (
            <ul className="list-disc space-y-2 p-4 pl-8 text-sm leading-6 text-blue-900">
              <li>
                The focused medication event has already been marked on the
                corresponding chart on the right.
              </li>
              <li>
                The surrounding context, including approximately 15 minutes
                around this event, has already been highlighted.
              </li>
              <li>
                Please focus your reasoning on this medication event and the
                highlighted surrounding context. You may refer to broader case
                context if needed.
              </li>
              <li>
                If the medication appears routine or the purpose is unclear, say
                so explicitly rather than forcing a specific explanation.
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border p-5">
        <div className="text-lg font-semibold text-gray-900">
          Focused medication event
        </div>

        <div className="mt-3 space-y-2 text-sm text-gray-800">
          <div>
            <span className="font-semibold text-gray-600">Medication:</span>{" "}
            {managementEvent.row_name || "-"}
          </div>

          <div>
            <span className="font-semibold text-gray-600">Time:</span>{" "}
            {getDisplayTime(managementEvent, anesthesiaStart)}
          </div>

          <div>
            <span className="font-semibold text-gray-600">Type:</span>{" "}
            {managementEvent.event_type || "-"}
          </div>

          {managementEvent.dose != null && (
            <div>
              <span className="font-semibold text-gray-600">Dose:</span>{" "}
              {managementEvent.dose} {managementEvent.unit ?? ""}
            </div>
          )}

          {managementEvent.route && (
            <div>
              <span className="font-semibold text-gray-600">Route:</span>{" "}
              {managementEvent.route}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-blue-900">
        <button
          type="button"
          onClick={() => setManagementInstructionsOpen((prev) => !prev)}
          className="flex w-full items-center gap-3 border-b border-blue-100 bg-blue-100 px-4 py-3 text-left text-sm font-semibold text-blue-950"
        >
          <span className="text-xl font-bold leading-none text-blue-700">
            {managementInstructionsOpen ? "▾" : "▸"}
          </span>
          <span>Task. Medication-centered management reasoning</span>
        </button>

        {managementInstructionsOpen && (
          <div className="p-4 text-sm leading-6 text-blue-900">
            <p className="mb-3 font-semibold text-blue-950">
              Please answer in the text box below using the following numbered
              points.
            </p>

            <ol className="ml-5 list-decimal space-y-2">
              <li>
                <strong>Clinical purpose:</strong> What was the most likely
                purpose of this medication event at this moment?
              </li>
              <li>
                <strong>Supporting context:</strong> What surrounding evidence
                supports your interpretation?
              </li>
              <li>
                <strong>Expected effect and observed response:</strong> What
                effect would be expected, and was the subsequent response
                consistent with that expectation?
              </li>
              <li>
                <strong>Uncertainty, alternatives, or missing information:</strong>{" "}
                How confident are you, and what else should be considered?
              </li>
              <li>
                <strong>Counterfactual:</strong> What might have happened if
                this medication had not been given?
              </li>
            </ol>
          </div>
        )}
      </div>

      <textarea
        value={answer}
        onChange={(e) => {
          markTyping();
          setAnswer(e.target.value);
        }}
        className="mt-4 h-80 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        placeholder="Write management reasoning here..."
      />

      <div className="mt-5 flex w-full flex-wrap items-center gap-3 border-t pt-5">
        <button
          type="button"
          onClick={recording ? stopVoiceNote : startVoiceNote}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
            recording
              ? "bg-red-500 hover:bg-red-600"
              : "bg-orange-500 hover:bg-orange-600"
          }`}
        >
          {recording ? "Stop Recording" : "Start Recording"}
        </button>

        <button
          type="button"
          onClick={() => {
            setAnswer("");
            voiceBaseTextRef.current = "";
            setRecording(false);
            recognitionRef.current?.stop?.();
            setSaveStatus("idle");
            setSaveMessage("");

            const nowIso = new Date().toISOString();
            firstInteractionAtRef.current = null;
            firstTypingAtRef.current = null;
            firstVoiceStartAtRef.current = null;
            taskTimingRef.current = makeEmptyQuestionTiming(nowIso);
          }}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
            saveStatus === "saving"
              ? "cursor-wait bg-blue-300"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {saveStatus === "saving" ? "Saving..." : "Save and Next"}
        </button>

        {saveMessage && (
          <div
            className={`ml-2 text-sm font-medium ${
              saveStatus === "success"
                ? "text-green-700"
                : saveStatus === "error"
                ? "text-red-700"
                : "text-gray-500"
            }`}
          >
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
}