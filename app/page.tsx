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

export default function Home() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [salutation, setSalutation] = useState("MD");
  const [department, setDepartment] = useState("OB/GYN");
  const [accessCode, setAccessCode] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("participantInfo");
      if (!raw) return;

      const saved = JSON.parse(raw);

      if (saved?.name) setName(saved.name);
      if (saved?.email) setEmail(saved.email);
      if (saved?.salutation) setSalutation(saved.salutation);
      if (saved?.department) setDepartment(saved.department);
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
      throw new Error(`Failed to load access_code.csv: ${res.status} ${res.statusText}`);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedAccessCode = accessCode.trim();

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
        name: name.trim(),
        email: email.trim(),
        salutation,
        department,
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
          Welcome to the VitalLens Project
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
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salutation">Salutation</Label>
              <Select value={salutation} onValueChange={setSalutation}>
                <SelectTrigger id="salutation">
                  <SelectValue placeholder="Select salutation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MD">MD</SelectItem>
                  <SelectItem value="PhD">PhD</SelectItem>
                  <SelectItem value="MD PhD">MD PhD</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OB/GYN">OB/GYN</SelectItem>
                  <SelectItem value="Anesthesiology">Anesthesiology</SelectItem>
                  <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                  <SelectItem value="Neonatology">Neonatology</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
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