"use client";

import { useEffect, useState } from "react";
import type { SpeechRecognitionLanguage } from "@/lib/speech-language";

const SPEECH_LANGUAGE_OPTIONS: Array<{
  value: SpeechRecognitionLanguage;
  label: string;
}> = [
  { value: "en-US", label: "English" },
  { value: "zh-CN", label: "中文" },
  { value: "hi-IN", label: "Hindi" },
  { value: "bn-IN", label: "Bengali" },
];

export default function SpeechLanguageSelector() {
  const [language, setLanguage] = useState<SpeechRecognitionLanguage>("en-US");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("speechRecognitionLanguage");

      if (
        saved === "en-US" ||
        saved === "zh-CN" ||
        saved === "hi-IN" ||
        saved === "bn-IN"
      ) {
        setLanguage(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleChange(nextLanguage: SpeechRecognitionLanguage) {
    setLanguage(nextLanguage);

    try {
      localStorage.setItem("speechRecognitionLanguage", nextLanguage);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="font-medium text-gray-700">
        Speech language:
      </label>

      <select
        value={language}
        onChange={(e) =>
          handleChange(e.target.value as SpeechRecognitionLanguage)
        }
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {SPEECH_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}