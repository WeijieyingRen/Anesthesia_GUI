export function getSpeechRecognitionLanguage() {
  try {
    return navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}
