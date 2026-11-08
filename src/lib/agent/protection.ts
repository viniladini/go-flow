import "server-only";
import { checkRateLimit } from "@vercel/firewall";
import { AgentError } from "./contracts";

/** Platform counters, not a serverless instance's memory. Missing protection fails closed. */
export async function protectAgent(request: Request) {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") return;
  try {
    const host = process.env.VERCEL_URL;
    if (process.env.VERCEL !== "1" || process.env.VERCEL_REGION !== "iad1" ||
      !host || !/^[a-z0-9-]+\.vercel\.app$/i.test(host)) throw new Error("platform");
    // Do not forward arbitrary caller headers/cookies to the firewall SDK.
    const ip = request.headers.get("x-real-ip");
    if (!ip) throw new Error("ip");
    const headers = new Headers({ host, "x-real-ip": ip });
    for (const [id, rateLimitKey] of [["goflow-agent-global", "all-demo-executions"], ["goflow-agent-ip", ip]]) {
      const result = await checkRateLimit(id, { headers, rateLimitKey, timeout: 1500 });
      if (result.error === "not-found") throw new Error("rule");
      if (result.rateLimited || result.error === "blocked") throw new AgentError("RATE_LIMIT", "Limite público de solicitações atingido. Tente novamente mais tarde.", 429);
      if (result.error || result.rateLimited !== false) throw new Error("firewall");
    }
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError("PROTECTION_UNAVAILABLE", "Proteção da IA pública indisponível. Nenhuma chamada à IA foi iniciada.", 503);
  }
}
