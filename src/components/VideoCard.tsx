import { useMemo, useRef, useState } from "react";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/YouTubePlayer";
import type { Source } from "@/lib/store";
import { findScene, formatTime, sceneStartTimes } from "@/lib/video";

export function VideoCard({ source, currentScene }: { source: Source; currentScene: string }) {
  const [open, setOpen] = useState(true);
  const player = useRef<YouTubePlayerHandle>(null);
  const times = useMemo(
    () => sceneStartTimes(source.graph, source.video?.cues),
    [source.graph, source.video?.cues],
  );
  if (!source.video) return null;

  const index = findScene(source.graph.scenes, currentScene);
  const sceneTime = index >= 0 ? times[index] : undefined;

  return (
    <div className="shrink-0 rounded-2xl border bg-card p-3 shadow-paper">
      <div className="flex items-center justify-between px-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Video</p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <YouTubePlayer ref={player} videoId={source.video.id} title={source.graph.title} />
          {sceneTime !== undefined && (
            <button
              type="button"
              onClick={() => player.current?.playFrom(sceneTime)}
              className="w-full rounded-lg bg-secondary px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              ▶ Play scene “{source.graph.scenes[index]!.title}” · {formatTime(sceneTime)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
