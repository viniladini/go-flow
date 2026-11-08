import { expect, it } from "vitest";
import { formatQuantity } from "@/lib/quantity-format";
import { formatMoney } from "@/lib/dashboard/format";
import { scenarioCalendar } from "@/lib/smart-buying/projection";
import { resolveBuyingConfig, MICRO_UNITS } from "@/lib/smart-buying/policy";
import { createSmartBuyingPlan } from "@/lib/smart-buying";
import { groupBuyingAlerts } from "@/lib/buying-alerts";
import { buyingFixture } from "../fixtures/buying";
import { createOperationalDemo } from "@/lib/operations/demo";

it.each([[169, "169"], [481, "481"], [1.125, "1,125"], [1.2346, "1,235"], [.000026, "<0,001"], [0, "0"], [-0, "0"], [null, "Indisponível"], [Infinity, "Indisponível"]])("formata quantidades sem mudar o valor do motor: %s", (value, label) => {
  expect(formatQuantity(value as number | null)).toBe(label);
});
it("dinheiro usa centavos inteiros e preserva duas casas, incluindo limites", () => {
  expect(formatMoney(12499868)).toMatch(/124\.998,68/);
  expect(formatMoney(1)).toMatch(/0,01/);
  expect(formatMoney(1.5)).toBe("Indisponível");
  expect(formatMoney(Number.MAX_SAFE_INTEGER)).toMatch(/,91$/);
});
it.each([3, 7, 30])("distribui residuos diarios sem acumular erro no periodo de %s dias", (days) => {
  const config = resolveBuyingConfig({ dataset: buyingFixture(), origin: "independent_synthetic", scenario: { blackFridayMultiplierBps: 10000, christmasMultiplierBps: 10000 } });
  const calendar = scenarioCalendar(64 / days, config);
  expect(calendar.slice(0, days).reduce((sum, d) => sum + d.microUnits, 0)).toBe(64 * MICRO_UNITS);
  let total = 0;
  for (const [i, day] of calendar.entries()) {
    total += day.microUnits;
    expect(Number.isSafeInteger(day.microUnits)).toBe(true);
    expect(day.microUnits).toBeGreaterThanOrEqual(0);
    expect(Math.abs(total - 64 / days * (i + 1) * MICRO_UNITS)).toBeLessThanOrEqual(.500001);
  }
});
it("limites fracionarios e overflow continuam explicitos", () => {
  const config = resolveBuyingConfig({ dataset: buyingFixture(), origin: "independent_synthetic" });
  expect(scenarioCalendar(0, config).every((day) => day.microUnits === 0)).toBe(true);
  expect(() => scenarioCalendar(-1, config)).toThrow();
  expect(() => scenarioCalendar(Number.MAX_SAFE_INTEGER, config)).toThrow();
});
it("comparacao: arredondar a taxa diaria acumula residuos; o calendario corrigido conserva a quantidade", () => {
  const config = resolveBuyingConfig({ dataset: buyingFixture(), origin: "independent_synthetic", scenario: { blackFridayMultiplierBps: 10000, christmasMultiplierBps: 10000 } });
  const previousTotal = Math.round(64 / 30 * MICRO_UNITS) * 90;
  const correctedTotal = scenarioCalendar(64 / 30, config).slice(0, 90).reduce((sum, day) => sum + day.microUnits, 0);
  expect(previousTotal).not.toBe(192 * MICRO_UNITS);
  expect(correctedTotal).toBe(192 * MICRO_UNITS);
});
it("nao gasta saldo sem necessidade mesmo com um orcamento maior", () => {
  const dataset = buyingFixture([{ id: "SYN-SUFFICIENT", stock: 10000 }]);
  for (const budgetCents of [10000, 10000000]) {
    const result = createSmartBuyingPlan({ dataset, budgetCents, origin: "independent_synthetic", scenario: { safetyStock: "none" } });
    expect(result.proposals).toEqual([]);
    expect(result.budget.remainingCents).toBe(budgetCents);
  }
});
it("acima do custo de atender a necessidade, aumentar orcamento nao aumenta a compra", () => {
  const dataset = buyingFixture([{ id: "SYN-NEED", stock: 10, dailyUnits: 1 }]);
  const run = (budgetCents: number) => createSmartBuyingPlan({ dataset, budgetCents, origin: "independent_synthetic", scenario: { safetyStock: "none" } });
  const first = run(1000000), second = run(2000000);
  expect(first.proposals.length).toBeGreaterThan(0);
  expect(second.proposals).toEqual(first.proposals);
  expect(first.budget.remainingCents).toBeGreaterThan(0);
  for (const proposal of first.proposals) expect(proposal.benefit.additionalServedMicroUnits).toBeGreaterThan(0);
  expect(first.globallyOptimal).toBe(false);
});
it("a demo usa a data do relogio fornecido em Sao Paulo", () => {
  const { dataset, parameters } = createOperationalDemo(new Date("2026-11-08T12:00:00Z"));
  expect(parameters.referenceDate).toBe("2026-11-08");
  expect(dataset.referenceDate).toBe(parameters.referenceDate);
  expect(parameters.horizonStart > parameters.referenceDate).toBe(true);
});
it("agrupa alertas sem perder ocorrencias, SKUs ou mensagens", () => {
  const alerts = [
    { code: "pending_orders", message: "Pedidos pendentes não creditados", sku: "A" },
    { code: "pending_orders", message: "Pedidos pendentes não creditados", sku: "B" },
    { code: "shortfall_before_arrival", message: "Ruptura antes da chegada", sku: "C" },
    { code: "conditional_scenario", message: "Simulação condicional" },
  ];
  const groups = groupBuyingAlerts(alerts);
  expect(groups.reduce((total, g) => total + g.count, 0)).toBe(alerts.length);
  expect(groups.find((g) => g.id === "pending")?.messages[0].occurrences).toHaveLength(2);
  expect(groups.flatMap((g) => g.messages.flatMap((m) => m.occurrences))).toEqual(expect.arrayContaining(alerts));
  expect(groups[0].critical).toBe(true);
});
