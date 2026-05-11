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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CsvRow = Record<string, any>;

const CSV_BASE = "/data";

const DEGREE_OPTIONS = [
  "MD",
  "DO",
  "MBBS",
  "PhD",
  "MD/PhD",
  "CRNA",
  "RN",
  "PA",
  "Other",
] as const;

type DegreeOption = (typeof DEGREE_OPTIONS)[number];

const PRACTICE_AREA_OPTIONS = [
  "General anesthesiology",
  "Pediatric anesthesiology",
  "Cardiac anesthesiology",
  "Obstetric anesthesiology",
  "Regional anesthesia / pain",
  "Critical care",
  "Other",
] as const;

type PracticeAreaOption = (typeof PRACTICE_AREA_OPTIONS)[number];

export default function Home() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [gender, setGender] = useState("");

  const [degrees, setDegrees] = useState<DegreeOption[]>([]);
  const [degreeOther, setDegreeOther] = useState("");

  const [trainingCountry, setTrainingCountry] = useState("");

  const [clinicalRole, setClinicalRole] = useState("");
  const [clinicalRoleOther, setClinicalRoleOther] = useState("");

  const [practiceArea, setPracticeArea] = useState<PracticeAreaOption | "">("");
  const [practiceAreaOther, setPracticeAreaOther] = useState("");

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
      if (Array.isArray(saved?.degrees)) setDegrees(saved.degrees);
      if (saved?.degreeOther) setDegreeOther(saved.degreeOther);
      if (saved?.trainingCountry) setTrainingCountry(saved.trainingCountry);
      if (saved?.clinicalRole) setClinicalRole(saved.clinicalRole);
      if (saved?.clinicalRoleOther) setClinicalRoleOther(saved.clinicalRoleOther);
      if (saved?.practiceArea) setPracticeArea(saved.practiceArea);
      if (saved?.practiceAreaOther) setPracticeAreaOther(saved.practiceAreaOther);
      if (saved?.experienceYears) setExperienceYears(saved.experienceYears);
      if (saved?.accessCode) setAccessCode(saved.accessCode);
    } catch {
      // ignore corrupted localStorage
    }
  }, []);

  async function resolveDoctorIdFromAccessCode(
    code: string
  ): Promise<string | null> {
    const res = await fetch(`${CSV_BASE}/access_code.csv`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `Failed to load access_code.csv: ${res.status} ${res.statusText}`
      );
    }

    const text = await res.text();
    const rows = Papa.parse<CsvRow>(text, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
    }).data;

    const matched = rows.find(
      (row) => String(row["access_code"] ?? "").trim() === code.trim()
    );

    if (!matched) return null;

    const doctorId = String(rowOrEmpty(matched, "doctor_id")).trim();
    return doctorId || null;
  }

  function rowOrEmpty(row: CsvRow, key: string) {
    return row?.[key] ?? "";
  }

  const selectedDegree = degrees[0] ?? "";
  const hasOtherDegree = selectedDegree === "Other";
  const hasOtherClinicalRole = clinicalRole === "Other";
  const hasOtherPracticeArea = practiceArea === "Other";


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedGender = gender.trim();
    const trimmedDegreeOther = degreeOther.trim();
    const trimmedTrainingCountry = trainingCountry.trim();
    const trimmedClinicalRoleOther = clinicalRoleOther.trim();
    const trimmedPracticeAreaOther = practiceAreaOther.trim();
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

    if (hasOtherDegree && !trimmedDegreeOther) {
      setError("Please specify your professional degree(s).");
      return;
    }

    if (hasOtherPracticeArea && !trimmedPracticeAreaOther) {
      setError("Please specify your primary area of anesthesia practice.");
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

      const doctorId = await resolveDoctorIdFromAccessCode(trimmedAccessCode);

      if (!doctorId) {
        setError("Invalid access code. No matching doctor ID was found.");
        return;
      }

      const participantInfo = {
        name: trimmedName,
        gender: trimmedGender,
        degrees,
        degreeOther: trimmedDegreeOther,
        trainingCountry: trimmedTrainingCountry,
        clinicalRole,
        clinicalRoleOther: trimmedClinicalRoleOther,
        practiceArea,
        practiceAreaOther: trimmedPracticeAreaOther,
        experienceYears: trimmedExperienceYears,
        accessCode: trimmedAccessCode,
        doctorId,
        timestamp: new Date().toISOString(),
      };

      localStorage.setItem("participantInfo", JSON.stringify(participantInfo));
      localStorage.setItem("doctorAccessCode", trimmedAccessCode);
      localStorage.setItem("doctorId", doctorId);

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
              <Label htmlFor="gender">Gender (optional)</Label>
              <Input
                id="gender"
                placeholder="Enter your gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                This field will be used only for analysis of
                annotation behavior across participants.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Professional Degree</Label>
              <Select
                value={selectedDegree}
                onValueChange={(value) => {
                  setDegrees(value ? [value as DegreeOption] : []);
                  if (value !== "Other") {
                    setDegreeOther("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select degree" />
                </SelectTrigger>
                <SelectContent>
                  {DEGREE_OPTIONS.map((degree) => (
                    <SelectItem key={degree} value={degree}>
                      {degree}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasOtherDegree && (
                <div className="space-y-2">
                  <Label htmlFor="degreeOther">Please specify degree</Label>
                  <Input
                    id="degreeOther"
                    placeholder="Enter your degree"
                    value={degreeOther}
                    onChange={(e) => setDegreeOther(e.target.value)}
                  />
                </div>
              )}
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
              <Select
                value={clinicalRole}
                onValueChange={(value) => {
                  setClinicalRole(value);
                  if (value !== "Other") {
                    setClinicalRoleOther("");
                  }
                }}
              >
                <SelectTrigger id="clinicalRole">
                  <SelectValue placeholder="Select your current role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Resident">Resident</SelectItem>
                  <SelectItem value="Fellow">Fellow</SelectItem>
                  <SelectItem value="Attending physician">
                    Attending physician
                  </SelectItem>
                  <SelectItem value="CRNA / Nurse anesthetist">
                    CRNA / Nurse anesthetist
                  </SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>

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
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="practiceArea">
                Primary Area of Anesthesia Practice (optional)
              </Label>
              <Select
                value={practiceArea}
                onValueChange={(value) => {
                  setPracticeArea(value as PracticeAreaOption);
                  if (value !== "Other") {
                    setPracticeAreaOther("");
                  }
                }}
              >
                <SelectTrigger id="practiceArea">
                  <SelectValue placeholder="Select your primary practice area" />
                </SelectTrigger>
                <SelectContent>
                  {PRACTICE_AREA_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasOtherPracticeArea && (
                <div className="space-y-2">
                  <Label htmlFor="practiceAreaOther">
                    Please specify your practice area
                  </Label>
                  <Input
                    id="practiceAreaOther"
                    placeholder="Enter your primary practice area"
                    value={practiceAreaOther}
                    onChange={(e) => setPracticeAreaOther(e.target.value)}
                  />
                </div>
              )}
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