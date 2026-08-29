import { Agent, callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import type { AgentState, CryptoFinding } from "./types";
import { initialAgentState } from "./types";

export class CryptoRiskAgent extends Agent<Env, AgentState> {
  initialState: AgentState = initialAgentState;

  // Called by the frontend once a CBOM file (or manually assembled finding
  // list) has been parsed client-side into CryptoFinding[]. Parsing itself
  // moves server-side in the next milestone — for now this accepts
  // already-normalized findings so the pipeline can be wired end to end.
  @callable()
  async ingestFindings(findings: CryptoFinding[]) {
    this.setState({
      ...this.state,
      status: "analyzing",
      findings,
      analysis: [],
      report: null,
      errorMessage: null,
    });

    // Hand off to the Workflow for the durable, retryable classify -> report
    // pipeline. We pass this agent's own id so the Workflow can call back
    // in with results when it's done.
    await this.env.RISK_WORKFLOW.create({
      params: {
        agentId: this.name,
        findings,
      },
    });

    return { accepted: findings.length };
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
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
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
