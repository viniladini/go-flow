import { dateValue } from "./primitives.ts";
import { calculateStock, calculateCoverage } from "./inventory.ts";
import { calculateSalesWindow } from "./sales.ts";
import { calculateLeadTime } from "./lead-time.ts";
import { classifyRisk } from "./risk.ts";
import { calculateMovement } from "./movement.ts";
import { sumIntegers } from "./math.ts";
import type { AnalyticsConfig, AnalyticsResult, DashboardMetrics, Dataset, SkuMetrics } from "./types.ts";

export const DEFAULT_CONFIG: Readonly<AnalyticsConfig> = Object.freeze({
  referenceDate: "2037-04-18", demandWindowDays: 30, maxStockAgeDays: 0,
  minLeadTimeSamples: 3, leadTimeBufferStd: 1, excessDays: 90, lowMovementDays: 60,
});
export function resolveConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  const c = { ...DEFAULT_CONFIG, ...overrides };
  if (c.referenceDate > DEFAULT_CONFIG.referenceDate) throw new Error("Configuração analítica inválida.");
  return validateAnalyticsConfig(c);
}
function validateAnalyticsConfig(c: AnalyticsConfig): AnalyticsConfig {
  if (dateValue(c.referenceDate) === null ||
    ![30, 60, 90].includes(c.demandWindowDays) ||
    !Number.isSafeInteger(c.maxStockAgeDays) || c.maxStockAgeDays < 0 ||
    !Number.isSafeInteger(c.minLeadTimeSamples) || c.minLeadTimeSamples < 1 ||
    !Number.isFinite(c.leadTimeBufferStd) || c.leadTimeBufferStd < 0 ||
    !Number.isSafeInteger(c.excessDays) || c.excessDays <= 0 ||
    !Number.isSafeInteger(c.lowMovementDays) || c.lowMovementDays <= 0 || c.lowMovementDays > 3650) {
    throw new Error("Configuração analítica inválida.");
  }
  return c;
}
function groupBySku<T extends { sku: string }>(rows: readonly T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) { const group = map.get(row.sku) ?? []; group.push(row); map.set(row.sku, group); }
  return map;
}
export function aggregateDashboard(rows: readonly SkuMetrics[], referenceDate: string, issueCount: number): DashboardMetrics {
  const sum = (values: (number | null)[]): number | null => { const valid = values.filter((n): n is number => n !== null); return valid.length ? sumIntegers(valid) : null; };
  const active = rows.filter((s) => s.status === "ativo"), discontinued = rows.filter((s) => s.status === "descontinuado");
  const risks: DashboardMetrics["risks"] = { critical: 0, attention: 0, low: 0, insufficient: 0, anomaly: 0, discontinued: 0 };
  rows.forEach((s) => risks[s.risk.level]++);
  return {
    referenceDate, skuCount: rows.length, activeSkuCount: active.length, discontinuedSkuCount: discontinued.length,
    inventoryValueCents: sum(rows.map((s) => s.stock.valueCents)),
    activeCapitalCents: active.length ? sum(active.map((s) => s.stock.valueCents)) : 0,
    discontinuedCapitalCents: discontinued.length ? sum(discontinued.map((s) => s.stock.valueCents)) : 0,
    validInventorySkuCount: rows.filter((s) => s.stock.valueCents !== null).length,
    excludedInventorySkuCount: rows.filter((s) => s.stock.valueCents === null).length,
    risks, observedSales: [30, 60, 90].map((days) => {
      const windows = rows.map((s) => s.sales.find((w) => w.days === days)!);
      return {
        days, units: sumIntegers(windows.map((w) => w.observedUnits)),
        revenueCents: sumIntegers(windows.map((w) => w.observedRevenueCents)),
        completeSkuCount: windows.filter((w) => w.status === "complete").length,
        partialOrMissingSkuCount: windows.filter((w) => w.status !== "complete").length,
      };
    }),
    excessCapitalCents: sum(rows.map((s) => s.movement.excessCapitalCents)),
    excessEligibleSkuCount: rows.filter((s) => s.movement.excessCapitalCents !== null).length,
    lowMovementCapitalCents: sum(rows.map((s) => s.movement.lowMovementCapitalCents)),
    lowMovementEligibleSkuCount: rows.filter((s) => s.movement.lowMovementCapitalCents !== null).length,
    normalizationIssueCount: issueCount, exploratory: true,
  };
}
export function analyzeDataset(data: Dataset, overrides: Partial<AnalyticsConfig> = {}): AnalyticsResult {
  const config = resolveConfig({ referenceDate: data.referenceDate, ...overrides });
  return analyzeWithConfig(data, config);
}
/** Methodological defaults only; operational reference and window are mandatory. */
export function operationalAnalyticsConfig(referenceDate: string, demandWindowDays: 30 | 60 | 90): AnalyticsConfig {
  return validateAnalyticsConfig({ referenceDate, demandWindowDays, maxStockAgeDays: 0, minLeadTimeSamples: 3,
    leadTimeBufferStd: 1, excessDays: 90, lowMovementDays: 60 });
}
export function analyzeOperationalDataset(data: Dataset, config: AnalyticsConfig): AnalyticsResult {
  return analyzeWithConfig(data, validateAnalyticsConfig(config));
}
function analyzeWithConfig(data: Dataset, config: AnalyticsConfig): AnalyticsResult {
  if (config.referenceDate !== data.referenceDate) throw new Error("Normalize novamente os dados para a data-base solicitada.");
  const sales = groupBySku(data.sales), stocks = groupBySku(data.stocks), purchases = groupBySku(data.purchases);
  const issues = groupBySku(data.issues.filter((i): i is typeof i & { sku: string } => !!i.sku));
  const rows: SkuMetrics[] = [...data.skus].sort((a, b) => a.sku.localeCompare(b.sku)).map((sku) => {
    const skuSales = sales.get(sku.sku) ?? [], skuStocks = stocks.get(sku.sku) ?? [], skuIssues = issues.get(sku.sku) ?? [];
    const stock = calculateStock(sku, skuStocks, config.referenceDate, config.maxStockAgeDays, skuIssues);
    const windows = [30, 60, 90].map((days) => calculateSalesWindow(sku.sku, skuSales, skuStocks, config.referenceDate, days, skuIssues));
    const demandWindow = windows.find((w) => w.days === config.demandWindowDays)!;
    const coverage = calculateCoverage(stock, demandWindow.estimatedDailyDemand, config.demandWindowDays);
    const leadTime = calculateLeadTime(sku.sku, purchases.get(sku.sku) ?? [], config.referenceDate, config.minLeadTimeSamples);
    const movementWindow = windows.find((w) => w.days === config.lowMovementDays) ??
      calculateSalesWindow(sku.sku, skuSales, skuStocks, config.referenceDate, config.lowMovementDays, skuIssues);
    return {
      sku: sku.sku, status: sku.status, stock, sales: windows, coverage, leadTime,
      risk: classifyRisk(sku.status, coverage, leadTime, config.leadTimeBufferStd),
      movement: calculateMovement(sku, skuSales, stock, coverage, demandWindow, movementWindow, config),
      qualityCodes: [...new Set([...skuIssues.map((i) => i.code), ...(stock.stale ? ["stale_stock"] : []), "exploratory_duplicate_policy"])].sort(),
    };
  });
  return { config, skus: rows, dashboard: aggregateDashboard(rows, config.referenceDate, data.issues.length) };
}
export function getSkuMetrics(result: AnalyticsResult, sku: string): SkuMetrics | null {
  return result.skus.find((s) => s.sku === sku) ?? null;
}
export type * from "./types.ts";

