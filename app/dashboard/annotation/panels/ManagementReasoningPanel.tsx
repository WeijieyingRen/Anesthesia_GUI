"use client";

import { useEffect, useRef, useState } from "react";
import type { ManagementEvent } from "@/lib/types_management";
import { submitAnnotation } from "@/lib/submit";
import { getSpeechRecognitionLanguage } from "@/lib/speech-language";

type Props = {
  caseId: string;
  managementEvent: ManagementEvent | null;
  patientIndex: number;
  patientId?: string;
  patientFolder?: string;
  anesthesiaStart?: string | null;
  onSaveSuccess?: () => void;
  readOnly?: boolean;
};

type SaveStatus = "idle" | "saving" | "success" | "error";

type QuestionTiming = {
  startedAt: string | null;
  firstInteractionAt: string | null;
  firstTypingAt: string | null;
  firstVoiceStartAt: string | null;
  submittedAt: string | null;
};

const EXAMPLE_MANAGEMENT_SUMMARY_1 = `This phenylephrine bolus was most likely given to treat a downward drift in blood pressure. The surrounding context supports this because the patient had decreasing blood pressure and had required nearby boluses. The expected effect was an increase in vascular tone and blood pressure, and the blood pressure did improve afterward (from 90s/40s to 100s/50s), suggesting an appropriate response. If this bolus had not been given, the patient may have remained hypotensive or continued to drift lower, depending on anesthetic depth, volume status, and surgical stimulation. One alternative would have been to lighten the anesthetic or administer pain medication, but this would require information on how deeply anesthetized the patient was and would have only been an acceptable alternative if the provider felt that the patient was too deeply anesthetized or had inadequate pain control and was responding to surgical stimulation..`;

const EXAMPLE_MANAGEMENT_SUMMARY_2 = `This propofol decrease was most likely part of emergence planning near the end of the case. The supporting context is that it occurred toward the end of the procedure, when the provider was likely lightening the anesthetic to prepare the patient for wake-up and extubation. The expected effect would be for the patient to become less deeply anesthetized and wake up more quickly once the case was over. An alternative would have been to wait until later to reduce the propofol, depending on the expected remaining surgical time and the patient’s anesthetic depth.`;

const MANAGEMENT_REASONING_PROMPT = {
  instruction:
    "Interpret the highlighted medication/gas event in the context of the surrounding intraoperative course. Focus on its likely clinical purpose, supporting evidence, expected effect, observed patient response, counterfactual implication, and uncertainty if the indication is unclear.",
  requestedElements: [
    "1. Clinical purpose: What was the most likely clinical purpose of this medication/gas event at this moment?",
    "2. Supporting context: What surrounding evidence supports your interpretation, including vital-sign trends, medication timing, nearby medications, fluids, gas or ventilation changes, surgical stimulus, procedural workflow, or transitions in anesthetic state?",
    "3. Expected effect and observed response: What effect was expected, and did the patient appear to respond as expected?",
    "4. Counterfactual: If clinically relevant, what might have happened if this medication/gas event had not occurred?",
    "5. Uncertainty and alternatives: If the purpose is unclear, what alternative explanations, missing information, or reasonable alternative management possibilities should be considered?",
  ],
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

function draftKey(patientId: string | undefined, caseId: string) {
  return `annotationDraft:management_reasoning:${patientId ?? "unknown_patient"}:${caseId}`;
}

function revisionKey(patientId: string | undefined, caseId: string) {
  return `annotationRevision:management_reasoning:${patientId ?? "unknown_patient"}:${caseId}`;
}

function saveNoticeKey(patientId: string | undefined, caseId: string) {
  return `annotationSaveNotice:management_reasoning:${patientId ?? "unknown_patient"}:${caseId}`;
}

function successSaveMessage() {
  return "Saved. You can continue to revise it.";
}

function nextRevisionNumber(patientId: string | undefined, caseId: string) {
  try {
    const key = revisionKey(patientId, caseId);
    const next = Number(localStorage.getItem(key) ?? "0") + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return null;
  }
}

function buildFocusEventLabel(
  managementEvent: ManagementEvent,
  anesthesiaStart?: string | null
) {
  const doseOrChange = buildDoseOrChangeLabel(managementEvent);
  const parts = [
    managementEvent.row_name,
    doseOrChange,
    getDisplayTime(managementEvent, anesthesiaStart),
  ].filter(Boolean);

  return parts.join(" | ");
}

function formatClinicalNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 10) return String(Math.round(value * 10) / 10);
  return String(Math.round(value * 1000) / 1000);
}

