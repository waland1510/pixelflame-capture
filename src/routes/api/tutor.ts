import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { errorResponse, makeGateway, reasoningOptions } from "@/lib/ai/gateway.server";
import { withLovableAiGatewayRunIdHeader } from "@/lib/ai/run-id.server";

const SYSTEM = `You are an adaptive language-learning TUTOR. Help the learner internalize and actively PRODUCE and USE the material in the LEARNING_GRAPH (derived from their source).

Principles:
1. Context before isolation — introduce items inside their scene context.
2. Preserve structure — use the scene sequences as the memory scaffold.
3. Gradually remove support: FULL CONTEXT → PARTIAL CONTEXT → CLOZE → PROMPT → RECALL → FREE PRODUCTION → TRANSFER. Don't advance after one correct answer.
4. Prefer asking the learner to produce over showing answers.
5. Adapt after every response using LEARNER_STATE.
6. Meaningful repetition: when they struggle, reintroduce the item in a new but related context.
7. Don't over-test; it should feel like a warm tutor, not an exam.
8. Conduct much of the interaction in the target language, with brief English support matched to their level.

Activities (choose ONE per turn, the one most likely to improve retention now): READ_CONTEXT, CLOZE, RECONSTRUCT, SITUATION, TRANSLATE, PARAPHRASE, CONVERSATION, TRANSFER, REVIEW.
Source fidelity: never present invented facts as from the source; label transfer examples as new.
Errors: classify (vocabulary/grammar/comprehension/recall/transfer), give the minimum correction, ask for another attempt when useful.

RECONSTRUCT requests: give progressively less help on the current scene. Level 1: sentence with blanks. Level 2: arrow chain with the last item(s) as "?". Level 3: emoji-only chain. Level 4: "Tell me what happens in this scene." Go one level beyond the last one used.

EVERY TURN:
- If the learner just answered, FIRST call record_evaluation with your honest assessment of each item involved.
- Then write the next activity. Keep it short (under ~120 words). Use markdown sparingly; use "___" for blanks. End with one clear prompt for the learner.
- Begin with a one-line tag like "**Cloze · Scene: Augen**".`;

export const Route = createFileRoute("/api/tutor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages, graph, learnerState } = (await request.json()) as {
            messages: UIMessage[];
            graph: unknown;
            learnerState: unknown;
          };
          const { model, runIdFetch } = makeGateway(request);
          const result = streamText({
            model,
            system: `${SYSTEM}\n\nLEARNING_GRAPH:\n${JSON.stringify(graph)}\n\nLEARNER_STATE:\n${JSON.stringify(learnerState)}`,
            messages: await convertToModelMessages(messages),
            abortSignal: request.signal,
            stopWhen: stepCountIs(50),
            providerOptions: reasoningOptions("low"),
            tools: {
              record_evaluation: tool({
                description:
                  "Record how the learner did on specific items in their last answer. Call before writing the next activity.",
                inputSchema: z.object({
                  items: z.array(
                    z.object({
                      term: z.string().describe("Item term exactly as in the learning graph"),
                      correct: z.boolean(),
                      produced: z.boolean().describe("True if the learner produced it unaided"),
                      error_type: z
                        .string()
                        .describe("none, vocabulary, grammar, comprehension, recall, or transfer"),
                    }),
                  ),
                  current_scene: z.string(),
                  stage: z
                    .string()
                    .describe("full_context, partial_context, cloze, prompt, recall, free_production, or transfer"),
                  note: z.string().describe("Very short note on what to do next"),
                }),
                execute: async () => ({ ok: true }),
              }),
            },
          });
          return withLovableAiGatewayRunIdHeader(
            result.toUIMessageStreamResponse({
              originalMessages: messages,
              onError: (error) => {
                console.error("[api/tutor] Response stream failed:", error);
                const status = (error as { statusCode?: number })?.statusCode;
                if (status === 402) return "AI credits are used up. Add credits in your workspace to keep learning.";
                if (status === 429) return "Too many requests right now — wait a moment and try again.";
                if (status === 403) return "AI access is blocked for this workspace right now.";
                return "The tutor couldn't generate a response. Please try again.";
              },
            }),
            runIdFetch,
          );
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
