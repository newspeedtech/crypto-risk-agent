// Parses CycloneDX CBOM (Cryptography Bill of Materials, spec >=1.6) JSON
// into this project's normalized CryptoFinding shape. Only the
// "cryptographic-asset" / assetType "algorithm" case is mapped for now —
// that's the dominant finding type scanners emit and covers the pipeline
// end to end. "certificate", "protocol", and "related-material" assets are
// recognized but skipped with a warning rather than guessed at, since
// mapping them onto CryptoFinding's flat shape needs real sample output to
// get right (see CLAUDE.md: test against real CBOM tooling-eval output, not
// synthetic data, before extending this).
import { z } from "zod";
import type { CryptoFinding } from "./types";

const toolComponentSchema = z.object({ name: z.string().optional() }).passthrough();

// CycloneDX <1.5 used a bare array of tools; 1.5+ nests them under
// `components` (tools can themselves carry full component metadata).
const toolsSchema = z.union([
  z.array(toolComponentSchema),
  z.object({ components: z.array(toolComponentSchema).optional() }).passthrough(),
]);

const algorithmPropertiesSchema = z
  .object({
    primitive: z.string().optional(),
    parameterSetIdentifier: z.string().optional(),
    curve: z.string().optional(),
    mode: z.string().optional(),
    padding: z.string().optional(),
    cryptoFunctions: z.array(z.string()).optional(),
    classicalSecurityLevel: z.number().optional(),
    nistQuantumSecurityLevel: z.number().optional(),
  })
  .passthrough();

const cryptoPropertiesSchema = z
  .object({
    assetType: z.enum(["algorithm", "certificate", "protocol", "related-material"]),
    algorithmProperties: algorithmPropertiesSchema.optional(),
    oid: z.string().optional(),
  })
  .passthrough();

const occurrenceSchema = z.object({ location: z.string().optional() }).passthrough();

const evidenceSchema = z
  .object({ occurrences: z.array(occurrenceSchema).optional() })
  .passthrough();

const componentSchema = z
  .object({
    type: z.string(),
    "bom-ref": z.string().optional(),
    name: z.string().optional(),
    cryptoProperties: cryptoPropertiesSchema.optional(),
    evidence: evidenceSchema.optional(),
  })
  .passthrough();

const cycloneDxBomSchema = z
  .object({
    bomFormat: z.string().optional(),
    specVersion: z.string().optional(),
    metadata: z
      .object({ tools: toolsSchema.optional() })
      .passthrough()
      .optional(),
    components: z.array(componentSchema).default([]),
  })
  .passthrough();

export type CbomParseResult = {
  findings: CryptoFinding[];
  warnings: string[];
};

function extractToolName(tools: z.infer<typeof toolsSchema> | undefined): string | undefined {
  if (!tools) return undefined;
  const list = Array.isArray(tools) ? tools : (tools.components ?? []);
  return list[0]?.name;
}

// CycloneDX key-size-ish fields (parameterSetIdentifier, curve names like
// "P-256") aren't pure numbers — pull the first integer run out as a
// best-effort key size. Falls back to classicalSecurityLevel when no
// parameter identifier is present.
function extractKeySize(algorithmProperties: z.infer<typeof algorithmPropertiesSchema> | undefined): number | undefined {
  const raw = algorithmProperties?.parameterSetIdentifier;
  if (raw) {
    const match = raw.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return algorithmProperties?.classicalSecurityLevel;
}

export function parseCBOM(input: unknown): CbomParseResult {
  const bom = cycloneDxBomSchema.parse(input);
  const warnings: string[] = [];
  const findings: CryptoFinding[] = [];
  const source = extractToolName(bom.metadata?.tools) ?? "cbom-scanner";

  bom.components.forEach((component, index) => {
    if (component.type !== "cryptographic-asset") return;

    const label = component.name ?? component["bom-ref"] ?? `component-${index}`;
    const crypto = component.cryptoProperties;
    if (!crypto) {
      warnings.push(`"${label}" is a cryptographic-asset with no cryptoProperties — skipped.`);
      return;
    }
    if (crypto.assetType !== "algorithm") {
      warnings.push(
        `Skipped "${label}" — assetType "${crypto.assetType}" is not yet mapped (only "algorithm" assets are parsed in this milestone).`,
      );
      return;
    }
    if (!component.name) {
      warnings.push(`Skipped an algorithm asset at index ${index} — no component name to use as the algorithm.`);
      return;
    }

    const algorithmProperties = crypto.algorithmProperties;
    findings.push({
      id: component["bom-ref"] ?? `finding-${index}`,
      algorithm: component.name,
      keySize: extractKeySize(algorithmProperties),
      location: component.evidence?.occurrences?.[0]?.location ?? component["bom-ref"] ?? `component-${index}`,
      usageContext:
        algorithmProperties?.cryptoFunctions?.join(", ") ?? algorithmProperties?.primitive ?? "unspecified usage",
      source,
    });
  });

  return { findings, warnings };
}
