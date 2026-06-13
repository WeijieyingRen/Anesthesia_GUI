"use client";

export type DemoEpisode = {
  id: string;
  episodeIndex: number;
  label: string;
  vital: "MAP";
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
  selected: boolean;
};

type UserCaseDemoGateProps = {
  patientFolder: string;
  caseId: string;
  onClose: () => void;
};

type DemoWindow = Window &
  typeof globalThis & {
    __userGuideFetchPatched?: boolean;
    __userGuideOriginalFetch?: typeof window.fetch;
  };

export const DEMO_SUMMARY_TEXT = `They got midazolam 2mg for premedication around 07:15. They had one isolated elevated BP of 160/101 at 07:13. It looks like they were induced with fentanyl, then propofol and rocuronium around 07:28. The blood pressure of 146/109 at 07:33 is likely stimulation with intubation, but overall the intubation was relatively hemodynamically stable.

They were started on a propofol drip at 150 around 07:37. They had one slightly lower blood pressure of 117/78 at 07:47, likely during the quiet period of the case where anesthesia had been induced but the incision had not yet been made, so there was no surgical stimulation. They got decadron 8mg around 07:37, likely for postoperative nausea/vomiting prophylaxis.

Their blood pressure increased a bit with incision to 145/98, but overall they stayed pretty hemodynamically stable throughout this part of the case. It looks like they also got methadone, a total of 10mg, given as two boluses of 5mg toward the beginning of the case, likely for postoperative pain control.

They got labetalol 10mg around 08:10, which was likely because they had a BP of 149/85 at 08:06, and their blood pressure had been slightly elevated before that in the 130s-140s/70s-80s, though the reading immediately before the labetalol administration was actually fine at 122/65 at 08:08.

They were re-paralyzed with 20mg of rocuronium at 08:23, likely to maintain paralysis during the case. Maintenance of anesthesia was largely with propofol as TIVA for the entire case, although sevoflurane was turned on at a low level initially at the beginning of the case; it looks like the provider changed their mind and decided to run this as a TIVA. After steady state was achieved, the propofol was reduced to 125 mcg/kg/min around 08:18 and further weaned to 100 and then 60 at 08:54, then turned off shortly thereafter.

They remained hemodynamically stable with blood pressure on the lower side, in the 90s-100s/40s-50s, throughout the remainder of the case after the labetalol until extubation. Around 09:05, they were given 4mg zofran, likely for PONV prophylaxis, and 200mg of sugammadex for reversal of rocuronium immediately before extubation. They were then extubated around 09:12 and had one slightly elevated BP reading of 146/92 around that time, likely related to stimulation of extubation. Their oxygen saturation remained stable throughout the case at 97-100%.`;

export const DEMO_ABNORMALITY_TEXT = `From 07:55 to 08:45, the patient developed a sustained period of lower blood pressure during maintenance of anesthesia. The MAP was frequently in the low range, with systolic blood pressure generally around the 90s to low 100s. This was most likely related to anesthetic-induced vasodilation and the relatively low level of surgical stimulation during this period.

The episode was clinically relevant because the blood pressure remained lower than the patient's earlier baseline for a prolonged period. However, the patient remained otherwise stable, with no clear evidence of hypoxemia, tachycardia, or another acute physiologic deterioration.

The provider continued to monitor the patient and adjusted anesthetic management as the case progressed. Depending on the clinical context, reasonable management options could include reducing anesthetic depth, administering intravenous fluid, or using a vasopressor if the blood pressure continued to decrease.`;

export const DEMO_MANAGEMENT_TEXT = `The labetalol bolus was most likely administered in response to the patient's mildly elevated blood pressure during the earlier portion of the case. The surrounding blood pressure values were generally in the 130s to 140s systolic, with one higher reading before the medication was given.

The expected effect of labetalol was a reduction in blood pressure and sympathetic tone. After administration, the patient's blood pressure decreased and subsequently remained on the lower side for much of the remainder of the case.

This intervention may have been reasonable based on the elevated blood pressure trend, although the provider would also need to consider anesthetic depth, surgical stimulation, heart rate, and the possibility that the elevated readings were transient. Continued observation without medication could also have been reasonable if the provider believed the blood pressure elevation was temporary and clinically insignificant.`;

export const DEMO_SELECTED_EPISODE_ID = "demo-episode-6";

