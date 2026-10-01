import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } from "./run-id.server";

export const MODEL = "openai/gpt-6-astra";

export function makeGateway(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (missing key).");
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  return { model: provider.responses(MODEL), runIdFetch };
}

export const reasoningOptions = (effort: "low" | "medium" = "low") => ({
  openai: {
    forceReasoning: true,
    reasoningEffort: effort,
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
});

export function errorResponse(e: unknown) {
  const err = e as { statusCode?: number; message?: string; responseBody?: string };
  const status = err?.statusCode ?? 500;
  let message = err?.message ?? "Something went wrong";
  if (status === 402) message = "AI credits are used up. Add credits to keep learning.";
  if (status === 429) message = "Too many requests right now — wait a moment and try again.";
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
