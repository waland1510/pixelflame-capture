import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { AttachVideo } from "@/components/AttachVideo";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/YouTubePlayer";
import { formatTime, sceneStartTimes } from "@/lib/video";
import {
  deleteSession,
  deleteSource,
  getActiveProfile,
  getProgress,
  getSource,
  mastery,
  sessionsFor,
  useStoreVersion,
  type Session,
  createSession,
  dueForReview,
  reviewOpener,
  sceneOpener,
} from "@/lib/store";

export const Route = createFileRoute("/source/$sourceId")({
  head: () => ({
    meta: [
      { title: "Lesson map — Lernwerk" },
      {
        name: "description",
        content: "Scenes, vocabulary and structure extracted from your source.",
      },
      { property: "og:title", content: "Lesson map — Lernwerk" },
      {
        property: "og:description",
        content: "Scenes, vocabulary and structure extracted from your source.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcePage,
});

function SourcePage() {
  const { sourceId } = Route.useParams();
  const navigate = useNavigate();
  const player = useRef<YouTubePlayerHandle>(null);
  const playerBox = useRef<HTMLDivElement>(null);
  const version = useStoreVersion();
  if (!version) return null;

  const source = getSource(sourceId);
  if (!source)
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p>This lesson isn't in this browser.</p>
        <Link to="/" className="text-accent underline">
          Back to library
        </Link>
      </main>
    );

  const profile = getActiveProfile();
  if (!profile) return null;
  const sessions = sessionsFor(profile.id, sourceId);
  const progress = getProgress(profile.id, sourceId);
  const summary = mastery(source, progress);
  const g = source.graph;
  const grammar = g.kind === "grammar";
  const times = sceneStartTimes(g, source.video?.cues);
  const playScene = (seconds: number) => {
    player.current?.playFrom(seconds);
    playerBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const start = (opener?: string) => {
    const s = createSession(profile.id, sourceId, opener);
    navigate({ to: "/session/$sessionId", params: { sessionId: s.id } });
  };
  const due = dueForReview(source, progress);
  const latest = sessions[0];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Library
      </Link>
      <p className="mt-6 text-xs uppercase tracking-widest text-accent">
        {g.language} · {g.level} · {grammar ? "Grammar" : source.kind}
      </p>
      <h1 className="mt-2 text-5xl">{g.title}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{g.summary}</p>
      {source.video ? (
        <div ref={playerBox} className="mt-8 max-w-3xl">
          <YouTubePlayer ref={player} videoId={source.video.id} title={g.title} />
        </div>
      ) : (
        <AttachVideo source={source} />
      )}

      <div className="mt-6 max-w-md">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {profile.name}: {summary.practised}/{summary.total} items practised
          </span>
          <span>{summary.percent}% mastered</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-success transition-all"
            style={{ width: `${summary.percent}%` }}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {latest ? (
          <>
            <Button size="lg" asChild>
              <Link to="/session/$sessionId" params={{ sessionId: latest.id }}>
                Continue session
              </Link>
            </Button>
            {due.length > 0 && (
              <Button size="lg" variant="secondary" onClick={() => start(reviewOpener(due))}>
                Review {due.length} {due.length === 1 ? "word" : "words"}
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={() => start()}>
              Start a fresh session
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={() => start()}>
            Start learning
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm("Delete this lesson, its sessions and everyone's progress on it?")) {
              deleteSource(sourceId);
              navigate({ to: "/" });
            }
          }}
        >
          Delete lesson
        </Button>
      </div>
      {latest && (
        <p className="mt-2 text-sm text-muted-foreground">
          A fresh session keeps your progress; only the conversation starts over.
          {due.length > 0 &&
            ` Review focuses on words you missed or haven't practised for a while.`}
        </p>
      )}

      {sessions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl">Sessions</h2>
          <ul className="mt-3 divide-y rounded-xl border bg-card shadow-paper">
            {sessions.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <Link
                  to="/session/$sessionId"
                  params={{ sessionId: s.id }}
                  className="flex-1 hover:text-accent"
                >
                  Session {sessions.length - i} · {new Date(s.updatedAt).toLocaleString()} ·{" "}
                  {answerLabel(s)}
                </Link>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete session"
                  onClick={() =>
                    confirm("Delete this session's conversation? Progress is kept.") &&
                    deleteSession(s.id)
                  }
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        {g.scenes.map((sc, i) => (
          <article key={i} className="rounded-2xl border bg-card p-6 shadow-paper">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {grammar ? "Rule" : "Scene"} {i + 1}
              </p>
              {times[i] !== undefined && (
                <button
                  type="button"
                  onClick={() => playScene(times[i]!)}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  title="Play this scene in the video"
                >
                  ▶ {formatTime(times[i]!)}
                </button>
              )}
            </div>
            <h3 className="mt-1 text-2xl">{sc.title}</h3>
            <p className="mt-3 text-sm italic text-muted-foreground">{sc.context}</p>
            {grammar && !!sc.exercises?.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                {sc.exercises.length} exercises ready
              </p>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="mt-4"
              onClick={() => start(sceneOpener(sc.title, grammar))}
            >
              Practise this {grammar ? "rule" : "scene"}
            </Button>
            <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
              {sc.sequence.map((it, j) => {
                const st = progress.items[it.term];
                const v = st ? (st.recall_strength + st.production_strength) / 2 : 0;
                return (
                  <li key={j} className="flex items-center gap-1.5">
                    <span
                      title={`${it.meaning}${st ? ` · ${Math.round(v * 100)}% mastered` : ""}`}
                      className={`rounded-full px-3 py-1 ${v >= 0.6 ? "bg-success/15 text-success" : st ? "bg-accent/10" : "bg-secondary"}`}
                    >
                      {it.emoji} {it.term}
                    </span>
                    {j < sc.sequence.length - 1 && <span className="text-accent">→</span>}
                  </li>
                );
              })}
            </ol>
          </article>
        ))}
      </section>
    </main>
  );
}

function answerLabel(s: Session) {
  const answers = Math.max(0, s.messages.filter((m) => m.role === "user").length - 1);
  return answers === 1 ? "1 answer" : `${answers} answers`;
}
