import { dayDifference, multiplyIntegers } from "./math.ts";
import { dateValue } from "./primitives.ts";
import type { AnalyticsConfig, CoverageMetric, MovementMetric, Sale, SalesWindow, Sku, StockMetric } from "./types.ts";

export function calculateMovement(sku: Sku, sales: readonly Sale[], stock: StockMetric, coverage: CoverageMetric, demandWindow: SalesWindow, movementWindow: SalesWindow, config: AnalyticsConfig): MovementMetric {
  const last = sales.filter((s) => s.sku === sku.sku && s.unidades_vendidas > 0 && dateValue(s.data) !== null && s.data <= config.referenceDate)
    .reduce<string | null>((date, s) => !date || s.data > date ? s.data : date, null);
  const elapsed = last ? dayDifference(config.referenceDate, last) : null;
  const adequate = movementWindow.estimatedDailyDemand !== null;
  const low = adequate ? (elapsed === null || elapsed >= config.lowMovementDays ? "identified" : "not_identified") : "insufficient";
  const excess = coverage.status === "zero_demand" ? "zero_observed_demand" : coverage.status !== "available" || coverage.days === null ? "insufficient" : coverage.days > config.excessDays ? "identified" : "not_identified";
  const excessUnits = excess === "identified" && stock.usableUnits !== null && demandWindow.estimatedDailyDemand !== null
    ? Math.max(0, stock.usableUnits - Math.ceil(demandWindow.estimatedDailyDemand * config.excessDays))
    : excess === "not_identified" ? 0 : null;
  return {
    lastObservedSaleDate: last, daysSinceLastObservedSale: elapsed, lowMovement: low,
    lowMovementCapitalCents: low === "identified" ? stock.valueCents : low === "not_identified" && stock.valueCents !== null ? 0 : null,
    excess, excessUnits, excessCapitalCents: excessUnits === null ? null : multiplyIntegers(excessUnits, sku.custo_unitario_centavos),
  };
}

