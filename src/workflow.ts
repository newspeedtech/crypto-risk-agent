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
            // Workers AI defaults to a 256-token completion cap when this
            // is unset, silently truncating output (finish_reason:
            // "length") — confirmed directly against the API. 512 is
            // generous headroom for one finding's classification object.
            maxOutputTokens: 512,
            prompt: [
              "You are assessing post-quantum migration risk for one cryptographic finding.",
              "Consider: is the algorithm quantum-vulnerable, how sensitive is the data it protects,",
              "how long does that data need to stay confidential for encryption only (risk of harvest now, decrypt later),",
              "and how exposed is this component. Cite the evidence provided that drove the ranking.",
              `Finding: ${JSON.stringify(finding)}`,
              "If the finding is a classical security risk, say so. Don't conflate to a pqc risk, ",
              "but assign priority based off of real security risk.", 
              "State what you don't know. Describe what information is limited rather than overstating.",
              "Give a priority (critical, high, medium, low), a short rationale, and concrete NIST migration ",
              "guidance for this specific finding. Be specific about NIST approved algorithms for migration.",
              "ML-KEM, ML-DSA, SLH-DSA, and other NIST PQC standards are compliant, classify as informational."
            ].join(" "),
          });
          return object;
        });

        analysis.push({ findingId: finding.id, ...result });
      }

      const report = await step.do("generate-report", async () => {
        const { text } = await generateText({
          model: workersai(CHAT_MODEL),
          // Same 256-token default cap as the classify step — this is the
          // one that was actually cutting reports off mid-sentence.
          // 2048 leaves comfortable headroom under the model's 24k
          // context window; confirmed directly against the API that a
          // multi-finding report finishes naturally (finish_reason:
          // "stop") well under this.
          // Capping the report to the top 10 findings to limit scope
          // for highest priority output.
          maxOutputTokens: 2048,
          prompt: [
            "Write a prioritized post-quantum cryptography migration report in markdown.",
            "Group findings by priority (critical, high, medium, low) but cap the report ",
            "to the top 10 findings. For each, include the,",
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
