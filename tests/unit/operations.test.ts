import { afterEach, describe, expect, it, vi } from "vitest";
import { beforeEach } from "vitest";
import { createOperationalDemo } from "@/lib/operations/demo";
import { computeOperation, getOperationalDemo } from "@/lib/operations/service";
import { createOperationalResource, type OperationalWorker } from "@/lib/operations/resource";
import { createImportSession } from "@/lib/flow-import/session";
import { createOperationalBuyingPlan } from "@/lib/smart-buying";
import { assertNormalizedInput } from "@/lib/smart-buying/policy";
import { analyzeOperationalDataset, operationalAnalyticsConfig } from "@/lib/analytics";
import { shiftDate } from "@/lib/analytics/math";
import { formatMoney, formatPercentBps } from "@/lib/dashboard/format";
import { operationalFixture } from "../fixtures/operational";
import type { ImportedOperation } from "@/lib/flow-import/types";
import type { OperationalBuyingPolicy } from "@/lib/smart-buying/types";
import type { OperationalRequest, OperationalResponse } from "@/lib/operations/operations.worker";

const buying = (operation: ImportedOperation) => createOperationalBuyingPlan({ dataset: operation.dataset, origin: "provided_dataset", policy: operation.parameters });
beforeEach(() => vi.setSystemTime(new Date("2026-11-08T15:00:00Z")));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("demo operacional independente", () => {
  it("gera 500 SKUs, 120 dias de posições, fornecedores e compras válidos", () => {
    const { dataset } = createOperationalDemo();
    expect(dataset.skus).toHaveLength(500); expect(dataset.stocks).toHaveLength(60000);
    expect(dataset.sales.length).toBeGreaterThan(59000); expect(dataset.suppliers).toHaveLength(8);
    expect(() => assertNormalizedInput(dataset)).not.toThrow();
    expect(dataset.purchases.filter((p) => !p.data_recebimento)).toHaveLength(100);
    expect(dataset.skus.some((s) => s.status === "descontinuado")).toBe(true);
  });
  it("é determinística, para um relógio controlado, sem aleatoriedade ou rede", () => {
    const first = createOperationalDemo();
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Aleatoriedade proibida"); });
    try { expect(createOperationalDemo()).toEqual(first); } finally { random.mockRestore(); }
    expect(first.dataset.stocks.every((r) => r.data <= first.parameters.referenceDate)).toBe(true);
    expect(first.dataset.sales.every((r) => r.data <= first.parameters.referenceDate)).toBe(true);
  });
  it("concilia cada saldo com vendas e recebimentos físicos, sem creditar pendências", () => {
    const { dataset } = createOperationalDemo();
    const sales = new Map(dataset.sales.map((r) => [r.sku + r.data, r.unidades_vendidas]));
    const received = new Map<string, number>();
    for (const p of dataset.purchases) if (p.data_recebimento) received.set(p.sku + p.data_recebimento, (received.get(p.sku + p.data_recebimento) ?? 0) + p.quantidade_unidades);
    const previous = new Map<string, number>();
    for (const stock of dataset.stocks) {
      if (previous.has(stock.sku)) expect(stock.estoque_disponivel).toBe(previous.get(stock.sku)! + (received.get(stock.sku + stock.data) ?? 0) - (sales.get(stock.sku + stock.data) ?? 0));
      expect(stock.estoque_disponivel).toBeGreaterThanOrEqual(0); previous.set(stock.sku, stock.estoque_disponivel);
    }
  });
  it("deriva indicadores, oportunidades e compras do motor", () => {
    const demo = createOperationalDemo(), result = getOperationalDemo();
    const analytics = analyzeOperationalDataset(demo.dataset, operationalAnalyticsConfig(demo.parameters.referenceDate, demo.parameters.demandWindowDays));
    expect(result.model.rows).toHaveLength(500);
    expect(result.model.kpis.find((k) => k.id === "inventory")?.value).toBe(formatMoney(analytics.dashboard.inventoryValueCents));
    expect(result.model.risks.reduce((sum, risk) => sum + risk.count, 0)).toBe(500);
    expect(new Set(result.opportunities.map((o) => o.kind)).size).toBe(3);
    expect(result.buying?.proposals.length).toBeGreaterThan(0);
    expect(result.buying?.budget.usedCents).toBeLessThanOrEqual(demo.parameters.budgetCents);
  }, 15000);
});
describe("compras parametrizadas sem fallback do case", () => {
  it("preserva centavos no limite seguro e casas decimais da meta na apresentação", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER).replace(/\s/g, " ")).toBe("R$ 90.071.992.547.409,91");
    expect(formatMoney(1).replace(/\s/g, " ")).toBe("R$ 0,01");
    expect(formatPercentBps(9725)).toBe("97,25%");
  });
  it("usa referência, orçamento, horizonte e taxas explicitamente informados", () => {
    const operation = operationalFixture("IMPORT-TESTE-A", { budgetCents: 300, serviceBps: 9100, annualCapitalBps: 123, monthlyStorageBps: 85 });
    const plan = buying(operation);
    expect(plan.config.operational).toEqual(operation.parameters);
    expect(plan.budget).toMatchObject({ totalCents: 300, usedCents: 250, remainingCents: 50, existingOrdersDeductedCents: 0 });
    expect(plan.proposals[0]).toMatchObject({ orderDate: operation.parameters.horizonStart, leadTimeDays: 10 });
    expect(plan.proposals[0].estimatedArrivalDate).toBe(shiftDate(operation.parameters.horizonStart, 10));
    expect(plan.proposals[0].projection.campaigns).toEqual([]);
    expect(plan.config.scenario.safetyStock).toBe("none");
    expect(plan.alerts.some((a) => a.message.includes("91%"))).toBe(true);
  });
  it("usa datas distintas tanto da demo quanto do case, sem teto temporal herdado", () => {
    const operation = operationalFixture("IMPORT-OUTRA-BASE", { referenceDate: "2041-08-17", horizonStart: "2041-08-20", horizonEnd: "2041-10-04", serviceBps: 9725 });
    const result = computeOperation(operation);
    expect(result.model.referenceDate).toBe("2041-08-17");
    expect(result.buying?.config).toMatchObject({ referenceDate: "2041-08-17", horizonStart: "2041-08-20", horizonEnd: "2041-10-04" });
    expect(result.buying?.proposals[0].estimatedArrivalDate).toBe("2041-08-30");
    expect(result.buying?.config.operational?.serviceBps).toBe(9725);
  });
  it("respeita MOQ de duas caixas e custo por unidade física exatamente no orçamento", () => {
    const plan = buying(operationalFixture("IMPORT-CAIXA", { budgetCents: 12000 }, true));
    expect(plan.proposals[0]).toMatchObject({ purchaseUnit: "cx 12 un", quantityPurchaseUnits: 4, physicalUnits: 48, estimatedCostCents: 12000 });
    expect(plan.budget.remainingCents).toBe(0);
  });
  it.each([0, 1, 249, 250, 251, 12000, 300000000])("não excede orçamento configurado %s, inclusive acima do teto legado", (budgetCents) => {
    const result = buying(operationalFixture("IMPORT-TESTE-A", { budgetCents }));
    const sum = result.proposals.reduce((total, p) => total + p.estimatedCostCents, 0);
    expect(result.budget.totalCents).toBe(budgetCents); expect(result.budget.usedCents).toBe(sum);
    expect(sum).toBeLessThanOrEqual(budgetCents); expect(result.budget.remainingCents).toBe(budgetCents - sum);
    expect(Number.isSafeInteger(sum)).toBe(true);
  });
  it("não usa taxas do case quando custos informados são zero", () => {
    const result = buying(operationalFixture("IMPORT-CAIXA", { budgetCents: 12000, annualCapitalBps: 0, monthlyStorageBps: 0 }, true));
    expect(result.proposals[0].projection.carryingCostCents).toBe(0);
  });
  it.each(["referenceDate", "horizonStart", "horizonEnd", "budgetCents", "serviceBps", "annualCapitalBps", "monthlyStorageBps", "maxDiscountBps", "demandWindowDays"] as const)("recusa política incompleta: %s", (key) => {
    const operation = operationalFixture();
    const policy = { ...operation.parameters, [key]: undefined } as unknown as OperationalBuyingPolicy;
    expect(() => createOperationalBuyingPlan({ dataset: operation.dataset, origin: "provided_dataset", policy })).toThrow();
  });
  it("não credita nem desconta pedidos pendentes, inclusive recebimento futuro", () => {
    const operation = operationalFixture(), baseline = buying(operation);
    operation.dataset.purchases.push({ ...operation.dataset.purchases[0], po_id: "IMPORT-PENDENTE", data_recebimento: null, quantidade: 1000, quantidade_unidades: 1000 });
    operation.dataset.purchases.push({ ...operation.dataset.purchases[0], po_id: "IMPORT-FUTURO", data_recebimento: operation.parameters.horizonEnd });
    const result = buying(operation);
    expect(result.proposals).toEqual(baseline.proposals); expect(result.budget).toEqual(baseline.budget);
    expect(result.assessments[0].pendingOrdersNotCredited).toBe(2);
    expect(result.proposals[0].leadTimeEvidence.sampleSize).toBe(3);
  });
  it("bloqueia chegada depois do horizonte e não repõe descontinuados", () => {
    const operation = operationalFixture("IMPORT-CURTO", { horizonEnd: "2032-04-05" });
    expect(buying(operation).assessments[0].status).toBe("arrival_after_horizon");
    operation.dataset.skus[0].status = "descontinuado";
    expect(buying(operation).assessments[0].status).toBe("discontinued");
    expect(buying(operation).proposals).toEqual([]);
  });
  it("exclui dados futuros e mantém resultados determinísticos", () => {
    const operation = operationalFixture(), baseline = buying(operation);
    operation.dataset.stocks.push({ ...operation.dataset.stocks[0], data: shiftDate(operation.parameters.referenceDate, 1), estoque_disponivel: 100000 });
    operation.dataset.sales.push({ ...operation.dataset.sales[0], data: shiftDate(operation.parameters.referenceDate, 1), unidades_vendidas: 100000 });
    expect(buying(operation)).toEqual(baseline); expect(buying(operation)).toEqual(buying(operation));
  });
  it("diferencia histórico insuficiente de falta de recursos", () => {
    const operation = operationalFixture(); operation.dataset.sales = [];
    expect(buying(operation).assessments[0].status).toBe("insufficient_data");
    expect(buying(operationalFixture("IMPORT-TESTE-A", { budgetCents: 0 })).assessments[0].selectionStatus).toBe("financial_infeasible");
  });
});
class ControlledOperationalWorker implements OperationalWorker {
  messages: OperationalRequest[] = []; stopped = false;
  onmessage: OperationalWorker["onmessage"] = null; onerror: OperationalWorker["onerror"] = null;
  postMessage(message: OperationalRequest) { this.messages.push(message); }
  terminate() { this.stopped = true; }
  emit(data: OperationalResponse) { this.onmessage?.({ data } as MessageEvent<OperationalResponse>); }
}
describe("fonte ativa única e isolamento", () => {
  it("não mistura operações nem altera entradas ou depende de APIs", () => {
    vi.stubGlobal("fetch", () => { throw new Error("Rede proibida"); });
    const operation = operationalFixture(), before = structuredClone(operation), result = computeOperation(operation);
    expect(operation).toEqual(before); expect(result.source).toBe("imported_local");
    expect(result.model.rows.map((r) => r.sku)).toEqual(["IMPORT-TESTE-A"]);
    expect(result.buying?.origin).toBe("provided_dataset");
    expect(getOperationalDemo().model.rows).toHaveLength(500);
  });
  it("troca fonte, ignora cálculos obsoletos e limpar restaura apenas a demo", () => {
    const session = createImportSession(), workers: ControlledOperationalWorker[] = [];
    const resource = createOperationalResource(session, () => { const w = new ControlledOperationalWorker(); workers.push(w); return w; });
    resource.start();
    const a = operationalFixture("IMPORT-A"), b = operationalFixture("IMPORT-B");
    session.commit(a, 0); expect(resource.getSnapshot()).toMatchObject({ status: "loading", result: null });
    session.commit(b, 1); workers[0].emit({ kind: "result", revision: 1, result: computeOperation(a) });
    expect(workers[0].stopped).toBe(true); expect(resource.getSnapshot().result).toBeNull();
    workers[1].emit({ kind: "result", revision: 2, result: computeOperation(b) });
    expect(resource.getSnapshot().result?.model.rows.map((r) => r.sku)).toEqual(["IMPORT-B"]);
    session.clear();
    expect(resource.getSnapshot().result?.source).toBe("demo");
    expect(resource.getSnapshot().result?.model.rows.every((r) => r.sku.startsWith("DEMO-FLOW-"))).toBe(true);
    resource.dispose();
  });
  it("falha de Worker ou resultado de outra fonte nunca usa números da demo", () => {
    const session = createImportSession(); session.commit(operationalFixture(), 0);
    const worker = new ControlledOperationalWorker();
    const resource = createOperationalResource(session, () => worker);
    expect(resource.getSnapshot().result).toBeNull(); resource.start();
    worker.emit({ kind: "result", revision: 1, result: getOperationalDemo() });
    expect(resource.getSnapshot()).toMatchObject({ status: "error", result: null }); resource.dispose();
    const unavailable = createOperationalResource(session, () => { throw new Error("Sem Worker"); });
    unavailable.start(); expect(unavailable.getSnapshot()).toMatchObject({ status: "error", result: null }); unavailable.dispose();
  });
  it("fonte importada vazia permanece vazia, sem preencher com registros sintéticos", () => {
    const operation = operationalFixture(); Object.assign(operation.dataset, { skus: [], sales: [], stocks: [], purchases: [], suppliers: [] });
    const result = computeOperation(operation);
    expect(result.model.rows).toEqual([]); expect(result.opportunities).toEqual([]); expect(result.buying?.proposals).toEqual([]);
  });
});
