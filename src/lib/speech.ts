import { useEffect, useRef, useState } from "react";

const LANGUAGE_CODES: Record<string, string> = {
  arabic: "ar-SA",
  chinese: "zh-CN",
  czech: "cs-CZ",
  danish: "da-DK",
  dutch: "nl-NL",
  english: "en-US",
  finnish: "fi-FI",
  french: "fr-FR",
  german: "de-DE",
  greek: "el-GR",
  hindi: "hi-IN",
  italian: "it-IT",
  japanese: "ja-JP",
  korean: "ko-KR",
  mandarin: "zh-CN",
  norwegian: "nb-NO",
  polish: "pl-PL",
  portuguese: "pt-PT",
  romanian: "ro-RO",
  russian: "ru-RU",
  spanish: "es-ES",
  swedish: "sv-SE",
  turkish: "tr-TR",
  ukrainian: "uk-UA",
};

const NATIVE_NAMES: Record<string, string> = {
  deutsch: "german",
  español: "spanish",
  espanol: "spanish",
  français: "french",
  francais: "french",
  italiano: "italian",
  nederlands: "dutch",
  polski: "polish",
  português: "portuguese",
  portugues: "portuguese",
  svenska: "swedish",
  türkçe: "turkish",
  українська: "ukrainian",
  русский: "russian",
};

export function speechLanguage(language: string): string | undefined {
  const name = language.trim().toLowerCase();
  const words = name.split(/[^\p{L}]+/u).map((w) => NATIVE_NAMES[w] ?? w);
  const has = (w: string) => words.includes(w);
  if (
    has("french") &&
    (has("canadian") || has("canada") || has("quebec") || has("québec") || has("québécois"))
  )
    return "fr-CA";
  if (has("portuguese") && (has("brazilian") || has("brazil"))) return "pt-BR";
  if (has("spanish") && (has("mexican") || has("latin"))) return "es-MX";
  if (has("english") && (has("british") || has("uk"))) return "en-GB";
  for (const w of words) if (LANGUAGE_CODES[w]) return LANGUAGE_CODES[w];
  return undefined;
}

export const VOICE_LANGUAGES = [
  { code: "fr-FR", label: "French (France)" },
  { code: "fr-CA", label: "French (Québec)" },
  { code: "en-US", label: "English" },
];

const VOICE_LANGUAGE_KEY = "lw.voiceLanguage";

export function useVoiceLanguage() {
  const [choice, setChoice] = useState("");
  useEffect(() => {
    try {
      setChoice(localStorage.getItem(VOICE_LANGUAGE_KEY) ?? "");
    } catch {
      setChoice("");
    }
  }, []);
  const update = (code: string) => {
    setChoice(code);
    try {
      localStorage.setItem(VOICE_LANGUAGE_KEY, code);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this page.
    }
  };
  return [choice, update] as const;
}

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }>>;
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

type DictationOptions = {
  /** When set, a pause in speech of this length ends listening and hands over the transcript. */
  pauseMs?: number;
  onPause?: (text: string) => void;
};

export function useDictation(
  language: string | undefined,
  onText: (text: string) => void,
  options: DictationOptions = {},
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<Recognition | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ onText, options });
  latest.current = { onText, options };

  useEffect(() => {
    setSupported(!!recognitionConstructor());
    return () => {
      clearTimeout(pauseTimer.current);
      active.current?.abort();
    };
  }, []);

  const cancel = () => {
    clearTimeout(pauseTimer.current);
    const recognition = active.current;
    active.current = null;
    recognition?.abort();
    setListening(false);
  };

  const start = (existingText: string) => {
    const Ctor = recognitionConstructor();
    if (!Ctor || active.current) return;
    if (!window.isSecureContext) {
      setError(
        "Voice input needs a secure page. Open the app over https or on localhost (not a plain http:// network address).",
      );
      return;
    }
    const recognition = new Ctor();
    recognition.lang = language ?? navigator.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    const prefix = existingText.trim() ? `${existingText.trimEnd()} ` : "";
    recognition.onresult = (e) => {
      if (active.current !== recognition) return;
      const spoken = Array.from(e.results, (r) => r[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const text = prefix + spoken;
      latest.current.onText(text);
      const { pauseMs, onPause } = latest.current.options;
      if (pauseMs && onPause && spoken) {
        clearTimeout(pauseTimer.current);
        pauseTimer.current = setTimeout(() => {
          if (active.current !== recognition) return;
          cancel();
          onPause(text);
        }, pauseMs);
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access is blocked. Allow it in the browser to speak your answer."
          : "Voice input stopped. Try again.",
      );
    };
    recognition.onend = () => {
      if (active.current === recognition) active.current = null;
      setListening(false);
    };
    active.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  };

  const stop = () => active.current?.stop();

  return { supported, listening, error, start, stop, cancel };
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

let speechRun = 0;

export function stopSpeaking() {
  speechRun++;
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Speaks the text; onEnd fires once when it finishes, but not if another speak() or stopSpeaking() replaced it. */
export function speak(text: string, language: string | undefined, onEnd?: () => void) {
  const spoken = text
    .replace(
      /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|\u{FE0F}|\u{200D}/gu,
      "",
    )
    .replace(/[ \t]+/g, " ")
    .trim();
  stopSpeaking();
  const run = speechRun;
  let finished = false;
  // Some voices never fire "end"; don't leave talk mode waiting forever.
  const watchdog = setTimeout(() => finish(), 4000 + spoken.length * 120);
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    if (run === speechRun) onEnd?.();
  };
  if (!canSpeak() || !spoken) return finish();
  const synth = window.speechSynthesis;
  const normalise = (l: string) => l.replace("_", "-").toLowerCase();
  const voices = synth.getVoices();
  const voice = language
    ? (voices.find((v) => normalise(v.lang) === language.toLowerCase()) ??
      voices.find((v) => normalise(v.lang).startsWith(language.slice(0, 2).toLowerCase())) ??
      null)
    : null;
  // Chrome can silently stop long utterances, so speak sentence by sentence.
  const chunks = spoken
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((c) => c.trim())
    .filter(Boolean);
  chunks.forEach((chunk, i) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    if (language) utterance.lang = language;
    utterance.voice = voice;
    utterance.rate = 0.9;
    if (i === chunks.length - 1) {
      utterance.onend = finish;
      utterance.onerror = finish;
    }
    synth.speak(utterance);
  });
}
