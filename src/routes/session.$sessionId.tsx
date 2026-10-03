import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyEvaluation,
  emptyState,
  getSession,
  getSource,
  recordPractice,
  saveProgress,
  saveSession,
  type LearnerState,
  type Session,
  type Source,
} from "@/lib/store";
import {
  VOICE_LANGUAGES,
  canSpeak,
  speak,
  speechLanguage,
  stopSpeaking,
  useDictation,
  useVoiceLanguage,
} from "@/lib/speech";
import { hasReply, plainText } from "@/lib/translate";
import { itemsToTry, usedItems } from "@/lib/vocab";
import { SpeakSelection } from "@/components/SpeakSelection";
import { VideoCard } from "@/components/VideoCard";
import { findScene } from "@/lib/video";
import { CorrectionCard, MessageActions, type Correction } from "@/components/ChatParts";

export const Route = createFileRoute("/session/$sessionId")({
  head: () => ({
    meta: [
      { title: "Learning session — Lernwerk" },
      { name: "description", content: "An adaptive tutor guides you from reading to speaking." },
      { property: "og:title", content: "Learning session — Lernwerk" },
      { property: "og:description", content: "An adaptive tutor guides you from reading to speaking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { sessionId } = Route.useParams();
  const [data, setData] = useState<{ session: Session; source: Source } | null | undefined>();
  useEffect(() => {
    const session = getSession(sessionId);
    const source = session && getSource(session.sourceId);
    setData(session && source ? { session, source } : null);
  }, [sessionId]);
  if (data === undefined) return null;
  if (data === null)
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p>This session isn't in this browser.</p>
        <Link to="/" className="text-accent underline">Back to library</Link>
      </main>
    );
  return <Tutor key={sessionId} session={data.session} source={data.source} />;
}

const STAGES = ["full_context", "partial_context", "cloze", "prompt", "recall", "free_production", "transfer"];

function deriveState(messages: UIMessage[], start: LearnerState) {
  let s: LearnerState = {
    ...start,
    stage: start.stage || "full_context",
  };
  for (const m of messages) {
    const evaluation = evaluationOf(m);
    if (evaluation) s = applyEvaluation(s, evaluation as Parameters<typeof applyEvaluation>[1]);
  }
  // An incomplete tool call can leave the stage empty; keep the progress panel renderable.
  if (!s.stage) s.stage = "full_context";
  return s;
}

function Tutor({ session: snapshot, source }: { session: Session; source: Source }) {
  const [session] = useState(() => getSession(snapshot.id) ?? snapshot);
  const stateRef = useRef<LearnerState>(session.state);
  const { messages, sendMessage, regenerate, status, error, stop } = useChat({
    id: session.id,
    messages: getSession(session.id)?.messages ?? session.messages,
    transport: new DefaultChatTransport({
      api: "/api/tutor",
      body: () => ({ graph: source.graph, learnerState: stateRef.current }),
    }),
  });
  const [input, setInput] = useState("");
  const lang = speechLanguage(source.graph.language);
  const [voiceChoice, setVoiceChoice] = useVoiceLanguage();
  const voiceLang = voiceChoice || lang;
  const [talkMode, setTalkMode] = useState(false);
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  const talkRef = useRef(false);
  talkRef.current = talkMode;
  const spokenIds = useRef(new Set<string>());
  const sendRef = useRef<(text: string) => void>(() => {});
  const spokenInput = useRef(false);
  const dictation = useDictation(voiceLang, (text) => {
    spokenInput.current = true;
    setInput(text);
  }, {
    ...(talkMode ? { pauseMs: 1600 } : {}),
    onPause: (text) => sendRef.current(text),
  });
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  const chatRef = useRef<HTMLDivElement>(null);
  const [ttsSupported, setTtsSupported] = useState(false);
  useEffect(() => setTtsSupported(canSpeak()), []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const started = useRef(false);
  const busy = status === "submitted" || status === "streaming";

  const startState = useMemo(() => session.startState ?? emptyState(), [session]);
  const state = useMemo(() => deriveState(messages, startState), [messages, startState]);
  stateRef.current = state;

  useEffect(() => {
    if (started.current) return;
    const saved = getSession(session.id)?.messages ?? [];
    const unanswered = saved.at(-1)?.role === "user";
    if (saved.length > 0 && !unanswered) return;
    // Deferred so a StrictMode remount cancels it; useChat stops the chat on unmount, aborting an immediate send.
    const timer = setTimeout(() => {
      started.current = true;
      if (unanswered) {
        void regenerate();
        return;
      }
      const resuming = Object.keys(startState.items).length > 0;
      sendMessage({
        text:
          session.opener ??
          (resuming ? "Let's continue where I left off last time." : "Let's begin."),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [session.id, session.opener, sendMessage, regenerate, startState]);

  const latest = useRef({ messages, state });
  latest.current = { messages, state };
  const persist = useCallback(
    (withProgress: boolean) => {
      const { messages, state } = latest.current;
      if (!messages.length) return;
      const stored = getSession(session.id)?.messages ?? [];
      if (stored.length > messages.length) return;
      const unchanged =
        stored.length === messages.length &&
        JSON.stringify(stored.at(-1)) === JSON.stringify(messages.at(-1));
      if (unchanged) return;
      saveSession({ ...session, messages, state, updatedAt: Date.now() });
      if (withProgress && session.profileId) saveProgress(session.profileId, session.sourceId, state);
    },
    [session],
  );

  useEffect(() => {
    if (status !== "streaming") persist(status !== "submitted");
  }, [messages, status, persist]);

  useEffect(() => {
    const onPageHide = () => persist(false);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      persist(false);
    };
  }, [persist]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    const onScroll = () => {
      const end = endRef.current;
      if (!end) return;
      const margin = parseFloat(getComputedStyle(end).scrollMarginBottom) || 0;
      followRef.current = end.getBoundingClientRect().top - (window.innerHeight - margin) < 60;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (followRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    dictation.cancel();
    stopSpeaking();
    setTutorSpeaking(false);
    followRef.current = true;
    if (session.profileId) recordPractice(session.profileId);
    sendMessage(spokenInput.current ? { text, metadata: { spoken: true } } : { text });
    spokenInput.current = false;
    setInput("");
  };
  sendRef.current = send;

  useEffect(() => {
    if (!talkMode || status !== "ready") return;
    const reply = messages.at(-1);
    if (!reply || reply.role !== "assistant" || spokenIds.current.has(reply.id)) return;
    const replyText = plainText(messageText(reply));
    if (!replyText) return;
    spokenIds.current.add(reply.id);
    setTutorSpeaking(true);
    speak(replyText, lang, () => {
      setTutorSpeaking(false);
      if (talkRef.current) dictationRef.current.start("");
    });
  }, [talkMode, status, messages, lang]);

  useEffect(() => () => stopSpeaking(), []);

  const toggleTalkMode = () => {
    if (talkMode) {
      setTalkMode(false);
      setTutorSpeaking(false);
      stopSpeaking();
      dictation.cancel();
      return;
    }
    const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
    spokenIds.current = new Set(
      messages.filter((m) => m.role === "assistant" && m !== lastReply).map((m) => m.id),
    );
    setTalkMode(true);
  };

  const answerNow = () => {
    stopSpeaking();
    setTutorSpeaking(false);
    dictation.start(input);
  };

  const retry = (original: string) => {
    setInput(original);
    inputRef.current?.focus();
  };
  const last = messages.at(-1);
  const awaitingText =
    status === "submitted" ||
    (status === "streaming" &&
      last?.role === "assistant" &&
      !last.parts.some((p) => p.type === "text" && p.text.trim()));
  const emptyReply =
    status === "ready" &&
    last?.role === "assistant" &&
    !last.parts.some((p) => p.type === "text" && hasReply(p.text));
  const answeredId = messages.at(-2)?.id;
  const retriedFor = useRef(new Set<string>());
  const autoRetried = !!answeredId && retriedFor.current.has(answeredId);
  useEffect(() => {
    if (!emptyReply || !answeredId || retriedFor.current.has(answeredId)) return;
    // Deferred like the opener: a StrictMode remount would otherwise abort the retry mid-flight.
    const timer = setTimeout(() => {
      retriedFor.current.add(answeredId);
      void regenerate();
    }, 0);
    return () => clearTimeout(timer);
  }, [emptyReply, answeredId, regenerate]);
  const taggedScene = latestSceneTag(messages);
  const sceneIndex = findScene(source.graph.scenes, taggedScene || state.current_scene);
  const items = source.graph.scenes.flatMap((s) => s.sequence);
  const userMessages = messages.filter((m) => m.role === "user");
  const recentlyUsed = userMessages.slice(-2).flatMap((m) => usedItems(messageText(m), items));
  const toTry = itemsToTry(source, state, taggedScene || state.current_scene, recentlyUsed);
  const stageIdx = Math.max(0, STAGES.indexOf(state.stage));

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_280px]">
      <section className="flex min-h-[85vh] flex-col">
        <Link
          to="/source/$sourceId"
          params={{ sourceId: source.id }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {source.graph.title}
        </Link>
        <SpeakSelection containerRef={chatRef} language={voiceLang} />
        <div ref={chatRef} className="mt-6 flex-1 space-y-6">
          {messages.map((m, index) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
                  {isSpoken(m) && (
                    <span className="mr-1.5 opacity-70" title="Spoken answer">
                      🎙️
                    </span>
                  )}
                  {messageText(m)}
                </p>
                {m.id !== userMessages[0]?.id && <UsedWords items={usedItems(messageText(m), items)} />}
              </div>
            ) : (
              <div key={m.id} className="space-y-3">
                {(() => {
                  const evaluation = evaluationOf(m);
                  if (!evaluation) return null;
                  return (
                    <div className="space-y-2">
                      {(() => {
                        const correction = correctionFor(evaluation, messages[index - 1]);
                        return correction ? (
                          <CorrectionCard
                            correction={correction}
                            onRetry={retry}
                            spoken={isSpoken(messages[index - 1])}
                          />
                        ) : null;
                      })()}
                      <EvalChips input={evaluation} />
                    </div>
                  );
                })()}
                <div className="max-w-[90%] space-y-2">
                  {visibleTexts(m).map((text, i) => (
                    <Prose key={i} text={text} />
                  ))}
                  {!(busy && m.id === last?.id) && (
                    <MessageActions
                      text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n")}
                      language={lang}
                    />
                  )}
                </div>
              </div>
            ),
          )}
          {awaitingText && (
            <p className="animate-pulse font-display text-lg italic text-muted-foreground">thinking…</p>
          )}
          {error && <p className="text-sm text-destructive">{parseErr(error.message)}</p>}
          {emptyReply && autoRetried && (
            <p className="text-sm text-muted-foreground">
              The tutor didn't reply.{" "}
              <button type="button" onClick={() => void regenerate()} className="text-accent hover:underline">
                Try again
              </button>
            </p>
          )}
          <div ref={endRef} className="scroll-mb-40" />
        </div>

        <div className="sticky bottom-4 mt-6 rounded-2xl border bg-card p-3 shadow-paper">
          {talkMode && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${tutorSpeaking || dictation.listening ? "animate-pulse bg-accent" : "bg-muted-foreground"}`}
                />
                {tutorSpeaking
                  ? "Tutor is speaking…"
                  : dictation.listening
                    ? "Listening — pause when you're done and it sends"
                    : busy
                      ? "Tutor is thinking…"
                      : "Your turn — tap Speak to answer"}
              </span>
              {tutorSpeaking && (
                <button type="button" onClick={answerNow} className="text-xs font-medium text-accent hover:underline">
                  Skip and answer
                </button>
              )}
            </div>
          )}
          {toTry.length > 0 && <TryWords key={last?.id} items={toTry} />}
          <textarea
            ref={inputRef}
            value={input}
            rows={2}
            onChange={(e) => {
              if (!e.target.value.trim()) spokenInput.current = false;
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={`Answer in ${source.graph.language}…`}
            className="w-full resize-none bg-transparent px-2 py-1 outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("🧠 Reconstruct the current scene — give me the next help level.")}>
                🧠 Reconstruct
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("Give me a hint, please.")}>
                Hint
              </Button>
            </div>
            <div className="flex items-center gap-1">
              {(dictation.supported || ttsSupported) && (
                <select
                  value={voiceChoice}
                  onChange={(e) => setVoiceChoice(e.target.value)}
                  title="Language for speaking and listening"
                  aria-label="Voice language"
                  className="h-8 rounded-md bg-transparent px-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <option value="">{source.graph.language}</option>
                  {VOICE_LANGUAGES.filter((v) => v.code !== lang).map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
              {(dictation.supported || ttsSupported) && (
                <Button
                  variant={talkMode ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={talkMode}
                  title="Hands-free: the tutor speaks, then listens and sends when you pause"
                  onClick={toggleTalkMode}
                >
                  {talkMode ? "🎧 Talk mode on" : "🎧 Talk mode"}
                </Button>
              )}
              {dictation.supported && (
                <Button
                  variant={dictation.listening ? "destructive" : "ghost"}
                  size="sm"
                  aria-pressed={dictation.listening}
                  title={dictation.listening ? "Stop listening" : "Speak your answer"}
                  onClick={() =>
                    dictation.listening
                      ? talkMode
                        ? send(input)
                        : dictation.stop()
                      : (stopSpeaking(), setTutorSpeaking(false), dictation.start(input))
                  }
                >
                  {dictation.listening ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                      Listening…
                    </span>
                  ) : (
                    "🎙️ Speak"
                  )}
                </Button>
              )}
              {busy ? (
                <Button size="sm" variant="secondary" onClick={stop}>Stop</Button>
              ) : (
                <Button size="sm" onClick={() => send(input)} disabled={!input.trim()}>Send</Button>
              )}
            </div>
          </div>
          {dictation.error && <p className="px-2 pt-1 text-xs text-destructive">{dictation.error}</p>}
        </div>
      </section>

      <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-7rem)] lg:self-start">
        <VideoCard source={source} currentScene={taggedScene || state.current_scene} />
        <div className="shrink-0 rounded-2xl border bg-card p-5 shadow-paper">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Stage</p>
          <div className="mt-3 flex gap-1">
            {STAGES.map((s, i) => (
              <span key={s} title={s.replace("_", " ")} className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? "bg-accent" : "bg-muted"}`} />
            ))}
          </div>
          <p className="mt-2 text-sm capitalize">{(state.stage || "full_context").replace("_", " ")}</p>
          <label className="mt-3 block text-xs uppercase tracking-wider text-muted-foreground" htmlFor="scene-picker">
            Scene
          </label>
          <select
            id="scene-picker"
            value={sceneIndex}
            disabled={busy}
            onChange={(e) => {
              const scene = source.graph.scenes[Number(e.target.value)];
              if (scene) send(`Let's switch to the scene "${scene.title}".`);
            }}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
          >
            {sceneIndex < 0 && <option value={-1}>Choose a scene…</option>}
            {source.graph.scenes.map((sc, i) => (
              <option key={i} value={i}>
                {i + 1}. {sc.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-0 flex-col rounded-2xl border bg-card p-5 shadow-paper">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">What you can produce</p>
          <ul className="-mr-3 mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-3">
            {items.map((it) => {
              const st = state.items[it.term];
              const v = st ? (st.recall_strength + st.production_strength) / 2 : 0;
              return (
                <li key={it.term} className="text-sm">
                  <div className="flex justify-between">
                    {ttsSupported ? (
                      <button
                        type="button"
                        title={`Listen: ${it.term} (${it.meaning})`}
                        onClick={() => speak(it.term, lang)}
                        className="text-left hover:text-accent"
                      >
                        {it.emoji} {it.term} <span className="text-xs text-muted-foreground">🔊</span>
                      </button>
                    ) : (
                      <span>{it.emoji} {it.term}</span>
                    )}
                    {st?.recent_errors.length ? <span className="text-xs text-destructive">!</span> : null}
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-muted">
                    <div className="h-1 rounded-full bg-success transition-all" style={{ width: `${v * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}

type Evaluation = {
  items: { term: string; correct: boolean; produced: boolean; error_type: string }[];
  current_scene: string;
  stage: string;
  note: string;
  correction?: Correction;
  corrected?: string;
  correction_note?: string;
};

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

/** The message's last successful evaluation; failed or repeated tool calls are ignored. */
function evaluationOf(m: UIMessage): Evaluation | undefined {
  if (m.role !== "assistant") return undefined;
  for (let i = m.parts.length - 1; i >= 0; i--) {
    const p = m.parts[i]!;
    if (p.type !== "tool-record_evaluation" || !("input" in p) || !p.input) continue;
    if ("state" in p && p.state === "output-error") continue;
    const raw = p.input as Record<string, unknown>;
    const items = parseMaybeJson(raw["items"]);
    const correction = parseMaybeJson(raw["correction"]) as Correction | undefined;
    return {
      ...(raw as Omit<Evaluation, "items" | "correction">),
      items: Array.isArray(items) ? (items as Evaluation["items"]) : [],
      ...(correction && typeof correction === "object" ? { correction } : {}),
    };
  }
  return undefined;
}

const SPOKEN_MARKER = "[spoken answer, auto-transcribed]";

/** Older sessions stored a full correction object; newer evaluations only send the corrected text. */
function correctionFor(evaluation: Evaluation, answer: UIMessage | undefined): Correction | undefined {
  if (evaluation.correction) return evaluation.correction;
  if (!evaluation.corrected?.trim() || answer?.role !== "user") return undefined;
  return {
    original: messageText(answer),
    corrected: evaluation.corrected.replace(SPOKEN_MARKER, "").trim(),
    explanation: evaluation.correction_note ?? "",
  };
}

const isSpoken = (m: UIMessage | undefined) =>
  m?.role === "user" && (m.metadata as { spoken?: boolean } | undefined)?.spoken === true;

/** Text parts to show; a tag-only fragment is dropped when the message also has a real reply. */
function visibleTexts(m: UIMessage) {
  const texts = m.parts.flatMap((p) => (p.type === "text" && p.text.trim() ? [p.text] : []));
  return texts.some(hasReply) ? texts.filter(hasReply) : texts;
}

function messageText(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
}

function UsedWords({ items }: { items: { term: string; emoji: string }[] }) {
  if (!items.length) return null;
  return (
    <p className="max-w-[80%] text-right text-xs text-success">
      ✓ used {items.map((i) => `${i.emoji} ${i.term}`).join(" · ")}
    </p>
  );
}

function TryWords({ items }: { items: { term: string; meaning: string; emoji: string }[] }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        💡 Stuck? Words to try
      </button>
    );
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 text-xs">
      <span className="text-muted-foreground">Try to say:</span>
      {items.map((it) => {
        const shown = revealed.includes(it.term);
        return (
          <button
            key={it.term}
            type="button"
            title={shown ? it.meaning : "Tap to reveal the word"}
            onClick={() => setRevealed((r) => (shown ? r.filter((t) => t !== it.term) : [...r, it.term]))}
            className="rounded-full border border-dashed border-accent/50 px-2.5 py-0.5 hover:bg-accent/10"
          >
            {it.emoji} {shown ? it.term : it.meaning}
          </button>
        );
      })}
    </div>
  );
}

function latestSceneTag(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    for (const p of m.parts) {
      if (p.type !== "text") continue;
      const tag = p.text.match(/(?:Scene|Szene|Scène|Escena)\s*:\s*([^*\n]+)/i);
      if (tag?.[1]) return tag[1].trim();
    }
  }
  return "";
}

function parseErr(m: string) {
  try {
    return JSON.parse(m).error as string;
  } catch {
    return m;
  }
}

function EvalChips({ input }: { input: { items: { term: string; correct: boolean }[] } }) {
  if (!input.items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {input.items.map((it, i) => (
        <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs ${it.correct ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
          {it.correct ? "✓" : "↺"} {it.term}
        </span>
      ))}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  const html = (typeof text === "string" ? text : "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-accent">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/___+/g, '<span class="inline-block w-16 border-b-2 border-accent align-bottom"></span>');
  return <div className="whitespace-pre-wrap font-display text-lg leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
}
