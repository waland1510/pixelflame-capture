import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { parseTranscript } from "@/lib/transcript";
import { youtubeId } from "@/lib/video";
import { Button } from "@/components/ui/button";
import {
  getActiveProfile,
  getProgress,
  getSources,
  createSession,
  dueForReview,
  mastery,
  practiceStats,
  reviewOpener,
  saveSource,
  sessionsFor,
  uid,
  useStoreVersion,
  type Source,
  type Video,
} from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lernwerk — learn languages from anything" },
      { name: "description", content: "Paste text, a YouTube link, an article or a PDF and get an adaptive language tutor for it." },
      { property: "og:title", content: "Lernwerk — learn languages from anything" },
      { property: "og:description", content: "Turn any source into an adaptive language lesson." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "text" | "link" | "pdf";

const EXAMPLE_TEXT = `Rotkäppchen lebte mit ihrer Mutter in einem kleinen Haus am Rand des Waldes. Eines Tages sagte die Mutter: „Bring der Großmutter diesen Korb mit Kuchen und Wein. Sie ist krank und schwach. Geh nicht vom Weg ab!“ Im Wald traf Rotkäppchen den Wolf. Der Wolf fragte: „Wohin gehst du?“ – „Zur Großmutter“, antwortete sie. Der Wolf lief schnell zum Haus der Großmutter. Später kam ein Jäger und rettete beide.`;

async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((x) => ("str" in x ? x.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

function Index() {
  const version = useStoreVersion();
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [askTranscript, setAskTranscript] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function create() {
    setError("");
    try {
      let content = parseTranscript(text).text;
      let kind = "Text";
      let video: Video | undefined;
      if (tab === "link" && askTranscript && transcript.trim() && youtubeId(url)) {
        const parsed = parseTranscript(transcript);
        content = parsed.text;
        video = { id: youtubeId(url)!, cues: parsed.cues };
        kind = "YouTube";
      } else if (tab === "link") {
        setBusy("Fetching the source…");
        const r = await fetch("/api/fetch-source", { method: "POST", body: JSON.stringify({ url }) });
        const j = await r.json();
        if (!r.ok) {
          if (youtubeId(url)) setAskTranscript(true);
          throw new Error(j.error);
        }
        content = j.text;
        video = j.video;
        kind = video ? "YouTube" : "Article";
      } else if (tab === "pdf") {
        if (!file) throw new Error("Choose a PDF first.");
        setBusy("Reading the PDF…");
        content = await readPdf(file);
        kind = "PDF";
      }
      setBusy("Mapping scenes, vocabulary and structure…");
      const r = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ text: content }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error);
      const s: Source = {
        id: uid(),
        createdAt: Date.now(),
        kind,
        text: content,
        graph: j.graph,
        ...(video ? { video } : {}),
      };
      saveSource(s);
      navigate({ to: "/source/$sourceId", params: { sourceId: s.id } });
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const tabs: [Tab, string][] = [["text", "Paste text"], ["link", "YouTube or web link"], ["pdf", "PDF"]];

  const profile = version ? getActiveProfile() : undefined;
  const lessons = profile
    ? getSources()
        .map((source) => {
          const last = sessionsFor(profile.id, source.id)[0];
          const state = getProgress(profile.id, source.id);
          return {
            source,
            last,
            due: dueForReview(source, state),
            progress: mastery(source, state),
            activity: last?.updatedAt ?? source.createdAt,
          };
        })
        .sort((a, b) => b.activity - a.activity)
    : [];
  const resume = lessons.find((l) => l.last);
  const stats = profile ? practiceStats(profile.id) : null;
  const hasLibrary = lessons.length > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {hasLibrary ? (
        <>
          <h1 className="text-4xl md:text-5xl">Welcome back, {profile?.name}.</h1>
          {stats && (
            <p className="mt-3 text-muted-foreground">
              {stats.streak > 0
                ? `🔥 ${stats.streak}-day streak · practised ${stats.thisWeek} of the last 7 days`
                : "Practise today to start a streak."}
              {stats.streak > 0 && !stats.practisedToday && " · one answer today keeps it going"}
            </p>
          )}
          {resume?.last && (
            <Link
              to="/session/$sessionId"
              params={{ sessionId: resume.last.id }}
              className="mt-8 flex items-center justify-between gap-6 rounded-2xl border bg-card p-6 shadow-paper transition-transform hover:-translate-y-0.5"
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-accent">Pick up where you left off</p>
                <h2 className="mt-2 text-2xl">{resume.source.graph.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Last practised {timeAgo(resume.last.updatedAt)} · {resume.progress.percent}% mastered
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground">
                Continue →
              </span>
            </Link>
          )}

          <section className="mt-12">
            <h2 className="text-2xl">Your lessons</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {lessons.map(({ source: s, last, progress, due }) => (
                <article key={s.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-paper">
                  <Link to="/source/$sourceId" params={{ sourceId: s.id }} className="group flex-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {s.kind} · {s.graph.language} · {s.graph.level}
                    </p>
                    <h3 className="mt-2 text-xl group-hover:text-accent">{s.graph.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.graph.topic}</p>
                  </Link>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {progress.practised}/{progress.total} items practised
                      </span>
                      <span>{progress.percent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-success transition-all"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {last ? (
                      <Button asChild size="sm">
                        <Link to="/session/$sessionId" params={{ sessionId: last.id }}>
                          Continue
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link to="/source/$sourceId" params={{ sourceId: s.id }}>
                          Start
                        </Link>
                      </Button>
                    )}
                    {due.length > 0 && profile && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const session = createSession(profile.id, s.id, reviewOpener(due));
                          navigate({ to: "/session/$sessionId", params: { sessionId: session.id } });
                        }}
                      >
                        Review {due.length}
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/source/$sourceId" params={{ sourceId: s.id }}>
                        Lesson map
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="text-sm font-medium uppercase tracking-widest text-accent">Lernwerk</p>
          <h1 className="mt-3 max-w-3xl text-5xl leading-tight md:text-6xl">
            Learn a language from <em className="text-accent">anything</em> you read or watch.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Drop in a transcript, article or chapter. A tutor maps its scenes and guides you from reading it to speaking it.
          </p>
        </>
      )}

      <section id="new" className="mt-12 scroll-mt-8 rounded-2xl border bg-card p-6 shadow-paper">
        {hasLibrary && <h2 className="mb-4 text-2xl">New lesson</h2>}
        <div className="flex flex-wrap gap-2">
          {tabs.map(([t, l]) => (
            <Button key={t} variant={tab === t ? "default" : "ghost"} size="sm" onClick={() => setTab(t)}>
              {l}
            </Button>
          ))}
        </div>
        <div className="mt-5">
          {tab === "text" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Ich kann meine Augen zumachen und aufmachen. Ich kann blinzeln…"
              className="w-full resize-y rounded-xl border bg-background p-4 outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          {tab === "link" && (
            <div className="space-y-3">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=… or an article URL"
                className="w-full rounded-xl border bg-background p-4 outline-none focus:ring-2 focus:ring-ring"
              />
              {askTranscript && youtubeId(url) && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    YouTube didn't let us download this video's captions. On YouTube, open the video's
                    description, click <strong>Show transcript</strong>, select the whole transcript and
                    paste it here. Keep the timestamps: they let each scene jump to the right moment in
                    the video.
                  </p>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={8}
                    placeholder={"0:00\nhello and welcome back…"}
                    className="w-full resize-y rounded-xl border bg-background p-4 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          )}
          {tab === "pdf" && (
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-dashed bg-background p-6"
            />
          )}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Button size="lg" onClick={create} disabled={!!busy}>
            {busy ? busy : "Build my lesson"}
          </Button>
          {!busy && tab === "text" && !text.trim() && (
            <Button variant="ghost" onClick={() => setText(EXAMPLE_TEXT)}>
              Try an example
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </section>

    </main>
  );
}

function timeAgo(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
