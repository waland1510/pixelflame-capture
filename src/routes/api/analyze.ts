import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { errorResponse, makeGateway, reasoningOptions } from "@/lib/ai/gateway.server";

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
      "context": string,        // a short passage (2-5 sentences) taken or lightly adapted from the source
      "sequence": [ { "term": string, "meaning": string, "emoji": string } ],  // ordered items as they occur, 3-10
      "phrases": [string]       // 0-4 useful full phrases from the source
    }
  ],
  "relationships": [ { "parent": string, "children": [string] } ]
}
Produce 2-8 scenes. Keep it faithful to the source.`;

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { text } = (await request.json()) as { text: string };
          if (!text || text.trim().length < 20)
            return new Response(JSON.stringify({ error: "Source is too short." }), { status: 400 });
          const { model } = makeGateway(request);
          const result = streamText({
            model,
            system: PROMPT,
            prompt: `SOURCE:\n${text.slice(0, 60000)}`,
            abortSignal: request.signal,
            providerOptions: reasoningOptions("low"),
          });
          const out = await result.text;
          const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
          const graph = JSON.parse(json);
          return Response.json({ graph });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
