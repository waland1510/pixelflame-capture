# Pixel Perfect Project

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pixelflame-capture.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/88fc017d-306e-446f-be3b-3706a8ab6030).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

AI features use Spiria's internal AI server, an OpenAI-compatible LiteLLM gateway. See [Getting Started — AI Server for Developers](https://spiria.atlassian.net/wiki/spaces/SPIRAI/pages/406782786/Getting+Started+AI+Server+for+Developers). Create a `.env` file:

```sh
AI_API_KEY=<your LiteLLM key>
# Optional overrides:
# AI_BASE_URL=https://ai-litellm.spiria.com/v1
# AI_MODEL=qwen3-27b
```

The gateway is reachable only from the Spiria office network or VPN.
