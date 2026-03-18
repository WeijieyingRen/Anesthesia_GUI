"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DiagnosisEntry = {
  patientId: string;
  records?: Record<string, number[]>;
};

type PatientMeta = {
  id: string;
  caseId?: string;
  patientId?: string;
  participantId?: string;
};
interface ParticipantInfo {
  name: string;
  salutation?: string;
  department?: string;
  timestamp: string;
}

export default function Results() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientMeta[]>([]);
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved data + auto-export JSON
  useEffect(() => {
    try {
      const gameData = localStorage.getItem("gameData");
      const participantData = localStorage.getItem("participantInfo");

      if (!gameData || !participantData) {
        router.push("/");
        return;
      }

      const parsedGameData = JSON.parse(gameData);
      const parsedParticipantInfo = JSON.parse(participantData) as ParticipantInfo;

      // --- Prepare valid arrays ---
      const validPatients: PatientMeta[] = Array.isArray(parsedGameData.selectedPatients)
        ? parsedGameData.selectedPatients.filter(
            (p: any) => p && typeof p === "object" && "id" in p
          )
        : [];

      // Diagnoses are now stored per patient with records
      const validDiagnoses: DiagnosisEntry[] = Array.isArray(parsedGameData.diagnoses)
        ? parsedGameData.diagnoses.filter(
            (d: any) => d && typeof d === "object" && "patientId" in d
          )
        : [];

      setPatients(validPatients);
      setDiagnoses(validDiagnoses);
      setParticipantInfo(parsedParticipantInfo);
      setLoading(false);

      // --- Auto-download JSON export ---
      if (parsedGameData && parsedParticipantInfo) {
        const exportObj = {
          participant: parsedParticipantInfo,
          session: parsedGameData,
          exportedAt: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
          type: "application/json",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `session_${parsedParticipantInfo.name || "anonymous"}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Error loading results:", err);
      setError("Could not load results data");
      setLoading(false);
    }
  }, [router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4" />
          <p className="text-lg">Loading results...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Error</h2>
          <p className="mb-4">{error}</p>
          <Button onClick={() => router.push("/")}>Return to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-gray-50">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-center text-2xl font-semibold">
              Thank You for Participating
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-6">
            <p className="text-lg mb-2">
              Your session results have been saved and automatically downloaded.
            </p>
            <p className="text-gray-600">
              You can now close this window or return to the home screen.
            </p>
            <div className="mt-4">
              <Button onClick={() => router.push("/")}>🏠 Return to Home</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per Patient Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {patients.length === 0 ? (
              <p>No patient data available.</p>
            ) : (
              <div className="space-y-4">
                {patients.map((p) => {
                  const patientDiagnoses = diagnoses.find(
                    (d) => d.patientId === p.id
                  );

                  return (
                    <div
                      key={p.id}
                      className="border rounded-lg p-4 bg-white shadow-sm"
                    >
                      <h3 className="font-semibold text-lg mb-2">
                        Patient {p.id || "Unnamed"}
                      </h3>
                      {!patientDiagnoses || !patientDiagnoses.records ? (
                        <p className="text-gray-500">No medication actions recorded.</p>
                      ) : (
                        <ul className="list-disc list-inside text-sm text-gray-700">
                          {Object.entries(patientDiagnoses.records).map(
                            ([medType, times]) => (
                              <li key={medType}>
                                <span className="font-semibold capitalize">{medType}</span>:{" "}
                                {(times as number[]).join(", ")}
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
