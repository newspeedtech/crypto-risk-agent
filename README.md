# Crypto Risk Triage Agent

[Live Demo](https://crypto-risk-agent.mack76801.workers.dev/)

A Cloudflare Agent that takes a normalized crypto inventory (parsed from
CycloneDX CBOM output, or hand-entered), classifies each finding's
post-quantum migration risk, generates a prioritized report, and answers
follow-up questions against the result.

The domain thesis: CBOM scanners do discovery well (find crypto
primitives, output a bill of materials). This agent decouples the judgment layer: risk prioritization by exposure, migration path design, and implementation sequencing, from any CBOM source. CBOM output is the _input_ to this agent, not a competitor
to it.

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
  streaming multi-turn conversation."
  **No voice input** — Out of scope.
- **Memory/state** — `CryptoRiskAgent`'s built-in SQLite-backed Durable
  Object state (`src/agent.ts`), holding findings, analysis, and the
  report across the session.

## What's real vs. stubbed right now

- **Known limitation: the report is capped to the top 10 findings.**
  This is a prompt-level instruction, not a deterministic code-level
  limit — a stopgap for a token-limit truncation bug, not a real fix for
  large CBOMs. Every finding is still classified individually regardless
  of CBOM size; only the final report narrative is capped.
- **Real and verified**: Agent, Workflow, and the classify → report →
  chat pipeline all wire together and run end to end — confirmed against
  a real `wrangler deploy`.
- **CBOM parsing — scaffolded, not yet validated against real PQC output.**
  `src/cbom-parser.ts` maps CycloneDX CBOM (spec ≥1.6) JSON onto this
  project's `CryptoFinding` shape. Only `cryptographic-asset` components
  with `assetType: "algorithm"` are mapped; other asset types are
  reported as warnings rather than guessed at. Verified against a
  CBOM sample with synthetic PQC findings.
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
first if unsure which Node is active.

## Next steps

1. Validate the CBOM parser against other real scanning tools.
2. Continue to iterate on the classification prompt.
3. Auth/Session-id fix if this is going anywhere near a real client.
4. **Migrate `Agent` → `AIChatAgent` for real multi-turn streaming
   chat.** 
