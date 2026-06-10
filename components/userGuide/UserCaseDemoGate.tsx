"use client";

type UserCaseDemoGateProps = {
  patientFolder: string;
  caseId: string;
  onClose: () => void;
};

const DEMO_SUMMARY_TEXT = `They got midazolam 2mg for premedication around 07:15. They had one isolated elevated BP of 160/101 at 07:13. It looks like they were induced with fentanyl, then propofol and rocuronium around 07:28. The blood pressure of 146/109 at 07:33 is likely stimulation with intubation, but overall the intubation was relatively hemodynamically stable.

They were started on a propofol drip at 150 around 07:37. They had one slightly lower blood pressure of 117/78 at 07:47, likely during the quiet period of the case where anesthesia had been induced but the incision had not yet been made, so there was no surgical stimulation. They got decadron 8mg around 07:37, likely for postoperative nausea/vomiting prophylaxis.

Their blood pressure increased a bit with incision to 145/98, but overall they stayed pretty hemodynamically stable throughout this part of the case. It looks like they also got methadone, a total of 10mg, given as two boluses of 5mg toward the beginning of the case, likely for postoperative pain control.

They got labetalol 10mg around 08:10, which was likely because they had a BP of 149/85 at 08:06, and their blood pressure had been slightly elevated before that in the 130s-140s/70s-80s, though the reading immediately before the labetalol administration was actually fine at 122/65 at 08:08.

They were re-paralyzed with 20mg of rocuronium at 08:23, likely to maintain paralysis during the case. Maintenance of anesthesia was largely with propofol as TIVA for the entire case, although sevoflurane was turned on at a low level initially at the beginning of the case; it looks like the provider changed their mind and decided to run this as a TIVA. After steady state was achieved, the propofol was reduced to 125 mcg/kg/min around 08:18 and further weaned to 100 and then 60 at 08:54, then turned off shortly thereafter.

They remained hemodynamically stable with blood pressure on the lower side, in the 90s-100s/40s-50s, throughout the remainder of the case after the labetalol until extubation. Around 09:05, they were given 4mg zofran, likely for PONV prophylaxis, and 200mg of sugammadex for reversal of rocuronium immediately before extubation. They were then extubated around 09:12 and had one slightly elevated BP reading of 146/92 around that time, likely related to stimulation of extubation. Their oxygen saturation remained stable throughout the case at 97-100%.`;

const DEMO_ABNORMALITY_TEXT = `From 11:15 to 11:32, the patient developed hypotension shortly after induction, likely due to anesthetic-induced vasodilation. The blood pressure ranged from 80-100s/40s-50s, with MAPs 55-65. The blood pressure nadir was 82/41 at 11:29. The hypotension appeared clinically meaningful because the blood pressure dropped below a clinically acceptable range after induction and required vasopressor support. The provider gave a phenylephrine bolus at 11:29, after which the blood pressure improved adequately, suggesting an appropriate response to treatment. No clear preventive intervention was given, and this may represent a common post-induction hemodynamic response. Management was appropriate in this context; another vasopressor such as ephedrine could also have been reasonable depending on the heart rate and overall physiology, however the heart rate was normal (80s) throughout the episode so phenylephrine was likely the more reasonable choice.`;

const DEMO_MANAGEMENT_TEXT = `This phenylephrine bolus was most likely given to treat a downward drift in blood pressure. The surrounding context supports this because the patient had decreasing blood pressure and had required nearby boluses. The expected effect was an increase in vascular tone and blood pressure, and the blood pressure did improve afterward (from 90s/40s to 100s/50s), suggesting an appropriate response. If this bolus had not been given, the patient may have remained hypotensive or continued to drift lower, depending on anesthetic depth, volume status, and surgical stimulation. One alternative would have been to lighten the anesthetic or administer pain medication, but this would require information on how deeply anesthetized the patient was and would have only been an acceptable alternative if the provider felt that the patient was too deeply anesthetized or had inadequate pain control and was responding to surgical stimulation.`;

const DEMO_SELECTED_EPISODE_ID = "demo-episode-6";

