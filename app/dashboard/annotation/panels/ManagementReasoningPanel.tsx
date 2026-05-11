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

const DEFAULT_ANSWER_TEMPLATE = `1. Clinical purpose:


2. Supporting context:


3. Expected effect and observed response:


4. Uncertainty, alternatives, or missing information:


5. Counterfactual if the medication had not been given:

`;

export default function ManagementReasoningPanel({
  caseId,
  managementEvent,
  patientIndex,
  patientId,
  patientFolder,
  anesthesiaStart,
  onSaveSuccess,
}: Props) {
  const [answer, setAnswer] = useState(DEFAULT_ANSWER_TEMPLATE);
  const [recording, setRecording] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [openGuideSections, setOpenGuideSections] = useState({
    goal: false,
    instructions: false,
  });

  const recognitionRef = useRef<any>(null);

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
    setAnswer(DEFAULT_ANSWER_TEMPLATE);
    setRecording(false);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
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

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        setAnswer((prev) => {
          const trimmedPrev = prev.trim();
          if (!trimmedPrev || trimmedPrev === DEFAULT_ANSWER_TEMPLATE.trim()) {
            return transcript;
          }
          return `${prev}\n${transcript}`;
        });
      };

      recognition.onerror = () => {
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecording(true);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      setRecording(false);
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    setRecording(false);
  }

  function validateBeforeSave() {
    if (!managementEvent) {
      return "No management event selected.";
    }

    const cleaned = answer.trim();
    const templateOnly = cleaned === DEFAULT_ANSWER_TEMPLATE.trim();

    if (!cleaned || templateOnly) {
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
      <h3 className="text-xl font-bold text-gray-900">
        Patient-level Panel: Medication-Centered Management Reasoning
      </h3>

      <div className="mt-6 space-y-2">
        <div className="overflow-hidden rounded-lg border border-blue-200 bg-blue-50">
          <button
            type="button"
            onClick={() =>
              setOpenGuideSections((prev) => ({
                ...prev,
                goal: !prev.goal,
              }))
            }
            className="flex w-full items-center gap-3 bg-blue-100 px-4 py-3 text-left"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xl font-bold text-blue-700">
              {openGuideSections.goal ? "▾" : "▸"}
            </span>
            <span className="text-sm font-semibold text-blue-950">
              Goal of Annotation
            </span>
          </button>

          {openGuideSections.goal && (
            <div className="border-t border-blue-200 bg-blue-50 px-4 py-4">
              <p className="text-sm leading-6 text-blue-900">
                The goal of this annotation is to interpret the highlighted
                medication event in the context of the surrounding intraoperative
                situation. The medication may reflect treatment of an abnormal
                event, routine/background care, anesthesia maintenance,
                analgesia, hemodynamic management, airway or ventilation
                management, prophylaxis, or another management purpose.
              </p>

              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-blue-900">
                <li>patient physiology and vital sign changes,</li>
                <li>surgical stimulus or procedural workflow,</li>
                <li>transitions in anesthetic state,</li>
                <li>nearby medications, fluids, gas, or ventilation changes,</li>
                <li>the likely downstream effect on the course of the case, and</li>
                <li>uncertainty or missing information if the purpose is unclear.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-rose-200 bg-rose-50">
          <button
            type="button"
            onClick={() =>
              setOpenGuideSections((prev) => ({
                ...prev,
                instructions: !prev.instructions,
              }))
            }
            className="flex w-full items-center gap-3 bg-rose-100 px-4 py-3 text-left"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xl font-bold text-rose-700">
              {openGuideSections.instructions ? "▾" : "▸"}
            </span>
            <span className="text-sm font-semibold text-rose-950">
              Annotation Instructions
            </span>
          </button>

          {openGuideSections.instructions && (
            <ul className="border-t border-rose-200 bg-rose-50 px-8 py-4 list-disc space-y-2 text-sm leading-6 text-rose-900">
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

      <div className="mt-6 rounded-2xl border p-5">
        <div className="text-base font-semibold text-gray-900">
          Task. Medication-centered management reasoning
        </div>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          Please answer in the text box below using the following numbered
          points.
        </p>

        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-700">
          <li>
            <span className="font-semibold">Clinical purpose:</span> What was
            the most likely purpose of this medication event at this moment?
          </li>
          <li>
            <span className="font-semibold">Supporting context:</span> What
            surrounding evidence supports your interpretation?
          </li>
          <li>
            <span className="font-semibold">
              Expected effect and observed response:
            </span>{" "}
            What effect would be expected, and was the subsequent response
            consistent with that expectation?
          </li>
          <li>
            <span className="font-semibold">
              Uncertainty, alternatives, or missing information:
            </span>{" "}
            How confident are you, and what else should be considered?
          </li>
          <li>
            <span className="font-semibold">Counterfactual:</span> What might
            have happened if this medication had not been given?
          </li>
        </ol>

        <textarea
          value={answer}
          onChange={(e) => {
            markTyping();
            setAnswer(e.target.value);
          }}
          className="mt-4 h-80 w-full rounded-xl border px-4 py-3 font-mono text-sm text-gray-800 outline-none focus:border-orange-400"
          placeholder={DEFAULT_ANSWER_TEMPLATE}
        />

        <div className="mt-4">
          <button
            type="button"
            onClick={() => (recording ? stopVoiceNote() : startVoiceNote())}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
              recording
                ? "bg-red-500 hover:bg-red-600"
                : "bg-orange-400 hover:bg-orange-500"
            }`}
          >
            {recording ? "Stop Recording" : "Start Recording"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 border-t pt-6">
        <button
          type="button"
          onClick={() => {
            setAnswer(DEFAULT_ANSWER_TEMPLATE);
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
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Reset All
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
          {saveStatus === "saving" ? "Saving..." : "Save"}
        </button>
      </div>

      {saveMessage && (
        <div
          className={`mt-4 rounded-md px-3 py-2 text-sm font-medium ${
            saveStatus === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {saveMessage}
        </div>
      )}
    </div>
  );
}