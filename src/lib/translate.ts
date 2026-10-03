const cache = new Map<string, Promise<string>>();

export function translate(text: string): Promise<string> {
  const key = text.trim();
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch("/api/translate", { method: "POST", body: JSON.stringify({ text: key }) })
      .then(async (r) => {
        const j = (await r.json()) as { translation?: string; error?: string };
        if (!r.ok || !j.translation) throw new Error(j.error || "Translation failed.");
        return j.translation;
      })
      .catch((e: unknown) => {
        cache.delete(key);
        throw e;
      });
    cache.set(key, pending);
  }
  return pending;
}

const TAG_LINE = /^\s*\*\*[^*\n]+·[^*\n]+\*\*\s*$/;

/** True when the tutor text has content beyond its "**Activity · Scene: …**" tag line. */
export const hasReply = (text: string) =>
  text
    .split("\n")
    .filter((line) => !TAG_LINE.test(line))
    .join(" ")
    .trim().length > 0;

export const plainText = (markdown: string) =>
  markdown
    .split("\n")
    .filter((line) => !TAG_LINE.test(line))
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/___+/g, "…")
    .trim();
