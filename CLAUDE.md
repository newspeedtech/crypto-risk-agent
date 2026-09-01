# Crypto Risk Triage Agent — Project Context

## What this is

A Cloudflare Agent that takes a normalized crypto inventory (eventually
parsed from CBOM scanner output), classifies each finding's post-quantum
migration risk, generates a prioritized report, and answers follow-up
questions against the result.

Three overlapping purposes, in priority order when they conflict:

1. Real internal tool for advisory/client work (Newspeed Tech)
2. Cloudflare "AI-powered application" interview take-home assignment
3. Content basis for a CBOM tooling evaluation write-up (PQCA working group)

The assignment requires: an LLM, a workflow/coordination layer, chat/voice
input, and memory/state — see "Architecture" below for how each is
satisfied, since a reviewer will be checking for these explicitly.

The domain thesis: CBOM scanners already do discovery well (find crypto
primitives, output a bill of materials). This agent does the judgment
layer scanners don't: risk prioritization by data sensitivity + exposure,
migration path design, and implementation sequencing across a portfolio
of findings. CBOM output is the _input_ to this agent, not a competitor
to it.

## Open questions

- **Does "chat/voice input" mean either-or, or does a reviewer expect
  actual voice input?** As of 2026-09-01, there is zero voice/speech code
  anywhere in this repo — no Web Speech API, no Workers AI
  speech-to-text, nothing. Chat exists (`askQuestion`, single-shot, see
  "Key decisions"). If the assignment's "chat/voice" is either-or, chat
  alone covers the requirement, if thinly. If a reviewer specifically
  checks for voice, this is an unmet requirement, not a partial one —
  flagged here explicitly so it isn't mistaken for an oversight later.
  Not yet decided which reading to build for; decide before submission.

## Architecture

- **LLM** — Llama 3.3 on Workers AI, via `workers-ai-provider` + the `ai`
  SDK (`generateObject`/`generateText`), in `src/agent.ts` and
  `src/workflow.ts`.
- **Workflow/coordination** — `CryptoRiskWorkflow` in `src/workflow.ts`.
  Durable, multi-step: classify each finding individually (its own
  `step.do`, so one bad LLM response doesn't restart the whole batch on
  retry), then generate the report, then RPC back into the Agent.
- **User input** — `public/index.html` + `src/frontend/main.ts`, a plain
  TS frontend using the vanilla `AgentClient` (not React) for RPC calls
  and state sync.
- **Memory/state** — `CryptoRiskAgent`'s built-in SQLite-backed Durable
  Object state (`src/agent.ts`), holding findings, analysis, and the
  report across the session.

## Key decisions and why (don't re-litigate these without reason)

- **Plain `Agent` class, not `AIChatAgent`.** The full streaming chat
  wire protocol's client half (`useAgentChat`) is React-only right now.
  Hand-rolling that protocol for a vanilla frontend wasn't worth it for a
  scaffold, so chat is a single-shot `askQuestion` RPC method instead of
  true multi-turn streaming. Revisit only if the assignment specifically
  needs streaming, or once the core pipeline is proven out.
- **Frontend is bundled locally with esbuild, not loaded from a CDN.**
  Originally tried importing `AgentClient` from esm.sh directly in the
  browser. Two problems: couldn't verify CDN resolution of nested deps
  (`agents` → `partysocket`) actually works, and it turned out not to
  matter because of the bug below. `npm run build:client` now bundles
  `src/frontend/main.ts` into `public/client.bundle.js`, wired via
  `predev`/`predeploy` npm hooks so it's always fresh.
- **`AgentClient` requires a `host` option.** This was the actual root
  cause of an early "nothing happens when I click the button" bug — the
  client had no idea what server to connect to, so the WebSocket never
  connected and every RPC call silently rejected. Fixed with
  `host: window.location.host`. If you ever see silent failures again,
  check the browser console first — the frontend now surfaces connection
  state and RPC errors on screen instead of failing silently, but it's
  worth knowing this class of bug exists in this stack.
- **State updates come via an `onStateUpdate` constructor callback, not
  a `"state"` DOM event.** Easy to get wrong by pattern-matching to
  normal `addEventListener` usage.
- **Test suite uses `@cloudflare/vitest-plugin` (not the older
  `@cloudflare/vitest-pool-workers`).** Cloudflare replaced the pool-based
  approach with a Vite-plugin one; `@cloudflare/vitest-pool-workers` was
  last published 2026-08-18 vs. `@cloudflare/vitest-plugin`'s 2026-08-28 —
  don't reach for the old package from stale training data, verify
  against the registry like the `ai` SDK v5→v7 jump. Config lives in
  `vitest.config.ts` via `cloudflareTest({ wrangler: { configPath:
  "./wrangler.jsonc" } })`, which derives all bindings (AI, the
  `CryptoRiskAgent` DO, `RISK_WORKFLOW`) from the real wrangler config —
  no separate test-only binding setup to keep in sync.
