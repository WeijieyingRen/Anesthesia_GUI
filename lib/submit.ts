type DatasetSource = "stanford_mpog" | "mover";

type SubmitPayload = {
  annotator?: { name?: string; email?: string };
  participant?: { name?: string; email?: string };

  participantInfo?: {
    name?: string;
    email?: string;
    doctorId?: string;
    accessCode?: string;

    gender?: string;
    professionalDegree?: string;
    countryOfPrimaryClinicalTraining?: string;
    currentClinicalRole?: string;
    yearsHandsOnAnesthesiaClinicalCare?: string | number;
  };

  caseId?: string | number | null;
  eventId?: string | number | null;
  selectedEventId?: string | number | null;
  episodeId?: string | number | null;
  episodeNumber?: number | string | null;
  episodeFolder?: string | null;

  doctorId?: string | null;
  accessCode?: string | null;
  patientId?: string | null;
  patientFolder?: string | null;
  source?: DatasetSource | null;
  displayCaseId?: string | number | null;

  panel: string;
  action?: string;
  task?: string;

  pageOpenedAt?: number | string | null;
  firstInteractionAt?: number | string | null;
  firstTypingAt?: number | string | null;
  firstVoiceStartAt?: number | string | null;
  submittedAt?: number | string | null;
  pageOpenedAtLocal?: string | null;
  submittedAtLocal?: string | null;
  totalDurationSec?: number | null;
  typingDurationSec?: number | null;
  voiceDurationSec?: number | null;
  localTimezone?: string | null;
  revisionNumber?: number | null;

  panelOpenedAt?: number | string | null; // legacy
  clickedAt?: number | string | null; // legacy

  answers?: Record<string, unknown> | null;
  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;

  annotationState?: Record<string, unknown> | null;
  workflowMode?: "annotation" | "review" | null;

  [key: string]: unknown;
};

type LocalExportEntry = {
  objectPath: string;
  data: unknown;
  savedAt: string;
};

function archiveKey(patientId: unknown, caseId: unknown) {
  return `localDriveExportArchive:${
    patientId ?? "unknown_patient"
  }:${caseId ?? "unknown_case"}`;
}

function rememberLocalDriveExport(payload: SubmitPayload, data: any) {
  const localExport = data?.localExport;

  if (
    !localExport ||
    typeof localExport.objectPath !== "string" ||
    localExport.objectPath.includes("case_status_index.json")
  ) {
    return;
  }

  try {
    const key = archiveKey(
      payload.patientId ?? payload.patientFolder,
      payload.caseId
    );

    const existing = JSON.parse(localStorage.getItem(key) || "[]");

    const entries: LocalExportEntry[] = Array.isArray(existing)
      ? existing
      : [];

    entries.push({
      objectPath: localExport.objectPath,
      data: localExport.data,
      savedAt: new Date().toISOString(),
    });

    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Local export is a best-effort fallback;
    // cloud save remains authoritative.
  }
}

function readParticipantInfoFromStorage(): SubmitPayload["participantInfo"] {
  try {
    const raw = localStorage.getItem("participantInfo");

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return {
      name: parsed.name,
      email: parsed.email,
      doctorId: parsed.doctorId,
      accessCode: parsed.accessCode,

      gender: parsed.gender,

      professionalDegree:
        parsed.professionalDegree ??
        parsed.degree,

      countryOfPrimaryClinicalTraining:
        parsed.countryOfPrimaryClinicalTraining ??
        parsed.trainingCountry,

      currentClinicalRole:
        parsed.currentClinicalRole ??
        parsed.clinicalRole,

      yearsHandsOnAnesthesiaClinicalCare:
        parsed.yearsHandsOnAnesthesiaClinicalCare ??
        parsed.yearsExperience ??
        parsed.experienceYears,
    };
  } catch {
    return {};
  }
}

/**
 * Reads the dataset source for the patient currently selected in gameData.
 *
 * Existing Stanford sessions may not contain a source field, so Stanford is
 * retained as the backward-compatible default.
 */
