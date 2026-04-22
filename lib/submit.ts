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
};

export async function submitAnnotation(payload: SubmitPayload) {
  const submittedAt = payload.submittedAt ?? new Date().toISOString();
  const clickedAt = payload.clickedAt ?? submittedAt;

  const patientId = payload.patientId ?? payload.patientFolder ?? null;
  const patientFolder = payload.patientFolder ?? payload.patientId ?? null;

  const pageOpenedAt = payload.pageOpenedAt ?? payload.panelOpenedAt ?? null;
  const panelOpenedAt = payload.panelOpenedAt ?? payload.pageOpenedAt ?? null;

  // ===== DEMO MODE: 不写后端，直接返回成功 =====
  console.log("[DEMO MODE] submitAnnotation skipped backend save:", {
    ...payload,
    patientId,
    patientFolder,
    pageOpenedAt,
    panelOpenedAt,
    submittedAt,
    clickedAt,
  });

  return {
    ok: true,
    demo: true,
    skippedBackend: true,
    saved: {
      patientId,
      patientFolder,
      panel: payload.panel,
      action: payload.action,
      task: payload.task ?? null,
      submittedAt,
      clickedAt,
    },
  };
}