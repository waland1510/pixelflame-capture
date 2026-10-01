import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyEvaluation,
  getSession,
  getSource,
  saveSession,
  type LearnerState,
  type Session,
  type Source,
} from "@/lib/store";

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

function deriveState(messages: UIMessage[], base: LearnerState) {
  // Older sessions (or an incomplete tool call) can have a missing stage.
  // Keep the progress panel renderable while replaying their evaluations.
  let s: LearnerState = {
    ...base,
    items: {},
    current_scene: base?.current_scene ?? "",
    stage: base?.stage || "full_context",
    note: base?.note ?? "",
  };
  for (const m of messages)
    for (const p of m.parts)
      if (p.type === "tool-record_evaluation" && "input" in p && p.input)
        s = applyEvaluation(s, p.input as Parameters<typeof applyEvaluation>[1]);
  if (!s.stage) s.stage = "full_context";
  return s;
}

function Tutor({ session, source }: { session: Session; source: Source }) {
  const stateRef = useRef<LearnerState>(session.state);
  const { messages, sendMessage, status, error, stop } = useChat({
    id: session.id,
    messages: session.messages,
    transport: new DefaultChatTransport({
      api: "/api/tutor",
      body: () => ({ graph: source.graph, learnerState: stateRef.current }),
    }),
  });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const busy = status === "submitted" || status === "streaming";

  const state = useMemo(() => deriveState(messages, session.state), [messages, session.state]);
  stateRef.current = state;

  useEffect(() => {
    if (!started.current && session.messages.length === 0) {
      started.current = true;
      sendMessage({ text: "Let's begin." });
    }
  }, [session.messages.length, sendMessage]);

  useEffect(() => {
    if (status === "ready" && messages.length)
      saveSession({ ...session, messages, state, updatedAt: Date.now() });
    if (!busy) inputRef.current?.focus();
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, state, session, busy]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  const items = source.graph.scenes.flatMap((s) => s.sequence);
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
        <div className="mt-6 flex-1 space-y-6">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
                  {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                </p>
              </div>
            ) : (
              <div key={m.id} className="max-w-[90%] space-y-2">
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    <Prose key={i} text={p.text} />
                  ) : p.type === "tool-record_evaluation" && "input" in p && p.input ? (
                    <EvalChips key={i} input={p.input as { items: { term: string; correct: boolean }[] }} />
                  ) : null,
                )}
              </div>
            ),
          )}
          {status === "submitted" && (
            <p className="animate-pulse font-display text-lg italic text-muted-foreground">thinking…</p>
          )}
          {error && <p className="text-sm text-destructive">{parseErr(error.message)}</p>}
          <div ref={endRef} />
        </div>

        <div className="sticky bottom-4 mt-6 rounded-2xl border bg-card p-3 shadow-paper">
          <textarea
            ref={inputRef}
            value={input}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
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
            {busy ? (
              <Button size="sm" variant="secondary" onClick={stop}>Stop</Button>
            ) : (
              <Button size="sm" onClick={() => send(input)} disabled={!input.trim()}>Send</Button>
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-6 lg:sticky lg:top-8 lg:h-fit">
        <div className="rounded-2xl border bg-card p-5 shadow-paper">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Stage</p>
          <div className="mt-3 flex gap-1">
            {STAGES.map((s, i) => (
              <span key={s} title={s.replace("_", " ")} className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? "bg-accent" : "bg-muted"}`} />
            ))}
          </div>
          <p className="mt-2 text-sm capitalize">{(state.stage || "full_context").replace("_", " ")}</p>
          {state.current_scene && <p className="mt-1 text-sm text-muted-foreground">Scene: {state.current_scene}</p>}
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-paper">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">What you can produce</p>
          <ul className="mt-3 space-y-2">
            {items.map((it) => {
              const st = state.items[it.term];
              const v = st ? (st.recall_strength + st.production_strength) / 2 : 0;
              return (
                <li key={it.term} className="text-sm">
                  <div className="flex justify-between">
                    <span>{it.emoji} {it.term}</span>
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
