import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  zodSchema,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  errorMessage,
  errorResponse,
  logAiError,
  logUsage,
  makeGateway,
} from "@/lib/ai/gateway.server";
import type { Graph, LearnerState } from "@/lib/store";
import { compactGraph, compactState, focusSceneIndex, recentMessages } from "@/lib/tutor-context";
import { hasReply } from "@/lib/translate";

const SYSTEM = `You are an adaptive language-learning TUTOR. Help the learner internalize and actively PRODUCE and USE the material in the LEARNING_GRAPH (derived from their source).

STRICT RULES (these override everything below):
- Make the learner retrieve, never copy. Your message must not contain the answer to its own question: don't retell or quote the part of the story you ask about, don't offer answer options ("A or B?"), and don't attach hints, word lists, translations, emoji cues or sentence starters to a question.
- Show a scene's passage only once, when the scene starts, or when the learner asks to see it again. When you show it, ask something the passage doesn't answer word for word: what they think, what might happen next, what they would say or do. After that, ask from memory.
- Give hints only when needed: after a wrong, partial or "I don't know" answer, or when the learner asks. Give the smallest useful hint and escalate on each further miss: 1) rephrase the question or describe the situation, 2) the meaning in English or an emoji, 3) the first letters, 4) the answer, then ask them to use it in a new sentence.
- After a correct answer, raise the bar: ask for a longer answer, a why or how, a retelling in their own words, or a sentence about their own life.
- Your default activity is CONVERSATION: ask the learner a question about the story or their own life that they answer in a full sentence.
- Do NOT give fill-in-the-blank (cloze) exercises unless the learner asked for them or has missed the same word at least twice. Never in your first message of a session. Never right after a correct answer. Never in two turns in a row.
- Start every message with a tag naming the activity you actually use, e.g. "**Conversation · Scene: Augen**".

Principles:
1. Context before isolation — introduce items inside their scene context, once; then make the learner recall them.
2. Preserve structure — use the scene sequences as the memory scaffold.
3. Gradually remove support: FULL CONTEXT → PARTIAL CONTEXT → CLOZE → PROMPT → RECALL → FREE PRODUCTION → TRANSFER. Don't advance after one correct answer. These stages describe how much help you give, not which exercise to use: at every stage, prefer talking with the learner.
4. Prefer asking the learner to produce over showing answers.
5. Adapt after every response using LEARNER_STATE.
6. Meaningful repetition: when they struggle, reintroduce the item in a new but related context.
7. Don't over-test; it should feel like a warm tutor, not an exam.
8. Conduct much of the interaction in the target language, with brief English support matched to their level.

Activities (choose ONE per turn, the one most likely to improve retention now): READ_CONTEXT, CLOZE, RECONSTRUCT, SITUATION, TRANSLATE, PARAPHRASE, CONVERSATION, TRANSFER, REVIEW.
If the learner asks to practise or switch to a specific scene, move to that scene right away: briefly set the scene, then continue the conversation there at a level that fits their progress on its words.
If the session's first message asks to review specific words, focus on those words, mixing them into conversation about the story.

Make the session feel like a conversation:
- Default to CONVERSATION, SITUATION and questions about the story: ask what happens, why, what a character says or feels, role-play a character, or ask about the learner's own life using the lesson words.
- Ask open questions the learner answers in a full sentence. Adjust difficulty through the question itself (a concrete "who/where/what" before a "why" or a retelling), never by putting the answer or the needed words into it.
- React to what the learner says like a conversation partner before moving on, and fold corrections into your reply.
- Build active vocabulary: regularly ask questions that make the learner say specific lesson words in their own sentences (about the story or their own life). Set up a situation or question that needs the word; don't name, translate or emoji-cue it unless you are giving a hint. Count it as produced only when they used it unprompted.
- Keep spoken turns short: one or two sentences of reaction, then one question. The learner may be listening to you rather than reading.
- Use CLOZE rarely: only when the learner has missed the same item at least twice or asks for blanks. Never in the first turn, never right after a correct answer, never in two turns in a row. At least three of every four turns should be conversation.
- The tag at the top must name the activity you actually use.
Source fidelity: never present invented facts as from the source; label transfer examples as new.
Errors: classify (vocabulary/grammar/comprehension/recall/transfer). Always fill record_evaluation's "corrected" field with the learner's last message, fixed if it has spelling, grammar or word-choice mistakes, and explain the fix in "correction_note"; the app shows any change as a correction card under their message. In your reply, don't repeat the whole correction: acknowledge it in a few words and keep the conversation going, or invite them to try the sentence again.

CLOZE and any fill-in-the-blank exercise (including RECONSTRUCT level 1):
- Only blank words that are terms in the LEARNING_GRAPH. Never blank articles, pronouns, filler words, or words from your own instructions or praise.
- Use a sentence taken from the scene context, unchanged except for the blank. Never invent a new sentence for a blank.
- At most 2 blanks per exercise.
- Each blank must have exactly one sensible answer. Put a cue right after every blank: the item's emoji and its English meaning, e.g. "___ (🐺 wolf)". If the word in the sentence is an inflected form of the term (e.g. "Waldes" for "Wald"), the cue also gives the base form.
- Before sending, check each blank: if a learner who knows the lesson could reasonably write a different word, change the cue or pick another blank.
- Good: "Im Wald ___ (🤝 met) Rotkäppchen den Wolf." Bad: "Der Wolf lief ___ zum Haus." (any adverb fits), a third blank, or one shared hint for several blanks.
- Don't mention these rules to the learner.
Voice answers: messages marked "[spoken answer, auto-transcribed]" were spoken, not typed. Ignore missing capitals and punctuation, and don't correct a word that only differs by sounding alike unless it changes the meaning; never change those in "corrected".
Grading blanks: accept the source word in any reasonable form (capitalisation, inflection, the base form). If the learner writes a different word that also fits the sentence, mark it correct, and mention the word the source uses.

RECONSTRUCT requests: give progressively less help on the current scene. Level 1: sentence with blanks. Level 2: arrow chain with the last item(s) as "?". Level 3: emoji-only chain. Level 4: "Tell me what happens in this scene." Go one level beyond the last one used.

EVERY TURN:
- If the learner just answered, FIRST call record_evaluation with your honest assessment of each item involved.
- Then write the next activity. Keep it short (under ~120 words). Use markdown sparingly; use "___" for blanks. End with one clear prompt for the learner.
- Begin with a one-line tag like "**Conversation · Scene: Augen**".`;

