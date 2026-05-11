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
type VoiceTarget = "answer1" | "answer2" | null;

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

export default function ManagementReasoningPanel({
  caseId,
  managementEvent,
  patientIndex,
  patientId,
  patientFolder,
  anesthesiaStart,
  onSaveSuccess,
}: Props) {
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [recordingTarget, setRecordingTarget] = useState<VoiceTarget>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const recognitionRef = useRef<any>(null);

  const pageOpenedAtRef = useRef<string | null>(null);
  const firstInteractionAtRef = useRef<string | null>(null);
  const firstTypingAtRef = useRef<string | null>(null);
  const firstVoiceStartAtRef = useRef<string | null>(null);

  const task1TimingRef = useRef<QuestionTiming>(makeEmptyQuestionTiming());
  const task2TimingRef = useRef<QuestionTiming>(makeEmptyQuestionTiming());

  useEffect(() => {
    const nowIso = new Date().toISOString();

    pageOpenedAtRef.current = nowIso;
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;

    task1TimingRef.current = makeEmptyQuestionTiming(nowIso);
    task2TimingRef.current = makeEmptyQuestionTiming(nowIso);
  }, [caseId, managementEvent?.row_name, managementEvent?.time_min]);

  useEffect(() => {
    setAnswer1("");
    setAnswer2("");
    setRecordingTarget(null);
    recognitionRef.current?.stop?.();
    setSaveStatus("idle");
    setSaveMessage("");
  }, [managementEvent?.row_name, managementEvent?.time_min, managementEvent?.start_time]);

  function markPageFirstInteraction() {
    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = new Date().toISOString();
    }
  }

  function markTyping(target: Exclude<VoiceTarget, null>) {
    const nowIso = new Date().toISOString();
    const ref = target === "answer1" ? task1TimingRef : task2TimingRef;

    if (!ref.current.firstInteractionAt) {
      ref.current.firstInteractionAt = nowIso;
    }
    if (!ref.current.firstTypingAt) {
      ref.current.firstTypingAt = nowIso;
    }

    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = nowIso;
    }
    if (!firstTypingAtRef.current) {
      firstTypingAtRef.current = nowIso;
    }
  }

  function markVoiceStart(target: Exclude<VoiceTarget, null>) {
    const nowIso = new Date().toISOString();
    const ref = target === "answer1" ? task1TimingRef : task2TimingRef;

    if (!ref.current.firstInteractionAt) {
      ref.current.firstInteractionAt = nowIso;
    }
    if (!ref.current.firstVoiceStartAt) {
      ref.current.firstVoiceStartAt = nowIso;
    }

    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = nowIso;
    }
    if (!firstVoiceStartAtRef.current) {
      firstVoiceStartAtRef.current = nowIso;
    }
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

      markVoiceStart(target);

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");

        if (target === "answer1") {
          setAnswer1(transcript);
        } else if (target === "answer2") {
          setAnswer2(transcript);
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

  function validateBeforeSave() {
    if (!managementEvent) {
      return "No management event selected.";
    }

    if (!answer1.trim()) {
      return "Task 1 incomplete: please answer why this intervention was given at this moment.";
    }

    if (!answer2.trim()) {
      return "Task 2 incomplete: please answer what might have happened if this intervention had not been given.";
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

      task1TimingRef.current.submittedAt = submittedAt;
      task2TimingRef.current.submittedAt = submittedAt;

      const managementEventId =
      sanitizeFilePart(
        (managementEvent as any).event_id ??
          `${managementEvent.row_name ?? "management"}_${managementEvent.time_min ?? "unknown"}`
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
          tasks: {
            task1_reason_for_intervention: {
              question: "Why was this intervention given at this moment?",
              answer: answer1.trim(),
              timing: { ...task1TimingRef.current },
            },
            task2_counterfactual: {
              question:
                "What might have happened if this intervention had not been given?",
              answer: answer2.trim(),
              timing: { ...task2TimingRef.current },
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
        Patient-level Panel: Management Reasoning
      </h3>

      <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-5">
        <div className="text-lg font-semibold text-amber-900">
          Goal of Annotation
        </div>

        <p className="mt-3 text-sm leading-6 text-amber-900">
          The goal of this annotation is to interpret the highlighted
          management event in the context of the surrounding intraoperative
          situation.
        </p>

        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
          <li>patient physiology and vital sign changes,</li>
          <li>surgical stimulus or procedural workflow,</li>
          <li>transitions in anesthetic state,</li>
          <li>other nearby interventions or strategy changes, and</li>
          <li>the likely downstream effect on the course of the case.</li>
          <li>Other important context you think is relevant to the annotation.</li>
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-[#c7d8ee] bg-[#eef4fb] p-5">
        <div className="text-lg font-semibold text-slate-900">
          Annotation Instructions
        </div>

        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
          <li>
            The focused management event has already been marked on the
            corresponding chart on the right.
          </li>
          <li>
            The surrounding context, including approximately 10 minutes before
            and 10 minutes after this event, has already been highlighted.
          </li>
          <li>
            Please focus your reasoning on this event and the highlighted
            surrounding context.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-2xl border p-5">
        <div className="text-lg font-semibold text-gray-900">
          Focused management event
        </div>

        <div className="mt-3 space-y-2 text-sm text-gray-800">
          <div>
            <span className="font-semibold text-gray-600">Event:</span>{" "}
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

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border p-5">
          <div className="text-base font-semibold text-gray-900">
            Task 1. Why was this intervention given at this moment?
          </div>

          <textarea
            value={answer1}
            onChange={(e) => {
              markTyping("answer1");
              setAnswer1(e.target.value);
            }}
            className="mt-4 h-40 w-full rounded-xl border px-4 py-3 text-sm text-gray-800 outline-none focus:border-orange-400"
            placeholder="Write your reasoning here..."
          />

          <div className="mt-4">
            <button
              type="button"
              onClick={() =>
                recordingTarget === "answer1"
                  ? stopVoiceNote()
                  : startVoiceNote("answer1")
              }
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                recordingTarget === "answer1"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-orange-400 hover:bg-orange-500"
              }`}
            >
              {recordingTarget === "answer1"
                ? "Stop Recording"
                : "Start Recording"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-base font-semibold text-gray-900">
            Task 2. What might have happened if this intervention had not been
            given?
          </div>

          <textarea
            value={answer2}
            onChange={(e) => {
              markTyping("answer2");
              setAnswer2(e.target.value);
            }}
            className="mt-4 h-40 w-full rounded-xl border px-4 py-3 text-sm text-gray-800 outline-none focus:border-orange-400"
            placeholder="Write your reasoning here..."
          />

          <div className="mt-4">
            <button
              type="button"
              onClick={() =>
                recordingTarget === "answer2"
                  ? stopVoiceNote()
                  : startVoiceNote("answer2")
              }
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                recordingTarget === "answer2"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-orange-400 hover:bg-orange-500"
              }`}
            >
              {recordingTarget === "answer2"
                ? "Stop Recording"
                : "Start Recording"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 border-t pt-6">
        <button
          type="button"
          onClick={() => {
            setAnswer1("");
            setAnswer2("");
            setRecordingTarget(null);
            recognitionRef.current?.stop?.();
            setSaveStatus("idle");
            setSaveMessage("");

            const nowIso = new Date().toISOString();
            firstInteractionAtRef.current = null;
            firstTypingAtRef.current = null;
            firstVoiceStartAtRef.current = null;
            task1TimingRef.current = makeEmptyQuestionTiming(nowIso);
            task2TimingRef.current = makeEmptyQuestionTiming(nowIso);
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