function isChangeManagementEvent(managementEvent: ManagementEvent) {
  const eventType = String(managementEvent.event_type ?? "").toLowerCase();
  return (
    eventType.includes("infusion_adjustment") ||
    eventType.includes("gas_adjustment") ||
    eventType.includes("change")
  );
}

function buildChangeLabel(managementEvent: ManagementEvent) {
  if (
    !Number.isFinite(managementEvent.change_from) ||
    !Number.isFinite(managementEvent.change_to)
  ) {
    return null;
  }

  const unit = managementEvent.change_unit ?? managementEvent.unit ?? "";
  const suffix = unit ? ` ${unit}` : "";

  return `${formatClinicalNumber(Number(managementEvent.change_from))}${suffix} -> ${formatClinicalNumber(Number(managementEvent.change_to))}${suffix}`;
}

function buildDoseOrChangeLabel(managementEvent: ManagementEvent) {
  const changeLabel = buildChangeLabel(managementEvent);

  if (isChangeManagementEvent(managementEvent) && changeLabel) {
    return changeLabel;
  }

  if (managementEvent.dose === undefined || managementEvent.dose === null) {
    return null;
  }

  return `${managementEvent.dose}${managementEvent.unit ? ` ${managementEvent.unit}` : ""}`;
}

function InstructionPanel({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

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

export default function ManagementReasoningPanel({
  caseId,
  managementEvent,
  patientIndex,
  patientId,
  patientFolder,
  anesthesiaStart,
  onSaveSuccess,
  readOnly = false,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [recording, setRecording] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const recognitionRef = useRef<any>(null);
  const voiceBaseTextRef = useRef("");

  const pageOpenedAtRef = useRef<string | null>(null);
  const pageOpenedAtLocalRef = useRef<string | null>(null);
  const firstInteractionAtRef = useRef<string | null>(null);
  const firstTypingAtRef = useRef<string | null>(null);
  const firstVoiceStartAtRef = useRef<string | null>(null);
  const typingStartedAtMsRef = useRef<number | null>(null);
  const typingDurationMsRef = useRef<number>(0);
  const voiceStartedAtMsRef = useRef<number | null>(null);
  const voiceDurationMsRef = useRef<number>(0);

  const taskTimingRef = useRef<QuestionTiming>(makeEmptyQuestionTiming());

  useEffect(() => {
    const nowIso = new Date().toISOString();

    pageOpenedAtRef.current = nowIso;
    pageOpenedAtLocalRef.current = getLocalTimestamp();
    firstInteractionAtRef.current = null;
    firstTypingAtRef.current = null;
    firstVoiceStartAtRef.current = null;
    typingStartedAtMsRef.current = null;
    typingDurationMsRef.current = 0;
    voiceStartedAtMsRef.current = null;
    voiceDurationMsRef.current = 0;

    taskTimingRef.current = makeEmptyQuestionTiming(nowIso);
  }, [caseId, managementEvent?.row_name, managementEvent?.time_min]);

  useEffect(() => {
    const resolvedPatientId = patientId ?? patientFolder;
    try {
      const draftText =
        localStorage.getItem(draftKey(resolvedPatientId, caseId)) ?? "";
      const savedResult = localStorage.getItem(
        `annotationResult:management_reasoning:${resolvedPatientId ?? "unknown_patient"}:${caseId}`
      );
      let fallbackText = "";
      if (savedResult) {
        try {
          const parsed = JSON.parse(savedResult);
          fallbackText = String(
            parsed?.managementReasoningText ??
              parsed?.answers?.managementReasoningText ??
              ""
          );
        } catch {
          fallbackText = "";
        }
      }
      setAnswer(draftText || fallbackText);
      const savedNotice = localStorage.getItem(
        saveNoticeKey(resolvedPatientId, caseId)
      );
      if (savedResult || savedNotice) {
        setSaveStatus("success");
        setSaveMessage(savedNotice || successSaveMessage());
      } else {
        setSaveStatus("idle");
        setSaveMessage("");
      }
    } catch {
      setAnswer("");
      setSaveStatus("idle");
      setSaveMessage("");
    }
    setRecording(false);
    voiceBaseTextRef.current = "";
    recognitionRef.current?.stop?.();
  }, [
    managementEvent?.row_name,
    managementEvent?.time_min,
    managementEvent?.start_time,
    patientId,
    patientFolder,
    caseId,
  ]);

  function markTyping() {
    const nowIso = new Date().toISOString();
    if (typingStartedAtMsRef.current === null) {
      typingStartedAtMsRef.current = performance.now();
    }

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
    if (voiceStartedAtMsRef.current === null) {
      voiceStartedAtMsRef.current = performance.now();
    }

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

  function finalizeTypingDuration() {
    if (typingStartedAtMsRef.current === null) return;

    typingDurationMsRef.current +=
      performance.now() - typingStartedAtMsRef.current;
    typingStartedAtMsRef.current = null;
  }

  function finalizeVoiceDuration() {
    if (voiceStartedAtMsRef.current === null) return;

    voiceDurationMsRef.current +=
      performance.now() - voiceStartedAtMsRef.current;
    voiceStartedAtMsRef.current = null;
  }

  async function startVoiceNote() {
    if (readOnly) return;
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
      recognition.lang = getSpeechRecognitionLanguage();
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
        finalizeVoiceDuration();
        setRecording(false);
        setSaveStatus("error");
        setSaveMessage("Speech recognition failed.");
      };

      recognition.onend = () => {
        finalizeVoiceDuration();
        setRecording(false);
        voiceBaseTextRef.current = "";
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecording(true);
    } catch {
      finalizeVoiceDuration();
      setRecording(false);
      voiceBaseTextRef.current = "";
      setSaveStatus("error");
      setSaveMessage("Failed to start voice note.");
    }
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop?.();
    finalizeVoiceDuration();
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
    if (readOnly) {
      setSaveStatus("error");
      setSaveMessage("This submitted case is locked for review.");
      return;
    }

    const validationError = validateBeforeSave();

    if (validationError) {
      setSaveStatus("error");
      setSaveMessage(validationError);
      return;
    }

    if (!managementEvent) return;

    try {
      setSaveStatus("saving");
      setSaveMessage(
        "Saving to cloud storage... Please wait and do not close the page."
      );

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
      const doctorName = String(participantInfo?.name ?? "").trim() || null;

      const submittedAt = new Date().toISOString();
      const submittedAtLocal = getLocalTimestamp();
      taskTimingRef.current.submittedAt = submittedAt;
      stopVoiceNote();
      finalizeTypingDuration();
      const resolvedPatientId = patientId ?? patientFolder ?? undefined;
      const revisionNumber = nextRevisionNumber(resolvedPatientId, caseId);
      const focusEvent = buildFocusEventLabel(managementEvent, anesthesiaStart);

      await submitAnnotation({
        doctorId,
        accessCode,

        caseId,
        patientId: patientId ?? patientFolder ?? null,
        patientFolder: patientFolder ?? patientId ?? null,

        panel: "management_reasoning_panel",
        participantInfo: {
          name: doctorName ?? undefined,
          email: participantInfo?.email ?? undefined,
          doctorId: doctorId ?? undefined,
          accessCode: accessCode ?? undefined,
        },

        pageOpenedAt: pageOpenedAtRef.current,
        pageOpenedAtLocal: pageOpenedAtLocalRef.current,
        firstInteractionAt: firstInteractionAtRef.current,
        firstTypingAt: firstTypingAtRef.current,
        firstVoiceStartAt: firstVoiceStartAtRef.current,
        submittedAt,
        submittedAtLocal,
        totalDurationSec:
          pageOpenedAtRef.current === null
            ? null
            : Number(
                (
                  (new Date(submittedAt).getTime() -
                    new Date(pageOpenedAtRef.current).getTime()) /
                  1000
                ).toFixed(3)
              ),
        typingDurationSec: roundSec(typingDurationMsRef.current),
        voiceDurationSec: roundSec(voiceDurationMsRef.current),
        localTimezone: getBrowserTimezone(),
        revisionNumber,

        answers: {
          focusEvent,
          managementReasoningText: answer.trim(),
        },
      });

      try {
        localStorage.setItem(draftKey(resolvedPatientId, caseId), answer.trim());
        localStorage.setItem(
          `annotationResult:management_reasoning:${resolvedPatientId ?? "unknown_patient"}:${caseId}`,
          JSON.stringify({
            focusEvent,
            managementReasoningText: answer.trim(),
            revisionNumber,
          })
        );
      } catch {
        // ignore
      }

      const successMessage = successSaveMessage();
      try {
        localStorage.setItem(
          saveNoticeKey(resolvedPatientId, caseId),
          successMessage
        );
      } catch {
        // ignore
      }

      setSaveStatus("success");
      setSaveMessage(successMessage);
      onSaveSuccess?.();
    } catch (error: any) {
      setSaveStatus("error");
      setSaveMessage(
        error?.message ||
          "Failed to save management reasoning to cloud storage. Please click Save again."
      );
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
          <div className="mb-3 text-sm font-semibold text-gray-900">
          Task 3: Reasoning on a given medication/gas event on the right medication/gas event panel
        </div>

      <InstructionPanel title="Annotation Instructions" defaultOpen={false}>
        <div className="space-y-4 text-sm leading-6 text-blue-900">
          <p className="font-semibold text-blue-950">
            Please briefly explain the highlighted medication/gas event in the
            surrounding intraoperative context. If the purpose is unclear, state
            the uncertainty explicitly. Please include these checklist items in your response:
          </p>

          <div>
            <p className="font-semibold text-blue-950">
              1.  What was the most likely clinical purpose of this medication/gas
              event? And what makes you infer this?
            </p>
           
          </div>

       

          <div>
            <p className="font-semibold text-blue-950">
              2.  What effect would be expected from this event, and was the
              subsequent patient response consistent with that expectation?
            </p>
           
          </div>

          <div>
            <p className="font-semibold text-blue-950">3.  What might have happened if this
            medication/gas event had not occurred?</p>
          
          </div>

          <div>
            <p className="font-semibold text-blue-950">
              4. Is there reasonable alternative management possibilities based on your clinical practice?
            </p>
          
          </div>
        </div>
      </InstructionPanel>

      <InstructionPanel title="Example" defaultOpen={false}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-semibold text-blue-950">Example 1</p>
            <p className="whitespace-pre-line rounded-lg border border-blue-100 bg-white p-3 text-gray-800">
              {EXAMPLE_MANAGEMENT_SUMMARY_1}
            </p>
          </div>

          <div>
            <p className="mb-2 font-semibold text-blue-950">Example 2</p>
            <p className="whitespace-pre-line rounded-lg border border-blue-100 bg-white p-3 text-gray-800">
              {EXAMPLE_MANAGEMENT_SUMMARY_2}
            </p>
          </div>
        </div>
      </InstructionPanel>

      <InstructionPanel title="FAQ / Common Questions" defaultOpen={false}>
  <div className="space-y-4 text-sm leading-6 text-blue-900">
    <div>
      <p className="font-semibold text-blue-950">
        1. Do I need to answer each checklist item separately?
      </p>
      <p>
        No. You may write a short integrated clinical explanation. However, your
        answer should still make clear the likely clinical purpose of the
        highlighted medication/gas event, the surrounding evidence, the expected
        effect, the observed patient response if visible, and any uncertainty or
        reasonable alternative management.
      </p>
    </div>

    <div>
      <p className="font-semibold text-blue-950">
        2. What if the medication/gas event appears routine?
      </p>
      <p>
        Please state that it appears routine or background care, and briefly
        explain why. For example, the event may reflect anesthetic maintenance,
        emergence planning, analgesia, prophylaxis, neuromuscular
        blockade/reversal, or ventilation management rather than treatment of an
        abnormal event.
      </p>
    </div>

    <div>
      <p className="font-semibold text-blue-950">
        3. What if the purpose of the event is unclear?
      </p>
      <p>
        Please describe the uncertainty rather than forcing one explanation. You
        may mention multiple plausible purposes and explain which one seems most
        likely based on timing, vital-sign trends, nearby medications, surgical
        context, anesthetic phase, and patient response.
      </p>
    </div>

    <div>
      <p className="font-semibold text-blue-950">
        4. What if I cannot see a clear patient response afterward?
      </p>
      <p>
        It is fine to say that no clear response is visible in the available
        window. If possible, briefly state what response would normally be
        expected and whether the available data are consistent, inconsistent, or
        insufficient to judge.
      </p>
    </div>

    <div>
      <p className="font-semibold text-blue-950">
        5. Do I always need to provide a counterfactual?
      </p>
      <p>
        No. Include a counterfactual only when clinically meaningful. For
        example, if a vasopressor was given for hypotension, you may comment that
        blood pressure might have remained low or continued to drift downward
        without it. If the event is routine or the effect is unclear, you may
        state that no clear counterfactual consequence can be determined from the
        available data.
      </p>
    </div>

    <div>
      <p className="font-semibold text-blue-950">
        6. What counts as alternative management?
      </p>
      <p>
        Alternative management means another reasonable clinical option that
        could have been considered in the same context. For example, another
        vasopressor, fluid administration, adjusting anesthetic depth, changing
        ventilation, or waiting longer may be reasonable depending on the
        patient&apos;s physiology. If no clear alternative is needed, you may say
        the observed management was appropriate.
      </p>
    </div>

    <div>
      <p className="font-semibold text-blue-950">
        7. How detailed should my answer be?
      </p>
      <p>
        A concise clinical explanation is enough. In most cases, five to six
        sentences or one short dictated paragraph is sufficient, as long as it
        explains why the event likely occurred and how it relates to the
        surrounding intraoperative context.
      </p>
    </div>
  </div>
</InstructionPanel>
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

          {isChangeManagementEvent(managementEvent) &&
          buildChangeLabel(managementEvent) ? (
            <div>
              <span className="font-semibold text-gray-600">Change:</span>{" "}
              {buildChangeLabel(managementEvent)}
            </div>
          ) : managementEvent.dose != null ? (
            <div>
              <span className="font-semibold text-gray-600">Dose:</span>{" "}
              {managementEvent.dose} {managementEvent.unit ?? ""}
            </div>
          ) : null}

          {managementEvent.route && (
            <div>
              <span className="font-semibold text-gray-600">Route:</span>{" "}
              {managementEvent.route}
            </div>
          )}
        </div>
      </div>

      <textarea
        value={answer}
        onBlur={finalizeTypingDuration}
        onChange={(e) => {
          if (readOnly) return;
          markTyping();
          try {
            localStorage.setItem(
              draftKey(patientId ?? patientFolder, caseId),
              e.target.value
            );
          } catch {
            // ignore
          }
          setAnswer(e.target.value);
        }}
        disabled={readOnly || saveStatus === "saving"}
        className="mt-4 h-80 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        placeholder="Write or dictate your management reasoning here..."
      />

      <div className="mt-5 flex w-full flex-wrap items-center gap-3 border-t pt-5">
        <button
          type="button"
          onClick={recording ? stopVoiceNote : startVoiceNote}
          disabled={readOnly || saveStatus === "saving"}
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
            if (readOnly) return;
            setAnswer("");
            voiceBaseTextRef.current = "";
            setRecording(false);
            recognitionRef.current?.stop?.();
            setSaveStatus("idle");
            setSaveMessage("");

            const nowIso = new Date().toISOString();
            pageOpenedAtRef.current = nowIso;
            pageOpenedAtLocalRef.current = getLocalTimestamp();
            firstInteractionAtRef.current = null;
            firstTypingAtRef.current = null;
            firstVoiceStartAtRef.current = null;
            typingStartedAtMsRef.current = null;
            typingDurationMsRef.current = 0;
            voiceStartedAtMsRef.current = null;
            voiceDurationMsRef.current = 0;
            taskTimingRef.current = makeEmptyQuestionTiming(nowIso);

            try {
              localStorage.removeItem(
                saveNoticeKey(patientId ?? patientFolder, caseId)
              );
              localStorage.removeItem(
                `annotationResult:management_reasoning:${patientId ?? patientFolder ?? "unknown_patient"}:${caseId}`
              );
            } catch {
              // ignore
            }
          }}
          disabled={readOnly || saveStatus === "saving"}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={readOnly || saveStatus === "saving"}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
            readOnly || saveStatus === "saving"
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
