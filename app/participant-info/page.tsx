// This file is part of the "Participant Info" page in a Next.js application.
// It is located at app/participant-info/page.tsx.
// The purpose of this page is to collect participant information before starting the game.
// The page includes a form where the participant can enter their name, select a salutation, and choose a department.
// The form data is stored in local storage, and upon submission, the user is redirected to the patient list page.
// The page is styled using Tailwind CSS and includes a header, form fields, and a submit button.
// Import necessary modules and components
// This file is part of the "Participant Info" page in a Next.js application.
// It is located at app/participant-info/page.tsx.
// The purpose of this page is to collect participant information before starting the game.
// The page includes a form where the participant can enter their name, select a salutation, and choose a department.
// The form data is stored in local storage, and upon submission, the user is redirected to the patient list page.

"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ParticipantInfo() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [salutation, setSalutation] = useState("MD")
  const [department, setDepartment] = useState("OB/GYN")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Store participant info in localStorage
    localStorage.setItem(
      "participantInfo",
      JSON.stringify({
        name,
        salutation,
        department,
        timestamp: new Date().toISOString(),
      }),
    )

    // Navigate to the patient list
    router.push("/patient-list")
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Participant Information</h1>

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
    </main>
  )
}

