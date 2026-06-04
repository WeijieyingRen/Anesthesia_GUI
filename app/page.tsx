"use client";

// app/page.tsx
import type React from "react";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CsvRow = Record<string, any>;
type WorkflowMode = "annotation" | "review";

type AccessCodeLookupResult = {
  doctorId: string;
  workflowMode: WorkflowMode;
  annotationCode: string;
};

export default function Home() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [degree, setDegree] = useState("");
  const [trainingCountry, setTrainingCountry] = useState("");

  const [clinicalRole, setClinicalRole] = useState("");
  const [clinicalRoleOther, setClinicalRoleOther] = useState("");

  const [boardCertified, setBoardCertified] = useState("");
  const [clinicalSubspecialty, setClinicalSubspecialty] = useState("");

  const [experienceYears, setExperienceYears] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("participantInfo");
      if (!raw) return;

      const saved = JSON.parse(raw);

      if (saved?.name) setName(saved.name);
      if (saved?.gender) setGender(saved.gender);

      if (typeof saved?.degree === "string") {
        setDegree(saved.degree);
      } else if (Array.isArray(saved?.degrees)) {
        const firstDegree = String(saved.degrees[0] ?? "").trim();
        const fallbackOther = String(saved?.degreeOther ?? "").trim();
        setDegree(firstDegree === "Other" ? fallbackOther : firstDegree);
      }

      if (saved?.trainingCountry) setTrainingCountry(saved.trainingCountry);
      if (saved?.clinicalRole) setClinicalRole(saved.clinicalRole);
      if (saved?.clinicalRoleOther) {
        setClinicalRoleOther(saved.clinicalRoleOther);
      }

      if (saved?.boardCertified) setBoardCertified(saved.boardCertified);
      if (saved?.clinicalSubspecialty) {
        setClinicalSubspecialty(saved.clinicalSubspecialty);
      }

      if (saved?.experienceYears) {
        setExperienceYears(saved.experienceYears);
      }

      if (saved?.accessCode) {
        setAccessCode(saved.accessCode);
      }
    } catch {
      // ignore corrupted localStorage
    }
  }, []);

  function rowOrEmpty(row: CsvRow, key: string) {
    return row?.[key] ?? "";
  }

  async function resolveAccessCodeInfo(
    code: string
  ): Promise<AccessCodeLookupResult | null> {
    const reviewLookupRes = await fetch("/assigned_code/access_review_code.csv", {
      cache: "no-store",
    });

    if (!reviewLookupRes.ok) {
      throw new Error(
        `Failed to load access_review_code.csv: ${reviewLookupRes.status} ${reviewLookupRes.statusText}`
      );
    }

    const text = await reviewLookupRes.text();

    const rows = Papa.parse<CsvRow>(text, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
    }).data;

    const trimmedCode = code.trim();

    const matched = rows.find(
      (row) =>
        String(row["annotation_code"] ?? "").trim() === trimmedCode ||
        String(row["review_code"] ?? "").trim() === trimmedCode
    );

    if (!matched) return null;

    const doctorId = String(rowOrEmpty(matched, "doctor_id")).trim();
    const annotationCode = String(rowOrEmpty(matched, "annotation_code")).trim();
    const reviewCode = String(rowOrEmpty(matched, "review_code")).trim();

    const workflowMode: WorkflowMode =
      trimmedCode === reviewCode ? "review" : "annotation";

    if (!doctorId || !annotationCode) return null;

    return {
      doctorId,
      workflowMode,
      annotationCode,
    };
  }

  const hasOtherClinicalRole = clinicalRole === "Other";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedGender = gender.trim();
    const trimmedDegree = degree.trim();
    const trimmedTrainingCountry = trainingCountry.trim();
    const trimmedClinicalRoleOther = clinicalRoleOther.trim();
    const trimmedBoardCertified = boardCertified.trim();
    const trimmedClinicalSubspecialty = clinicalSubspecialty.trim();
    const trimmedExperienceYears = experienceYears.trim();
    const trimmedAccessCode = accessCode.trim();

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

    if (!trimmedTrainingCountry) {
      setError("Please enter the country of your primary clinical training.");
      return;
    }

    if (!clinicalRole) {
      setError("Please select your current clinical role.");
      return;
    }

    if (hasOtherClinicalRole && !trimmedClinicalRoleOther) {
      setError("Please specify your clinical role.");
      return;
    }

    if (!trimmedDegree) {
      setError("Please specify your professional degree(s).");
      return;
    }

    if (!trimmedBoardCertified) {
      setError("Please indicate whether you have board certification.");
      return;
    }

    if (!trimmedClinicalSubspecialty) {
      setError(
        "Please enter your clinical subspecialty, or enter None if not applicable."
      );
      return;
    }

    if (!trimmedExperienceYears) {
      setError(
        "Please enter your approximate years of hands-on anesthesia-related clinical care."
      );
      return;
    }

    if (!/^\d{4}$/.test(trimmedAccessCode)) {
      setError("Access Code must be a 4-digit number.");
      return;
    }

    try {
      setSubmitting(true);

      const accessInfo = await resolveAccessCodeInfo(trimmedAccessCode);

      if (!accessInfo) {
        setError(
          "Invalid access code. No matching annotation/review assignment was found."
        );
        return;
      }

      const participantInfo = {
        name: trimmedName,
        gender: trimmedGender,

        degree: trimmedDegree,
        degrees: [trimmedDegree],
        degreeOther: "",

        trainingCountry: trimmedTrainingCountry,

        clinicalRole,
        clinicalRoleOther: trimmedClinicalRoleOther,

        boardCertified: trimmedBoardCertified,
        clinicalSubspecialty: trimmedClinicalSubspecialty,

        experienceYears: trimmedExperienceYears,

        accessCode: trimmedAccessCode,
        doctorId: accessInfo.doctorId,
        workflowMode: accessInfo.workflowMode,
        annotationCode: accessInfo.annotationCode,

        timestamp: new Date().toISOString(),
      };

      localStorage.setItem("participantInfo", JSON.stringify(participantInfo));
      localStorage.setItem("doctorAccessCode", trimmedAccessCode);
      localStorage.setItem("doctorId", accessInfo.doctorId);
      localStorage.setItem("loginWorkflowMode", accessInfo.workflowMode);

      router.push("/consent");
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message ?? "Failed to validate access code.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-3xl w-full bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-center mb-2">
          Welcome to the AnesthesiaGPT Project
        </h1>

        <p className="text-gray-600 text-center mb-8">
          Interpret intraoperative vital signs, annotate abnormalities, and
          provide clinical reasoning.
        </p>

        <div className="w-full max-w-md">
          <h2 className="text-xl font-semibold text-center mb-4">
            Participant Information
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Input
                id="gender"
                placeholder="Enter your gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                This field will be used only for analysis of annotation behavior
                across participants.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="degree">Professional Degree</Label>
              <Input
                id="degree"
                placeholder="e.g., MD, PhD, MS, MD-PhD"
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainingCountry">
                Country of Primary Clinical Training
              </Label>
              <Input
                id="trainingCountry"
                placeholder="e.g., United States, China, India"
                value={trainingCountry}
                onChange={(e) => setTrainingCountry(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicalRole">Current Clinical Role</Label>
              <select
                id="clinicalRole"
                value={clinicalRole}
                onChange={(e) => {
                  const value = e.target.value;
                  setClinicalRole(value);

                  if (value !== "Other") {
                    setClinicalRoleOther("");
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="" disabled>
                  Select your current role
                </option>
                <option value="Resident">Resident</option>
                <option value="Fellow">Fellow</option>
                <option value="Attending physician">Attending physician</option>
                <option value="Nurse anesthetist">Nurse anesthetist</option>
                <option value="Other">Other</option>
              </select>

              {hasOtherClinicalRole && (
                <div className="space-y-2">
                  <Label htmlFor="clinicalRoleOther">
                    Please specify your clinical role
                  </Label>
                  <Input
                    id="clinicalRoleOther"
                    placeholder="Enter your clinical role"
                    value={clinicalRoleOther}
                    onChange={(e) => setClinicalRoleOther(e.target.value)}
                    required={hasOtherClinicalRole}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="boardCertified">Board Certification</Label>
              <select
                id="boardCertified"
                value={boardCertified}
                onChange={(e) => setBoardCertified(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="" disabled>
                  Select your board certification status
                </option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="In progress">In progress</option>
                <option value="Not applicable">Not applicable</option>
              </select>

              <p className="text-xs text-gray-500">
                Please indicate whether you currently hold board certification.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicalSubspecialty">
                Clinical Subspecialty
              </Label>
              <Input
                id="clinicalSubspecialty"
                placeholder="e.g., Pediatric anesthesia, Cardiac anesthesia, Critical care, Pain medicine, None"
                value={clinicalSubspecialty}
                onChange={(e) => setClinicalSubspecialty(e.target.value)}
                required
              />

              <p className="text-xs text-gray-500">
                Please enter your clinical subspecialty, or enter None if not
                applicable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="experienceYears">
                Approximate Years of Hands-on Anesthesia-Related Clinical Care
              </Label>
              <Input
                id="experienceYears"
                placeholder="e.g., 2, 5, 12"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                required
              />

              <p className="text-xs text-gray-500">
                Please include both supervised training and independent practice.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessCode">Access Code</Label>
              <Input
                id="accessCode"
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Enter your 4-digit access code"
                value={accessCode}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/\D/g, "");
                  setAccessCode(onlyDigits);
                }}
                required
              />

              <p className="text-xs text-gray-500">
                Please enter the 4-digit code provided to you.
              </p>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Logging in..." : "Log In"}
            </Button>
          </form>
        </div>

        <div className="flex justify-between w-full mt-12">
          <div className="relative w-36 h-24">
            <Image
              src="/images/university-logo.png"
              alt="University Logo"
              fill
              className="object-contain"
            />
          </div>

          <div className="relative w-32 h-24">
            <Image
              src="/images/medicine-logo.png"
              alt="School of Medicine Logo"
              fill
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </main>
  );
}