- **`vitest.config.ts` also needs `agents()` from `agents/vite`, or
  `@callable()` fails at import time with `SyntaxError: Invalid or
  unexpected token`.** The Agents SDK uses TC39 (standard) decorators;
  the vitest plugin's own Vite/Oxc transform doesn't support that syntax
  without this plugin. Do **not** "fix" this by setting
  `experimentalDecorators: true` in a tsconfig — that applies the
  incompatible legacy decorator transform and breaks `@callable()`
  silently at runtime instead of loudly at build time. This only bit
  `test/agent.test.ts` and `test/workflow.test.ts` (anything that loads
  `CryptoRiskAgent` via `runInDurableObject`/`introspectWorkflowInstance`)
  — `test/cbom-parser.test.ts` never touches the DO/Workflow classes so
  it was unaffected either way, which is what made this confusing to
  isolate at first.
- **Test coverage tradeoff, worth knowing before extending workflow
  tests:** `introspectWorkflowInstance`'s `mockStepResult`/`mockStepError`
  bypass a `step.do()` body entirely rather than stubbing what it calls.
  So `test/workflow.test.ts` verifies `CryptoRiskWorkflow`'s own
  orchestration (per-finding aggregation, success/error callback into the
  Agent) but does **not** exercise the real `generateObject`/`generateText`
  calls inside those steps — including whether `CHAT_MODEL` is wired
  correctly there. `test/agent.test.ts`'s `askQuestion` test does cover
  real `CHAT_MODEL` wiring, by mocking one level lower (`env.AI.run` via
  `vi.spyOn`, following the official `ai-vectorize` fixture pattern) and
  letting the real `generateText` call execute against the mock. If the
  workflow's AI calls need real-code-path coverage later, mock at the
  `env.AI.run` level there too instead of the step level — it's more
  work (mocking a structured-output response shape) but actually
  exercises the code.
- **Requires Node `^22.18.0 || >=24.11.0`** (see `.nvmrc` /
  `package.json` `engines`) — `@cloudflare/vitest-plugin`'s dependencies
  (babel packages) enforce this; on an older 22.x (e.g. 22.16 via a
  stale `nvm` default) `npm install` warns but still installs, then
  `vitest` fails confusingly later. Run `nvm use` before `npm test` if
  unsure which Node is active.
- **CI/CD is two separate workflow files, not one, and deploy is gated
  on CI via `needs:` within a single file (`ci-cd.yml`), not a
  cross-workflow `workflow_run` trigger.** `.github/workflows/ci-cd.yml`
  runs typecheck (all three tsconfigs) + `npm test` on every push/PR, and
  only deploys (via `cloudflare/wrangler-action`) on push to `main`, after
  the `ci` job succeeds. `.github/workflows/claude.yml` is deliberately
  separate and triggers only on explicit `@claude` mentions (not
  automatic PR review — that was a scoped decision, not a default).
  Requires three repo secrets that were **not** set up by this session
  (deliberately — API tokens shouldn't be generated or pasted in by an
  agent): `ANTHROPIC_API_KEY` (claude.yml), `CLOUDFLARE_API_TOKEN`, and
  `CLOUDFLARE_ACCOUNT_ID`. The latter two are needed on **both** jobs,
  not just `deploy` — confirmed by an actual CI run (2026-09-01) that
  failed `npm test` with "necessary to set a CLOUDFLARE_API_TOKEN
  environment variable for wrangler to work." The `AI` binding is
  `remote: true`, so `@cloudflare/vitest-plugin` opens a real
  remote-binding proxy session just to start the test pool worker,
  before any test file's own `env.AI.run` mock ever runs — so `ci`'s
  `npm test` step needs real Cloudflare credentials too, set as job-level
  `env`, same as `deploy`. Don't assume mocking the AI binding in test
  code is enough to avoid needing real credentials in CI; it isn't.
  `wrangler-action` invokes
  `wrangler deploy` directly, not `npm run deploy`, so the `predeploy`
  npm hook never fires — the deploy step passes `preCommands: npm run
  build:client` explicitly instead; don't remove that assuming the hook
  covers it.
- **Session name is hardcoded to `"default-session"`.** Fine for solo
  use and for the assignment demo. First thing to fix before any
  client-facing deployment — generate a per-visitor session id instead.
- **`createWorkersAI` is instantiated fresh per call, not hoisted to a
  shared instance.** In `agent.ts`'s `askQuestion` and in `workflow.ts`'s
  `run`, each call creates its own provider via `createWorkersAI({
binding: this.env.AI })`. This looks wasteful if you assume it opens a
  connection, but it doesn't — `createWorkersAI` performs zero I/O. It's
  a plain factory that wraps whatever `env.AI` already is into an object
  shaped for the `ai` SDK; the real network call only happens later,
  inside the model's `doGenerate`/`doStream`, via `env.AI.run(...)`.
  `env.AI` itself is the actual binding, injected by the Workers runtime
  per request — not something `createWorkersAI` creates or owns. Calling
  the factory per-call just makes a new lightweight wrapper around the
  same underlying binding each time; there's no connection being
  redundantly established. Don't "fix" this into a shared
  `this.workersai` field — there's no per-call cost it would be saving.

