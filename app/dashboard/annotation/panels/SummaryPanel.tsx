"use client";

import * as React from "react";
import { submitAnnotation } from "@/lib/submit";

type SummaryPanelProps = {
  eventId?: string;
  caseId?: string;
  patientId?: string;
  eventTitle?: string;
  episodeLabel?: string;
  startMin?: number;
  endMin?: number;
  annotatorName?: string;
  annotatorEmail?: string;
  onSaveAndNextStep?: () => void;
  readOnly?: boolean;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

const SUMMARY_INSTRUCTION = `Imagine that you are reconstructing this patient’s intraoperative anesthetic course for another anesthesia provider who wants to understand what happened during the case.

Produce a detailed, chronological summary of the patient’s anesthetic course such that the receiving provider can confidently understand the patient’s intraoperative trajectory and key clinical details.

Make sure to cover topics such as overall anesthetic approach, notable pertinent positive and negative events, interesting observations or interventions, and red flags. Comment on observations and management during key events such as induction of anesthesia, intubation, maintenance, emergence, and extubation. Discuss periods of stability and dynamic changes.

Do not simply list vital signs or medications. Connect key observations and interventions to their likely clinical context, purpose, and patient response.

Anchor key events to specific time references using HH:MM format.`;

const EXAMPLE_SUMMARY = `They got midazolam 2mg for premedication around 07:15. They had one isolated elevated BP of 160/101 at 07:13. It looks like they were induced with fentanyl, then propofol and rocuronium around 07:28. The blood pressure of 146/109 at 07:33 is likely stimulation with intubation, but overall the intubation was relatively hemodynamically stable.

They were started on a propofol drip at 150 around 07:37. They had one slightly lower blood pressure of 117/78 at 07:47, likely during the quiet period of the case where anesthesia had been induced but the incision had not yet been made, so there was no surgical stimulation. They got decadron 8mg around 07:37, likely for postoperative nausea/vomiting prophylaxis.

Their blood pressure increased a bit with incision to 145/98, but overall they stayed pretty hemodynamically stable throughout this part of the case. It looks like they also got methadone, a total of 10mg, given as two boluses of 5mg toward the beginning of the case, likely for postoperative pain control.

They got labetalol 10mg around 08:10, which was likely because they had a BP of 149/85 at 08:06, and their blood pressure had been slightly elevated before that in the 130s-140s/70s-80s, though the reading immediately before the labetalol administration was actually fine at 122/65 at 08:08.

They were re-paralyzed with 20mg of rocuronium at 08:23, likely to maintain paralysis during the case. Maintenance of anesthesia was largely with propofol as TIVA for the entire case, although sevoflurane was turned on at a low level initially at the beginning of the case; it looks like the provider changed their mind and decided to run this as a TIVA. After steady state was achieved, the propofol was reduced to 125 mcg/kg/min around 08:18 and further weaned to 100 and then 60 at 08:54, then turned off shortly thereafter.

They remained hemodynamically stable with blood pressure on the lower side, in the 90s-100s/40s-50s, throughout the remainder of the case after the labetalol until extubation. Around 09:05, they were given 4mg zofran, likely for PONV prophylaxis, and 200mg of sugammadex for reversal of rocuronium immediately before extubation. They were then extubated around 09:12 and had one slightly elevated BP reading of 146/92 around that time, likely related to stimulation of extubation. Their oxygen saturation remained stable throughout the case at 97-100%.`;

function roundSec(ms: number) {
  return Number((ms / 1000).toFixed(3));
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function getLocalTimestamp() {
  const date = new Date();
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMin);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMinutes = String(absOffset % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);

  return `${local}${sign}${offsetHours}:${offsetMinutes}`;
}

function draftKey(patientId: string, caseId: string) {
  return `annotationDraft:summary:${patientId}:${caseId}`;
}

function revisionKey(patientId: string, caseId: string) {
  return `annotationRevision:summary:${patientId}:${caseId}`;
}

function nextRevisionNumber(patientId: string, caseId: string) {
  try {
    const key = revisionKey(patientId, caseId);
    const next = Number(localStorage.getItem(key) ?? "0") + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return null;
  }
}

function CollapsibleInstructionPanel({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-blue-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 border-b border-blue-100 bg-blue-100 px-4 py-3 text-left text-sm font-semibold text-blue-950"
      >
        <span className="text-xl font-bold leading-none text-blue-700">
          {open ? "▾" : "▸"}
        </span>
        <span>{title}</span>
      </button>

      {open && (
        <div className="p-4 text-sm leading-6 text-blue-900">{children}</div>
      )}
    </div>
  );
}

export default function SummaryPanel({
  eventId = "patient-summary",
  caseId = "unknown_case",
  patientId = "unknown_patient",
  eventTitle = "Patient-level Summary",
  episodeLabel = "Patient",
  startMin = 0,
  endMin = 0,
  annotatorName,
  annotatorEmail,
  onSaveAndNextStep,
  readOnly = false,
}: SummaryPanelProps) {
  const [summaryText, setSummaryText] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const voiceBaseTextRef = React.useRef("");

  const startedAtUtcRef = React.useRef<string | null>(null);
  const startedAtLocalRef = React.useRef<string | null>(null);

  const typingStartMsRef = React.useRef<number | null>(null);
  const typingDurationMsRef = React.useRef<number>(0);

  const voiceStartMsRef = React.useRef<number | null>(null);
  const voiceDurationMsRef = React.useRef<number>(0);

  React.useEffect(() => {
    startedAtUtcRef.current = new Date().toISOString();
    startedAtLocalRef.current = getLocalTimestamp();

    typingStartMsRef.current = null;
    typingDurationMsRef.current = 0;

    voiceStartMsRef.current = null;
    voiceDurationMsRef.current = 0;

    voiceBaseTextRef.current = "";

    try {
      setSummaryText(localStorage.getItem(draftKey(patientId, caseId)) ?? "");
    } catch {
      setSummaryText("");
    }
  }, [caseId, eventId, patientId]);

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus !== "saving") return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveStatus]);

  function startTypingTimer() {
    if (typingStartMsRef.current !== null) return;
    typingStartMsRef.current = performance.now();
  }

  function stopTypingTimer() {
    if (typingStartMsRef.current === null) return;

    typingDurationMsRef.current += performance.now() - typingStartMsRef.current;
    typingStartMsRef.current = null;
  }

  function startVoiceTimer() {
    if (voiceStartMsRef.current !== null) return;
    voiceStartMsRef.current = performance.now();
  }

  function stopVoiceTimer() {
    if (voiceStartMsRef.current === null) return;

    voiceDurationMsRef.current += performance.now() - voiceStartMsRef.current;
    voiceStartMsRef.current = null;
  }

  async function startVoiceNote() {
    if (readOnly) return;
    if (saveStatus === "saving") return;

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
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      voiceBaseTextRef.current = summaryText.trim();

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("")
          .trim();

        if (!transcript) return;

        const base = voiceBaseTextRef.current;
        const nextText = base ? `${base} ${transcript}` : transcript;
        setSummaryText(nextText);
      };

      recognition.onerror = () => {
        stopVoiceTimer();
        setRecording(false);
      };

      recognition.onend = () => {
        stopVoiceTimer();
        setRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;

      startVoiceTimer();
      setRecording(true);
      setSaveStatus("idle");
      setSaveMessage("");
    } catch {
      stopVoiceTimer();
      setRecording(false);
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    stopVoiceTimer();
    setRecording(false);
  }

  async function handleSaveSummary() {
    if (readOnly) {
      setSaveStatus("error");
      setSaveMessage("This submitted case is locked for review.");
      return;
    }

    if (!summaryText.trim()) {
      setSaveStatus("error");
      setSaveMessage("Please provide the patient-level summary.");
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveMessage(
        "Saving to cloud storage... Please wait and do not close the page."
      );

      stopTypingTimer();
      stopVoiceNote();

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

      const doctorName =
        String(participantInfo?.name ?? annotatorName ?? "").trim() || null;

      const submittedAtUtc = new Date().toISOString();
      const submittedAtLocal = getLocalTimestamp();
      const startedAtUtc = startedAtUtcRef.current ?? submittedAtUtc;
      const startedAtLocal = startedAtLocalRef.current ?? submittedAtLocal;

      const totalDurationSec = Number(
        (
          (new Date(submittedAtUtc).getTime() -
            new Date(startedAtUtc).getTime()) /
          1000
        ).toFixed(3)
      );

      const typingDurationSec = roundSec(typingDurationMsRef.current);
      const voiceDurationSec = roundSec(voiceDurationMsRef.current);
      const localTimezone = getBrowserTimezone();
      const revisionNumber = nextRevisionNumber(patientId, caseId);

      await submitAnnotation({
        doctorId,
        accessCode,
        patientId,
        patientFolder: patientId,

        caseId,
        eventId,
        episodeId: "patient-summary",

        panel: "summary_panel",
        pageOpenedAt: startedAtUtc,
        pageOpenedAtLocal: startedAtLocal,
        submittedAt: submittedAtUtc,
        submittedAtLocal,
        totalDurationSec,
        typingDurationSec,
        voiceDurationSec,
        localTimezone,
        revisionNumber,

        participantInfo: {
          name: doctorName ?? undefined,
          email: participantInfo?.email ?? annotatorEmail ?? undefined,
          doctorId: doctorId ?? undefined,
          accessCode: accessCode ?? undefined,
        },

        answers: {
          summaryText: summaryText.trim(),
        },
      });

      try {
        localStorage.setItem(draftKey(patientId, caseId), summaryText.trim());
        localStorage.setItem(
          `annotationResult:summary:${patientId}:${caseId}`,
          JSON.stringify({
            summaryText: summaryText.trim(),
            revisionNumber,
          })
        );
      } catch {
        // ignore
      }

      setSaveStatus("success");
      setSaveMessage("Summary saved successfully to cloud storage.");
      onSaveAndNextStep?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(
        error?.message ||
          "Failed to save summary to cloud storage. Please click Save again."
      );
    }
  }

  function handleReset() {
    if (readOnly) return;
    if (saveStatus === "saving") return;

    setSummaryText("");
    setRecording(false);
    recognitionRef.current?.stop?.();
    voiceBaseTextRef.current = "";

    setSaveStatus("idle");
    setSaveMessage("");

    startedAtUtcRef.current = new Date().toISOString();
    startedAtLocalRef.current = getLocalTimestamp();

    typingStartMsRef.current = null;
    typingDurationMsRef.current = 0;

    voiceStartMsRef.current = null;
    voiceDurationMsRef.current = 0;
  }

  return (
    <div className="bg-white">
      <div className="p-3">
        <div className="mb-3 text-sm font-semibold text-gray-900">
          Task 1: Overall Intraoperative Summary
        </div>

        <CollapsibleInstructionPanel
          title="Annotation Instructions"
          defaultOpen={false}
        >
          <div className="space-y-3">
            <p>
              Please provide a detailed summary of the patient’s anesthetic
              course in narrative form. Make sure to cover topics such as
              overall anesthetic approach, notable events such as abnormal vital
              signs, and interventions such as medications, as well as why they
              were given or why doses were changed. Comment on observations and
              management during key events such as induction of anesthesia,
              intubation, emergence, and extubation. Discuss periods of
              stability and dynamic changes. Anchor each event or intervention
              to specific time references using HH:MM format.
            </p>
          </div>
        </CollapsibleInstructionPanel>

        <CollapsibleInstructionPanel title="Example" defaultOpen={false}>
          <div className="space-y-3">
            <p className="whitespace-pre-line rounded-lg border border-blue-100 bg-white p-3 text-gray-800">
              {EXAMPLE_SUMMARY}
            </p>
          </div>
        </CollapsibleInstructionPanel>

        <CollapsibleInstructionPanel
          title="FAQ / Common Questions"
          defaultOpen={false}
        >
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-blue-950">
                Should I write a short handoff note?
              </p>
              <p>
                No. Please write a detailed intraoperative course summary. The
                goal is to reconstruct what happened during the case, not to
                produce a brief sign-out.
              </p>
            </div>

            <div>
              <p className="font-semibold text-blue-950">
                Should I only list medications and vital signs?
              </p>
              <p>
                No. Please explain the likely clinical context and purpose. For
                example, mention whether a blood pressure change may be related
                to intubation, incision, anesthetic depth, medication effect, or
                emergence.
              </p>
            </div>

            <div>
              <p className="font-semibold text-blue-950">
                Should I mention normal or stable findings?
              </p>
              <p>
                Yes, if they are clinically meaningful. For example, stable
                oxygen saturation, absence of major hemodynamic instability, or
                stable response after an intervention can be important.
              </p>
            </div>

            <div>
              <p className="font-semibold text-blue-950">
                What if I am not sure why something happened?
              </p>
              <p>
                Use uncertainty language such as “likely,” “possibly,” “the
                timing suggests,” “it appears,” or “the indication is unclear.”
              </p>
            </div>
          </div>
        </CollapsibleInstructionPanel>

        <textarea
          value={summaryText}
          disabled={readOnly || saveStatus === "saving"}
          onFocus={startTypingTimer}
          onBlur={stopTypingTimer}
          onChange={(e) => {
            if (readOnly) return;
            startTypingTimer();
            try {
              localStorage.setItem(draftKey(patientId, caseId), e.target.value);
            } catch {
              // ignore
            }
            setSummaryText(e.target.value);
          }}
          className="min-h-[260px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-orange-400 disabled:cursor-not-allowed disabled:bg-gray-100"
          placeholder="Write the overall patient-level intraoperative summary here..."
        />

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={readOnly || saveStatus === "saving"}
            onClick={recording ? stopVoiceNote : startVoiceNote}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
              readOnly || saveStatus === "saving"
                ? "cursor-not-allowed bg-gray-400"
                : recording
                ? "bg-red-500 hover:bg-red-600"
                : "bg-orange-400 hover:bg-orange-500"
            }`}
          >
            {recording ? "Stop Recording" : "Start Recording"}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={readOnly || saveStatus === "saving"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              readOnly || saveStatus === "saving"
                ? "cursor-not-allowed bg-gray-400"
                : "border border-gray-700 bg-gray-700 hover:bg-gray-800"
            }`}
          >
            Reset All
          </button>

          <button
            type="button"
            onClick={handleSaveSummary}
            disabled={readOnly || saveStatus === "saving"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              readOnly || saveStatus === "saving"
                ? "cursor-wait bg-blue-300"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saveStatus === "saving" ? "Saving..." : "Save and Next"}
          </button>
        </div>

        {saveMessage && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
              saveStatus === "success"
                ? "bg-green-50 text-green-700"
                : saveStatus === "saving"
                ? "bg-blue-50 text-blue-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
}
