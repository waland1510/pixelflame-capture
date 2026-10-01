import { createFileRoute } from "@tanstack/react-router";

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

function youtubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m?.[1];
}

async function youtubeTranscript(id: string) {
  const page = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  }).then((r) => r.text());
  const title = decode(page.match(/<title>(.*?)<\/title>/)?.[1] ?? "YouTube video").replace(
    / - YouTube$/,
    "",
  );
  const m = page.match(/"captionTracks":(\[.*?\])/);
  if (!m) throw new Error("This video has no captions we can read. Paste the transcript instead.");
  const tracks = JSON.parse(m[1]) as { baseUrl: string; kind?: string }[];
  const track = tracks.find((t) => t.kind !== "asr") ?? tracks[0];
  const xml = await fetch(track.baseUrl, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const text = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((x) => decode(decode(x[1])).replace(/<[^>]+>/g, ""))
    .join(" ");
  if (!text.trim()) throw new Error("Couldn't read this video's captions. Paste the transcript instead.");
  return { title, text };
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
  const text = decode(body).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
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
