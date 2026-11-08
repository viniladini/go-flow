import { dayDifference, multiplyIntegers } from "./math.ts";
import { dateValue } from "./primitives.ts";
import type { CoverageMetric, Issue, Sku, Stock, StockMetric } from "./types.ts";

export function calculateStock(sku: Sku, history: readonly Stock[], referenceDate: string, maxAgeDays = 0, issues: readonly Issue[] = []): StockMetric {
  const last = history.filter((s) => s.sku === sku.sku && dateValue(s.data) !== null && s.data <= referenceDate)
    .reduce<Stock | null>((latest, row) => !latest || row.data > latest.data ? row : latest, null);
  const blocked = issues.some((i) => i.file === "estoque_diario.csv" && i.sku === sku.sku && i.severity === "error" &&
    (!i.date || dateValue(i.date) === null || (i.date <= referenceDate && (!last || i.date >= last.data))));
  if (!last) return { state: blocked ? "missing" : "no_history", lastObservedDate: null, lastObservedBalance: null, ageDays: null, stale: false, usableUnits: null, valueCents: null };
  const age = dayDifference(referenceDate, last.data);
  const balance = last.estoque_disponivel;
  const state = blocked ? "missing" : balance < 0 ? "negative" : balance === 0 ? "zero" : "positive";
  const stale = age > maxAgeDays;
  const usable = !blocked && !stale && balance >= 0 ? balance : null;
  return {
    state, lastObservedDate: last.data, lastObservedBalance: balance, ageDays: age, stale,
    usableUnits: usable, valueCents: usable === null ? null : multiplyIntegers(usable, sku.custo_unitario_centavos),
  };
}
export function calculateCoverage(stock: StockMetric, dailyDemand: number | null, windowDays: number): CoverageMetric {
  const result = { days: null, demandWindowDays: windowDays };
  if (stock.state === "negative") return { ...result, status: "negative_stock" };
  if (stock.usableUnits === null || dailyDemand === null || !Number.isFinite(dailyDemand) || dailyDemand < 0) return { ...result, status: "insufficient" };
  if (dailyDemand === 0) return { ...result, status: "zero_demand" };
  const days = stock.usableUnits / dailyDemand;
  return Number.isFinite(days) ? { ...result, days, status: "available" } : { ...result, status: "insufficient" };
}

