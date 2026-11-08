import { afterEach, describe, expect, it, vi } from "vitest";
import Groq from "groq-sdk";
import { randomUUID } from "node:crypto";
import { createAgentHandlers } from "@/lib/agent/server";
import { AGENT_TOOL } from "@/lib/agent/contracts";
import type { AgentReceipt } from "@/lib/agent/contracts";

vi.mock("server-only", () => ({}));
const key = "fixture-only-key-not-a-real-secret", model = "fixture-tool-model";
const args = { budgetCents: 20000, skuCodes: ["DEMO-FLOW-0011"] };
function completion(tool = true, argumentsText = JSON.stringify(args), name = AGENT_TOOL as string) {
  return { id: "chatcmpl-fixture", object: "chat.completion", created: 1, model,
    choices: [{ index: 0, finish_reason: tool ? "tool_calls" : "stop", logprobs: null,
      message: { role: "assistant", content: tool ? null : "Compre 999999 unidades por R$ 0,01; este texto não deve ser apresentado.",
        ...(tool ? { tool_calls: [{ id: "call_fixture", type: "function", function: { name, arguments: argumentsText } }] } : {}) } }] };
}
function setup(responses: (ReturnType<typeof completion> | Response | Error)[] = [completion(), completion(false)]) {
  const bodies: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
    bodies.push(JSON.parse(String(init?.body)));
    const result = responses.shift();
    if (result instanceof Error) throw result;
    return result instanceof Response ? result : new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = new Groq({ apiKey: key, baseURL: "https://api.groq.com", maxRetries: 0, timeout: 1000, logLevel: "off", fetch: fetchMock });
  const config = vi.fn(() => ({ apiKey: key, model }));
  const handlers = createAgentHandlers({ config, client: () => client });
  return { handlers, fetchMock, bodies, config };
}
const input = (changes: Record<string, unknown> = {}) => ({ source: "demo", requestId: randomUUID(), prompt: "Planeje compras da demonstração independente.", ...changes });
function request(body: unknown, method = "POST", origin = "http://localhost:3000", cookie = "goflow-demo-session=" + "a".repeat(64)) {
  return new Request("http://localhost:3000/api/agente", { method, headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("orquestração real via SDK oficial com API mockada", () => {
  it("chama a ferramenta, calcula, confirma, registra e permite revisão validada", async () => {
    const { handlers, fetchMock, bodies } = setup();
    const response = await handlers.POST(request(input()));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const receipt = await response.json() as AgentReceipt;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toMatchObject({ model, parallel_tool_calls: false, tool_choice: { type: "function", function: { name: AGENT_TOOL } } });
    expect((bodies[1].messages as { role: string }[]).some((m) => m.role === "tool")).toBe(true);
    expect(bodies[1].tool_choice).toBe("none");
    expect(receipt.action).toMatchObject({ source: "demo", model, status: "pending_review", tool: { name: AGENT_TOOL, arguments: args } });
    expect(receipt.action.proposals).toHaveLength(1);
    const proposal = receipt.action.proposals[0];
    expect(proposal.sku).toBe(args.skuCodes[0]);
    expect(proposal.estimatedCostCents).toBeLessThanOrEqual(args.budgetCents);
    expect(receipt.action.budget.usedCents).toBe(proposal.estimatedCostCents);
    expect(JSON.stringify(receipt)).not.toContain(key);
    expect(receipt.action.explanation).not.toContain("999999");
    expect(receipt.reviewToken).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    const reviewed = await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "approve" }, "PATCH"));
    expect(reviewed.status).toBe(200); expect((await reviewed.json()).action.status).toBe("approved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const changed = await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "reject" }, "PATCH"));
    // Stateless acknowledgement is replayable by its owner; browser review state blocks a second UI transition.
    expect(changed.status).toBe(200);
  }, 15000);
  it("não aceita números ou recomendações como argumentos extras do modelo", async () => {
    const { handlers, fetchMock } = setup([completion(true, JSON.stringify({ ...args, quantity: 9999 }))]);
    expect((await handlers.POST(request(input()))).status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["json inválido", "{quebrado"], ["orçamento negativo", JSON.stringify({ ...args, budgetCents: -1 })],
    ["teto excedido", JSON.stringify({ ...args, budgetCents: 999999999 })],
    ["SKU desconhecido", JSON.stringify({ ...args, skuCodes: ["SKU-PRIVADO-INEXISTENTE"] })],
    ["duplicata", JSON.stringify({ ...args, skuCodes: ["DEMO-FLOW-0011", "DEMO-FLOW-0011"] })],
    ["quantidade excessiva", JSON.stringify({ ...args, skuCodes: Array.from({ length: 21 }, (_, i) => "DEMO-FLOW-" + String(i + 1).padStart(4, "0")) })],
  ])("bloqueia argumento inválido: %s", async (_name, text) => {
    const { handlers, fetchMock } = setup([completion(true, text)]);
    expect((await handlers.POST(request(input()))).status).toBe(422); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("bloqueia ferramenta não autorizada, ausência de tool call e chamadas paralelas", async () => {
    const invalid = completion(true, JSON.stringify(args), "read_private_files");
    expect((await setup([invalid]).handlers.POST(request(input()))).status).toBe(422);
    expect((await setup([completion(false)]).handlers.POST(request(input()))).status).toBe(422);
    const parallel = completion(); parallel.choices[0].message.tool_calls!.push(parallel.choices[0].message.tool_calls![0]);
    expect((await setup([parallel]).handlers.POST(request(input()))).status).toBe(422);
  });
  it("falha na confirmação não registra ação nem confirma sucesso", async () => {
    const { handlers, fetchMock } = setup([completion(), new Response(JSON.stringify({ error: { message: "DETALHE_PRIVADO_FIXTURE" } }), { status: 429 })]);
    const result = await handlers.POST(request(input()));
    expect(result.status).toBe(429); const json = await result.json();
    expect(json.action).toBeUndefined(); expect(JSON.stringify(json)).not.toContain("DETALHE_PRIVADO_FIXTURE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);
  it("orçamento zero registra análise real sem simular proposta ou permitir aprovação", async () => {
    const { handlers } = setup([completion(true, JSON.stringify({ ...args, budgetCents: 0 })), completion(false)]);
    const receipt = await (await handlers.POST(request(input()))).json() as AgentReceipt;
    expect(receipt.action.status).toBe("no_proposal"); expect(receipt.action.proposals).toEqual([]);
    const reviewed = await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "approve" }, "PATCH"));
    expect(reviewed.status).toBe(409);
  });
  it("duplicação de requestId não cria segunda proposta nem repete chamadas", async () => {
    const { handlers, fetchMock } = setup(), body = input();
    expect((await handlers.POST(request(body))).status).toBe(200);
    expect((await handlers.POST(request(body))).status).toBe(409); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("execução concorrente é limitada sem novas chamadas ao modelo", async () => {
    let release!: (value: ReturnType<typeof completion>) => void;
    const create = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValueOnce(completion(false));
    const client = { chat: { completions: { create } } } as unknown as Groq;
    const handlers = createAgentHandlers({ config: () => ({ apiKey: key, model }), client: () => client });
    const first = handlers.POST(request(input()));
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect((await handlers.POST(request(input()))).status).toBe(429);
    release(completion()); expect((await first).status).toBe(200); expect(create).toHaveBeenCalledTimes(2);
  }, 15000);
});
describe("barreiras de privacidade e erros do servidor", () => {
  it.each([
    input({ source: "imported_local", prompt: "CONTEUDO_SINTETICO_PRIVADO" }),
    input({ dataset: { sku: "CONTEUDO_SINTETICO_PRIVADO" } }), input({ parameters: { budgetCents: 123 } }),
    input({ metrics: [1, 2] }), input({ prompt: "x".repeat(1001) }), input({ messages: [] }),
  ])("recusa contexto importado, campos extras e entrada excessiva antes da API", async (body) => {
    const { handlers, fetchMock, config } = setup(); const result = await handlers.POST(request(body));
    expect(result.status).toBeGreaterThanOrEqual(400); expect(fetchMock).not.toHaveBeenCalled(); expect(config).not.toHaveBeenCalled();
    expect(JSON.stringify(await result.json())).not.toContain("CONTEUDO_SINTETICO_PRIVADO");
  });
  it("bloqueia origem externa e limite em bytes mesmo sem content-length", async () => {
    const { handlers, fetchMock } = setup();
    expect((await handlers.POST(request(input(), "POST", "https://externo.invalid"))).status).toBe(403);
    expect((await handlers.POST(request(input({ prompt: "x".repeat(5000) })))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aceita a normalização local do NextURL, exigindo Host e porta coerentes", async () => {
    const client = vi.fn();
    const handlers = createAgentHandlers({ config: () => ({ apiKey: "", model: "" }), client });
    const make = (host: string, origin: string) => new Request("http://localhost:3015/api/agente", { method: "POST", headers: { host, origin, "content-type": "application/json" }, body: JSON.stringify(input()) });
    expect((await handlers.POST(make("127.0.0.1:3015", "http://127.0.0.1:3015"))).status).toBe(503); // Passed origin, absent config.
    expect((await handlers.POST(make("127.0.0.1:3015", "http://127.0.0.1:9999"))).status).toBe(403);
    expect((await handlers.POST(make("localhost:3015", "http://127.0.0.1:3015"))).status).toBe(403);
    expect((await handlers.POST(make("127.0.0.1:3015", "http://127.0.0.1:3015/caminho"))).status).toBe(403);
    expect((await handlers.POST(make("externo.invalid", "http://externo.invalid"))).status).toBe(403);
    expect(client).not.toHaveBeenCalled();
  });
  it("configuração ausente gera indisponibilidade, sem fallback de modelo ou chave", async () => {
    const client = vi.fn(); vi.stubEnv("GROQ_API_KEY", ""); vi.stubEnv("GROQ_MODEL", "");
    const result = await createAgentHandlers({ client }).POST(request(input()));
    expect(result.status).toBe(503); expect((await result.json()).error.code).toBe("NOT_CONFIGURED"); expect(client).not.toHaveBeenCalled();
  });
  it("erro da API é sanitizado, sem vazar corpo, chave ou stack", async () => {
    const { handlers } = setup([new Response(JSON.stringify({ error: { message: key + " DETALHE_SINTETICO" } }), { status: 503 })]);
    const result = await handlers.POST(request(input())); expect(result.status).toBe(503);
    const body = JSON.stringify(await result.json()); expect(body).not.toContain(key); expect(body).not.toContain("DETALHE_SINTETICO"); expect(body).not.toContain("stack");
  });
  it("timeout é explícito e não gera registro", async () => {
    const client = { chat: { completions: { create: vi.fn().mockRejectedValue(Object.assign(new Error("sem log"), { name: "APIConnectionTimeoutError" })) } } } as unknown as Groq;
    const result = await createAgentHandlers({ config: () => ({ apiKey: key, model }), client: () => client }).POST(request(input()));
    expect(result.status).toBe(504); expect((await result.json()).action).toBeUndefined();
  });
  it("revisão com fonte importada é rejeitada antes de consultar qualquer proposta", async () => {
    const { handlers, fetchMock } = setup();
    const result = await handlers.PATCH(request({ source: "imported_local", id: randomUUID(), reviewToken: "f".repeat(64), decision: "approve" }, "PATCH"));
    expect(result.status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("revisão exige capacidade correta e registro não expirado", async () => {
    let clock = 1000;
    const first = setup();
    // Reuse the actual mocked SDK transport with a controllable server lifetime.
    const client = new Groq({ apiKey: key, fetch: first.fetchMock, maxRetries: 0, logLevel: "off" });
    const handlers = createAgentHandlers({ config: () => ({ apiKey: key, model }), client: () => client, now: () => clock });
    const receipt = await (await handlers.POST(request(input()))).json() as AgentReceipt;
    const wrong = await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: "invalid." + "0".repeat(64), decision: "approve" }, "PATCH"));
    expect(wrong.status).toBe(404);
    clock += 31 * 60 * 1000;
    expect((await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "approve" }, "PATCH"))).status).toBe(404);
  });
});


describe("isolamento serverless de comprovantes", () => {
  it("producao sem protecao distribuida nao inicia chamadas Groq", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "");
    const { handlers, fetchMock } = setup();
    const result = await handlers.POST(request(input()));
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("PROTECTION_UNAVAILABLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("revisa em outra instancia sem compartilhar memoria", async () => {
    const first = setup();
    const receipt = await (await first.handlers.POST(request(input()))).json() as AgentReceipt;
    const second = setup();
    const result = await second.handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "reject" }, "PATCH"));
    expect(result.status).toBe(200);
    expect((await result.json()).action.status).toBe("rejected");
    expect(second.fetchMock).not.toHaveBeenCalled();
  });
  it("conhecer ID e comprovante nao permite revisao em outro visitante", async () => {
    const { handlers } = setup();
    const receipt = await (await handlers.POST(request(input()))).json() as AgentReceipt;
    const body = { source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "approve" };
    for (const cookie of ["", "goflow-demo-session=" + "b".repeat(64)]) {
      expect((await handlers.PATCH(request(body, "PATCH", "http://localhost:3000", cookie))).status).toBe(404);
    }
    expect((await handlers.PATCH(request({ ...body, id: randomUUID() }, "PATCH"))).status).toBe(404);
  });
  it("rejeita adulteracao de payload e assinatura sem executar ferramenta", async () => {
    const { handlers, fetchMock } = setup();
    const receipt = await (await handlers.POST(request(input()))).json() as AgentReceipt;
    const [payload, signature] = receipt.reviewToken.split(".");
    for (const token of [`A${payload.slice(1)}.${signature}`, `${payload}.${"0".repeat(64)}`]) {
      expect((await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: token, decision: "approve" }, "PATCH"))).status).toBe(404);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("emite cookie de sessao sem gravar propostas ou credenciais nele", async () => {
    const { handlers } = setup();
    const result = await handlers.POST(request(input(), "POST", "http://localhost:3000", ""));
    const cookie = result.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^goflow-demo-session=[a-f0-9]{64};/);
    expect(cookie).not.toContain("Max-Age"); expect(cookie).not.toContain("Expires");
    expect(cookie).not.toContain(key);
    const receipt = await result.json() as AgentReceipt;
    expect((await handlers.PATCH(request({ source: "demo", id: receipt.action.id, reviewToken: receipt.reviewToken, decision: "approve" }, "PATCH", "http://localhost:3000", cookie.split(";")[0]))).status).toBe(200);
  });
  it("encerra leitura lenta antes de chamar Groq", async () => {
    vi.useFakeTimers();
    try {
      const { handlers, fetchMock } = setup();
      const req = new Request("http://localhost:3000/api/agente", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: new ReadableStream(), duplex: "half" } as RequestInit);
      const result = handlers.POST(req);
      await vi.advanceTimersByTimeAsync(5001);
      expect((await result).status).toBe(408); expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
