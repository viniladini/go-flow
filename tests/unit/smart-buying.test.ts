import { describe, expect, it, vi } from "vitest";
import { createSmartBuyingPlan, SYNTHETIC_RULES, generateNeeds, validateProposals } from "@/lib/smart-buying";
import { createDemoSmartBuyingPlan } from "@/lib/smart-buying/demo";
import { resolveBuyingConfig } from "@/lib/smart-buying/policy";
import { buyingFixture, syntheticOrder } from "../fixtures/buying";
import type { BuyingInput } from "@/lib/smart-buying/types";
import type { PurchaseUnit } from "@/lib/analytics/types";

vi.mock("node:fs/promises", () => ({
  readFile: () => { throw new Error("Não ler arquivos confidenciais em testes."); },
  writeFile: () => { throw new Error("Não escrever arquivos em testes."); },
}));
const input = (dataset = buyingFixture(), options: Partial<Omit<BuyingInput, "dataset" | "origin">> = {}): BuyingInput => ({
  dataset, origin: "independent_synthetic", ...options,
});
const plan = (dataset = buyingFixture(), options: Partial<Omit<BuyingInput, "dataset" | "origin">> = {}) => createSmartBuyingPlan(input(dataset, options));

describe("orçamento e MOQ", () => {
  it("com orçamento zero não emite proposta nem confunde falta de recursos com dados insuficientes", () => {
    const result = plan(undefined, { budgetCents: 0 });
    expect(result.proposals).toEqual([]);
    expect(result.budget).toMatchObject({ usedCents: 0, remainingCents: 0 });
    expect(result.assessments[0]).toMatchObject({ status: "eligible", selectionStatus: "financial_infeasible" });
  });
  it("rejeita o menor lote quando o orçamento é insuficiente", () => {
    const result = plan(undefined, { budgetCents: 249 });
    expect(result.proposals).toHaveLength(0);
    expect(result.alternatives.every((a) => a.reason === "financial_infeasible")).toBe(true);
  });
  it("compra exatamente no limite: 4 caixas de 12, MOQ 2 caixas, custo físico R$ 2,50", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: 1, unit: "cx 12 un", moq: 2 }]), { budgetCents: 12000 });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ quantityPurchaseUnits: 4, physicalUnits: 48, purchaseUnit: "cx 12 un", estimatedCostCents: 12000, status: "draft", humanApprovalRequired: true });
    expect(result.budget).toMatchObject({ totalCents: 12000, usedCents: 12000, remainingCents: 0 });
  });
  it.each([
    ["un", 1, 750, 3, 3, 750],
    ["un", 4, 2300, 8, 8, 2000],
    ["cx 12 un", 2, 15000, 4, 48, 12000],
  ] as const)("respeita unidade %s, MOQ %s e orçamento %s", (unit, moq, budgetCents, purchasing, physical, cost) => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: 1, unit, moq }]), { budgetCents });
    expect(result.proposals[0]).toMatchObject({ quantityPurchaseUnits: purchasing, physicalUnits: physical, estimatedCostCents: cost });
    expect(result.budget.remainingCents).toBe(budgetCents - cost);
  });
  it("distribui orçamento entre compras concorrentes e usa desempate estável por SKU", () => {
    const result = plan(buyingFixture([{ id: "SYN-B", stock: 1, costCents: 100, leadDays: [1, 1, 1] }, { id: "SYN-A", stock: 1, costCents: 100, leadDays: [1, 1, 1] }]), { budgetCents: 500 });
    expect(result.budget.usedCents).toBe(500);
    expect(result.proposals.map((p) => p.sku)).toEqual(["SYN-A", "SYN-B"]);
    expect(result.proposals[0].physicalUnits).toBeGreaterThan(result.proposals[1].physicalUnits);
    expect(result.globallyOptimal).toBe(false);
  });
  it("prioriza déficit remediável mais cedo e não promete ótimo global", () => {
    const result = plan(buyingFixture([{ id: "URGENTE", stock: 1 }, { id: "POSTERIOR", stock: 50 }]), { budgetCents: 250 });
    expect(result.proposals[0].sku).toBe("URGENTE");
    expect(result.alternatives.some((a) => a.reason === "budget_competition")).toBe(true);
    expect(result.methodology).toBe("deterministic_greedy_upgrades_v1");
  });
  it("recusa unidade desconhecida em vez de adivinhar conversão", () => {
    const data = buyingFixture();
    data.skus[0].unidade_compra = "pallet" as PurchaseUnit;
    expect(() => plan(data)).toThrow("Unidade de compra desconhecida");
  });
  it("bloqueia custo zero sem inventar cotação gratuita", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", costCents: 0 }]));
    expect(result.assessments[0].status).toBe("invalid_constraints");
    expect(result.proposals).toEqual([]);
  });
  it("mantém centavos exatos para custo unitário de um centavo", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", costCents: 1, stock: 1 }]), { budgetCents: 37 });
    expect(result.budget).toMatchObject({ usedCents: 37, remainingCents: 0 });
    expect(result.proposals[0].physicalUnits).toBe(37);
  });
  it.each([-1, 0.5, NaN, Infinity, 197000001])("recusa orçamento inválido %s", (budgetCents) => {
    expect(() => plan(undefined, { budgetCents })).toThrow();
  });
});

