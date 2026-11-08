import { distribution, shiftDate, sumIntegers } from "./math.ts";
import { dateValue } from "./primitives.ts";
import type { Issue, Sale, SalesWindow, Stock } from "./types.ts";

/** Missing days stay unknown: calendar statistics need an explicit row on EVERY day. */
export function calculateSalesWindow(sku: string, sales: readonly Sale[], stocks: readonly Stock[], referenceDate: string, days: number, issues: readonly Issue[] = []): SalesWindow {
  if (!Number.isSafeInteger(days) || days <= 0) throw new Error("Janela inválida.");
  const start = shiftDate(referenceDate, 1 - days);
  const rows = sales.filter((r) => r.sku === sku && dateValue(r.data) !== null && r.data >= start && r.data <= referenceDate);
  const saleMap = new Map(rows.map((r) => [r.data, r]));
  if (saleMap.size !== rows.length) throw new Error("Vendas precisam estar normalizadas, sem chaves repetidas.");
  const stockMap = new Map(stocks.filter((r) => r.sku === sku && dateValue(r.data) !== null && r.data >= start && r.data <= referenceDate).map((r) => [r.data, r]));
  const saleError = issues.some((i) => i.file === "vendas_diarias.csv" && i.sku === sku && i.severity === "error" &&
    (!i.date || dateValue(i.date) === null || (i.date >= start && i.date <= referenceDate)));
  const stockError = issues.some((i) => i.file === "estoque_diario.csv" && i.sku === sku && i.severity === "error" &&
    (!i.date || dateValue(i.date) === null || (i.date >= start && i.date <= referenceDate)));
  let nonpositive = 0, missingStock = 0;
  for (let i = 0; i < days; i++) {
    const stock = stockMap.get(shiftDate(start, i));
    if (!stock) missingStock++;
    else if (stock.estoque_disponivel <= 0) nonpositive++;
  }
  const complete = rows.length === days && !saleError;
  const stats = distribution(rows.map((r) => r.unidades_vendidas));
  const demandStatus = nonpositive > 0 ? "potentially_censored" : complete && missingStock === 0 && !stockError ? "sufficient_observed_proxy" : "insufficient";
  return {
    days, start, end: referenceDate, status: complete ? "complete" : rows.length ? "partial" : "no_evidence",
    observedUnits: sumIntegers(rows.map((r) => r.unidades_vendidas)),
    observedRevenueCents: sumIntegers(rows.map((r) => r.receita_centavos)),
    recordedDays: rows.length, explicitZeroDays: rows.filter((r) => r.unidades_vendidas === 0).length,
    missingSalesDays: days - rows.length, nonpositiveStockDays: nonpositive, missingStockDays: missingStock,
    calendarMean: complete ? stats.mean : null, calendarStdDev: complete ? stats.populationStdDev : null,
    estimatedDailyDemand: demandStatus === "sufficient_observed_proxy" ? stats.mean : null,
    demandStatus,
  };
}

