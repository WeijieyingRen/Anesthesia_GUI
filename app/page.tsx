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
type DatasetSource = "stanford_mpog" | "mover";

type AccessCodeLookupResult = {
  doctorId: string;
  workflowMode: WorkflowMode;
  annotationCode: string;
  reviewCode: string | null;
  datasetSource: DatasetSource;
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
  const [clinicalSubspecialty, setClinicalSubspecialty] =
    useState("");

  const [experienceYears, setExperienceYears] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("participantInfo");

      if (!raw) {
        return;
      }

      const saved = JSON.parse(raw);

      if (saved?.name) {
        setName(saved.name);
      }

      if (saved?.gender) {
        setGender(saved.gender);
      }

      if (typeof saved?.degree === "string") {
        setDegree(saved.degree);
      } else if (Array.isArray(saved?.degrees)) {
        const firstDegree = String(
          saved.degrees[0] ?? ""
        ).trim();

        const fallbackOther = String(
          saved?.degreeOther ?? ""
        ).trim();

        setDegree(
          firstDegree === "Other"
            ? fallbackOther
            : firstDegree
        );
      }

      if (saved?.trainingCountry) {
        setTrainingCountry(saved.trainingCountry);
      }

      if (saved?.clinicalRole) {
        setClinicalRole(saved.clinicalRole);
      }

      if (saved?.clinicalRoleOther) {
        setClinicalRoleOther(saved.clinicalRoleOther);
      }

      if (saved?.boardCertified) {
        setBoardCertified(saved.boardCertified);
      }

      if (saved?.clinicalSubspecialty) {
        setClinicalSubspecialty(
          saved.clinicalSubspecialty
        );
      }

      if (saved?.experienceYears) {
        setExperienceYears(saved.experienceYears);
      }

      if (saved?.accessCode) {
        setAccessCode(saved.accessCode);
      }
    } catch (error) {
      console.warn(
        "Failed to restore participantInfo from localStorage:",
        error
      );
    }
  }, []);

  async function resolveAccessCodeInfo(
    code: string
  ): Promise<AccessCodeLookupResult | null> {
    const normalizedCode = String(code ?? "").trim();

    const lookupConfigs: Array<{
      fileName: string;
      datasetSource: DatasetSource;
    }> = [
      {
        fileName: "access_review_code.csv",
        datasetSource: "stanford_mpog",
      },
      {
        fileName: "mover_access_review_code.csv",
        datasetSource: "mover",
      },
    ];

    const matches: AccessCodeLookupResult[] = [];

    for (const config of lookupConfigs) {
      const res = await fetch(
        `/assigned_code/${config.fileName}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(
          `Failed to load ${config.fileName}: ${res.status} ${res.statusText}`
        );
      }

      const text = await res.text();

      const parsed = Papa.parse<CsvRow>(text, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0) {
        console.warn(
          `CSV parsing warnings in ${config.fileName}:`,
          parsed.errors
        );
      }

      const matchedRow = parsed.data.find((row) => {
        const annotationCode = String(
          row["annotation_code"] ?? ""
        ).trim();

        const reviewCode = String(
          row["review_code"] ?? ""
        ).trim();

        return (
          annotationCode === normalizedCode ||
          reviewCode === normalizedCode
        );
      });

      if (!matchedRow) {
        continue;
      }

      const doctorId = String(
        matchedRow["doctor_id"] ?? ""
      ).trim();

      const annotationCode = String(
        matchedRow["annotation_code"] ?? ""
      ).trim();

      const reviewCode =
        String(
          matchedRow["review_code"] ?? ""
        ).trim() || null;

      if (!doctorId || !annotationCode) {
        throw new Error(
          `Matched access-code row in ${config.fileName} is missing doctor_id or annotation_code.`
        );
      }

      const workflowMode: WorkflowMode =
        reviewCode !== null &&
        normalizedCode === reviewCode
          ? "review"
          : "annotation";

      matches.push({
        doctorId,
        workflowMode,
        annotationCode,
        reviewCode,
        datasetSource: config.datasetSource,
      });
    }

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      throw new Error(
        `Access code ${normalizedCode} appears in more than one lookup file. MPOG and MOVER access codes must not overlap.`
      );
    }

    return matches[0];
  }

  const hasOtherClinicalRole =
    clinicalRole === "Other";

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedGender = gender.trim();
    const trimmedDegree = degree.trim();

    const trimmedTrainingCountry =
      trainingCountry.trim();

    const trimmedClinicalRoleOther =
      clinicalRoleOther.trim();

    const trimmedBoardCertified =
      boardCertified.trim();

    const trimmedClinicalSubspecialty =
      clinicalSubspecialty.trim();

    const trimmedExperienceYears =
      experienceYears.trim();

    const trimmedAccessCode =
      accessCode.trim();

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

    if (!trimmedTrainingCountry) {
      setError(
        "Please enter the country of your primary clinical training."
      );
      return;
    }

    if (!clinicalRole) {
      setError(
        "Please select your current clinical role."
      );
      return;
    }

    if (
      hasOtherClinicalRole &&
      !trimmedClinicalRoleOther
    ) {
      setError(
        "Please specify your clinical role."
      );
      return;
    }

    if (!trimmedDegree) {
      setError(
        "Please specify your professional degree(s)."
      );
      return;
    }

    if (!trimmedBoardCertified) {
      setError(
        "Please indicate whether you have board certification."
      );
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
      setError(
        "Access Code must be a 4-digit number."
      );
      return;
    }

    try {
      setSubmitting(true);

      const accessInfo =
        await resolveAccessCodeInfo(
          trimmedAccessCode
        );

      if (!accessInfo) {
        setError(
          "Invalid access code. No matching MPOG or MOVER annotation/review assignment was found."
        );
        return;
      }

      /*
       * Clear data from the previous case/session.
       *
       * consentInfo is deliberately removed so that a new login
       * must review and accept the consent page.
       */
      localStorage.removeItem("gameData");
      localStorage.removeItem(
        "currentDisplayCaseId"
      );
      localStorage.removeItem("consentInfo");
      localStorage.removeItem("isUserGuideMode");

      const participantInfo = {
        name: trimmedName,
        gender: trimmedGender,

        degree: trimmedDegree,
        degrees: [trimmedDegree],
        degreeOther: "",

        trainingCountry:
          trimmedTrainingCountry,

        clinicalRole,

        clinicalRoleOther:
          hasOtherClinicalRole
            ? trimmedClinicalRoleOther
            : "",

        boardCertified:
          trimmedBoardCertified,

        clinicalSubspecialty:
          trimmedClinicalSubspecialty,

        experienceYears:
          trimmedExperienceYears,

        accessCode:
          trimmedAccessCode,

        doctorId:
          accessInfo.doctorId,

        workflowMode:
          accessInfo.workflowMode,

        annotationCode:
          accessInfo.annotationCode,

        reviewCode:
          accessInfo.reviewCode,

        datasetSource:
          accessInfo.datasetSource,

        timestamp:
          new Date().toISOString(),
      };

      /*
       * This is the key line that was missing.
       *
       * The consent page checks participantInfo.
       * If participantInfo is not saved, it redirects back to "/".
       */
      localStorage.setItem(
        "participantInfo",
        JSON.stringify(participantInfo)
      );

      localStorage.setItem(
        "doctorAccessCode",
        trimmedAccessCode
      );

      localStorage.setItem(
        "doctorId",
        accessInfo.doctorId
      );

      localStorage.setItem(
        "annotationCode",
        accessInfo.annotationCode
      );

      localStorage.setItem(
        "loginWorkflowMode",
        accessInfo.workflowMode
      );

      localStorage.setItem(
        "currentWorkflowMode",
        accessInfo.workflowMode
      );

      localStorage.setItem(
        "currentDatasetSource",
        accessInfo.datasetSource
      );

      localStorage.setItem(
        "datasetSource",
        accessInfo.datasetSource
      );

      if (accessInfo.reviewCode) {
        localStorage.setItem(
          "reviewCode",
          accessInfo.reviewCode
        );
      } else {
        localStorage.removeItem("reviewCode");
      }

      console.log(
        "[Login] participant information saved:",
        {
          doctorId: accessInfo.doctorId,
          workflowMode:
            accessInfo.workflowMode,
          annotationCode:
            accessInfo.annotationCode,
          reviewCode:
            accessInfo.reviewCode,
          datasetSource:
            accessInfo.datasetSource,
        }
      );

      router.push("/consent");
    } catch (err: unknown) {
      console.error("Login error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to validate access code."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8">
      <div className="flex w-full max-w-3xl flex-col items-center rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold">
          Welcome to the AnesthesiaGPT Project
        </h1>

        <p className="mb-8 text-center text-gray-600">
          Interpret intraoperative vital signs,
          annotate abnormalities, and provide
          clinical reasoning.
        </p>

        <div className="w-full max-w-md">
          <h2 className="mb-4 text-center text-xl font-semibold">
            Participant Information
          </h2>

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="name">
                Full Name
              </Label>

              <Input
                id="name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">
                Gender
              </Label>

              <Input
                id="gender"
                placeholder="Enter your gender"
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value)
                }
              />

              <p className="text-xs text-gray-500">
                This field will be used only for
                analysis of annotation behavior
                across participants.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="degree">
                Professional Degree
              </Label>

              <Input
                id="degree"
                placeholder="e.g., MD, PhD, MS, MD-PhD"
                value={degree}
                onChange={(e) =>
                  setDegree(e.target.value)
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainingCountry">
                Country and State of Primary
                Clinical Training
              </Label>

              <Input
                id="trainingCountry"
                placeholder="e.g., United States, California; China; India"
                value={trainingCountry}
                onChange={(e) =>
                  setTrainingCountry(
                    e.target.value
                  )
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicalRole">
                Current Clinical Role
              </Label>

              <select
                id="clinicalRole"
                value={clinicalRole}
                onChange={(e) => {
                  const value =
                    e.target.value;

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

                <option value="Resident">
                  Resident
                </option>

                <option value="Fellow">
                  Fellow
                </option>

                <option value="Attending physician">
                  Attending physician
                </option>

                <option value="Nurse anesthetist">
                  Nurse anesthetist
                </option>

                <option value="Other">
                  Other
                </option>
              </select>

              {hasOtherClinicalRole && (
                <div className="space-y-2">
                  <Label htmlFor="clinicalRoleOther">
                    Please specify your clinical
                    role
                  </Label>

                  <Input
                    id="clinicalRoleOther"
                    placeholder="Enter your clinical role"
                    value={clinicalRoleOther}
                    onChange={(e) =>
                      setClinicalRoleOther(
                        e.target.value
                      )
                    }
                    required
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="boardCertified">
                Board Certification
              </Label>

              <select
                id="boardCertified"
                value={boardCertified}
                onChange={(e) =>
                  setBoardCertified(
                    e.target.value
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="" disabled>
                  Select your board certification
                  status
                </option>

                <option value="Yes">
                  Yes
                </option>

                <option value="No">
                  No
                </option>

                <option value="In progress">
                  In progress
                </option>

                <option value="Not applicable">
                  Not applicable
                </option>
              </select>

              <p className="text-xs text-gray-500">
                Please indicate whether you
                currently hold board certification.
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
                onChange={(e) =>
                  setClinicalSubspecialty(
                    e.target.value
                  )
                }
                required
              />

              <p className="text-xs text-gray-500">
                Please enter your clinical
                subspecialty, or enter None if not
                applicable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="experienceYears">
                Approximate Years of Hands-on
                Anesthesia-Related Clinical Care
              </Label>

              <Input
                id="experienceYears"
                placeholder="e.g., 2, 5, 12"
                value={experienceYears}
                onChange={(e) =>
                  setExperienceYears(
                    e.target.value
                  )
                }
                required
              />

              <p className="text-xs text-gray-500">
                Please include both supervised
                training and independent practice.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessCode">
                Access Code
              </Label>

              <Input
                id="accessCode"
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Enter your 4-digit access code"
                value={accessCode}
                onChange={(e) => {
                  const onlyDigits =
                    e.target.value.replace(
                      /\D/g,
                      ""
                    );

                  setAccessCode(onlyDigits);
                }}
                required
              />

              <p className="text-xs text-gray-500">
                Please enter the 4-digit code
                provided to you.
              </p>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting
                ? "Logging in..."
                : "Log In"}
            </Button>
          </form>
        </div>

        <div className="mt-12 flex w-full justify-between">
          <div className="relative h-24 w-36">
            <Image
              src="/images/university-logo.png"
              alt="University Logo"
              fill
              sizes="144px"
              className="object-contain"
            />
          </div>

          <div className="relative h-24 w-32">
            <Image
              src="/images/medicine-logo.png"
              alt="School of Medicine Logo"
              fill
              sizes="128px"
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </main>
  );
}