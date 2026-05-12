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
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type QuestionTiming = {
  startedAt: string | null;
  firstInteractionAt: string | null;
  firstTypingAt: string | null;
  firstVoiceStartAt: string | null;
  submittedAt: string | null;
};

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

function makeEmptyQuestionTiming(nowIso?: string): QuestionTiming {
  return {
    startedAt: nowIso ?? null,
    firstInteractionAt: null,
    firstTypingAt: null,
    firstVoiceStartAt: null,
    submittedAt: null,
  };
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
}: SummaryPanelProps) {
  const [summaryText, setSummaryText] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const recognitionRef = React.useRef<any>(null);
  const voiceBaseTextRef = React.useRef("");

  const pageOpenedAtRef = React.useRef<string | null>(null);
  const firstInteractionAtRef = React.useRef<string | null>(null);
  const firstTypingAtRef = React.useRef<string | null>(null);
  const firstVoiceStartAtRef = React.useRef<string | null>(null);

  const summaryTimingRef = React.useRef<QuestionTiming>(
    makeEmptyQuestionTiming()
  );

  React.useEffect(() => {
    const nowIso = new Date().toISOString();

    pageOpenedAtRef.current = nowIso;
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    voiceBaseTextRef.current = "";

    summaryTimingRef.current = makeEmptyQuestionTiming(nowIso);
  }, [caseId, eventId]);

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

  function markPageFirstInteraction(nowIso?: string) {
    const t = nowIso ?? new Date().toISOString();

    if (!firstInteractionAtRef.current) {
      firstInteractionAtRef.current = t;
    }
  }

  function markSummaryFirstInteraction(nowIso?: string) {
    const t = nowIso ?? new Date().toISOString();

    if (!summaryTimingRef.current.firstInteractionAt) {
      summaryTimingRef.current.firstInteractionAt = t;
    }

    markPageFirstInteraction(t);
  }

  function markSummaryTyping() {
    const nowIso = new Date().toISOString();

    markSummaryFirstInteraction(nowIso);

    if (!summaryTimingRef.current.firstTypingAt) {
      summaryTimingRef.current.firstTypingAt = nowIso;
    }

    if (!firstTypingAtRef.current) {
      firstTypingAtRef.current = nowIso;
    }
  }

  function markSummaryVoiceStart() {
    const nowIso = new Date().toISOString();

    markSummaryFirstInteraction(nowIso);

    if (!summaryTimingRef.current.firstVoiceStartAt) {
      summaryTimingRef.current.firstVoiceStartAt = nowIso;
    }

    if (!firstVoiceStartAtRef.current) {
      firstVoiceStartAtRef.current = nowIso;
    }
  }

  async function startVoiceNote() {
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

        if (transcript.length > 0) {
          markSummaryFirstInteraction();
        }

        const base = voiceBaseTextRef.current;
        const nextText = base ? `${base} ${transcript}` : transcript;
        setSummaryText(nextText);
      };

      recognition.onerror = () => {
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
      };

      markSummaryVoiceStart();

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

  async function handleSaveSummary() {
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

      recognitionRef.current?.stop?.();
      setRecording(false);

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
      summaryTimingRef.current.submittedAt = submittedAt;

      await submitAnnotation({
        annotator:
          annotatorName || annotatorEmail
            ? { name: annotatorName, email: annotatorEmail }
            : undefined,

        participantInfo: {
          name: participantInfo?.name ?? annotatorName ?? undefined,
          email: participantInfo?.email ?? annotatorEmail ?? undefined,
          doctorId: doctorId ?? undefined,
          accessCode: accessCode ?? undefined,
        },

        doctorId,
        accessCode,
        patientId,
        patientFolder: patientId,

        caseId,
        eventId,
        episodeId: "patient-summary",

        panel: "summary_panel",
        action: "submit",

        pageOpenedAt: pageOpenedAtRef.current,
        firstInteractionAt: firstInteractionAtRef.current,
        firstTypingAt: firstTypingAtRef.current,
        firstVoiceStartAt: firstVoiceStartAtRef.current,
        submittedAt,

        panelOpenedAt: pageOpenedAtRef.current,
        clickedAt: submittedAt,

        answers: {
          eventTitle,
          episodeLabel,
          startMin,
          endMin,
          summaryText: summaryText.trim(),
          prompt: {
            instruction: SUMMARY_INSTRUCTION,
            exampleSummary: EXAMPLE_SUMMARY,
          },
          tasks: {
            task1_overall_summary: {
              question: SUMMARY_INSTRUCTION,
              answer: summaryText.trim(),
              timing: { ...summaryTimingRef.current },
            },
          },
        },
      });

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
    if (saveStatus === "saving") return;

    setSummaryText("");
    setRecording(false);
    recognitionRef.current?.stop?.();
    voiceBaseTextRef.current = "";
    setSaveStatus("idle");
    setSaveMessage("");

    const nowIso = new Date().toISOString();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    summaryTimingRef.current = makeEmptyQuestionTiming(nowIso);
  }

  return (
    <div className="bg-white">
      <div className="p-3">
        <div className="mb-3 text-sm font-semibold text-gray-900">
          Patient-level Panel 1: Overall Intraoperative Summary
        </div>

        <CollapsibleInstructionPanel
          title="Annotation Instructions"
          defaultOpen={false}
        >
          <div className="space-y-3">
            <p>
              Imagine that you are reconstructing this patient’s intraoperative
              anesthetic course for another anesthesia provider who wants to
              understand what happened during the case.
            </p>

            <p>
            Make sure to cover topics such as overall anesthetic approach, notable pertinent positive and negative events, interesting observations or interventions, and red flags. Comment on observations and management during key events such as induction of anesthesia, intubation, emergence, extubation. Discuss periods of stability and dynamic changes. The receiving provider should be able to fully understand the patient’s intraoperative trajectory and key details from your report. 
            </p>

            <div className="pt-2 font-semibold text-blue-950">
              Please make sure to include:
            </div>

            <ol className="ml-5 list-decimal space-y-2">
              <li>
                <strong>Overall anesthetic approach:</strong> Describe the
                overall anesthetic strategy, such as TIVA, volatile anesthesia,
                regional/adjunctive techniques, or transitions between
                approaches.
              </li>

              <li>
                <strong>Key time-anchored events:</strong> Anchor important
                events to specific HH:MM time references when available. Comment
                on key phases such as premedication, induction, intubation,
                maintenance, incision/surgical stimulation, emergence, reversal,
                and extubation.
              </li>

              <li>
                <strong>Clinically meaningful observations:</strong> Describe
                notable pertinent positive and negative events, including
                abnormal or interesting vital sign changes, periods of stability,
                dynamic changes, and important negative findings such as stable
                oxygenation or absence of major hemodynamic instability.
              </li>

              <li>
                <strong>Interventions and clinical interpretation:</strong> Do
                not simply list vital signs or medications. Connect key
                observations and interventions to their likely clinical context,
                purpose, and patient response. Explain why an event may have
                occurred, why an intervention may have been performed, and how
                the patient responded.
              </li>

              <li>
                <strong>Uncertainty and ambiguity:</strong> Use uncertainty
                language when appropriate, such as “likely,” “possibly,” “the
                timing suggests,” “it appears,” or “the indication is unclear.”
              </li>

              <li>
                <strong>Overall impression and red flags:</strong> End with an
                overall assessment of the patient’s intraoperative course,
                including hemodynamic and respiratory stability, red flags, and
                any details that would be important for another anesthesia
                provider to know.
              </li>
            </ol>
          </div>
        </CollapsibleInstructionPanel>

        <CollapsibleInstructionPanel title="Example Summary" defaultOpen={false}>
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
          disabled={saveStatus === "saving"}
          onChange={(e) => {
            markSummaryTyping();
            setSummaryText(e.target.value);
          }}
          className="min-h-[260px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-orange-400 disabled:cursor-not-allowed disabled:bg-gray-100"
          placeholder="Write the overall patient-level intraoperative summary here..."
        />

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={saveStatus === "saving"}
            onClick={recording ? stopVoiceNote : startVoiceNote}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
              saveStatus === "saving"
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
            disabled={saveStatus === "saving"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              saveStatus === "saving"
                ? "cursor-not-allowed bg-gray-400"
                : "border border-gray-700 bg-gray-700 hover:bg-gray-800"
            }`}
          >
            Reset All
          </button>

          <button
            type="button"
            onClick={handleSaveSummary}
            disabled={saveStatus === "saving"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              saveStatus === "saving"
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