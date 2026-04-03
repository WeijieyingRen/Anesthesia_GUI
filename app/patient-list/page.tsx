"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ------------ Types ------------
type CsvRow = Record<string, any>;

interface CaseMeta {
  id: string;
  folder: string;
  age: number | null;
}

type GameData = {
  currentPatientIndex: number;
  selectedPatients: Array<{ id: string; folder: string }>;
  diagnoses: Array<string | null>;
  startTime: string;
};

// ------------ Config ------------
const CSV_BASE = "/data";
const CASE_COUNT = 100;

export default function PatientList() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseMeta[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatientFolders = async (): Promise<string[]> => {
    try {
      const res = await fetch(`${CSV_BASE}/manifest.json`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`manifest ${res.status} ${res.statusText}`);

      const m = (await res.json()) as { patients: string[] };
      const folders = Array.isArray(m.patients) ? m.patients : [];

      if (!folders.length) throw new Error("manifest has no patients");
      return folders;
    } catch (e) {
      console.error("loadPatientFolders failed:", e);
      return Array.from({ length: CASE_COUNT }, (_, i) => `patient_${i + 1}`);
    }
  };

  useEffect(() => {
    const participantInfo = localStorage.getItem("participantInfo");
    if (!participantInfo) {
      router.push("/participant-info");
      return;
    }

    (async () => {
      try {
        const folders = await loadPatientFolders();
        if (!folders.length) throw new Error("No patient folders found");

        const chosen = folders.slice(0, Math.min(CASE_COUNT, folders.length));

        const metas: CaseMeta[] = [];
        for (const folder of chosen) {
          try {
            const res = await fetch(`${CSV_BASE}/${folder}/case_info.csv`, {
              cache: "no-store",
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

            const text = await res.text();
            const rows = Papa.parse<CsvRow>(text, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
            }).data;

            const first = rows[0] ?? {};

            metas.push({
              id: folder,
              folder,
              age: Number.isFinite(Number(first["aims_patient_age_years"]))
                ? Number(first["aims_patient_age_years"])
                : null,
            });
          } catch (e) {
            console.warn(`Could not read ${folder}:`, e);
            metas.push({
              id: folder,
              folder,
              age: null,
            });
          }
        }

        setCases(metas);
      } catch (e: any) {
        console.error("Error building case list:", e);
        setError(e?.message ?? "Failed to load cases");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const buildGameData = (selectedCases: CaseMeta[]): GameData => {
    return {
      currentPatientIndex: 0,
      selectedPatients: selectedCases.map((c) => ({
        id: c.id,
        folder: c.folder,
      })),
      diagnoses: Array(selectedCases.length).fill(null),
      startTime: new Date().toISOString(),
    };
  };

  const handleStartSingleCase = (caseItem: CaseMeta) => {
    const gameData = buildGameData([caseItem]);
    localStorage.setItem("gameData", JSON.stringify(gameData));
    router.push("/dashboard");
  };

  const handleToggleCase = (caseId: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId)
        ? prev.filter((id) => id !== caseId)
        : [...prev, caseId]
    );
  };

  const handleStartSelectedCases = () => {
    const selectedCases = cases.filter((c) => selectedCaseIds.includes(c.id));

    if (selectedCases.length === 0) {
      alert("Please select at least one case.");
      return;
    }

    const gameData = buildGameData(selectedCases);
    localStorage.setItem("gameData", JSON.stringify(gameData));
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-700" />
          <p className="text-lg">Loading cases…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <div className="mb-4 text-5xl text-red-500">⚠️</div>
          <h2 className="mb-2 text-2xl font-bold">Error Loading Cases</h2>
          <p className="mb-4 text-gray-600">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-4xl font-bold text-gray-900">Annotation Goals and Case List</h1>

        {/* Annotation Goals */}
        <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-2xl font-bold text-gray-900">
            Annotation Goals
          </h2>
          <div className="space-y-3 text-sm leading-7 text-gray-700">
            <p>
              This project aims to build a large anesthesia foundation model that
              can understand what happened during anesthesia, why it happened,
              what interventions clinicians performed (for example medication,
              fluid, and gas-related interventions), how effective these
              interventions were, and how the patient physiologically responded.
            </p>

            <p>
              The annotation work is divided into two major tasks.
            </p>
            <div>
  <p>
    <span className="font-semibold text-gray-900">Task 1:</span>{" "}
    episode-level intraoperative event understanding, including abnormal
    event detection, mechanism (etiology) classification and generation,
    intervention evaluation (medication, gas, fluid), and patient
    physiology response evaluation.
  </p>

  <div className="mt-2 text-sm leading-7 text-gray-700">
    <p className="font-semibold text-gray-900">Annotate:</p>
    <ul className="ml-10 list-disc space-y-1">
      <li>Likely true physiologic abnormal episodes.</li>
      <li>Episodes that are moderate or severe.</li>
      <li>Episodes that are prolonged or clearly sustained.</li>
      <li>Episodes with associated changes in other vital signs.</li>
      <li>Episodes temporally related to interventions, medications, fluids, or ventilation changes.</li>
      <li>Episodes that are important to the overall intraoperative clinical course.</li>
    </ul>

    <p className="pt-2 font-semibold text-gray-900">Do not annotate:</p>
    <ul className="ml-10 list-disc space-y-1">
      <li>Obvious monitoring artifacts or measurement errors.</li>
      <li>Very brief isolated fluctuations with no clear clinical relevance.</li>
      <li>Minor waveform blips that do not support downstream interpretation.</li>
      <li>Events that are too trivial to inform mechanism, intervention, or response analysis.</li>
      <li>Do not try to annotate every small abnormality in the record; focus on the key episodes only.</li>
    </ul>
  </div>
</div>

            <p>
              <span className="font-semibold text-gray-900">Task 2:</span>{" "}
              patient-level generation of an intraoperative record that summarizes
              the overall clinical course across the full surgery.
            </p>
          </div>
        </div>

        {/* Guidance */}
        <div className="mb-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-2xl font-bold text-gray-900">Guidance</h2>
          <div className="space-y-3 text-sm leading-7 text-gray-700">
            <p>
              You may either start a single case directly or add multiple cases
              into a selected queue and review them sequentially.
            </p>

            <p>
              For each case, please first identify important intraoperative
              abnormal episodes from the timeline, then annotate the episode-level
              subtasks, and finally complete one patient-level summary for the
              whole case.
            </p>

            <p>
              Please focus on clinically meaningful abnormalities and clinically
              relevant mechanisms and interventions, rather than annotating every
              small fluctuation in the waveform.
            </p>

            <p>
              When evaluating intervention and response, prioritize clinical
              reasoning: whether the intervention matched the suspected mechanism,
              whether its timing was appropriate, and whether the subsequent
              patient response supported that judgment.
            </p>

            <p>
              After selecting cases, click{" "}
              <span className="font-semibold text-gray-900">
                Start Selected Cases
              </span>{" "}
              to begin annotation.
            </p>
          </div>
        </div>

        <p className="mb-6 text-lg text-gray-700">
          You have {cases.length} case{cases.length !== 1 ? "s" : ""} available
          for review.
        </p>

        <div className="mb-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {cases.map((c, i) => {
            const selected = selectedCaseIds.includes(c.id);

            return (
              <Card key={c.id} className="overflow-hidden rounded-2xl shadow-sm">
                <CardHeader className="bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-3xl font-bold">
                      Case {i + 1}
                    </CardTitle>

                    <div
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                        selected
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {selected ? "Selected" : "Not selected"}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  <div className="mb-8 space-y-4 text-lg text-gray-900">
                    <div className="flex justify-between">
                      <span className="font-semibold">Age:</span>
                      <span>{c.age ?? "—"}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => handleStartSingleCase(c)}
                      className="px-6 py-2 text-base"
                    >
                      Start This Case
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleToggleCase(c.id)}
                      className="px-6 py-2 text-base"
                    >
                      {selected ? "Remove" : "Add"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="text-sm text-gray-600">
            Selected: {selectedCaseIds.length} / {cases.length}
          </div>

          <Button size="lg" onClick={handleStartSelectedCases}>
            Start Selected Cases
          </Button>
        </div>
      </div>
    </main>
  );
}