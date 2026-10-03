import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import {
  errorMessage,
  errorResponse,
  logAiError,
  logUsage,
  makeGateway,
} from "@/lib/ai/gateway.server";

const PROMPT = `You are the CONTENT ARCHITECT of an adaptive language-learning app.
Convert the SOURCE into a structured learning graph. Identify its natural structure: scenes, sequences, stories, cause/effect, categories, recurring patterns, useful vocabulary and phrases. Preserve the source's natural wording. Never invent facts.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "title": string,              // short title in the target language
  "topic": string,              // one-line topic in the learner's native language (English unless obvious otherwise)
  "language": string,           // target language name, e.g. "German"
  "level": string,              // CEFR estimate, e.g. "A2"
  "summary": string,            // 1-2 sentences, English
  "scenes": [
    {
      "title": string,
      "context": string,        // a short passage (2-5 sentences) from the source, in the source's own language (never translated); you may fix capitalisation and punctuation
      "start_quote": string,    // the first 6-10 words of this scene copied exactly from the source, unchanged
      "sequence": [ { "term": string, "meaning": string, "emoji": string } ],  // ordered items as they occur, 3-10
      "phrases": [string]       // 0-4 useful full phrases from the source
    }
  ],
  "relationships": [ { "parent": string, "children": [string] } ]
}
Produce 2-8 scenes, in the order they occur. Keep it faithful to the source: titles, contexts, terms and phrases stay in the source's language; only "meaning", "topic" and "summary" are in English. Transcripts may lack punctuation and capitals; that's normal, don't translate them.`;

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { text } = (await request.json()) as { text: string };
          if (!text || text.trim().length < 20)
            return new Response(JSON.stringify({ error: "Source is too short." }), { status: 400 });
          const { model, withoutThinking } = makeGateway();
          let streamError: unknown;
          const result = streamText({
            model,
            system: PROMPT,
            prompt: `SOURCE:\n${text.slice(0, 60000)}`,
            abortSignal: request.signal,
            onFinish: ({ totalUsage }) => logUsage("api/analyze", totalUsage),
            onError: ({ error }) => {
              streamError = error;
            },
            providerOptions: withoutThinking,
          });
          const encoder = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            async start(controller) {
              // Browsers drop requests that receive no bytes for ~60s; leading whitespace keeps the JSON valid.
              const keepAlive = setInterval(() => controller.enqueue(encoder.encode(" ")), 5000);
              let payload: unknown;
              try {
                const out = await result.text;
                const graph = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
                payload = { graph };
              } catch (e) {
                const cause = streamError ?? e;
                logAiError("api/analyze", cause);
                payload = { error: errorMessage(cause) };
              } finally {
                clearInterval(keepAlive);
              }
              controller.enqueue(encoder.encode(JSON.stringify(payload)));
              controller.close();
            },
          });
          return new Response(body, { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
