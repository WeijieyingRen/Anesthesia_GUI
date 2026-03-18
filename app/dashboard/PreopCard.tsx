"use client";

import type { PreopAssessment } from "@/lib/types";

type PreopCardProps = {
  preop: PreopAssessment | null;
};

export default function PreopCard({ preop }: PreopCardProps) {
  if (!preop) return null;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-gray-800">
        Preoperative Assessment
      </div>

      <div className="grid grid-cols-6 gap-3 text-sm text-gray-700">
        <div>ASA Status: {preop.asa_status ?? "-"}</div>
        <div>Mallampati Score: {preop.mallampati_score ?? "-"}</div>
        <div>NPO Since: {preop.npo_since ?? "-"}</div>
        <div>Limited Cervical ROM: {preop.limited_cervical_rom ?? "-"}</div>
        <div>TM Distance: {preop.tm_distance ?? "-"}</div>
        <div>
          Abnormal Oropharynx Anatomy: {preop.abnormal_oropharynx_anatomy ?? "-"}
        </div>
      </div>
    </div>
  );
}