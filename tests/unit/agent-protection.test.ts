import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { protectAgent } from "@/lib/agent/protection";
import { signAction, verifyAction, visitor } from "@/lib/agent/receipts";
import { agentReceipt } from "../fixtures/agent";
import { createAgentHandlers } from "@/lib/agent/server";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
// Any accidental SDK call must fail, including when the edge mode is configured.
vi.mock("@vercel/firewall", () => ({ checkRateLimit: () => { throw new Error("SDK must not be called"); } }));
const request = () => new Request("https://fixture.vercel.app/api/agente", { headers: { "x-real-ip": "192.0.2.1", cookie: "private=not-forwarded" } });
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_REGION", "iad1"); vi.stubEnv("VERCEL_URL", "fixture.vercel.app");
  vi.stubEnv("AGENT_RATE_LIMIT_MODE", "vercel_edge_waf");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("protecao publica com WAF direto", () => {
  it("aceita modo explicito sem consultar SDK ou rede", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(protectAgent(request())).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
  it.each(["", "disabled", "vercel_firewall_sdk", "VERCEL_EDGE_WAF", "vercel_edge_waf "])("modo ausente/incorreto bloqueia antes da Groq: %s", async (mode) => {
    vi.stubEnv("AGENT_RATE_LIMIT_MODE", mode);
    const client = vi.fn();
    const handlers = createAgentHandlers({ config: () => ({ apiKey: "fixture-key", model: "fixture-model" }), client });
    const response = await handlers.POST(new Request(request(), {
      method: "POST", headers: { origin: "https://fixture.vercel.app", "content-type": "application/json", "x-real-ip": "192.0.2.1" },
      body: JSON.stringify({ source: "demo", requestId: randomUUID(), prompt: "Planeje compras da demo" }),
    }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("PROTECTION_UNAVAILABLE");
    expect(body.action).toBeUndefined(); expect(body.reviewToken).toBeUndefined();
    expect(client).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('{"event":"agent_protection","reason":"rate_limit_mode_unavailable"}');
  });
  it.each(["VERCEL", "VERCEL_URL", "VERCEL_REGION"])("configuracao ausente %s bloqueia producao", async (name) => {
    vi.stubEnv(name, "");
    await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
  });
  it("regiao inesperada continua bloqueada", async () => {
    vi.stubEnv("VERCEL_REGION", "other1");
    await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
  });
  it("IP ausente continua bloqueado", async () => {
    await expect(protectAgent(new Request(request(), { headers: {} }))).rejects.toMatchObject({ status: 503 });
  });
  it("header nao substitui configuracao do servidor", async () => {
    vi.stubEnv("AGENT_RATE_LIMIT_MODE", "");
    await expect(protectAgent(new Request(request(), { headers: { "x-real-ip": "192.0.2.1", "AGENT_RATE_LIMIT_MODE": "vercel_edge_waf" } }))).rejects.toMatchObject({ status: 503 });
  });
  it("desenvolvimento local preserva comportamento existente", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL", ""); vi.stubEnv("AGENT_RATE_LIMIT_MODE", "");
    await expect(protectAgent(request())).resolves.toBeUndefined();
  });
});

describe("comprovantes sinteticos limitados e assinados", () => {
  it("assinatura depende da chave; rotacao invalida comprovantes antigos", () => {
    const action = agentReceipt().action, time = Date.parse(action.createdAt);
    const token = signAction(action, "fixture-session", "fixture-key");
    expect(verifyAction(token, action.id, "fixture-session", "fixture-key", time)).toEqual(action);
    expect(() => verifyAction(token, action.id, "fixture-session", "different-key", time)).toThrow();
  });
  it("limita tamanho descomprimido antes de emitir comprovante", () => {
    const action = agentReceipt().action;
    expect(() => signAction({ ...action, explanation: "x".repeat(1048577) }, "session", "key")).toThrow();
  });
  it("cookie production e Secure HttpOnly SameSite sem dados operacionais", () => {
    const session = visitor(request()).create();
    expect(session.cookie).toMatch(/^__Host-goflow-demo-session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
    expect(visitor(new Request(request(), { headers: { cookie: session.cookie.split(";")[0] } })).id).toBe(session.id);
  });
});
