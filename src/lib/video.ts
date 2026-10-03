import type { Cue, Graph, Scene } from "@/lib/store";

export function youtubeId(url: string) {
  return url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1];
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Best-effort start time (seconds) of each scene, found by matching its context against the captions. */
export function sceneStartTimes(graph: Graph, cues: Cue[] | undefined): (number | undefined)[] {
  if (!cues?.length) return graph.scenes.map(() => undefined);
  const transcript: { word: string; start: number }[] = [];
  for (const cue of cues)
    for (const word of words(cue.text)) transcript.push({ word, start: cue.start });

  let from = 0;
  return graph.scenes.map((scene) => {
    const target = words(scene.start_quote || scene.context).slice(0, 10);
    if (target.length < 3) return undefined;
    const wanted = new Set(target);
    const window = target.length + 6;
    let best = { score: 0, index: -1 };
    for (let i = from; i < transcript.length; i++) {
      const seen = new Set<string>();
      for (let j = i; j < Math.min(transcript.length, i + window); j++) {
        const w = transcript[j]!.word;
        if (wanted.has(w)) seen.add(w);
      }
      const score = seen.size + (transcript[i]!.word === target[0] ? 0.5 : 0);
      if (score > best.score) best = { score, index: i };
    }
    if (best.index < 0 || best.score < Math.min(4, target.length * 0.5)) return undefined;
    from = best.index;
    return transcript[best.index]!.start;
  });
}

export const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Index of the scene the tutor named, tolerating small differences in the title; -1 if none. */
export function findScene(scenes: Scene[], name: string) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return -1;
  const titles = scenes.map((s) => s.title.trim().toLowerCase());
  const exact = titles.indexOf(wanted);
  return exact >= 0 ? exact : titles.findIndex((t) => t.includes(wanted) || wanted.includes(t));
}
