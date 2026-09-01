# Crypto Risk Triage Agent

A Cloudflare Agent that takes a normalized crypto inventory (parsed from
CycloneDX CBOM output, or hand-entered), classifies each finding's
post-quantum migration risk, generates a prioritized report, and answers
follow-up questions against the result.

## Architecture (maps to the four required components)

- **LLM** — Llama 3.3 on Workers AI (`src/agent.ts`, `src/workflow.ts`),
  via `workers-ai-provider` + the `ai` SDK.
- **Workflow/coordination** — `CryptoRiskWorkflow` (`src/workflow.ts`), a
  durable multi-step pipeline: classify each finding individually (so one
  bad LLM response doesn't restart the whole batch on retry), then
  generate the report, then call back into the Agent.
- **User input (chat)** — `public/index.html` + `src/frontend/main.ts`, a
  plain TS frontend using the vanilla `AgentClient` for RPC calls and
  state sync. Chat is single-shot request/response (`askQuestion`), not a
  streaming multi-turn conversation yet — see CLAUDE.md's "Next steps."
  **No voice input yet** — see CLAUDE.md's "Open questions" for whether
  that's in scope.
- **Memory/state** — `CryptoRiskAgent`'s built-in SQLite-backed Durable
  Object state (`src/agent.ts`), holding findings, analysis, and the
  report across the session.

## What's real vs. stubbed right now

- **Real and verified**: Agent, Workflow, and the classify → report →
  chat pipeline all wire together and run end to end — confirmed against
  a real `wrangler deploy` (not just local dev; see CLAUDE.md for a local
  `wrangler dev`-only limitation with the AI binding inside Workflow
  steps).
- **CBOM parsing — scaffolded, not yet validated against real output.**
  `src/cbom-parser.ts` maps CycloneDX CBOM (spec ≥1.6) JSON onto this
  project's `CryptoFinding` shape. Only `cryptographic-asset` components
  with `assetType: "algorithm"` are mapped; other asset types are
  reported as warnings rather than guessed at. Verified against a
  synthetic CBOM sample — not yet against real CBOM tooling-eval output.
- **Simplified**: chat is single-shot request/response (`askQuestion`),
  not a streaming multi-turn conversation. Migrating to `AIChatAgent` +
  `useAgentChat` is a tracked next step, gated on whether a
  framework-agnostic client exists yet (that API was React-only last
  checked).

## Setup

```bash
npm install
npm run dev
```

Then open the local URL Wrangler prints (usually `http://localhost:8787`).

## Testing

```bash
npm test        # single run
npm run test:watch
```

Requires Node `^22.18.0 || >=24.11.0` (see `.nvmrc`) — run `nvm use`
first if unsure which Node is active. See CLAUDE.md's "Key decisions"
for why (the test plugin's own dependencies enforce this), plus two
non-obvious setup requirements (`agents/vite`'s decorator transform, and
a documented coverage tradeoff on the workflow's embedded AI calls)
before extending the suite.

## Known rough edges to check when you run this

Model ID `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — confirm it's still
the current Llama 3.3 model slug on Workers AI when you run this; Workers
AI model catalog entries do get renamed/deprecated.

## Next steps

See CLAUDE.md's "Next steps, in order" and "Open questions" — kept there
instead of duplicated here so there's one source of truth.
