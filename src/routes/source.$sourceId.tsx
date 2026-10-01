import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteSource,
  emptyState,
  getSessions,
  getSource,
  saveSession,
  uid,
  type Session,
  type Source,
} from "@/lib/store";

export const Route = createFileRoute("/source/$sourceId")({
  head: () => ({
    meta: [
      { title: "Lesson map — Lernwerk" },
      { name: "description", content: "Scenes, vocabulary and structure extracted from your source." },
      { property: "og:title", content: "Lesson map — Lernwerk" },
      { property: "og:description", content: "Scenes, vocabulary and structure extracted from your source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcePage,
});

function SourcePage() {
  const { sourceId } = Route.useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<Source | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    setSource(getSource(sourceId) ?? null);
    setSessions(getSessions().filter((s) => s.sourceId === sourceId));
  }, [sourceId]);

  if (source === undefined) return null;
  if (source === null)
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p>This lesson isn't in this browser.</p>
        <Link to="/" className="text-accent underline">Back to library</Link>
      </main>
    );

  const g = source.graph;
  const start = () => {
    const s: Session = {
      id: uid(),
      sourceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      state: emptyState(),
    };
    saveSession(s);
    navigate({ to: "/session/$sessionId", params: { sessionId: s.id } });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Library</Link>
      <p className="mt-6 text-xs uppercase tracking-widest text-accent">
        {g.language} · {g.level} · {source.kind}
      </p>
      <h1 className="mt-2 text-5xl">{g.title}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{g.summary}</p>
      <div className="mt-6 flex gap-3">
        <Button size="lg" onClick={start}>Start a new session</Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm("Delete this lesson and its sessions?")) {
              deleteSource(sourceId);
              navigate({ to: "/" });
            }
          }}
        >
          Delete
        </Button>
      </div>

      {sessions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl">Sessions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {sessions.map((s, i) => (
              <Link
                key={s.id}
                to="/session/$sessionId"
                params={{ sessionId: s.id }}
                className="rounded-lg border bg-card px-4 py-2 text-sm shadow-paper hover:border-accent"
              >
                Session {sessions.length - i} · {new Date(s.updatedAt).toLocaleDateString()} ·{" "}
                {Object.keys(s.state.items).length} items practised
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        {g.scenes.map((sc, i) => (
          <article key={i} className="rounded-2xl border bg-card p-6 shadow-paper">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Scene {i + 1}</p>
            <h3 className="mt-1 text-2xl">{sc.title}</h3>
            <p className="mt-3 text-sm italic text-muted-foreground">{sc.context}</p>
            <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
              {sc.sequence.map((it, j) => (
                <li key={j} className="flex items-center gap-1.5">
                  <span title={it.meaning} className="rounded-full bg-secondary px-3 py-1">
                    {it.emoji} {it.term}
                  </span>
                  {j < sc.sequence.length - 1 && <span className="text-accent">→</span>}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>
    </main>
  );
}