describe("recebimentos, pendências e integridade temporal", () => {
  it("não credita pedido pendente sem data nem o desconta do orçamento", () => {
    const baseline = plan();
    const result = plan(buyingFixture(undefined, { "compras.csv": [syntheticOrder()] }));
    expect(result.proposals).toEqual(baseline.proposals);
    expect(result.assessments[0]).toMatchObject({ pendingOrdersNotCredited: 1, pendingUnitsNotCredited: 1000 });
    expect(result.budget.existingOrdersDeductedCents).toBe(0);
    expect(result.alerts.some((a) => a.code === "pending_orders_uncertain")).toBe(true);
  });
  it("recebido até a base compõe lead time, mas não é adicionado novamente ao saldo", () => {
    const result = plan(buyingFixture(undefined, { "compras.csv": [syntheticOrder({ data_pedido: "2037-04-08", data_recebimento: "2037-04-18" })] }));
    expect(result.proposals[0].leadTimeEvidence.sampleSize).toBe(4);
    expect(result.assessments[0].baseline?.servedUnits).toBe(9);
    expect(result.assessments[0].pendingOrdersNotCredited).toBe(0);
  });
  it("recebimento futuro permanece incerto e não altera o estoque ou a amostra", () => {
    const baseline = plan();
    const result = plan(buyingFixture(undefined, { "compras.csv": [syntheticOrder({ data_recebimento: "2037-04-21" })] }));
    expect(result.proposals).toEqual(baseline.proposals);
    expect(result.proposals[0].leadTimeEvidence.sampleSize).toBe(3);
    expect(result.assessments[0].pendingOrdersNotCredited).toBe(1);
  });
  it("não usa vendas, estoque ou pedidos emitidos depois da base", () => {
    const baseline = plan();
    const result = plan(buyingFixture(undefined, {
      "vendas_diarias.csv": [{ sku: "SYN-A", data: "2037-04-19", unidades_vendidas: "99999", receita: "99999" }],
      "estoque_diario.csv": [{ sku: "SYN-A", data: "2037-04-19", estoque_disponivel: "99999" }],
      "compras.csv": [syntheticOrder({ data_pedido: "2037-04-20", data_recebimento: "2037-04-21" })],
    }));
    expect(result.proposals).toEqual(baseline.proposals);
    expect(result.budget).toEqual(baseline.budget);
  });
  it("distingue lead time zero de ausência de amostra", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", leadDays: [0, 0, 0] }]));
    expect(result.proposals[0]).toMatchObject({ leadTimeDays: 0, estimatedArrivalDate: "2037-04-20" });
    const absent = plan(buyingFixture([{ id: "SYN-A", leadDays: [] }]));
    expect(absent.assessments[0].status).toBe("insufficient_data");
  });
  it("avisa que o lead time não permite atender Black Friday sem alegar chegada confirmada", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: 1, leadDays: [70, 70, 70] }]));
    expect(result.alerts.some((a) => a.code === "arrival_after_black_friday")).toBe(true);
    expect(result.proposals[0].estimatedArrivalDate).toBe("2037-06-29");
    expect(result.proposals[0].projection.campaigns.find((c) => c.campaign === "black_friday")?.servedUnits).toBe(0);
    expect(result.proposals[0].confidence).toBe("conditional");
  });
  it("não compra quando a chegada estimada ocorre após o horizonte", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", leadDays: [100, 100, 100] }]));
    expect(result.proposals).toHaveLength(0);
    expect(result.assessments[0].status).toBe("arrival_after_horizon");
  });
  it("respeita a data da proposta dentro do horizonte inclusivo", () => {
    expect(() => plan(undefined, { orderDate: "2037-04-19" })).toThrow();
    expect(() => plan(undefined, { orderDate: "2037-07-19" })).toThrow();
    const result = plan(buyingFixture([{ id: "SYN-A", leadDays: [0, 0, 0] }]), { orderDate: "2037-07-18" });
    expect(result.proposals.every((p) => p.orderDate === "2037-07-18")).toBe(true);
    expect(result.config.horizonEnd).toBe("2037-07-18");
  });
});

