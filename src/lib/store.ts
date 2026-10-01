import type { UIMessage } from "ai";

export type SeqItem = { term: string; meaning: string; emoji: string };
export type Scene = { title: string; context: string; sequence: SeqItem[]; phrases: string[] };
export type Graph = {
  title: string;
  topic: string;
  language: string;
  level: string;
  summary: string;
  scenes: Scene[];
  relationships: { parent: string; children: string[] }[];
};
export type Source = { id: string; createdAt: number; kind: string; text: string; graph: Graph };

export type ItemState = {
  familiarity: number;
  recall_strength: number;
  production_strength: number;
  recent_errors: string[];
  last_seen: number;
  seen: number;
};
export type LearnerState = {
  items: Record<string, ItemState>;
  current_scene: string;
  stage: string;
  note: string;
};
export type Session = {
  id: string;
  sourceId: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
  state: LearnerState;
};

const read = <T>(k: string, d: T): T => {
  if (typeof window === "undefined") return d;
  try {
    return JSON.parse(localStorage.getItem(k) ?? "") as T;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export const uid = () => Math.random().toString(36).slice(2, 10);

export const getSources = () => read<Source[]>("lw.sources", []);
export const getSource = (id: string) => getSources().find((s) => s.id === id);
export const saveSource = (s: Source) => write("lw.sources", [s, ...getSources().filter((x) => x.id !== s.id)]);
export const deleteSource = (id: string) => {
  write("lw.sources", getSources().filter((s) => s.id !== id));
  write("lw.sessions", getSessions().filter((s) => s.sourceId !== id));
};

export const getSessions = () => read<Session[]>("lw.sessions", []);
export const getSession = (id: string) => getSessions().find((s) => s.id === id);
export const saveSession = (s: Session) =>
  write("lw.sessions", [s, ...getSessions().filter((x) => x.id !== s.id)]);

export const emptyState = (): LearnerState => ({ items: {}, current_scene: "", stage: "full_context", note: "" });

type Eval = {
  items: { term: string; correct: boolean; produced: boolean; error_type: string }[];
  current_scene: string;
  stage: string;
  note: string;
};

export function applyEvaluation(state: LearnerState, ev: Eval): LearnerState {
  const items = { ...state.items };
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  for (const it of ev.items ?? []) {
    const p = items[it.term] ?? {
      familiarity: 0,
      recall_strength: 0,
      production_strength: 0,
      recent_errors: [],
      last_seen: 0,
      seen: 0,
    };
    items[it.term] = {
      familiarity: clamp(p.familiarity + 0.2),
      recall_strength: clamp(p.recall_strength + (it.correct ? 0.25 : -0.15)),
      production_strength: clamp(p.production_strength + (it.produced && it.correct ? 0.25 : it.correct ? 0.05 : -0.1)),
      recent_errors: it.correct ? p.recent_errors.slice(-2) : [...p.recent_errors, it.error_type].slice(-3),
      last_seen: Date.now(),
      seen: p.seen + 1,
    };
  }
  return { items, current_scene: ev.current_scene, stage: ev.stage, note: ev.note };
}
