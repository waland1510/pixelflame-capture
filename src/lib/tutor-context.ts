import type { UIMessage } from "ai";
import type { Graph, LearnerState } from "@/lib/store";
import { findScene } from "@/lib/video";

export const RECENT_MESSAGES = 12;

const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");

/**
 * The first message (it may set the session's focus, e.g. a scene or words to review) plus the
 * most recent ones. Reasoning parts are dropped: the model never needs its old reasoning back.
 */
export function recentMessages(messages: UIMessage[], keep = RECENT_MESSAGES): UIMessage[] {
  const stripped = messages.map((m) =>
    m.role === "assistant" ? { ...m, parts: m.parts.filter((p) => p.type !== "reasoning") } : m,
  );
  if (stripped.length <= keep + 1) return stripped;
  const tail = stripped.slice(-keep);
  while (tail.length && tail[0]!.role !== "user") tail.shift();
  return [stripped[0]!, ...tail];
}

/** Scene to keep in full: one the learner just asked for, else the tutor's current one, else the first. */
export function focusSceneIndex(
  graph: Graph,
  messages: UIMessage[],
  state: LearnerState | undefined,
) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const said = textOf(lastUser).toLowerCase();
    const asked = graph.scenes.findIndex((s) => said.includes(s.title.trim().toLowerCase()));
    if (asked >= 0) return asked;
  }
  const fromState = findScene(graph.scenes, state?.current_scene ?? "");
  if (fromState >= 0) return fromState;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const tag = textOf(m).match(/(?:Scene|Szene|Scène|Escena)\s*:\s*([^*\n]+)/i)?.[1];
    const index = tag ? findScene(graph.scenes, tag) : -1;
    if (index >= 0) return index;
  }
  return 0;
}

/** The focus scene and the next one in full; the rest as titles and words only. */
export function compactGraph(graph: Graph, focus: number) {
  return {
    ...(graph.kind ? { kind: graph.kind } : {}),
    title: graph.title,
    language: graph.language,
    level: graph.level,
    summary: graph.summary,
    scenes: graph.scenes.map((scene, i) =>
      i === focus || i === focus + 1
        ? scene
        : {
            title: scene.title,
            words: scene.sequence.map((item) => `${item.emoji} ${item.term} (${item.meaning})`),
          },
    ),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Learner state without timestamps and long float tails. */
export function compactState(state: LearnerState | undefined) {
  if (!state) return state;
  return {
    current_scene: state.current_scene,
    stage: state.stage,
    note: state.note,
    items: Object.fromEntries(
      Object.entries(state.items ?? {}).map(([term, s]) => [
        term,
        {
          familiarity: round(s.familiarity),
          recall: round(s.recall_strength),
          production: round(s.production_strength),
          seen: s.seen,
          ...(s.recent_errors?.length ? { recent_errors: s.recent_errors } : {}),
        },
      ]),
    ),
  };
}