function readCurrentDatasetSourceFromStorage(): DatasetSource {
  try {
    const raw = localStorage.getItem("gameData");

    if (!raw) {
      return "stanford_mpog";
    }

    const gameData = JSON.parse(raw);

    const selectedPatients = Array.isArray(gameData?.selectedPatients)
      ? gameData.selectedPatients
      : [];

    const rawCurrentPatientIndex = Number(
      gameData?.currentPatientIndex ?? 0
    );

    const currentPatientIndex = Number.isInteger(rawCurrentPatientIndex)
      ? rawCurrentPatientIndex
      : 0;

    const currentPatient =
      selectedPatients[currentPatientIndex] ?? null;

    return currentPatient?.source === "mover"
      ? "mover"
      : "stanford_mpog";
  } catch {
    return "stanford_mpog";
  }
}

function normalizeDatasetSource(
  value: unknown
): DatasetSource {
  return value === "mover"
    ? "mover"
    : "stanford_mpog";
}

export async function submitAnnotation(payload: SubmitPayload) {
  const submittedAt =
    payload.submittedAt ??
    new Date().toISOString();

  const clickedAt =
    payload.clickedAt ??
    submittedAt;

  const patientId =
    payload.patientId ??
    payload.patientFolder ??
    null;

  const patientFolder =
    payload.patientFolder ??
    payload.patientId ??
    null;

  const pageOpenedAt =
    payload.pageOpenedAt ??
    payload.panelOpenedAt ??
    null;

  const panelOpenedAt =
    payload.panelOpenedAt ??
    payload.pageOpenedAt ??
    null;

  let workflowMode =
    payload.workflowMode ??
    null;

  let displayCaseId =
    payload.displayCaseId ??
    null;

  if (!workflowMode) {
    try {
      const storedWorkflowMode =
        localStorage.getItem("currentWorkflowMode");

      if (
        storedWorkflowMode === "annotation" ||
        storedWorkflowMode === "review"
      ) {
        workflowMode = storedWorkflowMode;
      }
    } catch {
      workflowMode = null;
    }
  }

  if (
    displayCaseId === null ||
    displayCaseId === undefined ||
    displayCaseId === ""
  ) {
    try {
      displayCaseId =
        localStorage.getItem("currentDisplayCaseId");
    } catch {
      displayCaseId = null;
    }
  }

  const participantInfoFromStorage =
    readParticipantInfoFromStorage();

  const source = normalizeDatasetSource(
    payload.source ??
      readCurrentDatasetSourceFromStorage()
  );

  const normalizedPayload: SubmitPayload = {
    ...payload,

    patientId,
    patientFolder,
    source,
    displayCaseId,
    workflowMode,

    pageOpenedAt,
    panelOpenedAt,
    submittedAt,
    clickedAt,

    participantInfo: {
      ...participantInfoFromStorage,
      ...(payload.participantInfo ?? {}),
    },
  };

  console.log(
    "[submitAnnotation] sending payload to /api/submit:",
    {
      panel: normalizedPayload.panel,
      action: normalizedPayload.action,
      task: normalizedPayload.task ?? null,

      source: normalizedPayload.source,

      patientId: normalizedPayload.patientId,
      patientFolder: normalizedPayload.patientFolder,
      displayCaseId: normalizedPayload.displayCaseId ?? null,

      caseId: normalizedPayload.caseId ?? null,
      eventId: normalizedPayload.eventId ?? null,
      episodeId: normalizedPayload.episodeId ?? null,
      episodeNumber: normalizedPayload.episodeNumber ?? null,
      episodeFolder: normalizedPayload.episodeFolder ?? null,

      workflowMode: normalizedPayload.workflowMode ?? null,
      participantInfo:
        normalizedPayload.participantInfo ?? null,
    }
  );

  const res = await fetch("/api/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizedPayload),
  });

  let data: any = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data?.ok) {
    console.error(
      "[submitAnnotation] backend save failed:",
      {
        status: res.status,
        statusText: res.statusText,
        data,
      }
    );

    throw new Error(
      data?.error ??
        `Failed to save annotation: ${res.status} ${res.statusText}`
    );
  }

  console.log(
    "[submitAnnotation] backend save success:",
    {
      panel: normalizedPayload.panel,
      action: normalizedPayload.action,
      task: normalizedPayload.task ?? null,
      source: normalizedPayload.source,
      drive: data?.drive ?? null,
    }
  );

  rememberLocalDriveExport(
    normalizedPayload,
    data
  );

  return data;
}