const GRAMMAR = `GRAMMAR LESSON: this LEARNING_GRAPH teaches a grammar rule. Each scene is one part of the rule; its "context" states the rule, "sequence" lists the forms to master and "exercises" holds ready-made exercises with answers. For this lesson the rules below replace the conversation, cloze and hint rules above.
- When a part starts, explain its rule briefly (2-3 sentences with one example from the source), then give the first exercise in the same message. Show the explanation again only when the learner asks or keeps missing the same form.
- Every turn is one exercise, and it tests only forms listed in the lesson's "sequence": the current part's, or an earlier part's when mixing in review. Never test a form the lesson doesn't list.
- Follow PRACTICE_PLAN: target the forms it lists as needing practice, least practised first, and move to the next part only when it says this part is covered.
- Use the scene's ready-made exercises first, without showing their answers and without repeating one already asked; then write new ones.
- Vary the task, never the same kind twice in a row: fill in the blank with a cue right after it ("Heute ist der ___ Mai. (3.)"), transform a sentence (change the article, number, case or person), translate a short English sentence, answer a question using the form, fix a sentence with one mistake, build a sentence from given words, a free sentence about their own life. Vary the people, objects and situations in the sentences too.
- Grade the form strictly (ending, spelling, agreement); accept any other words that fit, and ignore spacing and punctuation slips.
- After a wrong answer, give the correct form and the reason in one sentence, then move on to a DIFFERENT exercise. Don't ask the missed exercise again yet: PRACTICE_PLAN says when it is due. If the learner asks for a hint or says they don't know, give the smallest useful hint and let them try again.
- When PRACTICE_PLAN lists a review exercise, make it this turn's exercise, word for word, introduced with something like "Let's try this one again:".
- In record_evaluation, "items" are exactly the "sequence" terms this exercise tested, never a different form that merely looks similar, and "exercise" is the exercise the learner just answered, copied word for word.
- Tag messages "**Exercise · Scene: <the scene's exact title>**".`;

