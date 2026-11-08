import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@vercel/firewall";
import { protectAgent } from "@/lib/agent/protection";
import { signAction, verifyAction, visitor } from "@/lib/agent/receipts";
import { agentReceipt } from "../fixtures/agent";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/firewall", () => ({ checkRateLimit: vi.fn() }));
const check = vi.mocked(checkRateLimit);
const request = () => new Request("https://fixture.vercel.app/api/agente", { headers: { host: "untrusted.invalid", "x-real-ip": "192.0.2.1", cookie: "private=not-forwarded" } });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_REGION", "iad1"); vi.stubEnv("VERCEL_URL", "fixture.vercel.app");
  check.mockResolvedValue({ rateLimited: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("protecao publica fail-closed", () => {
  it("consulta limites compartilhados global e por IP sem encaminhar cookies", async () => {
    await protectAgent(request());
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls.map(([id]) => id)).toEqual(["goflow-agent-global", "goflow-agent-ip"]);
    const options = check.mock.calls[0][1]!;
    expect(options.rateLimitKey).toBe("all-demo-executions");
    expect((options.headers as Headers).get("host")).toBe("fixture.vercel.app");
    expect((options.headers as Headers).get("cookie")).toBeNull();
    expect(options.timeout).toBe(1500);
  });
  it.each([{ rateLimited: true }, { rateLimited: true, error: "blocked" as const }])("limite da plataforma retorna 429", async (result) => {
    check.mockResolvedValue(result);
    await expect(protectAgent(request())).rejects.toMatchObject({ status: 429 });
  });
  it("regra ausente nao e permissao para chamar IA", async () => {
    check.mockResolvedValue({ rateLimited: false, error: "not-found" });
    await expect(protectAgent(request())).rejects.toMatchObject({ code: "PROTECTION_UNAVAILABLE", status: 503 });
  });
  it("timeout ou falha do firewall bloqueia consumo", async () => {
    check.mockRejectedValue(new Error("private detail"));
    await expect(protectAgent(request())).rejects.toMatchObject({ code: "PROTECTION_UNAVAILABLE" });
  });
  it.each(["VERCEL", "VERCEL_URL", "VERCEL_REGION"])("configuracao ausente %s bloqueia producao", async (name) => {
    vi.stubEnv(name, ""); await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
    expect(check).not.toHaveBeenCalled();
  });
  it("regiao adicional nao pode multiplicar o limite global", async () => {
    vi.stubEnv("VERCEL_REGION", "other1");
    await expect(protectAgent(request())).rejects.toMatchObject({ status: 503 });
  });
  it("desenvolvimento local nao depende da Vercel", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL", "");
    await protectAgent(request()); expect(check).not.toHaveBeenCalled();
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
