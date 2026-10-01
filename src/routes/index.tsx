import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSources, saveSource, uid, type Source } from "@/lib/store";

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
  const [sources, setSources] = useState<Source[]>([]);
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => setSources(getSources()), []);

  async function create() {
    setError("");
    try {
      let content = text;
      let kind = "Text";
      if (tab === "link") {
        setBusy("Fetching the source…");
        const r = await fetch("/api/fetch-source", { method: "POST", body: JSON.stringify({ url }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        content = j.text;
        kind = /youtu/.test(url) ? "YouTube" : "Article";
      } else if (tab === "pdf") {
        if (!file) throw new Error("Choose a PDF first.");
        setBusy("Reading the PDF…");
        content = await readPdf(file);
        kind = "PDF";
      }
      setBusy("Mapping scenes, vocabulary and structure…");
      const r = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ text: content }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const s: Source = { id: uid(), createdAt: Date.now(), kind, text: content, graph: j.graph };
      saveSource(s);
      navigate({ to: "/source/$sourceId", params: { sourceId: s.id } });
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const tabs: [Tab, string][] = [["text", "Paste text"], ["link", "YouTube or web link"], ["pdf", "PDF"]];

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">Lernwerk</p>
      <h1 className="mt-3 max-w-3xl text-5xl leading-tight md:text-6xl">
        Learn a language from <em className="text-accent">anything</em> you read or watch.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted-foreground">
        Drop in a transcript, article or chapter. A tutor maps its scenes and guides you from reading it to speaking it.
      </p>

      <section className="mt-12 rounded-2xl border bg-card p-6 shadow-paper">
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
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=… or an article URL"
              className="w-full rounded-xl border bg-background p-4 outline-none focus:ring-2 focus:ring-ring"
            />
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
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </section>

      {sources.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl">Your library</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {sources.map((s) => (
              <Link
                key={s.id}
                to="/source/$sourceId"
                params={{ sourceId: s.id }}
                className="rounded-xl border bg-card p-5 shadow-paper transition-transform hover:-translate-y-0.5"
              >
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {s.kind} · {s.graph.language} · {s.graph.level}
                </p>
                <h3 className="mt-2 text-xl">{s.graph.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.graph.topic}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
