import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const DEFAULT_BASE_URL = "https://ai-litellm.spiria.com/v1";
const DEFAULT_MODEL = "qwen3-27b";

export function makeGateway() {
  const apiKey = process.env["AI_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured (missing key).");
  const baseURL = process.env["AI_BASE_URL"] || DEFAULT_BASE_URL;
  const provider = createOpenAICompatible({ name: "ai", baseURL, apiKey, includeUsage: true });
  // chat_template_kwargs is a vLLM extension (Spiria's Qwen models reason by default); other
  // OpenAI-compatible APIs such as Gemini reject the unknown field.
  const withoutThinking = baseURL.startsWith(DEFAULT_BASE_URL)
    ? { ai: { chat_template_kwargs: { enable_thinking: false } } }
    : {};
  return { model: provider(process.env["AI_MODEL"] || DEFAULT_MODEL), withoutThinking };
}

export function logUsage(
  route: string,
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    inputTokenDetails?: { cacheReadTokens: number | undefined };
  },
) {
  console.info(
    `[${route}] tokens in=${usage.inputTokens ?? "?"} cached=${usage.inputTokenDetails?.cacheReadTokens ?? 0} out=${usage.outputTokens ?? "?"}`,
  );
}

type ApiError = { statusCode?: number; responseBody?: string; message?: string };

/** The provider's HTTP error, unwrapped from the AI SDK's retry and no-output wrappers. */
function findApiError(e: unknown, depth = 0): ApiError | undefined {
  if (!e || typeof e !== "object" || depth > 4) return undefined;
  const err = e as ApiError & { cause?: unknown; lastError?: unknown };
  if (typeof err.statusCode === "number") return err;
  return findApiError(err.lastError, depth + 1) ?? findApiError(err.cause, depth + 1);
}

function providerMessage(body: string | undefined) {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    const first = (Array.isArray(parsed) ? parsed[0] : parsed) as { error?: { message?: string } };
    return first?.error?.message;
  } catch {
    return body.slice(0, 300);
  }
}

export function errorMessage(e: unknown) {
  const api = findApiError(e);
  const status = api?.statusCode;
  if (status === 401 || status === 403)
    return "AI is not configured correctly (invalid key). If you just changed .env, restart the server.";
  if (status === 402) return "The AI account is out of credit. Top it up to keep learning.";
  if (status === 429) return "Too many requests right now — wait a moment and try again.";
  if (status && status >= 500) return "The AI service is busy right now — try again in a moment.";
  const detail = providerMessage(api?.responseBody);
  // Gemini reports a bad key as 400 INVALID_ARGUMENT rather than 401.
  if (detail && /api key/i.test(detail))
    return "AI is not configured correctly (invalid key). If you just changed .env, restart the server.";
  if (detail) return `The AI service rejected the request: ${detail}`;
  return (e as { message?: string })?.message ?? "Something went wrong";
}

export function logAiError(route: string, e: unknown) {
  const api = findApiError(e);
  console.error(
    `[${route}] failed${api?.statusCode ? ` (${api.statusCode})` : ""}: ${providerMessage(api?.responseBody) ?? (e as Error)?.message ?? e}`,
  );
}

export function errorResponse(e: unknown) {
  const status = findApiError(e)?.statusCode ?? 500;
  return new Response(JSON.stringify({ error: errorMessage(e) }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
