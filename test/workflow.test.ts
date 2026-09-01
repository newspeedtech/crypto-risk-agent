// Tests CryptoRiskWorkflow's own orchestration logic (per-finding step
// aggregation, and the success/error callback into the Agent) using the
// official step-mocking API. Note: mockStepResult/mockStepError bypass the
// step body entirely, so these tests do NOT exercise the real
// generateObject/generateText calls inside workflow.ts's steps (including
// the CHAT_MODEL wiring) — that's covered separately for the askQuestion
// call site in agent.test.ts via a real (env.AI.run-mocked) call, and was
// verified manually end to end against a real deployment (see CLAUDE.md).
import { introspectWorkflowInstance, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, it } from "vitest";
import type { CryptoRiskAgent } from "../src/agent";
import type { CryptoFinding } from "../src/types";

const findings: CryptoFinding[] = [
  {
    id: "f1",
    algorithm: "RSA",
    keySize: 2048,
    location: "api-gateway/tls",
    usageContext: "TLS termination",
    source: "manual-test",
  },
  {
    id: "f2",
    algorithm: "AES-256-GCM",
    keySize: 256,
    location: "cache/redis",
    usageContext: "data-at-rest",
    source: "manual-test",
  },
];

function agentStubFor(agentId: string) {
  return env.CryptoRiskAgent.get(env.CryptoRiskAgent.idFromName(agentId));
}

describe("CryptoRiskWorkflow — success path", () => {
  it("aggregates per-finding classifications and reports the result back to the Agent", async ({
    expect,
  }) => {
    const agentId = `test-agent-${crypto.randomUUID()}`;
    const instanceId = crypto.randomUUID();
    const mockAnalysisF1 = {
      priority: "high",
      rationale: "quantum-vulnerable, high exposure",
      migrationGuidance: "migrate to Kyber",
    };
    const mockAnalysisF2 = {
      priority: "low",
      rationale: "already quantum-secure",
      migrationGuidance: "no action needed",
    };
    const mockReport = "# Report\n\nf1 is high priority, f2 is low priority.";

    await using instance = await introspectWorkflowInstance(env.RISK_WORKFLOW, instanceId);
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.mockStepResult({ name: "classify-f1" }, mockAnalysisF1);
      await m.mockStepResult({ name: "classify-f2" }, mockAnalysisF2);
      await m.mockStepResult({ name: "generate-report" }, mockReport);
    });

    await env.RISK_WORKFLOW.create({ id: instanceId, params: { agentId, findings } });

    await expect(instance.waitForStatus("complete")).resolves.not.toThrow();

    const state = await runInDurableObject(
      agentStubFor(agentId),
      (agent: CryptoRiskAgent) => agent.state,
    );
    expect(state.status).toBe("complete");
    expect(state.report).toBe(mockReport);
    expect(state.analysis).toEqual([
      { findingId: "f1", ...mockAnalysisF1 },
      { findingId: "f2", ...mockAnalysisF2 },
    ]);
  });
});

describe("CryptoRiskWorkflow — error path", () => {
  it("reports the failure back to the Agent when a classification step exhausts its retries", async ({
    expect,
  }) => {
    const agentId = `test-agent-${crypto.randomUUID()}`;
    const instanceId = crypto.randomUUID();

    await using instance = await introspectWorkflowInstance(env.RISK_WORKFLOW, instanceId);
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      // Omitting `times` fails every attempt, exhausting the step's
      // configured retry limit (5, per workflow.ts) rather than eventually
      // succeeding.
      await m.mockStepError({ name: "classify-f1" }, new Error("classification exploded"));
    });

    await env.RISK_WORKFLOW.create({ id: instanceId, params: { agentId, findings } });

    await expect(instance.waitForStatus("errored")).resolves.not.toThrow();

    const state = await runInDurableObject(
      agentStubFor(agentId),
      (agent: CryptoRiskAgent) => agent.state,
    );
    expect(state.status).toBe("error");
    expect(state.errorMessage).toContain("classification exploded");
  });
});
