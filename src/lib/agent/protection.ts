import "server-only";
import { AgentError } from "./contracts";

/** Explicit deployment contract; the active edge WAF enforces the rate limit. */
export async function protectAgent(request: Request) {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") return;
  let reason = "rate_limit_mode_unavailable";
  try {
    // This setting acknowledges an external rule; it cannot attest that it exists.
    if (process.env.AGENT_RATE_LIMIT_MODE !== "vercel_edge_waf") throw new Error("mode");
    reason = "platform_unavailable";
    if (process.env.VERCEL !== "1") throw new Error("platform");
    reason = "region_mismatch";
    if (process.env.VERCEL_REGION !== "iad1") throw new Error("region");
    reason = "host_unavailable";
    const host = process.env.VERCEL_URL;
    if (!host || !/^[a-z0-9-]+\.vercel\.app$/i.test(host)) throw new Error("host");
    reason = "ip_unavailable";
    if (!request.headers.get("x-real-ip")) throw new Error("ip");
  } catch {
    // eslint-disable-next-line no-console -- Fixed configuration category only; no private payloads.
    console.warn(JSON.stringify({ event: "agent_protection", reason }));
    throw new AgentError("PROTECTION_UNAVAILABLE", "Proteção da IA pública indisponível. Nenhuma chamada à IA foi iniciada.", 503);
  }
}
