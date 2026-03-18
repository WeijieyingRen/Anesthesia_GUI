type SubmitPayload = {
    annotator?: { name?: string };
    caseId?: string | number | null;
    eventId?: string | number | null;
    panel: string;
    action: string;
    panelOpenedAt?: number | null;
    answers?: Record<string, unknown> | null;
  };
  
  export async function submitAnnotation(payload: SubmitPayload) {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        clickedAt: Date.now(),
      }),
    });
  
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || "Failed to submit annotation.");
    }
  
    return res.json();
  }