import { createFileRoute } from "@tanstack/react-router";
import { jsonSchema, Output, streamText } from "ai";
import {
  errorMessage,
  errorResponse,
  logAiError,
  logUsage,
  makeGateway,
} from "@/lib/ai/gateway.server";
import type { Graph, Scene } from "@/lib/store";

const PROMPT = `You are the CONTENT ARCHITECT of an adaptive language-learning app.
Convert the SOURCE into a structured learning graph. Identify its natural structure: scenes, sequences, stories, cause/effect, categories, recurring patterns, useful vocabulary and phrases. Preserve the source's natural wording. Never invent facts.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "kind": "content" | "grammar", // "grammar" when the source mainly explains a grammar rule (forms, endings, word order…), else "content"
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
      "phrases": [string],      // 0-4 useful full phrases from the source
      "exercises": [ { "prompt": string, "answer": string } ]  // grammar only, else []
    }
  ],
  "relationships": [ { "parent": string, "children": [string] } ]
}
Produce 2-8 scenes, in the order they occur. Keep it faithful to the source: titles, contexts, terms and phrases stay in the source's language; only "meaning", "topic" and "summary" are in English. Transcripts may lack punctuation and capitals; that's normal, don't translate them.

For a "grammar" source, each scene is one part of the rule, in the order the source teaches it (e.g. the regular pattern, then the exceptions, then how the form changes with articles):
- "title": a short name for that part, e.g. "1–19: add -te".
- "context": the rule for that part in 2-4 short English sentences, with the source's own target-language examples.
- "start_quote": "".
- "sequence": the forms the learner must master, e.g. { "term": "der dritte", "meaning": "the third (irregular)", "emoji": "3️⃣" }.
- "phrases": the source's example sentences.
- "exercises": 4-8 exercises that make the learner apply this part of the rule, easy to hard and varied: fill in the correct form ("Heute ist der ___ Mai. (3.)"), transform, translate a short sentence into the target language, answer a question with the form. Every exercise has exactly one correct answer; "prompt" is the task as the learner sees it (instruction in English, sentence in the target language); "answer" is the full expected answer. Use only words a learner at this level knows; new example sentences are allowed here.`;

const string = { type: "string" } as const;
const strings = { type: "array", items: string } as const;

const graphOutput = Output.object({
  name: "learning_graph",
  schema: jsonSchema<unknown>({
    type: "object",
    properties: {
      kind: { type: "string", enum: ["content", "grammar"] },
      title: string,
      topic: string,
      language: string,
      level: string,
      summary: string,
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: string,
            context: string,
            start_quote: string,
            sequence: {
              type: "array",
              items: {
                type: "object",
                properties: { term: string, meaning: string, emoji: string },
                required: ["term", "meaning", "emoji"],
              },
            },
            phrases: strings,
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: { prompt: string, answer: string },
                required: ["prompt", "answer"],
              },
            },
          },
          required: ["title", "context", "start_quote", "sequence", "phrases", "exercises"],
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: { parent: string, children: strings },
          required: ["parent", "children"],
        },
      },
    },
    required: ["kind", "title", "topic", "language", "level", "summary", "scenes", "relationships"],
  }),
});

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const record = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function normaliseGraph(value: unknown): Graph {
  const g = record(value);
  const scenes: Scene[] = list(g["scenes"]).flatMap((raw) => {
    const sc = record(raw);
    const title = str(sc["title"]);
    if (!title) return [];
    const sequence = list(sc["sequence"]).flatMap((rawItem) => {
      const it = record(rawItem);
      const term = str(it["term"]);
      return term ? [{ term, meaning: str(it["meaning"]), emoji: str(it["emoji"]) }] : [];
    });
    return [
      {
        title,
        context: str(sc["context"]),
        ...(str(sc["start_quote"]) ? { start_quote: str(sc["start_quote"]) } : {}),
        sequence,
        phrases: list(sc["phrases"]).map(str).filter(Boolean),
        exercises: list(sc["exercises"]).flatMap((rawExercise) => {
          const ex = record(rawExercise);
          const prompt = str(ex["prompt"]);
          const answer = str(ex["answer"]);
          return prompt && answer ? [{ prompt, answer }] : [];
        }),
      },
    ];
  });
  if (!scenes.length) throw new Error("The AI didn't return any scenes. Try again.");
  return {
    kind: g["kind"] === "grammar" ? "grammar" : "content",
    title: str(g["title"]) || scenes[0]!.title,
    topic: str(g["topic"]),
    language: str(g["language"]),
    level: str(g["level"]),
    summary: str(g["summary"]),
    scenes,
    relationships: list(g["relationships"]).flatMap((raw) => {
      const r = record(raw);
      const parent = str(r["parent"]);
      return parent ? [{ parent, children: list(r["children"]).map(str).filter(Boolean) }] : [];
    }),
  };
}

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
            // Constrains decoding to valid JSON; Qwen otherwise leaves quotes inside strings unescaped.
            output: graphOutput,
            abortSignal: request.signal,
            onFinish: ({ totalUsage }) => logUsage("api/analyze", totalUsage),
            onError: ({ error }) => {
              streamError = error;
            },
            providerOptions: withoutThinking,
          });
          const encoder = new TextEncoder();
          let keepAlive: ReturnType<typeof setInterval> | undefined;
          const body = new ReadableStream<Uint8Array>({
            async start(controller) {
              const send = (chunk: string) => {
                try {
                  controller.enqueue(encoder.encode(chunk));
                } catch {
                  clearInterval(keepAlive);
                }
              };
              // Browsers drop requests that receive no bytes for ~60s; leading whitespace keeps the JSON valid.
              keepAlive = setInterval(() => send(" "), 5000);
              let payload: unknown;
              try {
                const graph = normaliseGraph(await result.output);
                payload = { graph };
              } catch (e) {
                const cause = streamError ?? e;
                logAiError("api/analyze", cause);
                payload = { error: errorMessage(cause) };
              } finally {
                clearInterval(keepAlive);
              }
              send(JSON.stringify(payload));
              try {
                controller.close();
              } catch {
                // The client already disconnected.
              }
            },
            cancel() {
              clearInterval(keepAlive);
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
