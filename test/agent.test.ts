import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, it, vi } from "vitest";
import type { CryptoRiskAgent } from "../src/agent";
import { initialAgentState } from "../src/types";

function freshStub() {
  const id = env.CryptoRiskAgent.idFromName(`test-agent-${crypto.randomUUID()}`);
  return env.CryptoRiskAgent.get(id);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ingestCBOM — input validation (no bindings touched)", () => {
  it("rejects invalid JSON", async ({ expect }) => {
    const stub = freshStub();
    await expect(
      runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.ingestCBOM("{not json")),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("rejects a CBOM shape zod can't validate", async ({ expect }) => {
    const stub = freshStub();
    await expect(
      runInDurableObject(stub, (instance: CryptoRiskAgent) =>
        instance.ingestCBOM(JSON.stringify({ components: "not-an-array" })),
      ),
    ).rejects.toThrow(/does not match the expected CycloneDX shape/);
  });

  it("rejects a CBOM with no supported findings", async ({ expect }) => {
    const stub = freshStub();
    const cbom = JSON.stringify({
      components: [{ type: "cryptographic-asset", name: "cert", cryptoProperties: { assetType: "certificate" } }],
    });
    await expect(
      runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.ingestCBOM(cbom)),
    ).rejects.toThrow(/No supported cryptographic-asset findings/);
  });
});

describe("ingestCBOM / ingestFindings — kickoff (RISK_WORKFLOW.create mocked)", () => {
  it("ingestCBOM parses a valid CBOM, transitions state to analyzing, and kicks off the Workflow", async ({
    expect,
  }) => {
    const createSpy = vi.spyOn(env.RISK_WORKFLOW, "create").mockResolvedValue(undefined as never);
    const stub = freshStub();
    const cbom = JSON.stringify({
      components: [
        {
          type: "cryptographic-asset",
          "bom-ref": "crypto/rsa",
          name: "RSA",
          cryptoProperties: {
            assetType: "algorithm",
            algorithmProperties: { parameterSetIdentifier: "2048" },
          },
          evidence: { occurrences: [{ location: "svc/tls" }] },
        },
      ],
    });

    const result = await runInDurableObject(stub, (instance: CryptoRiskAgent) =>
      instance.ingestCBOM(cbom),
    );
    expect(result).toEqual({ accepted: 1, warnings: [] });

    const state = await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.state);
    expect(state.status).toBe("analyzing");
    expect(state.findings).toEqual([
      { id: "crypto/rsa", algorithm: "RSA", keySize: 2048, location: "svc/tls", source: "cbom-scanner", usageContext: "unspecified usage" },
    ]);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [createArgs] = createSpy.mock.calls[0];
    expect(createArgs?.params?.findings).toEqual(state.findings);
  });

  it("ingestFindings accepts an already-normalized array directly", async ({ expect }) => {
    const createSpy = vi.spyOn(env.RISK_WORKFLOW, "create").mockResolvedValue(undefined as never);
    const stub = freshStub();
    const findings = [
      {
        id: "f1",
        algorithm: "AES-256-GCM",
        keySize: 256,
        location: "cache/redis",
        usageContext: "data-at-rest",
        source: "manual",
      },
    ];

    const result = await runInDurableObject(stub, (instance: CryptoRiskAgent) =>
      instance.ingestFindings(findings),
    );
    expect(result).toEqual({ accepted: 1 });

    const state = await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.state);
    expect(state.status).toBe("analyzing");
    expect(state.findings).toEqual(findings);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});

describe("state-transition callables", () => {
  it("completeAnalysis sets status complete with the given analysis and report", async ({
    expect,
  }) => {
    const stub = freshStub();
    const analysis = [
      { findingId: "f1", priority: "high" as const, rationale: "r", migrationGuidance: "m" },
    ];
    await runInDurableObject(stub, (instance: CryptoRiskAgent) =>
      instance.completeAnalysis(analysis, "# Report"),
    );
    const state = await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.state);
    expect(state.status).toBe("complete");
    expect(state.analysis).toEqual(analysis);
    expect(state.report).toBe("# Report");
  });

  it("reportWorkflowError sets status error with the given message", async ({ expect }) => {
    const stub = freshStub();
    await runInDurableObject(stub, (instance: CryptoRiskAgent) =>
      instance.reportWorkflowError("boom"),
    );
    const state = await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.state);
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("boom");
  });

  it("reset returns state to initialAgentState after prior activity", async ({ expect }) => {
    const stub = freshStub();
    await runInDurableObject(stub, (instance: CryptoRiskAgent) =>
      instance.reportWorkflowError("boom"),
    );
    await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.reset());
    const state = await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.state);
    expect(state).toEqual(initialAgentState);
  });
});

describe("askQuestion (env.AI.run mocked)", () => {
  it("returns the model's text response", async ({ expect }) => {
    vi.spyOn(env.AI, "run").mockResolvedValue({ response: "PQC is crypto resistant to quantum attacks." } as never);
    const stub = freshStub();
    const answer = await runInDurableObject(stub, (instance: CryptoRiskAgent) =>
      instance.askQuestion("What is PQC?"),
    );
    expect(answer).toBe("PQC is crypto resistant to quantum attacks.");
  });

  it("tells the model no analysis is loaded yet when state is idle", async ({ expect }) => {
    const runSpy = vi.spyOn(env.AI, "run").mockResolvedValue({ response: "sure" } as never);
    const stub = freshStub();
    await runInDurableObject(stub, (instance: CryptoRiskAgent) => instance.askQuestion("anything"));

    const [, inputs] = runSpy.mock.calls[0] as unknown as [unknown, { messages: { role: string; content: string }[] }];
    const systemMessage = inputs.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toContain("No completed crypto risk analysis is loaded yet.");
  });
});
