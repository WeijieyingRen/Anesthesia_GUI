export type SpeechRecognitionLanguage = "en-US" | "zh-CN" | "hi-IN" | "bn-IN";

const DEFAULT_SPEECH_LANGUAGE: SpeechRecognitionLanguage = "en-US";

function normalizeSpeechRecognitionLanguage(
  language: string | null | undefined
): SpeechRecognitionLanguage | null {
  if (!language) return null;

  const lang = language.toLowerCase();

  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("hi")) return "hi-IN";
  if (lang.startsWith("bn")) return "bn-IN";
  if (lang.startsWith("en")) return "en-US";

  return null;
}

export function getSpeechRecognitionLanguage(): SpeechRecognitionLanguage {
  try {
    const savedLanguage =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("speechRecognitionLanguage")
        : null;

    const savedMatch = normalizeSpeechRecognitionLanguage(savedLanguage);
    if (savedMatch) return savedMatch;

    const browserLanguages =
      typeof navigator !== "undefined" &&
      Array.isArray(navigator.languages) &&
      navigator.languages.length > 0
        ? navigator.languages
        : typeof navigator !== "undefined"
        ? [navigator.language]
        : [];

    for (const language of browserLanguages) {
      const matched = normalizeSpeechRecognitionLanguage(language);
      if (matched) return matched;
    }

    return DEFAULT_SPEECH_LANGUAGE;
  } catch {
    return DEFAULT_SPEECH_LANGUAGE;
  }
}