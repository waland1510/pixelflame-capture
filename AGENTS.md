<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- AI calls live in server routes under src/routes/api/ (analyze, tutor, fetch-source) using the helper in src/lib/ai/gateway.server.ts — keeps the key server-side and streams responses.
- Learner data (sources, sessions, learner state) is stored in browser localStorage via src/lib/store.ts — the user chose no accounts.
- Learner state is derived from the tutor's `record_evaluation` tool calls in the message history — the agent, not hard-coded flow, drives adaptation.
- PDFs are parsed in the browser with pdfjs-dist — the server runtime can't run native PDF tooling.
