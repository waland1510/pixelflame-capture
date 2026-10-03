import type { LearnerState, SeqItem, Source } from "@/lib/store";

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const stem = (w: string) => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w);

/** Lesson items the text uses, allowing for inflected forms (e.g. "Brötchen" ↔ "Brötchens", "bestellen" ↔ "bestellt"). */
export function usedItems(text: string, items: SeqItem[]): SeqItem[] {
  const said = words(text);
  if (!said.length) return [];
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.term.toLowerCase();
    if (seen.has(key)) return false;
    const parts = words(item.term).filter((w) => w.length > 2 || words(item.term).length === 1);
    const hit =
      parts.length > 0 &&
      parts.every((p) =>
        said.some(
          (w) =>
            w === p ||
            (p.length >= 3 && w.startsWith(p)) ||
            (p.length > 4 && w.startsWith(stem(p))),
        ),
      );
    if (hit) seen.add(key);
    return hit;
  });
}

/** Up to `count` items to nudge the learner to say next: weakest production first, current scene preferred. */
export function itemsToTry(
  source: Source,
  state: LearnerState,
  currentScene: string,
  recentlyUsed: SeqItem[],
  count = 3,
) {
  const scene = source.graph.scenes.find(
    (s) => s.title.trim().toLowerCase() === currentScene.trim().toLowerCase(),
  );
  const pool = scene?.sequence.length
    ? scene.sequence
    : source.graph.scenes.flatMap((s) => s.sequence);
  const used = new Set(recentlyUsed.map((i) => i.term.toLowerCase()));
  const unique = [...new Map(pool.map((i) => [i.term.toLowerCase(), i])).values()];
  return unique
    .filter((i) => !used.has(i.term.toLowerCase()))
    .map((i) => ({ item: i, production: state.items[i.term]?.production_strength ?? 0 }))
    .filter((x) => x.production < 0.75)
    .sort((a, b) => a.production - b.production)
    .slice(0, count)
    .map((x) => x.item);
}
