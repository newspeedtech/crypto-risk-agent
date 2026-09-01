import { it, describe } from "vitest";
import { parseCBOM } from "../src/cbom-parser";

function algorithmComponent(overrides: Record<string, unknown> = {}) {
  return {
    type: "cryptographic-asset",
    "bom-ref": "crypto/rsa-tls-cert",
    name: "RSA",
    cryptoProperties: {
      assetType: "algorithm",
      algorithmProperties: {
        primitive: "signature",
        parameterSetIdentifier: "2048",
        cryptoFunctions: ["keygen", "encrypt", "decrypt"],
      },
    },
    evidence: { occurrences: [{ location: "payments-service/tls-cert" }] },
    ...overrides,
  };
}

describe("parseCBOM — algorithm assets", () => {
  it("maps a well-formed algorithm asset onto CryptoFinding", ({ expect }) => {
    const result = parseCBOM({ components: [algorithmComponent()] });
    expect(result.warnings).toEqual([]);
    expect(result.findings).toEqual([
      {
        id: "crypto/rsa-tls-cert",
        algorithm: "RSA",
        keySize: 2048,
        location: "payments-service/tls-cert",
        usageContext: "keygen, encrypt, decrypt",
        source: "cbom-scanner",
      },
    ]);
  });

  it("falls back keySize to classicalSecurityLevel when there's no parameterSetIdentifier", ({
    expect,
  }) => {
    const result = parseCBOM({
      components: [
        algorithmComponent({
          cryptoProperties: {
            assetType: "algorithm",
            algorithmProperties: { classicalSecurityLevel: 128 },
          },
        }),
      ],
    });
    expect(result.findings[0].keySize).toBe(128);
  });

  it("extracts the first integer run out of a non-numeric parameterSetIdentifier", ({
    expect,
  }) => {
    const result = parseCBOM({
      components: [
        algorithmComponent({
          name: "ECDSA",
          cryptoProperties: {
            assetType: "algorithm",
            algorithmProperties: { parameterSetIdentifier: "P-256" },
          },
        }),
      ],
    });
    expect(result.findings[0].keySize).toBe(256);
  });

  it("falls back usageContext to primitive when there are no cryptoFunctions", ({ expect }) => {
    const result = parseCBOM({
      components: [
        algorithmComponent({
          cryptoProperties: {
            assetType: "algorithm",
            algorithmProperties: { primitive: "ae" },
          },
        }),
      ],
    });
    expect(result.findings[0].usageContext).toBe("ae");
  });

  it("falls back usageContext to 'unspecified usage' when there's no primitive or cryptoFunctions either", ({
    expect,
  }) => {
    const result = parseCBOM({
      components: [algorithmComponent({ cryptoProperties: { assetType: "algorithm" } })],
    });
    expect(result.findings[0].usageContext).toBe("unspecified usage");
  });

  it("falls back location to bom-ref when there's no evidence occurrence", ({ expect }) => {
    const result = parseCBOM({
      components: [algorithmComponent({ evidence: undefined })],
    });
    expect(result.findings[0].location).toBe("crypto/rsa-tls-cert");
  });

  it("falls back location to a component-index placeholder when there's neither evidence nor bom-ref", ({
    expect,
  }) => {
    const result = parseCBOM({
      components: [algorithmComponent({ evidence: undefined, "bom-ref": undefined })],
    });
    expect(result.findings[0].location).toBe("component-0");
    expect(result.findings[0].id).toBe("finding-0");
  });

  it("skips an algorithm asset with no component name, with a warning", ({ expect }) => {
    const result = parseCBOM({
      components: [algorithmComponent({ name: undefined })],
    });
    expect(result.findings).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("no component name");
  });
});

describe("parseCBOM — source (metadata.tools)", () => {
  it("defaults source to 'cbom-scanner' when there's no metadata.tools", ({ expect }) => {
    const result = parseCBOM({ components: [algorithmComponent()] });
    expect(result.findings[0].source).toBe("cbom-scanner");
  });

  it("reads source from the CycloneDX 1.5+ metadata.tools.components form", ({ expect }) => {
    const result = parseCBOM({
      metadata: { tools: { components: [{ name: "real-scanner" }] } },
      components: [algorithmComponent()],
    });
    expect(result.findings[0].source).toBe("real-scanner");
  });

  it("reads source from the legacy CycloneDX <1.5 bare-array tools form", ({ expect }) => {
    const result = parseCBOM({
      metadata: { tools: [{ name: "legacy-scanner" }] },
      components: [algorithmComponent()],
    });
    expect(result.findings[0].source).toBe("legacy-scanner");
  });
});

describe("parseCBOM — non-algorithm and non-crypto components", () => {
  it("skips a non-cryptographic-asset component silently (no warning)", ({ expect }) => {
    const result = parseCBOM({
      components: [{ type: "library", name: "openssl" }, algorithmComponent()],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("skips a cryptographic-asset with no cryptoProperties, with a warning", ({ expect }) => {
    const result = parseCBOM({
      components: [{ type: "cryptographic-asset", name: "mystery-asset" }],
    });
    expect(result.findings).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("no cryptoProperties");
  });

  for (const assetType of ["certificate", "protocol", "related-material"]) {
    it(`skips a ${assetType} asset with a warning naming the assetType`, ({ expect }) => {
      const result = parseCBOM({
        components: [
          { type: "cryptographic-asset", name: "some-asset", cryptoProperties: { assetType } },
        ],
      });
      expect(result.findings).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(assetType);
    });
  }
});

describe("parseCBOM — input shape", () => {
  it("tolerates a BOM with no components key at all (zero findings, zero warnings)", ({
    expect,
  }) => {
    const result = parseCBOM({ bomFormat: "CycloneDX", specVersion: "1.6" });
    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("throws when components is present but not an array", ({ expect }) => {
    expect(() => parseCBOM({ components: "not-an-array" })).toThrow();
  });

  it("throws when input isn't an object at all", ({ expect }) => {
    expect(() => parseCBOM("just a string")).toThrow();
  });
});
