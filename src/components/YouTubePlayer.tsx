import { forwardRef, useImperativeHandle, useRef } from "react";

export type YouTubePlayerHandle = { playFrom: (seconds: number) => void };

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, { videoId: string; title: string }>(
  function YouTubePlayer({ videoId, title }, ref) {
    const frame = useRef<HTMLIFrameElement>(null);
    const command = (func: string, args: unknown[] = []) =>
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube-nocookie.com",
      );

    useImperativeHandle(ref, () => ({
      playFrom: (seconds) => {
        command("seekTo", [seconds, true]);
        command("playVideo");
      },
    }));

    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          ref={frame}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&playsinline=1&cc_load_policy=1&origin=${encodeURIComponent(origin)}`}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  },
);
