"use client"

// app/page.tsx
// Main landing page ("/") of the VitalLens Project.
// This page serves as both:
// 1) A welcome / branding page (title + logos)
// 2) The participant onboarding form (name + salutation + department)
//
// After submission:
// - Participant info is saved to localStorage under "participantInfo"
// - The user is redirected to "/patient-list" to start the game
//
// Styling: Tailwind CSS
// Framework: Next.js App Router + React

import type React from "react"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function Home() {
  const router = useRouter()

  // Participant fields
  const [name, setName] = useState("")
  const [salutation, setSalutation] = useState("MD")
  const [department, setDepartment] = useState("OB/GYN")

  // On first load, try to restore participant info from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("participantInfo")
      if (!raw) return
      const saved = JSON.parse(raw)

      if (saved?.name) setName(saved.name)
      if (saved?.salutation) setSalutation(saved.salutation)
      if (saved?.department) setDepartment(saved.department)
    } catch {
      // ignore corrupted localStorage
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Persist participant info for use across pages
    localStorage.setItem(
      "participantInfo",
      JSON.stringify({
        name: name.trim(),
        salutation,
        department,
        timestamp: new Date().toISOString(),
      }),
    )

    // Navigate to the patient list page to start the game
    router.push("/patient-list")
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-3xl w-full bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
        {/* Welcome header */}
        <h1 className="text-3xl font-bold text-center mb-2">Welcome to the VitalLens Project</h1>
        <p className="text-gray-600 text-center mb-8">
          Interpret intraoperative vital signs, annotate abnormalities, and provide clinical reasoning.
        </p>

        {/* Participant form */}
        <div className="w-full max-w-md">
          <h2 className="text-xl font-semibold text-center mb-4">Participant Information</h2>

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

            <Button type="submit" className="w-full">
              Start Game
            </Button>
          </form>
        </div>

        {/* Logos */}
        <div className="flex justify-between w-full mt-12">
          <div className="relative w-36 h-24">
            <Image src="/images/university-logo.png" alt="University Logo" fill className="object-contain" />
          </div>
          <div className="relative w-32 h-24">
            <Image src="/images/medicine-logo.png" alt="School of Medicine Logo" fill className="object-contain" />
          </div>
        </div>
      </div>
    </main>
  )
}
