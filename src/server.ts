import { routeAgentRequest } from "agents";

export { CryptoRiskAgent } from "./agent";
export { CryptoRiskWorkflow } from "./workflow";

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
