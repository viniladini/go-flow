import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { protectAgent } from "@/lib/agent/protection";

// Exercise the installed SDK, not a mock of checkRateLimit. No network is used.
vi.mock("server-only", () => ({}));
const request = () => new Request("https://fixture.vercel.app/api/agente", {
  headers: { "x-real-ip": "192.0.2.1", cookie: "private=fixture-secret", "x-extra": "fixture-secret" },
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_URL", "fixture.vercel.app");
  vi.stubEnv("VERCEL_REGION", "iad1");
  vi.stubEnv("PUBLIC_VERCEL_FIREWALL_PATH_PREFIX", "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_FIREWALL_PATH_PREFIX", "");
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "fixture-bypass-secret");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("SDK real: 204 permite; usa endpoint, chave assinada por IP e timeout suportados", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(protectAgent(request())).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://fixture.vercel.app/.well-known/vercel/rate-limit-api/goflow-agent-global");
  expect(options.redirect).toBe("manual");
  expect(options.signal).toBeInstanceOf(AbortSignal);
  const headers = options.headers as Headers;
  expect(headers.get("x-vercel-rate-limit-key")).toMatch(/^192\.0\.2\.1-[a-f0-9]{64}$/);
  expect(headers.get("x-vercel-protection-bypass")).toBe("fixture-bypass-secret");
  expect(headers.get("cookie")).toBeNull();
  expect(headers.get("x-rr-x-extra")).toBeNull();
  expect(console.warn).not.toHaveBeenCalled();
});

it.each([
  [404, 503, "rule_not_found"],
  [429, 429, "rate_limited"],
  [403, 429, "firewall_blocked"],
  [401, 503, "sdk_integration_error"],
  [307, 503, "sdk_integration_error"],
  [500, 503, "infrastructure_http"],
])("SDK real: HTTP %i bloqueia com %i e diagnostico %s", async (upstream, status, reason) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: upstream })));
  await expect(protectAgent(request())).rejects.toMatchObject({ status });
  const lastLog = vi.mocked(console.warn).mock.calls.at(-1)!;
  expect(JSON.parse(lastLog[0])).toEqual({ event: "agent_protection", reason, ...([401, 307, 500].includes(upstream) ? { upstreamStatus: upstream } : {}) });
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/fixture-secret|fixture-bypass-secret|192\.0\.2\.1/);
});

it.each([
  [new DOMException("fixture-secret", "TimeoutError"), "infrastructure_timeout"],
  [new TypeError("fetch failed"), "infrastructure_network"],
  [new Error("fixture-secret"), "sdk_integration_error"],
])("SDK real: excecao bloqueia sem expor detalhes (%s)", async (error, reason) => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
  expect(console.warn).toHaveBeenLastCalledWith(JSON.stringify({ event: "agent_protection", reason }));
});

it.each([
  ["VERCEL", "", "platform_unavailable"],
  ["VERCEL_REGION", "other1", "region_mismatch"],
  ["VERCEL_URL", "", "host_unavailable"],
])("diagnostica precondicao %s sem chamar SDK", async (name, value, reason) => {
  vi.stubEnv(name, value);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(console.warn).toHaveBeenCalledWith(JSON.stringify({ event: "agent_protection", reason }));
});

it("diagnostica runtime sem Web Crypto e permanece bloqueado", async () => {
  vi.stubGlobal("crypto", undefined);
  await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
  expect(console.warn).toHaveBeenCalledWith(JSON.stringify({ event: "agent_protection", reason: "runtime_unavailable" }));
});