const REVIEW_AFTER = 3;
const NEEDS_PRACTICE = 3;

const exerciseKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function evaluationsIn(messages: UIMessage[]) {
  return messages.flatMap((m) => {
    if (m.role !== "assistant") return [];
    const part = [...m.parts]
      .reverse()
      .find(
        (p) =>
          p.type === "tool-record_evaluation" &&
          "input" in p &&
          !!p.input &&
          p.state !== "output-error",
      );
    const evaluation = part && "input" in part ? normaliseEvaluation(part.input) : undefined;
    return evaluation ? [evaluation] : [];
  });
}

/** The oldest missed exercise that has had REVIEW_AFTER other answers since and wasn't asked again. */
function dueReview(evaluations: Evaluation[]) {
  for (let i = 0; i < evaluations.length; i++) {
    const { exercise, items } = evaluations[i]!;
    const key = exerciseKey(exercise);
    if (!key || !items.some((item) => !item.correct)) continue;
    const askedAgain = evaluations.slice(i + 1).some((e) => exerciseKey(e.exercise) === key);
    if (!askedAgain && evaluations.length - 1 - i >= REVIEW_AFTER) return exercise;
  }
  return undefined;
}

function practicePlan(
  graph: Graph,
  focus: number,
  messages: UIMessage[],
  state: LearnerState | undefined,
) {
  const scene = graph.scenes[focus];
  if (!scene) return { plan: "", note: "" };
  const needs = scene.sequence
    .map((item) => ({ term: item.term, seen: state?.items?.[item.term]?.seen ?? 0 }))
    .filter(
      ({ term, seen }) =>
        seen < NEEDS_PRACTICE || (state?.items?.[term]?.recall_strength ?? 0) < 0.6,
    )
    .sort((a, b) => a.seen - b.seen);
  const review = dueReview(evaluationsIn(messages));
  const plan = [
    `PRACTICE_PLAN for the part "${scene.title}":`,
    needs.length
      ? `- Forms needing practice: ${needs.map(({ term, seen }) => `${term} (practised ${seen}x)`).join(", ")}.`
      : "- Every form of this part is practised; move on to the next part and mix earlier forms in now and then.",
    review
      ? `- THIS TURN: after reacting to the learner's answer, your exercise must be this missed one, word for word, introduced with "Let's try this one again:"\n  ${review}`
      : "- No review exercise is due; write a new exercise.",
  ].join("\n");
  const note = review
    ? `after reacting to my answer, ask this missed exercise again word for word, introduced with "Let's try this one again:" — ${review}`
    : needs[0]
      ? `make the next exercise practise "${needs[0].term}", with a different kind of task and a different sentence than your previous exercise.`
      : "";
  return { plan, note };
}

/** Models follow the latest message more closely than the system prompt, so the plan's next step rides on it. */
function withAppNote(messages: UIMessage[], note: string): UIMessage[] {
  const last = messages.at(-1);
  if (!note || last?.role !== "user") return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      parts: [
        ...last.parts,
        { type: "text", text: `[App note to the tutor, not written by the learner: ${note}]` },
      ],
    },
  ];
}

// Shown to the model as-is so it fills every field.
const evaluationSchema = z.object({
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
  corrected: z
    .string()
    .describe(
      "The learner's last message rewritten with the minimum changes needed to be correct. If it had no mistakes, repeat it unchanged.",
    ),
  correction_note: z
    .string()
    .describe(
      "If you changed anything in 'corrected': one short English sentence explaining the main fix. Otherwise an empty string.",
    ),
  exercise: z
    .string()
    .describe(
      "Grammar lessons: the exercise the learner just answered, copied word for word from your previous message. Otherwise an empty string.",
    ),
});

