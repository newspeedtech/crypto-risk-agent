# Crypto Risk Triage Agent

[Live Demo](https://crypto-risk-agent.mack76801.workers.dev/)

A Cloudflare Agent that takes a normalized crypto inventory (parsed from
CycloneDX CBOM output, or hand-entered), classifies each finding's
post-quantum migration risk, generates a prioritized report, and answers
follow-up questions against the result.

The domain thesis: CBOM scanners do discovery well (find crypto
primitives, output a bill of materials). This agent decouples the judgment: risk prioritization by exposure, migration path design, and implementation sequencing, from any CBOM source. CBOM output is the _input_ to this agent, not a competitor
to it.

## Architecture (maps to the four required components)

- **LLM** — Llama 3.3 on Workers AI (`src/agent.ts`, `src/workflow.ts`),
  via `workers-ai-provider` + the `ai` SDK.
- **Workflow/coordination** — `CryptoRiskWorkflow` (`src/workflow.ts`), a
  durable multi-step pipeline: classify each finding individually (so one
  bad LLM response doesn't restart the whole batch on retry), then
  generate the report, then call back into the Agent.
- **User input (chat)** — `public/index.html` + `src/frontend/main.ts`, a
  plain TS frontend using the vanilla `AgentClient` for RPC calls and
  state sync. Chat is single-shot request/response (`askQuestion`), not a
  streaming multi-turn conversation."
  **No voice input** — Out of scope.
- **Memory/state** — `CryptoRiskAgent`'s built-in SQLite-backed Durable
  Object state (`src/agent.ts`), holding findings, analysis, and the
  report across the session.

## What's real vs. stubbed right now

- **Known limitation: the report is capped to the top 10 findings.**
  This is a prompt-level instruction, not a deterministic code-level
  limit — a stopgap for a token-limit truncation bug, not a real fix for
  large CBOMs. Every finding is still classified individually regardless
  of CBOM size; only the final report narrative is capped.
- **Real and verified**: Agent, Workflow, and the classify → report →
  chat pipeline all wire together and run end to end — confirmed against
  a real `wrangler deploy`.
- **CBOM parsing — scaffolded, not yet validated against real PQC output.**
  `src/cbom-parser.ts` maps CycloneDX CBOM (spec ≥1.6) JSON onto this
  project's `CryptoFinding` shape. Only `cryptographic-asset` components
  with `assetType: "algorithm"` are mapped; other asset types are
  reported as warnings rather than guessed at. Verified against a
  CBOM sample with synthetic PQC findings.

  ```json
  {
    "bomFormat": "CycloneDX",
    "specVersion": "1.6",
    "serialNumber": "urn:uuid:3709a709-068f-4a7d-80b4-b858c3eb1c5e",
    "version": 1,
    "metadata": {
      "timestamp": "2026-08-31T21:36:48Z",
      "tools": {
        "components": [
          {
            "type": "application",
            "group": "SCANOSS",
            "name": "crypto-finder",
            "version": "v0.24.0-16-g7c362ca"
          }
        ]
      }
    },
    "components": [
      {
        "bom-ref": "8aa74eb6-f5be-44b4-907d-9253e319567c",
        "type": "cryptographic-asset",
        "name": "MD5/SHA-1",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "digest"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 1,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 1,
                  "value": "scanoss:ruleid,java.messagedigest.weak"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "org/apache/commons/io/input/MessageDigestCalculatingInputStream.java",
              "line": 197,
              "additionalContext": "scanoss:match,requires login"
            },
            {
              "location": "org/eclipse/aether/repository/AuthenticationDigest.java",
              "line": 91,
              "additionalContext": "scanoss:match,requires login"
            },
            {
              "location": "org/eclipse/aether/repository/AuthenticationDigest.java",
              "line": 94,
              "additionalContext": "scanoss:match,requires login"
            },
            {
              "location": "server-spi-private/src/main/java/org/keycloak/protocol/saml/util/ArtifactBindingUtils.java",
              "line": 48,
              "additionalContext": "scanoss:match,requires login"
            },
            {
              "location": "services/src/main/java/org/keycloak/cache/ComputedKey.java",
              "line": 34,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "algorithmProperties": {
            "primitive": "hash",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["digest"]
          }
        }
      },
      {
        "bom-ref": "1f2b9a3e-6c1d-4e8a-9d2f-4a7c0e5b3d81",
        "type": "cryptographic-asset",
        "name": "RSA-2048",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "sign"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.95,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.95,
                  "value": "scanoss:ruleid,java.security.rsa.keypair"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "server-spi-private/src/main/java/org/keycloak/protocol/saml/SamlProtocolUtils.java",
              "line": 112,
              "additionalContext": "scanoss:match,requires login"
            },
            {
              "location": "services/src/main/java/org/keycloak/crypto/KeyWrapper.java",
              "line": 67,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "oid": "1.2.840.113549.1.1.1",
          "algorithmProperties": {
            "primitive": "signature",
            "parameterSetIdentifier": "2048",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["keygen", "sign", "verify"],
            "classicalSecurityLevel": 112,
            "nistQuantumSecurityLevel": 0
          }
        }
      },
      {
        "bom-ref": "d4e8c1a0-2f9b-4c3d-8e1a-7b5f9c2d0a64",
        "type": "cryptographic-asset",
        "name": "ECDSA-P256",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "sign"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.9,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.9,
                  "value": "scanoss:ruleid,java.security.ecdsa.signatureprovider"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "services/src/main/java/org/keycloak/crypto/ECDSASignatureProvider.java",
              "line": 84,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "oid": "1.2.840.10045.2.1",
          "algorithmProperties": {
            "primitive": "signature",
            "parameterSetIdentifier": "P-256",
            "curve": "P-256",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["keygen", "sign", "verify"],
            "classicalSecurityLevel": 128,
            "nistQuantumSecurityLevel": 0
          }
        }
      },
      {
        "bom-ref": "6c2f8e91-3a7b-4d5c-b1e0-9f4a2c8d7b53",
        "type": "cryptographic-asset",
        "name": "ECDH-P256",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "keyAgreement"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.92,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.92,
                  "value": "scanoss:ruleid,java.security.ecdh.keyagreement"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "services/src/main/java/org/keycloak/crypto/ECDHKeyAgreementProvider.java",
              "line": 58,
              "additionalContext": "scanoss:match,requires login"
            },
            {
              "location": "services/src/main/java/org/keycloak/storage/vault/BackupEncryptionKeyExchange.java",
              "line": 23,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "oid": "1.2.840.10045.2.1",
          "algorithmProperties": {
            "primitive": "key-agree",
            "parameterSetIdentifier": "P-256",
            "curve": "P-256",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["keygen", "keyderive"],
            "classicalSecurityLevel": 128,
            "nistQuantumSecurityLevel": 0
          }
        }
      },
      {
        "bom-ref": "b7e3d1a4-9c5f-4e2b-8a0d-6f1c3b7e9d42",
        "type": "cryptographic-asset",
        "name": "RSA-4096",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "sign"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.95,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.95,
                  "value": "scanoss:ruleid,java.security.rsa.keypair"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "services/src/main/java/org/keycloak/crypto/CertificateAuthorityProvider.java",
              "line": 145,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "oid": "1.2.840.113549.1.1.1",
          "algorithmProperties": {
            "primitive": "signature",
            "parameterSetIdentifier": "4096",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["keygen", "sign", "verify"],
            "classicalSecurityLevel": 152,
            "nistQuantumSecurityLevel": 0
          }
        }
      },
      {
        "bom-ref": "9d1a6c3e-4b8f-4a7d-9e2c-3f6b0a8d5c17",
        "type": "cryptographic-asset",
        "name": "DH-2048",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "keyAgreement"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.85,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.85,
                  "value": "scanoss:ruleid,java.security.dh.keyagreement"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "server-spi-private/src/main/java/org/keycloak/protocol/oidc/TokenEndpoint.java",
              "line": 201,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "algorithmProperties": {
            "primitive": "key-agree",
            "parameterSetIdentifier": "2048",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["keygen", "keyderive"],
            "classicalSecurityLevel": 112,
            "nistQuantumSecurityLevel": 0
          }
        }
      },
      {
        "bom-ref": "3e7b9c1d-6a4f-4c8e-b2d0-8a5f1c9e3b76",
        "type": "cryptographic-asset",
        "name": "AES-128",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "encrypt"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.98,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.98,
                  "value": "scanoss:ruleid,java.crypto.aes.cbc"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "core/src/main/java/org/keycloak/crypto/Aes128CbcHmacSha256ContentEncryptionProvider.java",
              "line": 39,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "algorithmProperties": {
            "primitive": "block-cipher",
            "parameterSetIdentifier": "128",
            "mode": "cbc",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["encrypt", "decrypt"],
            "classicalSecurityLevel": 128,
            "nistQuantumSecurityLevel": 64
          }
        }
      },
      {
        "bom-ref": "5f8c2a4e-1d9b-4f6a-a3e7-2b8d5c1f9a30",
        "type": "cryptographic-asset",
        "name": "SHA-256",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "digest"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 1,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 1,
                  "value": "scanoss:ruleid,java.messagedigest.sha256"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "core/src/main/java/org/keycloak/crypto/HashUtils.java",
              "line": 21,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "algorithmProperties": {
            "primitive": "hash",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["digest"],
            "classicalSecurityLevel": 128,
            "nistQuantumSecurityLevel": 128
          }
        }
      },
      {
        "bom-ref": "0a4d7b2e-8f3c-4b1a-9d6e-5c2f8a4b1d69",
        "type": "cryptographic-asset",
        "name": "ML-KEM-768",
        "properties": [
          {
            "name": "scanoss:cryptoFunction",
            "value": "encapsulate"
          }
        ],
        "evidence": {
          "identity": [
            {
              "field": "name",
              "confidence": 0.88,
              "methods": [
                {
                  "technique": "source-code-analysis",
                  "confidence": 0.88,
                  "value": "scanoss:ruleid,java.security.pqc.mlkem"
                }
              ]
            }
          ],
          "occurrences": [
            {
              "location": "server-spi-private/src/main/java/org/keycloak/crypto/pqc/MlKemHybridKeyExchangeProvider.java",
              "line": 12,
              "additionalContext": "scanoss:match,requires login"
            }
          ]
        },
        "cryptoProperties": {
          "assetType": "algorithm",
          "algorithmProperties": {
            "primitive": "pke",
            "parameterSetIdentifier": "768",
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": ["keygen", "encapsulate", "decapsulate"],
            "classicalSecurityLevel": 192,
            "nistQuantumSecurityLevel": 192
          }
        }
      }
    ]
  }
  ```

````
- **Simplified**: chat is single-shot request/response (`askQuestion`),
  not a streaming multi-turn conversation. Migrating to `AIChatAgent` +
  `useAgentChat` is a tracked next step, gated on whether a
  framework-agnostic client exists yet (that API was React-only last
  checked).

## Setup

```bash
npm install
npm run dev
````

Then open the local URL Wrangler prints (usually `http://localhost:8787`).

## Testing

```bash
npm test        # single run
npm run test:watch
```

Requires Node `^22.18.0 || >=24.11.0` (see `.nvmrc`) — run `nvm use`
first if unsure which Node is active.

## Next steps

See CLAUDE.md's "Next steps, in order" and "Open questions" — kept there
instead of duplicated here so there's one source of truth.
