// @vitest-environment happy-dom
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportSessionProvider, useAgentSession, useImportSession } from "@/components/import-session-provider";
import { AgentWorkspace } from "@/components/agent-workspace";
import { agentTransport } from "@/lib/agent/client";
import { agentReceipt } from "../fixtures/agent";
import { operationalFixture } from "../fixtures/operational";
import type { AgentSession } from "@/lib/agent/session";
import type { ImportSession } from "@/lib/flow-import/session";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
let current: { source: ImportSession; agent: AgentSession };
function Pages() {
  const [central, setCentral] = useState(false);
  const { session } = useImportSession(), { agent } = useAgentSession();
  useEffect(() => { current = { source: session, agent }; }, [session, agent]);
  return <div onClick={(event) => { const href = (event.target as Element).closest("a")?.getAttribute("href"); if (href === "/acoes" || href === "/agente") { event.preventDefault(); setCentral(href === "/acoes"); } }}><AgentWorkspace key={central ? "central" : "agent"} central={central} /></div>;
}
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(agentTransport, "execute").mockResolvedValue(agentReceipt());
  vi.spyOn(agentTransport, "review").mockImplementation(async (request) => ({ ...agentReceipt().action, status: request.decision === "approve" ? "approved" : "rejected", reviewedAt: "2032-01-01T12:01:00.000Z" }));
  // Operational analysis may be unavailable in this isolated agent view; it must never use HTTP.
  vi.stubGlobal("Worker", class { constructor() { throw new Error("Worker não utilizado por este teste"); } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede externa proibida em teste de UI"); }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ImportSessionProvider><Pages /></ImportSessionProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("go.agent e Central de Ações", () => {
  it("sugestão preenche o pedido para revisão sem executar ou transmitir", async () => {
    const suggestion = container.querySelector<HTMLButtonElement>(".agent-suggestions button")!;
    await act(async () => suggestion.click());
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(suggestion.textContent);
    expect(document.activeElement?.id).toBe("agent-prompt");
    expect(agentTransport.execute).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  }, 15000);
  it("mascote acompanha somente uma execução real e permanece estático em repouso", async () => {
    expect(container.querySelector('.agent-heading-orb svg[aria-label="Flow Orb, mascote do go.agent"]')).not.toBeNull();
    expect(container.querySelector(".agent-heading-orb")?.hasAttribute("data-running")).toBe(false);
    let complete!: (value: ReturnType<typeof agentReceipt>) => void;
    vi.mocked(agentTransport.execute).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await act(async () => { current.agent.setDraft("Planeje compras da demonstração."); void current.agent.execute(); });
    expect(container.querySelector(".agent-heading-orb")?.getAttribute("data-running")).toBe("true");
    await act(async () => complete(agentReceipt()));
    expect(container.querySelector(".agent-heading-orb")?.hasAttribute("data-running")).toBe(false);
  }, 15000);
  it("enviar solicitação cria uma proposta verificável e preserva a sessão ao abrir a Central", async () => {
    await act(async () => current.agent.setDraft("Planeje compras da demonstração."));
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("registrada na Central");
    expect(container.querySelector("[data-action-id]")).not.toBeNull();
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/acoes"]')!.click());
    expect(container.querySelector("h1")?.textContent).toBe("Central de ações");
    expect(container.textContent).toContain("Aguardando revisão");
    expect(container.textContent).toContain("plan_demo_purchases");
    expect(container.textContent).not.toContain("f".repeat(64));
    const approve = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Aprovar proposta"))!;
    await act(async () => approve.click());
    expect(container.textContent).toContain("Aprovada · demonstração");
    expect(container.textContent).toContain("Nenhuma compra foi executada");
    expect(agentTransport.review).toHaveBeenCalledOnce();
  }, 15000);
  it("fonte importada não apresenta formulário nem envia prompt ou revisão", async () => {
    await act(async () => { current.source.commit(operationalFixture(), 0); });
    expect(container.textContent).toContain("IA externa indisponível na fonte importada");
    expect(container.querySelector("textarea")).toBeNull(); expect(container.querySelector("form")).toBeNull();
    await act(async () => { current.agent.setDraft("CONTEUDO_PRIVADO_SINTETICO"); await current.agent.execute(); });
    expect(agentTransport.execute).not.toHaveBeenCalled(); expect(agentTransport.review).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("erro da API mostra falha sem sucesso ou proposta fictícia", async () => {
    vi.mocked(agentTransport.execute).mockRejectedValue(new Error("Falha controlada"));
    await act(async () => { current.agent.setDraft("Planeje compras da demo."); await current.agent.execute(); });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector("[data-action-id]")).toBeNull(); expect(container.textContent).toContain("Nenhuma execução registrada");
  });
});
