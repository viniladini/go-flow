import { describe, expect, it } from "vitest";
import { createSmartBuyingPlan } from "@/lib/smart-buying";
import { buyingFixture } from "../fixtures/buying";
import { shiftDate } from "@/lib/analytics/math";
import type { BuyingInput } from "@/lib/smart-buying/types";

const plan = (dataset = buyingFixture(), budgetCents?: number) => createSmartBuyingPlan({
  dataset, budgetCents, origin: "independent_synthetic",
});

describe("fronteiras financeiras e de normalização", () => {
  it("aceita entrada vazia sem inventar necessidade ou capital", () => {
    const result = plan(buyingFixture([]), 123);
    expect(result.proposals).toEqual([]);
    expect(result.alternatives).toEqual([]);
    expect(result.assessments).toEqual([]);
    expect(result.budget).toMatchObject({ totalCents: 123, usedCents: 0, remainingCents: 123 });
  });

  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("recusa custo de catálogo inválido %s", (cost) => {
    const data = buyingFixture(); data.skus[0].custo_unitario_centavos = cost;
    expect(() => plan(data)).toThrow("Cadastro");
  });
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("recusa preço de catálogo inválido %s", (price) => {
    const data = buyingFixture(); data.skus[0].preco_venda_centavos = price;
    expect(() => plan(data)).toThrow("Cadastro");
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("recusa MOQ não normalizado %s", (moq) => {
    const data = buyingFixture(); data.skus[0].moq = moq;
    expect(() => plan(data)).toThrow("Cadastro");
  });
  it.each(["skus", "suppliers", "sales", "stocks", "purchases"] as const)("recusa duplicata remanescente em %s", (table) => {
    const data = buyingFixture();
    // Each table is independently duplicated, preserving the relevant logical key.
    Object.assign(data, { [table]: [...data[table], structuredClone(data[table][0])] });
    expect(() => plan(data)).toThrow("duplicatas");
  });
  it("recusa quantidade física inconsistente em pedido histórico", () => {
    const data = buyingFixture(); data.purchases[0].quantidade_unidades += 1;
    expect(() => plan(data)).toThrow("Compra não normalizada");
  });
  it("recusa identificação de pedido ausente", () => {
    const data = buyingFixture(); data.purchases[0].po_id = " ";
    expect(() => plan(data)).toThrow("Chave");
  });
  it("recusa fornecedor ausente do catálogo", () => {
    const data = buyingFixture(); data.skus[0].fornecedor = "SYN-ORFAO";
    expect(() => plan(data)).toThrow("Referência");
  });
  it("recusa fornecedor com chave ausente", () => {
    const data = buyingFixture(); data.suppliers[0].fornecedor = "";
    expect(() => plan(data)).toThrow("Chave");
  });
  it("custo seguro máximo não aborta o diagnóstico de inviabilidade financeira", () => {
    const data = buyingFixture([{ id: "SYN-A", stock: 1 }]);
    data.skus[0].custo_unitario_centavos = Number.MAX_SAFE_INTEGER;
    const result = plan(data, 100);
    expect(result.proposals).toEqual([]);
    expect(result.assessments[0].selectionStatus).toBe("financial_infeasible");
    expect(result.budget.remainingCents).toBe(100);
  });
  it("recusa valor de estoque fora da faixa segura, sem retornar valor aproximado", () => {
    const data = buyingFixture(); data.skus[0].custo_unitario_centavos = Number.MAX_SAFE_INTEGER;
    expect(() => plan(data)).toThrow("intervalo seguro");
  });
  it("recusa quantidade física fora da faixa segura, sem truncar caixas", () => {
    const data = buyingFixture();
    data.purchases[0].unidade = "cx 12 un";
    data.purchases[0].quantidade = Number.MAX_SAFE_INTEGER;
    expect(() => plan(data)).toThrow("intervalo seguro");
  });
  it("recusa demanda projetada fora da precisão interna suportada", () => {
    expect(() => createSmartBuyingPlan({ dataset: buyingFixture(), origin: "independent_synthetic",
      scenario: { christmasMultiplierBps: Number.MAX_SAFE_INTEGER } })).toThrow("intervalo inteiro seguro");
  });
});

describe("temporalidade, priorização e invariantes independentes", () => {
  it("filtra dados futuros mesmo quando acrescentados diretamente ao dataset", () => {
    const data = buyingFixture(), baseline = plan(data);
    data.sales.push({ ...data.sales[0], data: "2037-04-19", unidades_vendidas: 99999 });
    data.stocks.push({ ...data.stocks[0], data: "2037-04-19", estoque_disponivel: 99999 });
    data.purchases.push({ ...data.purchases[0], po_id: "SYN-FUTURO", data_pedido: "2037-04-19", data_recebimento: "2037-04-20" });
    expect(plan(data)).toEqual(baseline);
  });
  it("não usa recebimento futuro direto na amostra nem no orçamento", () => {
    const data = buyingFixture();
    data.purchases.push({ ...data.purchases[0], po_id: "SYN-PENDENTE", data_recebimento: "2037-06-20" });
    const baseline = plan(), result = plan(data);
    expect(result.proposals).toEqual(baseline.proposals);
    expect(result.budget).toEqual(baseline.budget);
    expect(result.assessments[0].pendingOrdersNotCredited).toBe(1);
  });
  it("não mascara lacunas, ausência de saldo ou ausência de lead time com demanda zero", () => {
    for (const table of ["sales", "stocks", "purchases"] as const) {
      const data = buyingFixture(); data[table] = [];
      const result = plan(data);
      expect(result.proposals).toEqual([]);
      expect(result.assessments[0].status).toBe("insufficient_data");
    }
  });
  it("conserva demanda, saldo e benefício contra simulação sintética independente", () => {
    const result = plan(buyingFixture([{ id: "SYN-A", stock: 13, dailyUnits: 2, moq: 3, costCents: 7 }]), 217);
    const p = result.proposals[0];
    let stock = 13 - 2; // 30/09: ponte fora do objetivo.
    let baselineStock = stock, served = 0, baselineServed = 0;
    for (let date = "2037-04-20"; date <= "2037-07-18"; date = shiftDate(date, 1)) {
      if (date === p.estimatedArrivalDate) stock += p.physicalUnits;
      const used = Math.min(stock, 2), withoutPurchase = Math.min(baselineStock, 2);
      stock -= used; baselineStock -= withoutPurchase;
      served += used; baselineServed += withoutPurchase;
    }
    expect(p.projection.demandUnits).toBe(180);
    expect(p.projection.servedUnits).toBe(served);
    expect(p.projection.unservedUnits).toBe(180 - served);
    expect(p.projection.endingStockUnits).toBe(stock);
    expect(p.benefit.additionalServedUnits).toBe(served - baselineServed);
    expect(p.estimatedCostCents).toBe(p.physicalUnits * 7);
  });
  it("prefere maior benefício marginal por custo com urgência e risco equivalentes", () => {
    const result = plan(buyingFixture([{ id: "SYN-CARO", stock: 1, costCents: 1000 },
      { id: "SYN-BARATO", stock: 1, costCents: 10 }]), 1000);
    expect(result.proposals.map((p) => p.sku)).toEqual(["SYN-BARATO"]);
    expect(result.assessments.find((a) => a.sku === "SYN-CARO")?.selectionStatus).toBe("budget_competition");
  });
  it("preserva o resultado completo sob diversas permutações determinísticas", () => {
    const data = buyingFixture([{ id: "SYN-C", stock: 1, variableSales: true, leadDays: [2, 7, 4] },
      { id: "SYN-A", stock: 1, costCents: 17 }, { id: "SYN-B", stock: 2, unit: "cx 12 un" }]);
    const baseline = plan(data, 10000);
    for (let step = 1; step <= 5; step++) {
      const shuffled = structuredClone(data);
      for (const table of ["skus", "sales", "stocks", "purchases", "suppliers", "issues"] as const) {
        const offset = step % (shuffled[table].length || 1);
        Object.assign(shuffled, { [table]: [...shuffled[table].slice(offset), ...shuffled[table].slice(0, offset)].reverse() });
      }
      expect(plan(shuffled, 10000)).toEqual(baseline);
    }
  });
  it("mantém orçamento, MOQ e números finitos numa grade com três SKUs concorrentes", () => {
    const data = buyingFixture([{ id: "SYN-A", moq: 7, costCents: 1, stock: 1 },
      { id: "SYN-B", moq: 3, unit: "cx 12 un", costCents: 13, stock: 2 },
      { id: "SYN-C", moq: 5, costCents: 97, stock: 3, variableSales: true }]);
    for (const budget of [0, 1, 6, 7, 8, 467, 468, 469, 1000, 5000, 86400000]) {
      const result = plan(data, budget);
      const total = result.proposals.reduce((sum, p) => {
        const sku = data.skus.find((s) => s.sku === p.sku)!;
        const factor = sku.unidade_compra === "un" ? 1 : 12;
        expect(p.quantityPurchaseUnits % sku.moq).toBe(0);
        expect(p.quantityPurchaseUnits).toBeGreaterThan(0);
        expect(p.physicalUnits).toBe(p.quantityPurchaseUnits * factor);
        expect(p.estimatedCostCents).toBe(p.physicalUnits * sku.custo_unitario_centavos);
        return sum + p.estimatedCostCents;
      }, 0);
      expect(total).toBe(result.budget.usedCents);
      expect(total).toBeLessThanOrEqual(budget);
      expect(result.budget.remainingCents).toBe(budget - total);
      const check = (value: unknown): void => {
        if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        else if (value && typeof value === "object") Object.values(value).forEach(check);
      };
      check(result);
      expect(() => JSON.stringify(result)).not.toThrow();
    }
  });
});

describe("regressões da auditoria de confiabilidade", () => {
  it("recusa orçamento explicitamente nulo em vez de liberar o teto sintético", () => {
    const request = { dataset: buyingFixture(), origin: "independent_synthetic", budgetCents: null } as unknown as BuyingInput;
    expect(() => createSmartBuyingPlan(request)).toThrow("Configuração");
  });

  it("recusa custo negativo de descontinuado antes de produzir capital negativo", () => {
    const data = buyingFixture([{ id: "SYN-A", status: "descontinuado" }]);
    data.skus[0].custo_unitario_centavos = -1;
    expect(() => plan(data)).toThrow("Cadastro");
  });

  it("recusa compra cujo fornecedor não existe em vez de usá-la no lead time", () => {
    const data = buyingFixture();
    data.purchases[0].fornecedor = "SYN-ORFAO";
    expect(() => plan(data)).toThrow("Referência");
  });

  it.each(["sales", "stocks", "purchases"] as const)("recusa SKU órfão em %s", (table) => {
    const data = buyingFixture();
    data[table][0].sku = "SYN-ORFAO";
    expect(() => plan(data)).toThrow("Referência");
  });

  it("recusa chave de produto vazia", () => {
    const data = buyingFixture();
    data.skus[0].sku = "";
    expect(() => plan(data)).toThrow("Chave");
  });

  it("não aborta compras viáveis por gerar alternativa impagável com overflow", () => {
    const data = buyingFixture([{ id: "SYN-CARO", stock: 1 }, { id: "SYN-VIAVEL", stock: 1 }]);
    data.skus.find((s) => s.sku === "SYN-CARO")!.custo_unitario_centavos = 200_000_000_000_000;
    const result = plan(data, 1000);
    expect(result.assessments.find((a) => a.sku === "SYN-CARO")?.selectionStatus).toBe("financial_infeasible");
    expect(result.proposals.map((p) => p.sku)).toEqual(["SYN-VIAVEL"]);
    expect(result.budget.usedCents).toBe(1000);
  });
});
