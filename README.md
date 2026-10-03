# Lernwerk

Learn a language from anything you read or watch. Paste text, a YouTube link, an article or a PDF;
Lernwerk maps its scenes and vocabulary, and an adaptive tutor guides you from reading it to
speaking it.

Built with TanStack Start, React and the AI SDK. Learner data lives in the browser's localStorage.

## Development

Requires [Bun](https://bun.sh) and Node.js 22+.

```sh
bun install
cp .env.example .env   # then fill in a key
bun run dev            # http://localhost:8080
```

## AI provider

The server talks to any OpenAI-compatible API, configured with environment variables:

| Variable      | Default                             |
| ------------- | ----------------------------------- |
| `AI_API_KEY`  | required                            |
| `AI_BASE_URL` | `https://ai-litellm.spiria.com/v1`  |
| `AI_MODEL`    | `qwen3-27b`                         |

### Spiria AI server (local only)

Spiria's LiteLLM gateway is reachable only from the Spiria office network or VPN, so it works for
local development but not from Vercel. See
[Getting Started — AI Server for Developers](https://spiria.atlassian.net/wiki/spaces/SPIRAI/pages/406782786/Getting+Started+AI+Server+for+Developers)
for a key.

To keep another provider in `.env` and switch to Spiria when needed, put the Spiria settings in
`.env.spiria` and run `bun run dev:spiria`; values there override `.env`:

```sh
AI_API_KEY=<your LiteLLM key>
AI_BASE_URL=https://ai-litellm.spiria.com/v1
AI_MODEL=qwen3-27b
```

### Gemini (or another hosted provider)

```sh
AI_API_KEY=<your Gemini key>
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.5-flash-lite
```

## Deployment

The app deploys to Vercel from GitHub: every push to `main` deploys to production, and other
branches get preview deployments. Set `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL` in the Vercel
project's environment variables; it must use a provider reachable from the internet, not the
Spiria gateway.

`bun run build` targets Vercel when it runs on Vercel and a plain Node server elsewhere;
`bun run start` serves that local build with `.env` loaded.
