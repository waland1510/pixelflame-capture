# Project rules

- AI calls live in server routes under src/routes/api/ (analyze, tutor, translate, fetch-source) using the helper in src/lib/ai/gateway.server.ts — keeps the key server-side and streams responses.
- Learner data (lessons, sessions, progress) is stored in browser localStorage via src/lib/store.ts. Several people can share a browser as learner profiles, each with their own sessions and per-lesson progress. There are no server-side accounts yet.
- A lesson's graph is either `content` (scenes of a story or text) or `grammar` (`kind: "grammar"`: each scene is one part of a rule with ready-made exercises); the tutor switches to exercise drills for grammar lessons.
- Learner state is derived from the tutor's `record_evaluation` tool calls in the message history — the agent, not hard-coded flow, drives adaptation.
- PDFs are parsed in the browser with pdfjs-dist — the server runtime can't run native PDF tooling.
