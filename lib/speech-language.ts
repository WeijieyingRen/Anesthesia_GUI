export const SPEECH_LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English" },
  { value: "hi-IN", label: "Hindi" },
  { value: "zh-CN", label: "Chinese" },
];

export function getSpeechRecognitionLanguage() {
  const fallback = "en-US";

  try {
    const saved = localStorage.getItem("speechRecognitionLanguage");
    if (saved) return saved;
  } catch {
    // ignore storage access failures
  }

  try {
    const language = navigator.language || fallback;
    if (language.toLowerCase().startsWith("zh")) return "zh-CN";
    if (language.toLowerCase().startsWith("hi")) return "hi-IN";
    return "en-US";
  } catch {
    return fallback;
  }
}
