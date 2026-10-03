import type { Cue } from "@/lib/store";

const STAMP = /^\[?(\d{1,2}(?::\d{2}){1,2})\]?/;
const SPOKEN_TIME = /^\d+\s+(seconds?|minutes?|hours?)\b[\d\s,a-z]*$/i;

const seconds = (stamp: string) =>
  stamp
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);

/**
 * Reads a transcript copied from YouTube's "Show transcript" panel, where each caption comes
 * with a timestamp either on its own line or at the start of the line. Text without timestamps
 * is returned unchanged with no cues.
 */
export function parseTranscript(raw: string): { text: string; cues: Cue[] } {
  const cues: Cue[] = [];
  let pending: number | undefined;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(STAMP);
    if (match) {
      const rest = trimmed
        .slice(match[0].length)
        .replace(/^[\s·–-]+/, "")
        .trim();
      pending = seconds(match[1]!);
      if (rest && !SPOKEN_TIME.test(rest)) {
        cues.push({ start: pending, text: rest });
        pending = undefined;
      }
    } else if (SPOKEN_TIME.test(trimmed)) {
      continue;
    } else if (pending !== undefined) {
      cues.push({ start: pending, text: trimmed });
      pending = undefined;
    } else if (cues.length) {
      cues[cues.length - 1]!.text += ` ${trimmed}`;
    }
  }
  if (cues.length < 3) return { text: raw.trim(), cues: [] };
  return { text: cues.map((c) => c.text).join(" "), cues };
}
