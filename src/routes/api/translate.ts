import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { errorResponse, makeGateway } from "@/lib/ai/gateway.server";

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { text, to = "English" } = (await request.json()) as { text: string; to?: string };
          if (!text?.trim())
            return Response.json({ error: "Nothing to translate." }, { status: 400 });
          const { model, withoutThinking } = makeGateway();
          const result = await generateText({
            model,
            system: `Translate the user's text into ${to}. Keep emoji and line breaks. Leave parts already in ${to} unchanged. Reply with the translation only.`,
            prompt: text.slice(0, 4000),
            abortSignal: request.signal,
            providerOptions: withoutThinking,
          });
          return Response.json({ translation: result.text.trim() });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