## What's real vs. stubbed right now

- **Real and verified**: Agent, Workflow, wrangler bindings, and the
  classify → report pipeline wire together correctly. Confirmed via
  `tsc --noEmit` (both `tsconfig.json` for the Worker and
  `tsconfig.frontend.json` for the frontend, which needs DOM lib types
  the Worker config deliberately excludes) and `wrangler deploy
--dry-run`.
- **CBOM parsing — scaffolded, not yet validated against real output.**
  `src/cbom-parser.ts` maps CycloneDX CBOM (spec >=1.6) JSON onto
  `CryptoFinding[]` via a zod schema. Only `cryptographic-asset`
  components with `assetType: "algorithm"` are mapped — `certificate`,
  `protocol`, and `related-material` assets are recognized but skipped
  with a warning rather than guessed at, since mapping them onto
  `CryptoFinding`'s flat shape needs real sample output to get right, not
  synthetic data. Non-crypto components (libraries, etc.) are silently
  skipped, no warning. Wired end to end: `CryptoRiskAgent.ingestCBOM(json:
  string)` parses and kicks off the same `startAnalysis` pipeline
  `ingestFindings` uses; the frontend textarea now takes raw CBOM JSON
  instead of a pre-normalized array (`ingestFindings` still exists,
  useful for programmatic/test entry). Verified against a synthetic
  CycloneDX sample (2 algorithm assets + 1 skipped certificate + 1
  skipped non-crypto component, all handled correctly) and against the
  real RPC path in `wrangler dev` (accepted, parsed, state transitioned
  to `analyzing` correctly). **Not yet tested against real output from
  the CBOM tooling eval done for PQCA** — do that before trusting the
  `algorithm` mapping (field names like `parameterSetIdentifier`,
  `cryptoFunctions`, evidence occurrence shape) or extending to
  `certificate`/`protocol` assets.
- **Confirmed working end to end against a real deployment** (2026-08-30).
  `ingestFindings` → classify → report → `completeAnalysis` completes in
  ~17s against `wrangler deploy` output. Note: this does **not** work
  under `wrangler dev` — the `AI` binding hangs indefinitely when called
  from inside a `CryptoRiskWorkflow` step in local dev (confirmed via
  direct isolation testing: the model, the AI SDK, and the same binding
  called from the Agent DO all work fine locally; only the Workflow-step
  case hangs, past its own step timeout, with no retry ever firing).
  This is a `wrangler dev` local-emulation limitation, not a code defect
  — don't debug `workflow.ts` if this resurfaces locally, verify against
  a real deploy first. `"remote": true` was added to the `ai` binding in
  `wrangler.jsonc` during that investigation (harmless, partial local
  improvement, kept).
- **Test suite added** (2026-08-31): `npm test` runs 31 tests across
  `test/cbom-parser.test.ts` (full branch coverage of the parser, no
  bindings needed), `test/agent.test.ts` (`CryptoRiskAgent`'s callables
  via `runInDurableObject`, with `env.RISK_WORKFLOW.create`/`env.AI.run`
  mocked via `vi.spyOn`), and `test/workflow.test.ts`
  (`CryptoRiskWorkflow`'s success/error orchestration via
  `introspectWorkflowInstance`'s step mocking). See "Key decisions and
  why" for the `agents/vite` plugin requirement and the coverage
  tradeoff on the workflow's embedded AI calls before extending these.

## Package versions

Versions in `package.json` were wrong on first pass (guessed against
stale training data — the `ai` SDK had jumped from v5 to v7,
`@cloudflare/workers-types` is now deprecated in favor of `wrangler
types`). Corrected against the real npm registry and verified installing

- typechecking + dry-run deploying cleanly. If dependencies start failing
  again, check versions against the registry before assuming the code is
  wrong — this stack moves fast.

## Next steps, in order

1. Validate the CBOM parser against real CBOM tooling-eval output (PQCA)
   — fix field-mapping bugs the synthetic sample didn't exercise, then
   decide whether `certificate`/`protocol` assets are worth mapping.
2. Iterate on the classification prompt — this is genuinely the part
   worth spending the most time on, not a checkbox.
3. Session-id fix if this is going anywhere near a real client.
4. Prompt-history log for the assignment submission (this file plus git commit history should cover most of it).
5. **Migrate `Agent` → `AIChatAgent` for real multi-turn streaming
   chat.** This is a genuine near-term goal, not a someday-maybe —
   `askQuestion`'s single-shot request/response is fine for the
   interview POC but not for actual longer-term use, where real
   back-and-forth about a report is the point. Gated on: (a) the core
   classify → report pipeline being proven out end to end, and (b)
   checking whether `useAgentChat`'s React-only constraint has changed
   — if a framework-agnostic client still doesn't exist, the honest
   scope is either adopting React for the frontend or hand-rolling the
   WebSocket chat wire protocol, not a quick swap. Re-verify before
   starting, don't assume. If still React-only, React is probably the
   less risky path given this is heading toward real advisory use, even
   though the current scaffold deliberately avoided it.
