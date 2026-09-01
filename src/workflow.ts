import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { RiskWorkflowParams, RiskAnalysis } from "./types";
import { CHAT_MODEL } from "./types";

const classificationSchema = z.object({
  priority: z.enum(["critical", "high", "medium", "low"]),
  rationale: z.string(),
  migrationGuidance: z.string(),
});

export class CryptoRiskWorkflow extends WorkflowEntrypoint<Env, RiskWorkflowParams> {
  async run(event: WorkflowEvent<RiskWorkflowParams>, step: WorkflowStep) {
    const { agentId, findings } = event.payload;
    const workersai = createWorkersAI({ binding: this.env.AI });
    const agentStub = this.env.CryptoRiskAgent.getByName(agentId);

    try {
      // Step per finding so a single bad classification doesn't restart
      // the whole batch on retry — each step is independently durable.
      const analysis: RiskAnalysis[] = [];
      for (const finding of findings) {
        const result = await step.do(`classify-${finding.id}`, async () => {
          const { object } = await generateObject({
            model: workersai(CHAT_MODEL),
            schema: classificationSchema,
            prompt: [
              "You are assessing post-quantum migration risk for one cryptographic finding.",
              "Consider: is the algorithm quantum-vulnerable, how sensitive is the data it protects,",
              "how long does that data need to stay confidential, and how exposed is this component.",
              `Finding: ${JSON.stringify(finding)}`,
              "Give a priority, a short rationale, and concrete migration guidance for this specific finding.",
            ].join(" "),
          });
          return object;
        });

        analysis.push({ findingId: finding.id, ...result });
      }

      const report = await step.do("generate-report", async () => {
        const { text } = await generateText({
          model: workersai(CHAT_MODEL),
          prompt: [
            "Write a prioritized post-quantum cryptography migration report in markdown.",
            "Group findings by priority (critical, high, medium, low). For each, include the",
            "location, why it's rated that way, and the migration guidance.",
            `Findings: ${JSON.stringify(findings)}`,
            `Analysis: ${JSON.stringify(analysis)}`,
          ].join(" "),
        });
        return text;
      });

      await step.do("report-back-to-agent", async () => {
        await agentStub.completeAnalysis(analysis, report);
      });
    } catch (err) {
      await step.do("report-error-to-agent", async () => {
        const message = err instanceof Error ? err.message : String(err);
        await agentStub.reportWorkflowError(message);
      });
      throw err;
    }
  }
}
