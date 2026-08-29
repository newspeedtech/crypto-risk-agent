# Crypto Risk Triage Agent

Scaffold for a Cloudflare Agent that takes a normalized crypto inventory
(eventually parsed from CBOM output), classifies each finding's
post-quantum migration risk, generates a prioritized report, and answers
follow-up questions against the result.

## Architecture (maps to the four required components)

- **LLM** — Llama 3.3 on Workers AI (`src/agent.ts`, `src/workflow.ts`)
- **Workflow/coordination** — `CryptoRiskWorkflow` (`src/workflow.ts`), a
  durable multi-step pipeline: classify each finding individually (so one
  bad LLM response doesn't restart the whole batch on retry), then
  generate the report, then call back into the Agent.
- **User input** — `public/index.html`, a plain-JS page using the vanilla
  `AgentClient` for RPC calls and state sync
- **Memory/state** — `CryptoRiskAgent`'s built-in SQLite-backed state
  (`src/agent.ts`), holding findings, analysis, and the report across the
  session

## What's real vs. stubbed right now

- **Real**: the Agent, Workflow, wrangler bindings, and the classify ->
  report pipeline all wire together and should run end to end once
  dependencies are installed.
- **Stubbed**: CBOM parsing. The frontend currently expects you to paste
  an already-normalized findings array (see `src/types.ts` for the
  shape). Parsing actual CycloneDX CBOM JSON into that shape is the next
  milestone.
- **Simplified**: chat is single-shot request/response (`askQuestion`),
  not a streaming multi-turn conversation. `@cloudflare/ai-chat` +
  `useAgentChat` would give you that, but the client half is React-only
  right now, so it's deferred until the core pipeline is proven out.

## Setup

```bash
npm install
npm run dev
```

Then open the local URL Wrangler prints (usually `http://localhost:8787`).

## Known rough edges to check when you run this

Package versions in `package.json` are best-guess pins — run
`npm install agents@latest ai@latest workers-ai-provider@latest zod@latest`
after the first install to make sure you're not stuck on a stale range.

The frontend imports `AgentClient` from an `esm.sh` CDN URL for zero
build-step simplicity. If that doesn't resolve cleanly, switch to a real
bundler (Vite is the path of least resistance) and
`import { AgentClient } from "agents/client"` normally — worth doing
anyway once the UI grows past this scaffold.

Model ID `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — confirm it's still
the current Llama 3.3 model slug on Workers AI when you run this; Workers
AI model catalog entries do get renamed/deprecated.

## Next steps

1. CBOM (CycloneDX) parser to replace the manual findings textarea
2. Iterate on the classification prompt against real output from the
   CBOM tooling eval — this is the part worth spending the most time on
3. Prompt history log for the assignment submission
