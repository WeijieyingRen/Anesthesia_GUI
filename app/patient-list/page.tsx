// Project: Your (non-mom/child) Chorio-like Game
// File: app/patient-list/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ------------ Types (minimal) ------------
type CsvRow = Record<string, any>;

interface CaseMeta {
  id: string;
  folder: string;
  age: number | null;
  weight: number | null;
}

type GameData = {
  currentPatientIndex: number;
  selectedPatients: Array<{ id: string; folder: string }>;
  diagnoses: Array<string | null>;
  startTime: string;
};

// ------------ Config ------------
const CSV_BASE = "/data";
const CASE_COUNT = 10; // how many cases you want to show

export default function PatientList() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ----- helpers -----
  const shuffle = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const loadPatientFolders = async (): Promise<string[]> => {
    try {
      const res = await fetch(`${CSV_BASE}/manifest.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`manifest ${res.status} ${res.statusText}`);
  
      const m = (await res.json()) as { patients: string[] };
      console.log("manifest content:", m);
  
      const folders = Array.isArray(m.patients) ? m.patients : [];
      console.log("folders from manifest:", folders);
  
      if (!folders.length) throw new Error("manifest has no patients");
      return folders;
    } catch (e) {
      console.error("loadPatientFolders failed:", e);
      return ["patient_1", "patient_2", "patient_3"];
    }
  };


  const parseCsv = (text: string): CsvRow[] => {
    const parsed = Papa.parse<CsvRow>(text, { header: true, dynamicTyping: true });
    return (parsed.data || []).filter(Boolean);
  };

  // pick first finite value for a set of possible headers (case-insensitive)
  const pickNumeric = (rows: CsvRow[], headerOptions: string[]): number | null => {
    if (!rows.length) return null;
    // build lowercase key map for each row
    const opts = headerOptions.map((h) => h.toLowerCase());
    for (const row of rows) {
      const keys = Object.keys(row);
      const keyMap: Record<string, string> = {};
      for (const k of keys) keyMap[k.toLowerCase()] = k;

      for (const opt of opts) {
        const realKey = keyMap[opt];
        if (realKey !== undefined) {
          const v = Number(row[realKey]);
          if (Number.isFinite(v)) return v;
        }
      }
    }
    return null;
  };

  // Try to infer age & weight using forgiving header names
  const extractAgeWeight = (rows: CsvRow[]) => {
    const age = pickNumeric(rows, ["age", "patient_age", "years", "age_years"]);
    // assuming weight is in kg by default; adjust list if you use lbs
    const weight =
      pickNumeric(rows, ["weight", "body_weight", "weight_kg", "wt_kg", "bw_kg"]) ??
      // fallback if your file stores pounds
      pickNumeric(rows, ["weight_lb", "weight_lbs", "wt_lb", "wt_lbs"]);
    return { age, weight };
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
            const res = await fetch(`${CSV_BASE}/${folder}/case_info.csv`, { cache: "no-store" });
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
              weight: null,
            });
          } catch (e) {
            console.warn(`Could not read ${folder}:`, e);
            metas.push({ id: folder, folder, age: null, weight: null });
          }
        }
  
        setCases(metas);
  
        const gameData: GameData = {
          currentPatientIndex: 0,
          selectedPatients: metas.map((m) => ({ id: m.id, folder: m.folder })),
          diagnoses: Array(metas.length).fill(null),
          startTime: new Date().toISOString(),
        };
        localStorage.setItem("gameData", JSON.stringify(gameData));
      } catch (e: any) {
        console.error("Error building case list:", e);
        setError(e?.message ?? "Failed to load cases");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleStartDiagnosis = () => {
    router.push("/dashboard");
  };

  // ------------- UI -------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4" />
          <p className="text-lg">Loading cases…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Error Loading Cases</h2>
          <p className="mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Case List</h1>
        <p className="mb-6">
          You have {cases.length} case{cases.length !== 1 ? "s" : ""} to review. Click Start to begin.
        </p>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {cases.map((c, i) => (
            <Card key={c.id} className="overflow-hidden">
              <CardHeader className="bg-slate-50">
                <div className="flex justify-between items-start">
                  <CardTitle>Case {i + 1}</CardTitle>
                </div>
                <CardDescription>{c.folder}</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Age:</span>
                    <span>{c.age ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Weight:</span>
                    <span>{c.weight ?? "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center">
          <Button size="lg" onClick={handleStartDiagnosis}>
            Start Diagnosis
          </Button>
        </div>
      </div>
    </main>
  );
}
