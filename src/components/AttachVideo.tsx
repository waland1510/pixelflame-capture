import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSource, type Source, type Video } from "@/lib/store";
import { youtubeId } from "@/lib/video";

export function AttachVideo({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-sm text-accent hover:underline"
      >
        ▶ Add the YouTube video for this lesson
      </button>
    );

  const attach = async () => {
    const id = youtubeId(url);
    if (!id) return setError("That doesn't look like a YouTube link.");
    setBusy(true);
    setError("");
    let video: Video = { id };
    try {
      const r = await fetch("/api/fetch-source", { method: "POST", body: JSON.stringify({ url }) });
      const j = (await r.json()) as { video?: Video };
      if (j.video) video = j.video;
    } catch {
      // Captions only enable scene jumps; the video still plays without them.
    }
    saveSource({ ...source, video });
    setBusy(false);
  };

  return (
    <form
      className="mt-4 flex max-w-xl flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void attach();
      }}
    >
      <Input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=…"
        className="flex-1"
      />
      <Button type="submit" disabled={busy || !url.trim()}>
        {busy ? "Adding…" : "Add video"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
