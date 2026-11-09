import { afterEach, describe, expect, it, vi } from "vitest";
import { ESLint } from "eslint";
import { createAgentSession } from "@/lib/agent/session";
import { agentTransport } from "@/lib/agent/client";
import { createImportSession } from "@/lib/flow-import/session";
import { agentReceipt, agentAnalysis } from "../fixtures/agent";
import { operationalFixture } from "../fixtures/operational";
import type { AgentTransport } from "@/lib/agent/client";
import type { AgentReceipt, AgentRequest } from "@/lib/agent/contracts";

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const source = createImportSession(), receipt = agentReceipt();
  const transport: AgentTransport = { execute: vi.fn().mockResolvedValue(receipt), review: vi.fn().mockResolvedValue({ ...receipt.action, status: "approved", reviewedAt: "2032-01-01T12:01:00.000Z" }) };
  const agent = createAgentSession(source, transport); agent.start();
  return { source, receipt, transport, agent };
}
describe("sessão do go.agent e barreira da fonte importada", () => {
  it("análise aparece sem comprovante, proposta ou revisão e é limpa ao trocar fonte", async () => {
    const { agent, source, transport } = setup();
    vi.mocked(transport.execute).mockResolvedValueOnce(agentAnalysis());
    agent.setDraft("Analisar risco de ruptura");
    expect(await agent.execute()).toBe(true);
    expect(agent.getSnapshot().analysis).toEqual(agentAnalysis().analysis);
    expect(agent.getSnapshot().receipts).toEqual([]);
    expect(await agent.review(crypto.randomUUID(), "approve")).toBe(false);
    expect(transport.review).not.toHaveBeenCalled();
    source.commit(operationalFixture(), 0);
    expect(agent.getSnapshot().analysis).toBeNull();
    agent.setDraft("Analisar risco de ruptura");
    expect(await agent.execute()).toBe(false); expect(transport.execute).toHaveBeenCalledTimes(1);
    agent.dispose();
  });
  it("análise não sobrescreve proposta anterior nem permite promover resposta mista", async () => {
    const { agent, receipt, transport } = setup();
    agent.setDraft("Planeje compras da demo."); await agent.execute();
    vi.mocked(transport.execute).mockResolvedValueOnce(agentAnalysis());
    agent.setDraft("Analisar risco de ruptura"); await agent.execute();
    expect(agent.getSnapshot().receipts).toEqual([receipt]);
    vi.mocked(transport.execute).mockResolvedValueOnce({ ...agentAnalysis(), ...receipt });
    agent.setDraft("Analisar risco de ruptura");
    expect(await agent.execute()).toBe(false);
    expect(agent.getSnapshot().receipts).toEqual([receipt]);
    expect(agent.getSnapshot().analysis).toBeNull(); agent.dispose();
  });
  it("ignora análise tardia depois da troca para dados importados", async () => {
    const { agent, source, transport } = setup();
    let finish!: (value: ReturnType<typeof agentAnalysis>) => void;
    vi.mocked(transport.execute).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    agent.setDraft("Analisar risco de ruptura"); const running = agent.execute();
    source.commit(operationalFixture(), 0); finish(agentAnalysis());
    expect(await running).toBe(false); expect(agent.getSnapshot().analysis).toBeNull();
    expect(agent.getSnapshot().receipts).toEqual([]); agent.dispose();
  });
  it("recusa conteúdo de proposta escondido numa resposta de análise", async () => {
    const { agent, transport } = setup();
    vi.mocked(transport.execute).mockResolvedValueOnce({ analysis: { ...agentAnalysis().analysis, proposals: [] } } as ReturnType<typeof agentAnalysis>);
    agent.setDraft("Analisar risco de ruptura");
    expect(await agent.execute()).toBe(false);
    expect(agent.getSnapshot().analysis).toBeNull(); expect(agent.getSnapshot().receipts).toEqual([]); agent.dispose();
  });
  it("registra somente resposta validada e preserva a proposta ao trocar de assinante/página", async () => {
    const { agent, transport } = setup(); const subscriber = vi.fn(), unsubscribe = agent.subscribe(subscriber);
    agent.setDraft("Planeje as compras da demonstração."); expect(await agent.execute()).toBe(true);
    expect(agent.getSnapshot().receipts).toHaveLength(1); unsubscribe();
    const next = vi.fn(); agent.subscribe(next); expect(agent.getSnapshot().receipts).toHaveLength(1);
    expect(transport.execute).toHaveBeenCalledTimes(1); agent.dispose();
  });
  it("fonte importada impede prompt e revisão, sem chamar transporte", async () => {
    const { agent, source, transport, receipt } = setup(); source.commit(operationalFixture(), 0);
    agent.setDraft("CONTEUDO_PRIVADO_SINTETICO");
    expect(agent.getSnapshot().draft).toBe(""); expect(await agent.execute()).toBe(false);
    expect(await agent.review(receipt.action.id, "approve")).toBe(false);
    expect(transport.execute).not.toHaveBeenCalled(); expect(transport.review).not.toHaveBeenCalled(); agent.dispose();
  });
  it("troca de fonte cancela envio pendente e ignora resultado tardio", async () => {
    const { agent, source, transport, receipt } = setup(); let resolve!: (receipt: AgentReceipt) => void;
    vi.mocked(transport.execute).mockImplementation(() => new Promise((r) => { resolve = r; }));
    agent.setDraft("Planeje compras da demonstração."); const running = agent.execute();
    source.commit(operationalFixture(), 0); resolve(receipt);
    expect(await running).toBe(false); expect(agent.getSnapshot().receipts).toEqual([]);
    expect(vi.mocked(transport.execute).mock.calls[0][1].aborted).toBe(true); expect(agent.getSnapshot().draft).toBe(""); agent.dispose();
  });
  it("cliques repetidos não criam execuções ou revisões duplicadas", async () => {
    const { agent, transport, receipt } = setup(); agent.setDraft("Planeje compras da demo.");
    const first = agent.execute(); expect(await agent.execute()).toBe(false); await first;
    const review = agent.review(receipt.action.id, "approve"); expect(await agent.review(receipt.action.id, "approve")).toBe(false); await review;
    expect(transport.execute).toHaveBeenCalledTimes(1); expect(transport.review).toHaveBeenCalledTimes(1);
    expect(agent.getSnapshot().receipts[0].action.status).toBe("approved"); agent.dispose();
  });
  it("falhas ou resposta fictícia não são registradas", async () => {
    const { agent, transport, receipt } = setup(); agent.setDraft("Planeje compras da demo.");
    vi.mocked(transport.execute).mockRejectedValueOnce(new Error("falha da API"));
    expect(await agent.execute()).toBe(false); expect(agent.getSnapshot().receipts).toEqual([]);
    vi.mocked(transport.execute).mockResolvedValueOnce({ ...receipt, action: { ...receipt.action, budget: { ...receipt.action.budget, usedCents: 1 } } });
    expect(await agent.execute()).toBe(false); expect(agent.getSnapshot().receipts).toEqual([]); agent.dispose();
  });
  it("uma resposta da IA não pode registrar aprovação automática", async () => {
    const { agent, transport, receipt } = setup(); agent.setDraft("Planeje compras da demo.");
    vi.mocked(transport.execute).mockResolvedValue({ ...receipt, action: { ...receipt.action, status: "approved" } });
    expect(await agent.execute()).toBe(false); expect(agent.getSnapshot().receipts).toEqual([]); agent.dispose();
  });
  it("transporte não aceita fonte importada nem campos privados", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    const request = { source: "imported_local", requestId: crypto.randomUUID(), prompt: "CONTEUDO_PRIVADO_SINTETICO" } as unknown as AgentRequest;
    await expect(agentTransport.execute(request, new AbortController().signal)).rejects.toThrow();
    await expect(agentTransport.execute({ ...request, source: "demo", dataset: {} } as unknown as AgentRequest, new AbortController().signal)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it("payload transmitido contém apenas prompt demo, origem e UUID, sem parâmetros ou dados", async () => {
    const receipt = agentReceipt(), network = vi.fn().mockResolvedValue(new Response(JSON.stringify(receipt), { status: 200 }));
    vi.stubGlobal("fetch", network);
    await agentTransport.execute({ source: "demo", requestId: crypto.randomUUID(), prompt: "Planeje compras da demonstração." }, new AbortController().signal);
    const body = JSON.parse(network.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["prompt", "requestId", "source"]);
    expect(network.mock.calls[0][0]).toBe("/api/agente");
  });
});
describe("SDK e segredos restritos ao servidor", () => {
  const eslint = new ESLint();
  it.each([
    'import Groq from "groq-sdk";',
    'import { agentHandlers } from "@/lib/agent/server";',
    'import { executeDemoAgent } from "@/lib/agent/execution";',
  ])("bloqueia import em componente cliente: %s", async (code) => {
    const [result] = await eslint.lintText(code, { filePath: "src/components/agent-leak.tsx" });
    expect(result.messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  }, 20000);
});