describe("demanda, risco e hipóteses", () => {
  it("separa descontinuados para avaliação de destinação sem propor desconto ou compra", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", status: "descontinuado" }]));
    expect(result.proposals).toEqual([]);
    expect(result.dispositionOpportunities[0]).toMatchObject({ sku: "SYN-A", action: "manual_disposition_review" });
    expect(result.assessments[0].status).toBe("discontinued");
  });
  it("não inventa previsão para dias ausentes ou censura", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", missingSaleDay: 1 }]));
    expect(result.proposals).toEqual([]);
    expect(result.assessments[0]).toMatchObject({ status: "insufficient_data", selectionStatus: "not_applicable" });
  });
  it("preserva saldo negativo como anomalia, sem somar ou converter para disponibilidade", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: -3 }]));
    expect(result.proposals).toEqual([]);
    expect(result.assessments[0]).toMatchObject({ status: "negative_stock", baseline: null });
    expect(result.budget.usedCents).toBe(0);
  });
  it("não compra com proxy zero sem benefício estimável", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", dailyUnits: 0 }]));
    expect(result.proposals).toHaveLength(0);
    expect(result.assessments[0].status).toBe("zero_observed_demand");
  });
  it("sazonalidade é hipótese explícita e altera só as projeções", () => {
    const base = plan();
    const result = plan(undefined, { scenario: { name: "Hipótese BF 2x e Natal 1,5x", blackFridayMultiplierBps: 20000, christmasMultiplierBps: 15000 } });
    expect(base.proposals[0].projection.demandUnits).toBe(90);
    expect(result.proposals[0].projection.demandUnits).toBe(106);
    expect(result.alerts.some((a) => a.code === "hypothetical_seasonality")).toBe(true);
    expect(result.proposals[0].benefit.interpretation).toBe("conditional_scenario_improvement");
  });
  it("buffer usa variabilidade calculável sob hipótese normal, sem garantir a meta", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", variableSales: true, leadDays: [4, 5, 6] }]));
    expect(result.assessments[0].safetyStockUnits).toBe(6);
    expect(result.alerts.some((a) => a.message.includes("96,5% não é garantia"))).toBe(true);
    const noBuffer = plan(buyingFixture([{ id: "SYN-A", variableSales: true, leadDays: [4, 5, 6] }]), { scenario: { safetyStock: "none" } });
    expect(noBuffer.assessments[0].safetyStockUnits).toBe(0);
  });
  it("não compra estoque sem necessidade nem buffer adicional", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: 1000 }]));
    expect(result.proposals).toEqual([]);
    expect(result.assessments[0].status).toBe("no_need");
  });
  it("pode proteger buffer sem afirmar ganho de vendas nominal", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: 185, variableSales: true, leadDays: [4, 5, 6] }]));
    expect(result.proposals[0].benefit.additionalServedUnits).toBe(0);
    expect(result.proposals[0].benefit.addedSafetyBufferUnits).toBeGreaterThan(0);
  });
});

