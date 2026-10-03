import { createFileRoute } from "@tanstack/react-router";
import { youtubeId } from "@/lib/video";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

type PlayerClient = { userAgent: string; context: Record<string, unknown> };

// YouTube blocks some clients from data-centre IPs ("confirm you're not a bot") but not others,
// so try several. The web page's own caption URLs need a proof-of-origin token, so it isn't used.
const PLAYER_CLIENTS: PlayerClient[] = [
  {
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    context: {
      client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "en" },
    },
  },
  {
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    context: {
      client: { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2", hl: "en" },
    },
  },
  {
    userAgent: UA,
    context: {
      client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20250310.01.00", hl: "en" },
      thirdParty: { embedUrl: "https://www.youtube.com/" },
    },
  },
  {
    userAgent: UA,
    context: {
      client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en" },
    },
  },
  {
    userAgent: UA,
    context: { client: { clientName: "MWEB", clientVersion: "2.20250311.03.00", hl: "en" } },
  },
];

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };
type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
};
type Cue = { start: number; text: string };

function pickTrack(tracks: CaptionTrack[]) {
  const spoken = tracks.find((t) => t.kind === "asr")?.languageCode.split("-")[0];
  const manual = tracks.filter((t) => t.kind !== "asr");
  return (
    (spoken && manual.find((t) => t.languageCode.split("-")[0] === spoken)) ||
    tracks.find((t) => t.kind === "asr") ||
    manual[0]
  );
}

function parseCues(xml: string): Cue[] {
  const clean = (raw: string) =>
    decode(decode(raw.replace(/<[^>]+>/g, "")))
      .replace(/\s+/g, " ")
      .trim();
  const format3 = [...xml.matchAll(/<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({
    start: Number(m[1]) / 1000,
    text: clean(m[2] ?? ""),
  }));
  const legacy = [...xml.matchAll(/<text\s+start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)].map(
    (m) => ({
      start: Number(m[1]),
      text: clean(m[2] ?? ""),
    }),
  );
  return (format3.length ? format3 : legacy).filter((c) => c.text && !/^\[.*\]$/.test(c.text));
}

async function youtubeTranscript(id: string) {
  let player: PlayerResponse | undefined;
  let lastReason = "This video isn't available.";
  for (const client of PLAYER_CLIENTS) {
    const response = (await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": client.userAgent },
      body: JSON.stringify({ context: client.context, videoId: id }),
    })
      .then((r) => r.json())
      .catch(() => undefined)) as PlayerResponse | undefined;
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (response?.playabilityStatus?.status === "OK") {
      if (tracks.length) {
        player = response;
        console.info(
          `[api/fetch-source] captions via ${String((client.context["client"] as { clientName: string }).clientName)}`,
        );
        break;
      }
      lastReason = "This video has no captions we can read. Paste the transcript instead.";
      continue;
    }
    lastReason = response?.playabilityStatus?.reason ?? lastReason;
  }
  if (!player)
    throw new Error(
      /bot/i.test(lastReason)
        ? "YouTube blocked the transcript download from our server. Paste the video's transcript instead."
        : lastReason,
    );
  const title = player.videoDetails?.title ?? "YouTube video";
  const track = pickTrack(player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  if (!track)
    throw new Error("This video has no captions we can read. Paste the transcript instead.");
  const xml = await fetch(track.baseUrl, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const cues = parseCues(xml);
  const text = cues.map((c) => c.text).join(" ");
  if (!text.trim())
    throw new Error("Couldn't read this video's captions. Paste the transcript instead.");
  return { title, text, video: { id, cues } };
}

async function webPage(url: string) {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => {
    if (!r.ok) throw new Error(`The page returned an error (${r.status}).`);
    return r.text();
  });
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? url);
  const body = (html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html)
    .replace(/<(script|style|nav|header|footer|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h\d|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { title, text };
}

export const Route = createFileRoute("/api/fetch-source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { url } = (await request.json()) as { url: string };
          const u = new URL(url);
          if (!/^https?:$/.test(u.protocol)) throw new Error("Only web links are supported.");
          const id = youtubeId(url);
          const out = id ? await youtubeTranscript(id) : await webPage(url);
          return Response.json(out);
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
