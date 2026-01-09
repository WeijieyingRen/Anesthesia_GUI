import { useState } from "react";

export type VitalKey =
  | "MAP"
  | "SBP"
  | "DBP"
  | "ETCO2"
  | "HR"
  | "SpO2";

export type AbnormalPiece = {
  feature: VitalKey;
  pieceIndex: number;
  start: number;
  end: number;
  centerY: number;
  yAxisId: "left" | "right";
  etiology: string;
  confidence: number;
};

type Draft = {
  feature: VitalKey;
  start: number;
  end: number | null;
  centerY: number;
  yAxisId: "left" | "right";
};

export function useAbnormalAnnotations(opts: {
  patientId: string;
  activeVital: VitalKey;
}) {
  const { patientId, activeVital } = opts;

  const [abnormalPieces, setAbnormalPieces] = useState<AbnormalPiece[]>([]);
  const [abnormalDraft, setAbnormalDraft] = useState<Draft | null>(null);

  // ---------- CRUD ----------

  function submitAbnormalPiece(
    feature: VitalKey,
    start: number,
    end: number,
    centerY: number,
    yAxisId: "left" | "right"
  ) {
    const key = "abnormal_annotations";
    const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");

    const pieceIndex =
      Math.max(
        0,
        ...existing
          .filter((r) => r.patientId === patientId && r.feature === feature)
          .map((r) => Number(r.pieceIndex) || 0)
      ) + 1;

    const record = {
      patientId,
      feature,
      pieceIndex,
      startMinute: start,
      endMinute: end,
      centerY,
      yAxisId,
      etiology: "",
      confidence: 3,
      createdAt: Date.now(),
    };

    existing.push(record);
    localStorage.setItem(key, JSON.stringify(existing));

    setAbnormalPieces((prev) => [
      ...prev,
      {
        feature,
        pieceIndex,
        start,
        end,
        centerY,
        yAxisId,
        etiology: "",
        confidence: 3,
      },
    ]);
  }

  function deleteAbnormalPiece(feature: VitalKey, pieceIndex: number) {
    setAbnormalPieces((prev) =>
      prev.filter(
        (p) => !(p.feature === feature && p.pieceIndex === pieceIndex)
      )
    );

    const key = "abnormal_annotations";
    const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");

    const filtered = existing.filter(
      (r) =>
        !(
          r.patientId === patientId &&
          r.feature === feature &&
          Number(r.pieceIndex) === pieceIndex
        )
    );

    localStorage.setItem(key, JSON.stringify(filtered));
  }

  function updateAbnormalPiece(
    feature: VitalKey,
    pieceIndex: number,
    patch: Partial<Pick<AbnormalPiece, "etiology" | "confidence">>
  ) {
    setAbnormalPieces((prev) =>
      prev.map((p) =>
        p.feature === feature && p.pieceIndex === pieceIndex
          ? { ...p, ...patch }
          : p
      )
    );

    const key = "abnormal_annotations";
    const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");

    const idx = existing.findIndex(
      (r) =>
        r.patientId === patientId &&
        r.feature === feature &&
        r.pieceIndex === pieceIndex
    );

    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...patch };
      localStorage.setItem(key, JSON.stringify(existing));
    }
  }

  // ---------- Chart bindings ----------

  function bindChartHandlers(chartData: any[]) {
    return {
      onMouseDown(e: any) {
        const idx = e?.activeTooltipIndex;
        if (typeof idx !== "number") return;

        const row = chartData[idx];
        if (!row) return;

        const centerY = row[activeVital];
        if (!Number.isFinite(centerY)) return;

        setAbnormalDraft({
          feature: activeVital,
          start: row.time,
          end: row.time,
          centerY,
          yAxisId: "left",
        });
      },

      onMouseMove(e: any) {
        if (!abnormalDraft) return;

        const idx = e?.activeTooltipIndex;
        if (typeof idx !== "number") return;

        const x = chartData[idx]?.time;
        if (typeof x !== "number") return;

        setAbnormalDraft((prev) =>
          prev ? { ...prev, end: x } : null
        );
      },

      onMouseUp() {
        if (!abnormalDraft || abnormalDraft.end == null) {
          setAbnormalDraft(null);
          return;
        }

        const start = Math.min(abnormalDraft.start, abnormalDraft.end);
        const end = Math.max(abnormalDraft.start, abnormalDraft.end);

        submitAbnormalPiece(
          abnormalDraft.feature,
          start,
          end,
          abnormalDraft.centerY,
          abnormalDraft.yAxisId
        );

        setAbnormalDraft(null);
      },
    };
  }

  // ---------- expose ----------

  return {
    abnormalPieces,
    abnormalDraft,
    submitAbnormalPiece,
    deleteAbnormalPiece,
    updateAbnormalPiece,
    bindChartHandlers,
    setAbnormalPieces, // 给 loadPatient 用
  };
}
