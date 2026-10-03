import { useState } from "react";
import { canSpeak, speak } from "@/lib/speech";
import { diffWords } from "@/lib/diff";
import { plainText, translate } from "@/lib/translate";

export type Correction = { original: string; corrected: string; explanation: string };

const spokenForm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export function CorrectionCard({
  correction,
  onRetry,
  spoken = false,
}: {
  correction: Correction;
  onRetry?: (original: string) => void;
  spoken?: boolean;
}) {
  const typedForm = (text: string) =>
    text
      .trim()
      .replace(/[.!?…]+$/, "")
      .replace(/\s+/g, " ");
  if (
    !correction.corrected?.trim() ||
    typedForm(correction.corrected) === typedForm(correction.original ?? "")
  )
    return null;
  // Speech recognition can't hear capitals or punctuation, so don't flag them on spoken answers.
  if (spoken && spokenForm(correction.corrected) === spokenForm(correction.original ?? ""))
    return null;
  const tokens = diffWords(correction.original ?? "", correction.corrected);
  return (
    <div className="ml-auto max-w-[80%] rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
      <p className="text-xs uppercase tracking-wider text-accent">Correction</p>
      <p className="mt-1.5 text-base leading-relaxed">
        {tokens.map((t, i) => (
          <span key={i}>
            {i > 0 && " "}
            <span
              className={
                t.kind === "removed"
                  ? "text-destructive line-through decoration-2"
                  : t.kind === "added"
                    ? "rounded bg-success/15 px-0.5 font-medium text-success"
                    : undefined
              }
            >
              {t.text}
            </span>
          </span>
        ))}
      </p>
      {correction.explanation && (
        <p className="mt-1 text-muted-foreground">{correction.explanation}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={() => onRetry(correction.original)}
          className="mt-2 text-xs font-medium text-accent hover:underline"
        >
          ✍️ Try it yourself
        </button>
      )}
    </div>
  );
}

export function MessageActions({ text, language }: { text: string; language: string | undefined }) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const plain = plainText(text);
  if (!plain) return null;

  const toggleTranslation = async () => {
    if (translation !== null) return setTranslation(null);
    setLoading(true);
    setError("");
    try {
      setTranslation(await translate(plain));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        {canSpeak() && (
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => speak(plain, language)}
          >
            🔊 Listen
          </button>
        )}
        <button
          type="button"
          className="hover:text-foreground"
          onClick={toggleTranslation}
          disabled={loading}
        >
          {loading ? "Translating…" : translation !== null ? "Hide translation" : "🌐 Translate"}
        </button>
      </div>
      {translation !== null && (
        <p className="mt-2 whitespace-pre-wrap border-l-2 border-muted pl-3 text-sm italic text-muted-foreground">
          {translation}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
