// write comments to explain the code and the page location
// This is the main page of the application, located at app/page.tsx.
// It serves as the entry point for the application and contains the main layout and content.
// The page is styled using Tailwind CSS and includes a welcome message, a button to start the game, and logos of the university and school of medicine.
// The page is built using React and Next.js, and it uses the Link component from Next.js for navigation.
// Import necessary modules and components

import Link from "next/link"
import Image from "next/image"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-3xl w-full bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-center mb-6">Welcome to Intra-op Bolus Medication Game!</h1>

        <p className="text-lg text-center mb-8">
          In this game, you will be presented with patient profiles. Your task is to analyze their vitals and make a
          diagnosis.
        </p>

        <Link
          href="/participant-info"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors flex items-center"
        >
          <span className="mr-2">Begin</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-gamepad-2"
          >
            <line x1="6" x2="10" y1="11" y2="11" />
            <line x1="8" x2="8" y1="9" y2="13" />
            <line x1="15" x2="15.01" y1="12" y2="12" />
            <line x1="18" x2="18.01" y1="10" y2="10" />
            <rect width="20" height="12" x="2" y="6" rx="2" />
          </svg>
        </Link>

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

