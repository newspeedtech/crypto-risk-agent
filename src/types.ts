// Normalized crypto inventory item — deliberately a subset of CycloneDX CBOM
// fields. The parser (next milestone) maps whichever scanner's raw output
// you're using onto this shape.
export type CryptoFinding = {
  id: string;
  algorithm: string; // e.g. "RSA", "AES-128", "ECDSA-P256"
  keySize?: number;
  location: string; // file path, service name, or cert location
  usageContext: string; // e.g. "TLS termination", "JWT signing", "data-at-rest"
  source: string; // which scanner/tool produced this finding
};

export type RiskPriority = "critical" | "high" | "medium" | "low";

export type RiskAnalysis = {
  findingId: string;
  priority: RiskPriority;
  rationale: string;
  migrationGuidance: string;
};

export type AgentState = {
  status: "idle" | "analyzing" | "complete" | "error";
  findings: CryptoFinding[];
  analysis: RiskAnalysis[];
  report: string | null;
  errorMessage: string | null;
};

export const initialAgentState: AgentState = {
  status: "idle",
  findings: [],
  analysis: [],
  report: null,
  errorMessage: null,
};

// Params passed into the Workflow when the agent triggers a run
export type RiskWorkflowParams = {
  agentId: string;
  findings: CryptoFinding[];
};
