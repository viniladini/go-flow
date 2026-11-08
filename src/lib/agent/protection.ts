import "server-only";
import { checkRateLimit } from "@vercel/firewall";
import { AgentError } from "./contracts";

type ProtectionReason = "platform_unavailable" | "region_mismatch" | "host_unavailable" | "ip_unavailable" |
  "runtime_unavailable" | "rule_not_found" | "rate_limited" | "firewall_blocked" |
  "sdk_invalid_response" | "sdk_integration_error" | "infrastructure_http" |
  "infrastructure_timeout" | "infrastructure_network";

/** Platform counters, not a serverless instance's memory. Missing protection fails closed. */
export async function protectAgent(request: Request) {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") return;
  let reason: ProtectionReason = "platform_unavailable";
  try {
    if (process.env.VERCEL !== "1") throw new Error("platform");
    reason = "region_mismatch";
    if (process.env.VERCEL_REGION !== "iad1") throw new Error("region");
    reason = "host_unavailable";
    const host = process.env.VERCEL_URL;
    if (!host || !/^[a-z0-9-]+\.vercel\.app$/i.test(host)) throw new Error("host");
    // Do not forward arbitrary caller headers/cookies to the firewall SDK.
    reason = "ip_unavailable";
    const ip = request.headers.get("x-real-ip");
    if (!ip) throw new Error("ip");
    reason = "runtime_unavailable";
    if (typeof fetch !== "function" || !globalThis.crypto?.subtle || typeof AbortSignal.timeout !== "function") throw new Error("runtime");
    const headers = new Headers({ host, "x-real-ip": ip });
    // Reuse the existing ID for Hobby's single rule; the bucket is per platform IP.
    reason = "sdk_integration_error";
    const result = await checkRateLimit("goflow-agent-global", { headers, rateLimitKey: ip, timeout: 1500 });
    reason = "sdk_invalid_response";
    if (result?.error === "not-found") { reason = "rule_not_found"; throw new Error("rule"); }
    if (result?.rateLimited === true || result?.error === "blocked") {
      reason = result.error === "blocked" ? "firewall_blocked" : "rate_limited";
      throw new AgentError("RATE_LIMIT", "Limite público de solicitações atingido. Tente novamente mais tarde.", 429);
    }
    if (!result || result.error || result.rateLimited !== false) throw new Error("firewall");
  } catch (error) {
    let upstreamStatus: number | undefined;
    if (reason === "sdk_integration_error" && error instanceof Error) {
      // Parse only the installed SDK's fixed status message; never log raw errors.
      const status = /^Unexpected rate-limit API response status 'goflow-agent-global': ([1-5]\d{2})$/.exec(error.message);
      if (status) {
        upstreamStatus = Number(status[1]);
        if (upstreamStatus >= 500) reason = "infrastructure_http";
      } else if (error.name === "TimeoutError" || error.name === "AbortError") reason = "infrastructure_timeout";
      else if (error instanceof TypeError && error.message === "fetch failed") reason = "infrastructure_network";
    }
    // User-requested diagnostics: fixed categories/status only, no request or error payloads.
    // eslint-disable-next-line no-console -- Safe allowlisted firewall diagnostics; never log private data.
    console.warn(JSON.stringify({ event: "agent_protection", reason, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) }));
    if (error instanceof AgentError) throw error;
    throw new AgentError("PROTECTION_UNAVAILABLE", "Proteção da IA pública indisponível. Nenhuma chamada à IA foi iniciada.", 503);
  }
}
