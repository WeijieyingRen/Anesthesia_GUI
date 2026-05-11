type SubmitPayload = {
  annotator?: { name?: string; email?: string };
  participant?: { name?: string; email?: string };
  participantInfo?: {
    name?: string;
    email?: string;
    doctorId?: string;
    accessCode?: string;
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

  panel: string;
  action: string;
  task?: string;

  pageOpenedAt?: number | string | null;
  firstInteractionAt?: number | string | null;
  firstTypingAt?: number | string | null;
  firstVoiceStartAt?: number | string | null;
  submittedAt?: number | string | null;

  panelOpenedAt?: number | string | null; // legacy
  clickedAt?: number | string | null; // legacy

  answers?: Record<string, unknown> | null;
  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;

  annotationState?: Record<string, unknown> | null;

  [key: string]: unknown;
};

export async function submitAnnotation(payload: SubmitPayload) {
  const submittedAt = payload.submittedAt ?? new Date().toISOString();
  const clickedAt = payload.clickedAt ?? submittedAt;

  const patientId = payload.patientId ?? payload.patientFolder ?? null;
  const patientFolder = payload.patientFolder ?? payload.patientId ?? null;

  const pageOpenedAt = payload.pageOpenedAt ?? payload.panelOpenedAt ?? null;
  const panelOpenedAt = payload.panelOpenedAt ?? payload.pageOpenedAt ?? null;

  const normalizedPayload: SubmitPayload = {
    ...payload,
    patientId,
    patientFolder,
    pageOpenedAt,
    panelOpenedAt,
    submittedAt,
    clickedAt,
  };

  console.log("[submitAnnotation] sending payload to /api/submit:", {
    panel: normalizedPayload.panel,
    action: normalizedPayload.action,
    task: normalizedPayload.task ?? null,
    patientId: normalizedPayload.patientId,
    patientFolder: normalizedPayload.patientFolder,
    caseId: normalizedPayload.caseId ?? null,
    eventId: normalizedPayload.eventId ?? null,
    episodeId: normalizedPayload.episodeId ?? null,
    episodeNumber: normalizedPayload.episodeNumber ?? null,
    episodeFolder: normalizedPayload.episodeFolder ?? null,
  });

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
    console.error("[submitAnnotation] backend save failed:", {
      status: res.status,
      statusText: res.statusText,
      data,
    });

    throw new Error(
      data?.error ??
        `Failed to save annotation: ${res.status} ${res.statusText}`
    );
  }

  console.log("[submitAnnotation] backend save success:", {
    panel: normalizedPayload.panel,
    action: normalizedPayload.action,
    task: normalizedPayload.task ?? null,
    drive: data?.drive ?? null,
  });

  return data;
}