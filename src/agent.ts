import { Agent, callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import type { AgentState, CryptoFinding } from "./types";
import { CHAT_MODEL, initialAgentState } from "./types";
import { parseCBOM } from "./cbom-parser";

export class CryptoRiskAgent extends Agent<Env, AgentState> {
  initialState: AgentState = initialAgentState;

  // Shared by ingestFindings and ingestCBOM once a CryptoFinding[] has been
  // produced, however it got there. Hands off to the Workflow for the
  // durable, retryable classify -> report pipeline; passes this agent's own
  // id so the Workflow can call back in with results when it's done.
  private async startAnalysis(findings: CryptoFinding[]) {
    this.setState({
      ...this.state,
      status: "analyzing",
      findings,
      analysis: [],
      report: null,
      errorMessage: null,
    });

    await this.env.RISK_WORKFLOW.create({
      params: {
        agentId: this.name,
        findings,
      },
    });
  }

  // Accepts an already-normalized findings array directly — useful for
  // programmatic entry (tests, scripted demos) without going through CBOM.
  @callable()
  async ingestFindings(findings: CryptoFinding[]) {
    await this.startAnalysis(findings);
    return { accepted: findings.length };
  }

  // Accepts raw CycloneDX CBOM JSON (as a string, since it comes straight
  // off a textarea/file upload) and parses it into CryptoFinding[] before
  // kicking off the same pipeline. See src/cbom-parser.ts for what's mapped
  // vs skipped — currently only assetType "algorithm" components.
  @callable()
  async ingestCBOM(cbomJson: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cbomJson);
    } catch (err) {
      throw new Error(`CBOM input is not valid JSON: ${(err as Error).message}`);
    }

    let result: ReturnType<typeof parseCBOM>;
    try {
      result = parseCBOM(parsed);
    } catch (err) {
      throw new Error(`CBOM does not match the expected CycloneDX shape: ${(err as Error).message}`);
    }

    if (result.findings.length === 0) {
      const detail = result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
      throw new Error(`No supported cryptographic-asset findings found in this CBOM.${detail}`);
    }

    await this.startAnalysis(result.findings);
    return { accepted: result.findings.length, warnings: result.warnings };
  }

  // Called by the Workflow when the classify -> report pipeline finishes.
  @callable()
  async completeAnalysis(analysis: AgentState["analysis"], report: string) {
    this.setState({
      ...this.state,
      status: "complete",
      analysis,
      report,
    });
  }

  @callable()
  async reportWorkflowError(errorMessage: string) {
    this.setState({
      ...this.state,
      status: "error",
      errorMessage,
    });
  }

  @callable()
  async reset() {
    this.setState(initialAgentState);
  }

  // Follow-up Q&A against whatever analysis is already in state
  // ("why is finding X high priority", "what's the migration path for
  // RSA-2048 here"). No analysis yet -> the model says so instead of
  // guessing. Single-shot for now; swap in a real streaming chat protocol
  // once the core pipeline is proven out.
  @callable()
  async askQuestion(question: string) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const context =
      this.state.status === "complete"
        ? JSON.stringify({ findings: this.state.findings, analysis: this.state.analysis })
        : "No completed crypto risk analysis is loaded yet.";

    const { text } = await generateText({
      model: workersai(CHAT_MODEL),
      system: [
        "You are a post-quantum cryptography migration advisor.",
        "Answer questions about the crypto inventory and risk analysis below.",
        "Be direct and specific. If something isn't in the data, say so instead of guessing.",
        `Current analysis state: ${context}`,
      ].join(" "),
      prompt: question,
    });

    return text;
  }
}
