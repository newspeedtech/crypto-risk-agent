import agents from "agents/vite";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // Transpiles the TC39 (standard) decorators used by `agents`' @callable()
    // — CryptoRiskAgent's RPC methods — which the plugin's Vite/Oxc transform
    // doesn't support out of the box. See agents SDK docs, "Callable methods"
    // troubleshooting. Do NOT set experimentalDecorators in tsconfig instead;
    // that applies the incompatible legacy transform and breaks @callable()
    // silently rather than at build time.
    agents(),
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
});