type Evaluation = z.infer<typeof evaluationSchema>;

const parseJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

// Models (Gemini Flash-Lite especially) often omit fields or send nested values as JSON strings.
// Rejecting the call would lose the learner's progress for that turn, so normalise instead.
function normaliseEvaluation(value: unknown): Evaluation | undefined {
  const raw = parseJson(value);
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" ? x : "");
  const items = parseJson(v["items"]);
  return {
    items: (Array.isArray(items) ? items : []).flatMap((item: unknown) => {
      const i = item as Record<string, unknown> | null;
      if (!i || typeof i["term"] !== "string") return [];
      return [
        {
          term: i["term"],
          correct: i["correct"] === true,
          produced: i["produced"] === true,
          error_type: text(i["error_type"]) || "none",
        },
      ];
    }),
    current_scene: text(v["current_scene"]),
    stage: text(v["stage"]),
    note: text(v["note"]),
    corrected: text(v["corrected"]),
    correction_note: text(v["correction_note"]),
    exercise: text(v["exercise"]),
  };
}

const evaluationInput = jsonSchema<Evaluation>(zodSchema(evaluationSchema).jsonSchema, {
  validate: (value) => {
    const evaluation = normaliseEvaluation(value);
    return evaluation
      ? { success: true, value: evaluation }
      : { success: false, error: new Error("The evaluation must be an object.") };
  },
});

function markSpoken(m: UIMessage): UIMessage {
  if (m.role !== "user" || (m.metadata as { spoken?: boolean } | undefined)?.spoken !== true)
    return m;
  return {
    ...m,
    parts: [{ type: "text", text: "[spoken answer, auto-transcribed]" }, ...m.parts],
  };
}

export const Route = createFileRoute("/api/tutor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages, graph, learnerState } = (await request.json()) as {
            messages: UIMessage[];
            graph: Graph;
            learnerState: LearnerState | undefined;
          };
          const { model } = makeGateway();
          const focus = graph?.scenes ? focusSceneIndex(graph, messages, learnerState) : 0;
          const lessonForModel = graph?.scenes ? compactGraph(graph, focus) : graph;
          const grammar = graph?.kind === "grammar";
          const practice = grammar
            ? practicePlan(graph, focus, messages, learnerState)
            : { plan: "", note: "" };
          const plan = practice.plan ? `\n\n${practice.plan}` : "";
          const history = recentMessages(messages);
          const trimmed = history.length < messages.length;
          const result = streamText({
            model,
            system: `${SYSTEM}${grammar ? `\n\n${GRAMMAR}` : ""}\n\nLEARNING_GRAPH (scenes other than the current and next one are listed by title and words only):\n${JSON.stringify(lessonForModel)}\n\nLEARNER_STATE:\n${JSON.stringify(compactState(learnerState))}${trimmed ? "\n\nOnly the session's first message and the most recent messages are included below; LEARNER_STATE summarises the learner's progress from the rest." : ""}${plan}`,
            messages: await convertToModelMessages(
              withAppNote(history.map(markSpoken), practice.note),
            ),
            abortSignal: request.signal,
            onFinish: ({ totalUsage }) => logUsage("api/tutor", totalUsage),
            // The model sometimes writes its reply in the same step as the tool call; another step would repeat it.
            stopWhen: [stepCountIs(3), ({ steps }) => hasReply(steps.at(-1)?.text ?? "")],
            // Once it has evaluated, force a written reply; otherwise it can loop on the tool and never answer.
            prepareStep: ({ steps }) =>
              steps.some((step) => step.toolCalls.length > 0) ? { toolChoice: "none" } : {},
            tools: {
              record_evaluation: tool({
                description:
                  "Record how the learner did on specific items in their last answer. Call before writing the next activity.",
                inputSchema: evaluationInput,
                execute: async () => ({ ok: true }),
              }),
            },
          });
          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onError: (error) => {
              logAiError("api/tutor", error);
              return errorMessage(error);
            },
          });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
