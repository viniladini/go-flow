// @vitest-environment happy-dom
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportSessionProvider, useImportSession, useImportWizard } from "@/components/import-session-provider";
import { AppShell } from "@/components/app-shell";
import { OperationalView, type OperationalSection } from "@/components/operational-view";
import { computeOperation, getOperationalDemo } from "@/lib/operations/service";
import { operationalFixture } from "../fixtures/operational";
import type { ImportSession } from "@/lib/flow-import/session";
import type { ImportWizard } from "@/lib/flow-import/wizard";
import type { OperationalWorker } from "@/lib/operations/resource";
import type { OperationalRequest, OperationalResponse } from "@/lib/operations/operations.worker";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
class LocalAnalysisWorker implements OperationalWorker {
  static delayed = false; static fail = false; static pending: (() => void)[] = [];
  onmessage: OperationalWorker["onmessage"] = null; onerror: OperationalWorker["onerror"] = null;
  stopped = false;
  terminate() { this.stopped = true; }
  postMessage(request: OperationalRequest) {
    const run = () => {
      if (this.stopped) return;
      const response: OperationalResponse = LocalAnalysisWorker.fail ? { kind: "error", revision: request.revision, message: "Falha sintética controlada" } : { kind: "result", revision: request.revision, result: computeOperation(request.operation) };
      this.onmessage?.({ data: response } as MessageEvent<OperationalResponse>);
    };
    if (LocalAnalysisWorker.delayed) LocalAnalysisWorker.pending.push(run); else queueMicrotask(run);
  }
}
let api: { session: ImportSession; wizard: ImportWizard };
const routes: Record<string, OperationalSection> = { "/": "overview", "/estoque": "stock", "/compras": "buying", "/oportunidades": "opportunities" };
function Pages() {
  const [route, setRoute] = useState("/");
  const { session } = useImportSession(), { wizard } = useImportWizard();
  useEffect(() => { api = { session, wizard }; }, [session, wizard]);
  return <div onClick={(e) => { const href = (e.target as Element).closest("a")?.getAttribute("href"); if (href && routes[href]) { e.preventDefault(); setRoute(href); } }}><AppShell><OperationalView section={routes[route]} /></AppShell></div>;
}
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  LocalAnalysisWorker.delayed = false; LocalAnalysisWorker.fail = false; LocalAnalysisWorker.pending = [];
  vi.stubGlobal("Worker", LocalAnalysisWorker);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Transmissão proibida"); }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ImportSessionProvider><Pages /></ImportSessionProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function navigate(route: string) { await act(async () => container.querySelector<HTMLAnchorElement>(`nav[aria-label="Navegação principal"] a[href="${route}"]`)!.click()); }
function importedCatalog() {
  const operation = operationalFixture("LOCAL-A", { budgetCents: 12000 }), second = operationalFixture("LOCAL-B");
  second.dataset.skus[0].status = "descontinuado";
  second.dataset.stocks.forEach((s) => { s.estoque_disponivel = 1000; });
  for (const key of ["skus", "sales", "stocks", "purchases"] as const) Object.assign(operation.dataset, { [key]: [...operation.dataset[key], ...second.dataset[key]] });
  return operation;
}
describe("quatro abas na fonte ativa", () => {
  it("exibe demo com 500 SKUs e planos nas quatro abas", async () => {
    for (const route of Object.keys(routes)) {
      await navigate(route);
      expect(container.querySelector('[data-operation-source="demo"]')).not.toBeNull();
      expect(container.querySelector('[data-source="goflow-demo-v1"]')).not.toBeNull();
    }
    await navigate("/estoque"); expect(container.textContent).toContain("500 SKUs");
    expect(container.querySelectorAll("tr[data-sku]")).toHaveLength(50);
    await navigate("/compras"); expect(container.textContent).toContain("Rascunhos determinísticos");
    expect(getOperationalDemo().buying?.proposals.length).toBeGreaterThan(0);
  });
  it("as quatro abas usam somente a importação, mantêm a sessão e retornam à demo ao limpar", async () => {
    const operation = importedCatalog();
    await act(async () => { api.session.commit(operation, api.session.getSnapshot().revision); });
    const expected = computeOperation(operation);
    for (const route of Object.keys(routes)) {
      await navigate(route);
      expect(container.querySelector('[data-operation-source="imported_local"]')).not.toBeNull();
      expect(container.querySelector('[data-source="goflow-imported-v1"]')).not.toBeNull();
      expect(container.textContent).not.toContain("DEMO-FLOW-");
      expect(api.session.getSnapshot().operation).toBe(operation);
    }
    expect(container.textContent).toContain("LOCAL-B");
    await navigate("/estoque"); expect(container.querySelectorAll("tr[data-sku]")).toHaveLength(2);
    expect(container.textContent).toContain("Vendas · 30 dias");
    await navigate("/compras"); expect(container.textContent).toContain("LOCAL-A");
    expect(container.textContent).toContain(expected.model.origin.label);
    expect(expected.buying?.proposals.map((p) => p.sku)).toEqual(["LOCAL-A"]);
    await act(async () => api.wizard.clear());
    expect(container.querySelector('[data-operation-source="demo"]')).not.toBeNull();
    expect(container.textContent).not.toContain("LOCAL-A");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enquanto calcula importação ou ocorre erro, nunca mostra indicadores demonstrativos", async () => {
    LocalAnalysisWorker.delayed = true;
    await act(async () => { api.session.commit(importedCatalog(), 0); });
    expect(container.textContent).toContain("Calculando a fonte ativa");
    expect(container.querySelector('[data-source="goflow-demo-v1"]')).toBeNull();
    LocalAnalysisWorker.fail = true;
    await act(async () => { LocalAnalysisWorker.pending.splice(0).forEach((f) => f()); });
    expect(container.textContent).toContain("Indicadores indisponíveis");
    expect(container.querySelector('[data-operation-source="demo"]')).toBeNull();
    LocalAnalysisWorker.fail = false; LocalAnalysisWorker.delayed = false;
    const retry = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Recalcular localmente"))!;
    await act(async () => retry.click());
    expect(container.querySelector('[data-operation-source="imported_local"]')).not.toBeNull();
  });
  it("respeita janela informada e mostra dados insuficientes sem copiar valores da demo", async () => {
    const operation = operationalFixture("LOCAL-JANELA", { demandWindowDays: 60 });
    operation.dataset.sales.splice(5, 1);
    await act(async () => { api.session.commit(operation, 0); }); await navigate("/estoque");
    expect(container.textContent).toContain("Vendas · 60 dias");
    expect(container.querySelector("tr[data-sku] .risk-badge")?.textContent).toBe("Dados insuficientes");
    await navigate("/compras"); expect(container.textContent).toContain("Nenhuma proposta viável");
    expect(container.textContent).not.toContain("DEMO-FLOW-");
  });
});
