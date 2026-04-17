type SubmitPayload = {
  annotator?: { name?: string; email?: string };
  participant?: { name?: string; email?: string };
  participantInfo?: { name?: string; email?: string };

  caseId?: string | number | null;
  eventId?: string | number | null;
  selectedEventId?: string | number | null;

  panel: string;
  action: string;
  panelOpenedAt?: number | null;
  clickedAt?: number | null;

  answers?: Record<string, unknown> | null;
  summary?: unknown;
  result?: unknown;
  response?: unknown;
  notes?: unknown;
  confidence?: unknown;
};

export async function submitAnnotation(payload: SubmitPayload) {
  const res = await fetch("/api/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      clickedAt: payload.clickedAt ?? Date.now(),
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to submit annotation.");
  }

  return data;
}