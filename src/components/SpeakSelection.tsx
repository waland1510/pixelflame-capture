import { useEffect, useState, type RefObject } from "react";
import { canSpeak, speak } from "@/lib/speech";
import { translate } from "@/lib/translate";

type Anchor = { text: string; top: number; left: number };

export function SpeakSelection({
  containerRef,
  language,
}: {
  containerRef: RefObject<HTMLElement | null>;
  language: string | undefined;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [translation, setTranslation] = useState<{ text: string; value: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const container = containerRef.current;
      if (!selection || !text || !container || selection.rangeCount === 0) return setAnchor(null);
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return setAnchor(null);
      const rect = range.getBoundingClientRect();
      setAnchor({ text, top: rect.top, left: rect.left + rect.width / 2 });
    };
    const hide = () => setAnchor(null);
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", hide);
    };
  }, [containerRef]);

  if (!anchor) return null;
  const shown = translation?.text === anchor.text ? translation.value : null;

  const runTranslate = async () => {
    const text = anchor.text;
    setLoading(true);
    try {
      setTranslation({ text, value: await translate(text) });
    } catch (e) {
      setTranslation({ text, value: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Selected text"
      onMouseDown={(e) => e.preventDefault()}
      style={{ bottom: window.innerHeight - anchor.top + 8, left: anchor.left }}
      className="fixed z-50 flex max-w-sm -translate-x-1/2 flex-col items-center gap-1.5"
    >
      {shown && (
        <p className="rounded-lg bg-popover px-3 py-2 text-sm text-popover-foreground shadow-paper">
          {shown}
        </p>
      )}
      <div className="flex overflow-hidden rounded-full bg-primary text-sm text-primary-foreground shadow-paper">
        {canSpeak() && (
          <button
            type="button"
            onClick={() => speak(anchor.text, language)}
            className="px-3 py-1.5 hover:bg-primary/80"
          >
            🔊 Listen
          </button>
        )}
        <button
          type="button"
          onClick={runTranslate}
          disabled={loading}
          className="border-l border-primary-foreground/20 px-3 py-1.5 hover:bg-primary/80"
        >
          {loading ? "…" : "🌐 Translate"}
        </button>
      </div>
    </div>
  );
}