describe("validação independente e estabilidade", () => {
  it("recusa adulteração de centavos, MOQ, projeções ou duplicação de SKU", () => {
    const request = input();
    const result = createSmartBuyingPlan(request);
    const config = resolveBuyingConfig(request), needs = generateNeeds(request.dataset, config).needs;
    const p = result.proposals[0];
    expect(validateProposals([{ ...p, estimatedCostCents: p.estimatedCostCents + 1 }], needs, config).valid).toBe(false);
    expect(validateProposals([{ ...p, quantityPurchaseUnits: p.quantityPurchaseUnits + 0.5 }], needs, config).valid).toBe(false);
    expect(validateProposals([{ ...p, projection: { ...p.projection, servedUnits: 99999 } }], needs, config).valid).toBe(false);
    expect(validateProposals([p, p], needs, config).errors).toContain("duplicate_sku:SYN-A");
  });
  it("rejeita conjunto de propostas válidas cujo total excede o orçamento", () => {
    const request = input(buyingFixture([{ id: "SYN-A" }, { id: "SYN-B" }]));
    const result = createSmartBuyingPlan(request), config = resolveBuyingConfig(request);
    const needs = generateNeeds(request.dataset, config).needs;
    expect(validateProposals(result.proposals, needs, { ...config, budgetCents: 1 }).errors).toContain("budget_exceeded");
  });
  it("é estável entre execuções e permutações sem alterar os dados de entrada", () => {
    const data = buyingFixture([{ id: "SYN-B", stock: 1 }, { id: "SYN-A", stock: 1 }]);
    const before = structuredClone(data), a = plan(data, { budgetCents: 12000 });
    expect(plan(data, { budgetCents: 12000 })).toEqual(a);
    expect(data).toEqual(before);
    const shuffled = structuredClone(data);
    shuffled.skus.reverse(); shuffled.sales.reverse(); shuffled.stocks.reverse(); shuffled.purchases.reverse();
    expect(plan(shuffled, { budgetCents: 12000 })).toEqual(a);
  });
  it("não aceita chaves duplicadas não normalizadas silenciosamente", () => {
    const data = buyingFixture(); data.sales.push({ ...data.sales[0] });
    expect(() => plan(data)).toThrow("duplicatas");
  });
  it("mantém dinheiro íntegro e nunca excede o orçamento em uma grade de concorrência", () => {
    const data = buyingFixture([{ id: "SYN-A", moq: 3, costCents: 29, stock: 1 }, { id: "SYN-B", unit: "cx 12 un", moq: 2, costCents: 31, stock: 2 }]);
    for (let budgetCents = 0; budgetCents <= 10000; budgetCents += 137) {
      const result = plan(data, { budgetCents });
      const sum = result.proposals.reduce((total, p) => total + p.estimatedCostCents, 0);
      expect(sum).toBe(result.budget.usedCents);
      expect(sum).toBeLessThanOrEqual(budgetCents);
      expect(result.budget.remainingCents).toBe(budgetCents - sum);
      expect(Number.isSafeInteger(sum)).toBe(true);
      for (const p of result.proposals) {
        const sku = data.skus.find((s) => s.sku === p.sku)!;
        expect(p.quantityPurchaseUnits % sku.moq).toBe(0);
        expect(p.estimatedCostCents).toBe(p.physicalUnits * sku.custo_unitario_centavos);
      }
    }
  });
  it("o demonstrador usa somente fixtures independentes, sem acesso a arquivos ou interface", () => {
    const result = createDemoSmartBuyingPlan({ budgetCents: 50000 });
    expect(result.origin).toBe("independent_synthetic");
    expect(result.proposals.every((p) => p.sku.startsWith("DEMO-"))).toBe(true);
    expect(result.budget.usedCents).toBeLessThanOrEqual(50000);
    expect(result.requiresHumanApproval).toBe(true);
  });
  it("mantém as constantes independentes do exemplo sintético", () => {
    expect(SYNTHETIC_RULES).toMatchObject({ referenceDate: "2037-04-18", horizonStart: "2037-04-20", horizonEnd: "2037-07-18", maxBudgetCents: 86400000, targetServiceBps: 9650, annualCapitalBps: 1350, monthlyStorageBps: 85, maxLiquidationDiscountBps: 2750 });
  });
});


it("usa o teto sintético sem excedê-lo mesmo com vários SKUs de custo alto", () => {
  const data = buyingFixture([{ id: "SYN-A", stock: 10, costCents: 3_100_000 }, { id: "SYN-B", stock: 10, costCents: 3_100_000 }]);
  data.skus.forEach((sku) => { sku.preco_venda_centavos = 6_200_000; });
  const result = plan(data);
  expect(result.budget.totalCents).toBe(86_400_000);
  expect(result.budget.usedCents).toBe(83_700_000);
  expect(result.budget.remainingCents).toBe(2_700_000);
});

it("custo de carregamento é estimativa separada e não debita o orçamento de compra", () => {
  const result = plan(buyingFixture([{ id: "SYN-A", stock: 1, unit: "cx 12 un", moq: 2 }]), { budgetCents: 12000 });
  expect(result.proposals[0].projection.carryingCostCents).toBeGreaterThan(0);
  expect(result.budget.usedCents).toBe(12000);
  expect(result.budget.remainingCents).toBe(0);
});
it("identifica cenário hipotético mesmo sem nome manual e conta as campanhas inclusivamente", () => {
  const result = plan(undefined, { scenario: { blackFridayMultiplierBps: 20000 } });
  expect(result.config.scenario.name).toContain("hipotético");
  const campaigns = result.proposals[0].projection.campaigns;
  expect(campaigns.find((c) => c.campaign === "black_friday")?.demandUnits).toBe(18);
  expect(campaigns.find((c) => c.campaign === "christmas")?.demandUnits).toBe(14);
});
it.each([-1, 10000.5, NaN, Infinity])("recusa multiplicador de cenário inválido %s", (blackFridayMultiplierBps) => {
  expect(() => plan(undefined, { scenario: { blackFridayMultiplierBps } })).toThrow();
});
it("não aceita quantidade observada fracionária sem normalização", () => {
  const data = buyingFixture(); data.sales[0].unidades_vendidas = 1.5;
  expect(() => plan(data)).toThrow("não normalizada");
});
it("não serializa BigInt ou números não finitos nas propostas", () => {
  const result = plan();
  expect(() => JSON.stringify(result)).not.toThrow();
  const numbers: number[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "number") numbers.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(result);
  expect(numbers.every(Number.isFinite)).toBe(true);
});