export const DEMO_EPISODES: DemoEpisode[] = [
  {
    id: "demo-episode-1",
    episodeIndex: 1,
    label: "Episode 1",
    vital: "MAP",
    startMin: 0,
    endMin: 4,
    y1: 80,
    y2: 170,
    selected: false,
  },
  {
    id: "demo-episode-2",
    episodeIndex: 2,
    label: "Episode 2",
    vital: "MAP",
    startMin: 13,
    endMin: 20,
    y1: 80,
    y2: 170,
    selected: false,
  },
  {
    id: "demo-episode-3",
    episodeIndex: 3,
    label: "Episode 3",
    vital: "MAP",
    startMin: 28,
    endMin: 36,
    y1: 80,
    y2: 170,
    selected: false,
  },
  {
    id: "demo-episode-4",
    episodeIndex: 4,
    label: "Episode 4",
    vital: "MAP",
    startMin: 35,
    endMin: 48,
    y1: 70,
    y2: 150,
    selected: false,
  },
  {
    id: "demo-episode-5",
    episodeIndex: 5,
    label: "Episode 5",
    vital: "MAP",
    startMin: 50,
    endMin: 58,
    y1: 70,
    y2: 150,
    selected: false,
  },
  {
    id: DEMO_SELECTED_EPISODE_ID,
    episodeIndex: 6,
    label: "Episode 6",
    vital: "MAP",
    startMin: 55,
    endMin: 105,
    y1: 40,
    y2: 115,
    selected: true,
  },
  {
    id: "demo-episode-7",
    episodeIndex: 7,
    label: "Episode 7",
    vital: "MAP",
    startMin: 112,
    endMin: 120,
    y1: 70,
    y2: 160,
    selected: false,
  },
];

function getCurrentPatientFolder(): string {
  try {
    const gameDataRaw = localStorage.getItem("gameData");

    if (!gameDataRaw) {
      return "";
    }

    const gameData = JSON.parse(gameDataRaw);

    const currentPatientIndex = Number(
      gameData?.currentPatientIndex ?? 0
    );

    const selectedPatient =
      gameData?.selectedPatients?.[currentPatientIndex];

    return String(selectedPatient?.folder ?? "").trim();
  } catch {
    return "";
  }
}

function isCurrentUserGuideCase(): boolean {
  const isGuideMode =
    localStorage.getItem("isUserGuideMode") === "true";

  if (!isGuideMode) {
    return false;
  }

  return getCurrentPatientFolder() === "user_guide";
}

function isSubmitRequest(input: RequestInfo | URL): boolean {
  const requestUrl =
    input instanceof Request ? input.url : String(input);

  return (
    requestUrl.includes("/api/submit") ||
    requestUrl.includes("/gcp_submit_service")
  );
}

/**
 * Simulates Save and Submit for the User Guide case.
 *
 * The real frontend can still display:
 * - Saving...
 * - Saved
 * - Submitting...
 * - Submitted
 *
 * No data is uploaded.
 */
function installUserGuideFakeSubmit(): void {
  const demoWindow = window as DemoWindow;

  if (demoWindow.__userGuideFetchPatched) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  demoWindow.__userGuideOriginalFetch = originalFetch;
  demoWindow.__userGuideFetchPatched = true;

  window.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (
      isSubmitRequest(input) &&
      isCurrentUserGuideCase()
    ) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 900);
      });

      console.log(
        "[User Guide Demo] Simulated Save/Submit succeeded. No upload was performed."
      );

      return new Response(
        JSON.stringify({
          ok: true,
          success: true,

          demo: true,
          simulated: true,
          uploaded: false,

          saved: true,
          submitted: true,
          completed: true,

          status: "submitted",

          message: "User Guide demo saved successfully.",

          savedAtUtc: new Date().toISOString(),
        }),
        {
          status: 200,
          statusText: "OK",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return originalFetch(input, init);
  }) as typeof window.fetch;
}

/**
 * Stores only the fixed example text used by the real Summary,
 * Abnormality Reasoning and Management Reasoning panels.
 *
 * The fixed abnormality boxes and checklist are rendered separately
 * by the User Guide demo overlay. They are not placed into the real
 * Dashboard episodeState.
 */