const DEMO_EPISODES = [
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

function dashboardDraftKey(patientFolder: string, caseId: string) {
  return `dashboardDraft:${patientFolder}:${caseId}`;
}

function toLocalTimestamp(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

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

function formatClockFromOffset(offsetMin: number) {
  const hh = Math.floor(offsetMin / 60);
  const mm = offsetMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function writeDemoDataToLocalStorage(patientFolder: string, caseId: string) {
  const nowUtc = new Date().toISOString();

  localStorage.setItem(`userDemoMode:${patientFolder}:${caseId}`, "true");

  const summaryResult = {
    caseId,
    patientId: patientFolder,
    patientFolder,
    eventId: "patient-summary",
    eventTitle: "Patient-level Summary",
    panel: "summary",
    savedAtUtc: nowUtc,
    answers: {
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

  const selectedEpisodes = DEMO_EPISODES.map((episode) => ({
    episodeIndex: episode.episodeIndex,
    selected: episode.selected,
    startMin: formatClockFromOffset(episode.startMin),
    endMin: formatClockFromOffset(episode.endMin),
    vital: episode.vital,
    y1: episode.y1,
    y2: episode.y2,
    createdAtUtc: nowUtc,
    createdAtLocal: toLocalTimestamp(nowUtc),
    updatedAtUtc: nowUtc,
    updatedAtLocal: toLocalTimestamp(nowUtc),
  }));

  const annotatedEpisodeSource =
    DEMO_EPISODES.find((episode) => episode.id === DEMO_SELECTED_EPISODE_ID) ??
    DEMO_EPISODES[0];

  const abnormalityResult = {
    selectedEpisodes,
    annotatedEpisode: {
      episodeIndex: annotatedEpisodeSource.episodeIndex,
      selected: true,
      startMin: formatClockFromOffset(annotatedEpisodeSource.startMin),
      endMin: formatClockFromOffset(annotatedEpisodeSource.endMin),
      vital: annotatedEpisodeSource.vital,
      y1: annotatedEpisodeSource.y1,
      y2: annotatedEpisodeSource.y2,
      createdAtUtc: nowUtc,
      createdAtLocal: toLocalTimestamp(nowUtc),
      updatedAtUtc: nowUtc,
      updatedAtLocal: toLocalTimestamp(nowUtc),
    },
    abnormalityReasoningText: DEMO_ABNORMALITY_TEXT,
    answers: {
      selectedEpisodes,
      annotatedEpisode: {
        episodeIndex: annotatedEpisodeSource.episodeIndex,
        selected: true,
        startMin: formatClockFromOffset(annotatedEpisodeSource.startMin),
        endMin: formatClockFromOffset(annotatedEpisodeSource.endMin),
        vital: annotatedEpisodeSource.vital,
        y1: annotatedEpisodeSource.y1,
        y2: annotatedEpisodeSource.y2,
        createdAtUtc: nowUtc,
        createdAtLocal: toLocalTimestamp(nowUtc),
        updatedAtUtc: nowUtc,
        updatedAtLocal: toLocalTimestamp(nowUtc),
      },
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

  const managementResult = {
    focusEvent: "Phenylephrine | 11:29:00",
    managementEvent: {
      focusEvent: "Phenylephrine | 11:29:00",
      rowName: "Phenylephrine",
      eventType: "medication_bolus",
      chartType: "medication",
      displayTime: "11:29:00",
      timeMin: annotatedEpisodeSource.startMin + 34,
      dose: null,
      unit: null,
      route: null,
    },
    managementReasoningText: DEMO_MANAGEMENT_TEXT,
    answers: {
      focusEvent: "Phenylephrine | 11:29:00",
      managementEvent: {
        focusEvent: "Phenylephrine | 11:29:00",
        rowName: "Phenylephrine",
        eventType: "medication_bolus",
        chartType: "medication",
        displayTime: "11:29:00",
        timeMin: annotatedEpisodeSource.startMin + 34,
        dose: null,
        unit: null,
        route: null,
      },
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

  const detectedEpisodes = DEMO_EPISODES.map((episode) => ({
    id: episode.id,
    label: episode.label,
    vital: episode.vital,
    startMin: episode.startMin,
    endMin: episode.endMin,
    y1: episode.y1,
    y2: episode.y2,
    selectedForAnnotation: episode.selected,
    createdAtUtc: nowUtc,
    updatedAtUtc: nowUtc,
  }));

  const dashboardDraftRaw = localStorage.getItem(
    dashboardDraftKey(patientFolder, caseId)
  );

  let existingDraft: Record<string, unknown> = {};

  try {
    existingDraft = dashboardDraftRaw ? JSON.parse(dashboardDraftRaw) : {};
  } catch {
    existingDraft = {};
  }

  localStorage.setItem(
    dashboardDraftKey(patientFolder, caseId),
    JSON.stringify({
      ...existingDraft,
      selectedTask: "summary",
      annotationLevel: "summary",
      selectedDetectVital: "MAP",
      selectedWindow: null,

      patientSummaryCompleted: true,
      abnormalityReasoningCompleted: true,
      managementReasoningCompleted: true,

      episodeState: {
        stage: "select_all",
        annotateStep: "detect",
        detectedEpisodes,
        prioritizedEpisodeIds: [DEMO_SELECTED_EPISODE_ID],
        activeEpisodeId: DEMO_SELECTED_EPISODE_ID,
      },

      episodeTaskCompletion: {
        [DEMO_SELECTED_EPISODE_ID]: {
          detect: true,
        },
      },

      hasSubmitted: false,
    })
  );
}

export default function UserCaseDemoGate({
  patientFolder,
  caseId,
  onClose,
}: UserCaseDemoGateProps) {
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
            This demo will show how the annotation platform works. After closing
            this guide, you will see the selected case with pre-filled example
            annotation results.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-base font-bold text-slate-900">
              1. Summary
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Review the overall anesthesia course and summarize major events,
              medications, hemodynamic changes, and emergence.
            </p>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-base font-bold text-slate-900">
              2. Abnormality Reasoning
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Detect abnormal physiologic episodes on the timeline. In this
              demo, several estimated abnormalities are shown in the checklist,
              but only the hypotension episode is pre-selected for detailed
              reasoning.
            </p>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-base font-bold text-slate-900">
              3. Management Reasoning
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Explain why selected medications, fluids, ventilation, or gas
              changes were likely made in the surrounding clinical context.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="mb-2 text-sm font-bold text-blue-900">
            Demo behavior
          </div>
          <p className="text-sm leading-6 text-blue-900">
            1. When you close this page, the platform will open one user case with pre-filled annotation results. </p>
          <p className="text-sm leading-6 text-blue-900">
            2. You can click on 'user guide' button on top right in the next pageto know the workingflow of the platform. 
          </p>
          <p className="text-sm leading-6 text-blue-900">
            3. You can play with this case to get a sense of the platform. When finished, click on 'Home' to return to the home page.
          </p>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={() => {
              writeDemoDataToLocalStorage(patientFolder, caseId);
              onClose();
            }}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Close and open case
          </button>
        </div>
      </div>
    </main>
  );
}