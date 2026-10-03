import type { UIMessage } from "ai";
import { useSyncExternalStore } from "react";

export type SeqItem = { term: string; meaning: string; emoji: string };
export type Scene = {
  title: string;
  context: string;
  start_quote?: string;
  sequence: SeqItem[];
  phrases: string[];
};
export type Graph = {
  title: string;
  topic: string;
  language: string;
  level: string;
  summary: string;
  scenes: Scene[];
  relationships: { parent: string; children: string[] }[];
};
export type Cue = { start: number; text: string };
export type Video = { id: string; cues?: Cue[] };
export type Source = {
  id: string;
  createdAt: number;
  kind: string;
  text: string;
  graph: Graph;
  video?: Video;
};

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
  profileId?: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
  state: LearnerState;
  startState?: LearnerState;
  opener?: string;
};
export type Profile = { id: string; name: string; createdAt: number };

const CHANGE_EVENT = "lw-change";
const cache = new Map<string, { raw: string | null; value: unknown }>();

const read = <T>(k: string, d: T): T => {
  if (typeof window === "undefined") return d;
  const raw = localStorage.getItem(k);
  const hit = cache.get(k);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = d;
  try {
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {
    value = d;
  }
  cache.set(k, { raw, value });
  return value;
};
const write = (k: string, v: unknown) => {
  localStorage.setItem(k, JSON.stringify(v));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

let version = 1;
if (typeof window !== "undefined") {
  const bump = () => version++;
  window.addEventListener(CHANGE_EVENT, bump);
  window.addEventListener("storage", bump);
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Re-renders on any store change; returns 0 during SSR and hydration, when localStorage is unavailable. */
export const useStoreVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );

export const uid = () => Math.random().toString(36).slice(2, 10);

const NO_SOURCES: Source[] = [];
const NO_SESSIONS: Session[] = [];
const NO_PROFILES: Profile[] = [];
const NO_PROGRESS: Record<string, LearnerState> = {};

export const getSources = () => read<Source[]>("lw.sources", NO_SOURCES);
export const getSource = (id: string) => getSources().find((s) => s.id === id);
export const saveSource = (s: Source) =>
  write("lw.sources", [s, ...getSources().filter((x) => x.id !== s.id)]);
export const deleteSource = (id: string) => {
  write(
    "lw.sources",
    getSources().filter((s) => s.id !== id),
  );
  write(
    "lw.sessions",
    getSessions().filter((s) => s.sourceId !== id),
  );
  write(
    "lw.progress",
    Object.fromEntries(Object.entries(getAllProgress()).filter(([k]) => !k.endsWith(`:${id}`))),
  );
};

export const getSessions = () => read<Session[]>("lw.sessions", NO_SESSIONS);
export const getSession = (id: string) => getSessions().find((s) => s.id === id);
export const saveSession = (s: Session) =>
  write("lw.sessions", [s, ...getSessions().filter((x) => x.id !== s.id)]);
export const deleteSession = (id: string) =>
  write(
    "lw.sessions",
    getSessions().filter((s) => s.id !== id),
  );

export const sessionsFor = (profileId: string, sourceId?: string) =>
  getSessions()
    .filter((s) => s.profileId === profileId && (!sourceId || s.sourceId === sourceId))
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const getProfiles = () => read<Profile[]>("lw.profiles", NO_PROFILES);
export const getActiveProfileId = () => read<string>("lw.activeProfile", "");

export const getActiveProfile = (): Profile | undefined => {
  const profiles = getProfiles();
  return profiles.find((p) => p.id === getActiveProfileId()) ?? profiles[0];
};

export function ensureProfile(): Profile {
  const active = getActiveProfile();
  if (active) return active;
  const p: Profile = { id: uid(), name: "Me", createdAt: Date.now() };
  write("lw.profiles", [p]);
  write("lw.activeProfile", p.id);
  write(
    "lw.sessions",
    getSessions().map((s) => (s.profileId ? s : { ...s, profileId: p.id })),
  );
  return p;
}

export const setActiveProfile = (id: string) => write("lw.activeProfile", id);

export function addProfile(name: string) {
  const p: Profile = { id: uid(), name: name.trim() || "Learner", createdAt: Date.now() };
  write("lw.profiles", [...getProfiles(), p]);
  setActiveProfile(p.id);
  return p;
}

export const renameProfile = (id: string, name: string) =>
  write(
    "lw.profiles",
    getProfiles().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
  );

export function deleteProfile(id: string) {
  const rest = getProfiles().filter((p) => p.id !== id);
  if (!rest.length) return;
  write("lw.profiles", rest);
  write(
    "lw.sessions",
    getSessions().filter((s) => s.profileId !== id),
  );
  write(
    "lw.progress",
    Object.fromEntries(Object.entries(getAllProgress()).filter(([k]) => !k.startsWith(`${id}:`))),
  );
  if (getActiveProfileId() === id) setActiveProfile(rest[0]!.id);
}

const getAllProgress = () => read<Record<string, LearnerState>>("lw.progress", NO_PROGRESS);

export function getProgress(profileId: string, sourceId: string): LearnerState {
  return (
    getAllProgress()[`${profileId}:${sourceId}`] ??
    sessionsFor(profileId, sourceId)[0]?.state ??
    emptyState()
  );
}

export const saveProgress = (profileId: string, sourceId: string, state: LearnerState) =>
  write("lw.progress", { ...getAllProgress(), [`${profileId}:${sourceId}`]: state });

export function mastery(source: Source, state: LearnerState) {
  const terms = source.graph.scenes.flatMap((s) => s.sequence.map((i) => i.term));
  if (!terms.length) return { percent: 0, practised: 0, total: 0 };
  let sum = 0;
  let practised = 0;
  for (const t of terms) {
    const st = state.items[t];
    if (!st) continue;
    practised++;
    sum += (st.recall_strength + st.production_strength) / 2;
  }
  return { percent: Math.round((sum / terms.length) * 100), practised, total: terms.length };
}

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_INTERVALS_DAYS = [1, 3, 8, 20];

export const itemStrength = (st: ItemState | undefined) =>
  st ? (st.recall_strength + st.production_strength) / 2 : 0;

export function dueForReview(source: Source, state: LearnerState, now = Date.now()) {
  const due: SeqItem[] = [];
  for (const item of source.graph.scenes.flatMap((s) => s.sequence)) {
    const st = state.items[item.term];
    if (!st) continue;
    const strength = itemStrength(st);
    const bucket = Math.min(REVIEW_INTERVALS_DAYS.length - 1, Math.floor(strength * 4));
    const interval = REVIEW_INTERVALS_DAYS[bucket]! * DAY;
    if (strength < 0.4 || st.recent_errors.length > 0 || now - st.last_seen > interval)
      due.push(item);
  }
  return due;
}

export function createSession(profileId: string, sourceId: string, opener?: string): Session {
  const progress = getProgress(profileId, sourceId);
  const s: Session = {
    id: uid(),
    sourceId,
    profileId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    state: progress,
    startState: progress,
    ...(opener ? { opener } : {}),
  };
  saveSession(s);
  return s;
}

export const sceneOpener = (title: string) => `Let's practise the scene "${title}".`;

export const reviewOpener = (items: SeqItem[]) =>
  `Let's review the words I find hard: ${items
    .slice(0, 8)
    .map((i) => i.term)
    .join(", ")}.`;

const NO_ACTIVITY: Record<string, string[]> = {};
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function recordPractice(profileId: string, now = Date.now()) {
  const all = read<Record<string, string[]>>("lw.activity", NO_ACTIVITY);
  const days = all[profileId] ?? [];
  const today = dayKey(now);
  if (days.includes(today)) return;
  write("lw.activity", { ...all, [profileId]: [...days, today].slice(-400) });
}

export function practiceStats(profileId: string, now = Date.now()) {
  const days = new Set(read<Record<string, string[]>>("lw.activity", NO_ACTIVITY)[profileId] ?? []);
  let cursor = days.has(dayKey(now)) ? now : now - DAY;
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  let thisWeek = 0;
  for (let i = 0; i < 7; i++) if (days.has(dayKey(now - i * DAY))) thisWeek++;
  return { streak, thisWeek, practisedToday: days.has(dayKey(now)) };
}

export const emptyState = (): LearnerState => ({
  items: {},
  current_scene: "",
  stage: "full_context",
  note: "",
});

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
      production_strength: clamp(
        p.production_strength + (it.produced && it.correct ? 0.25 : it.correct ? 0.05 : -0.1),
      ),
      recent_errors: it.correct
        ? p.recent_errors.slice(-2)
        : [...p.recent_errors, it.error_type].slice(-3),
      last_seen: Date.now(),
      seen: p.seen + 1,
    };
  }
  return {
    items,
    current_scene: ev.current_scene || state.current_scene,
    stage: ev.stage || state.stage,
    note: ev.note || state.note,
  };
}