function writeDemoDataToLocalStorage(
  patientFolder: string,
  caseId: string
): void {
  const nowUtc = new Date().toISOString();

  localStorage.setItem("isUserGuideMode", "true");

  localStorage.setItem(
    `userDemoMode:${patientFolder}:${caseId}`,
    "true"
  );

  // ============================================================
  // 1. Summary
  // ============================================================

  const summaryResult = {
    caseId,
    case_id: caseId,

    patientId: patientFolder,
    patient_id: patientFolder,

    patientFolder,
    patient_folder: patientFolder,

    eventId: "patient-summary",
    event_id: "patient-summary",

    eventTitle: "Patient-level Summary",
    panel: "summary",

    savedAtUtc: nowUtc,

    summaryText: DEMO_SUMMARY_TEXT,

    answers: {
      summaryText: DEMO_SUMMARY_TEXT,
    },

    data: {
      summaryText: DEMO_SUMMARY_TEXT,
    },
  };

  localStorage.setItem(
    `annotationDraft:summary:${patientFolder}:${caseId}`,
    DEMO_SUMMARY_TEXT
  );

  localStorage.setItem(
    `annotationResult:summary:${patientFolder}:${caseId}`,
    JSON.stringify(summaryResult)
  );

  // ============================================================
  // 2. Abnormality Reasoning
  //
  // The checklist and boxes are drawn by the User Guide overlay.
  // This section only supplies the fixed reasoning answer.
  // ============================================================

  const abnormalityResult = {
    caseId,
    case_id: caseId,

    patientId: patientFolder,
    patient_id: patientFolder,

    patientFolder,
    patient_folder: patientFolder,

    panel: "abnormality_reasoning",

    eventId: DEMO_SELECTED_EPISODE_ID,
    event_id: DEMO_SELECTED_EPISODE_ID,

    episodeId: DEMO_SELECTED_EPISODE_ID,
    episode_id: DEMO_SELECTED_EPISODE_ID,

    savedAtUtc: nowUtc,

    abnormalityReasoningText: DEMO_ABNORMALITY_TEXT,

    answers: {
      abnormalityReasoningText: DEMO_ABNORMALITY_TEXT,
    },

    data: {
      abnormalityReasoningText: DEMO_ABNORMALITY_TEXT,
    },
  };

  localStorage.setItem(
    `annotationDraft:abnormality_reasoning:${patientFolder}:${caseId}:${DEMO_SELECTED_EPISODE_ID}`,
    DEMO_ABNORMALITY_TEXT
  );

  localStorage.setItem(
    `annotationResult:abnormality_reasoning:${patientFolder}:${caseId}`,
    JSON.stringify(abnormalityResult)
  );

  // ============================================================
  // 3. Management Reasoning
  // ============================================================

  const managementEvent = {
    id: "demo-management-labetalol",

    eventId: "demo-management-labetalol",
    event_id: "demo-management-labetalol",

    focusEvent: "Labetalol | 08:10:00",
    rowName: "labetalol",

    eventType: "medication_bolus",
    chartType: "medication",

    displayTime: "08:10:00",
    timeMin: 70,

    dose: 10,
    unit: "mg",
    route: null,
  };

  const managementResult = {
    caseId,
    case_id: caseId,

    patientId: patientFolder,
    patient_id: patientFolder,

    patientFolder,
    patient_folder: patientFolder,

    panel: "management_reasoning",

    savedAtUtc: nowUtc,

    focusEvent: managementEvent.focusEvent,
    managementEvent,

    managementReasoningText: DEMO_MANAGEMENT_TEXT,

    answers: {
      focusEvent: managementEvent.focusEvent,
      managementEvent,
      managementReasoningText: DEMO_MANAGEMENT_TEXT,
    },

    data: {
      focusEvent: managementEvent.focusEvent,
      managementEvent,
      managementReasoningText: DEMO_MANAGEMENT_TEXT,
    },
  };

  localStorage.setItem(
    `annotationDraft:management_reasoning:${patientFolder}:${caseId}`,
    DEMO_MANAGEMENT_TEXT
  );

  localStorage.setItem(
    `annotationResult:management_reasoning:${patientFolder}:${caseId}`,
    JSON.stringify(managementResult)
  );
}

export default function UserCaseDemoGate({
  patientFolder,
  caseId,
  onClose,
}: UserCaseDemoGateProps) {
  const handleOpenDemoCase = () => {
    try {
      /*
       * Store the fixed example answers.
       */
      writeDemoDataToLocalStorage(
        patientFolder,
        caseId
      );

      /*
       * Simulate successful Save and Submit actions.
       * No data is uploaded.
       */
      installUserGuideFakeSubmit();

      /*
       * Close the introduction and show the Dashboard.
       *
       * Do not reload or replace the page.
       */
      onClose();
    } catch (error) {
      console.error(
        "Failed to initialize User Guide demo:",
        error
      );

      window.alert("Failed to open the demo case.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-white p-8 text-slate-900 shadow-2xl">
        <div className="mb-6">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-600">
            Demo User Guide
          </div>

          <h1 className="text-2xl font-bold text-slate-950">
            How to review this anesthesia case
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            This demo uses the same dashboard, task panels,
            Save buttons, and submission workflow as a real
            case. The example answers are pre-filled only to
            demonstrate how the platform works.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-base font-bold text-slate-900">
              1. Summary
            </div>

            <p className="text-sm leading-6 text-slate-600">
              Review the overall anesthesia course and
              summarize major events, medications,
              hemodynamic changes, and emergence.
            </p>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-base font-bold text-slate-900">
              2. Abnormality Reasoning
            </div>

            <p className="text-sm leading-6 text-slate-600">
              Review the example abnormal episodes on the
              Vitals panel. The checklist contains several
              episodes, and one is selected for detailed
              reasoning.
            </p>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-base font-bold text-slate-900">
              3. Management Reasoning
            </div>

            <p className="text-sm leading-6 text-slate-600">
              Review the focused medication event and the
              pre-filled example management reasoning.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="mb-2 text-sm font-bold text-blue-900">
            Demo behavior
          </div>

          <div className="space-y-2 text-sm leading-6 text-blue-900">
            <p>
              1. Summary, Abnormality Reasoning, and
              Management Reasoning contain pre-filled examples.
            </p>

            <p>
              2. Use the Save buttons to experience the same
              interface and workflow as a real annotation.
            </p>

            <p>
              3. Save and Submit are simulated in this demo.
              No data will be uploaded.
            </p>

            <p>
              4. Click the User Guide button in the upper-right
              corner for step-by-step instructions.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={handleOpenDemoCase}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Close and open case
          </button>
        </div>
      </div>
    </main>
  );
}