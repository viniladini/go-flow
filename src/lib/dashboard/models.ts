import type { RiskMetric, SkuStatus, StockMetric } from "@/lib/analytics/types";

export interface MetricCardModel { id: string; label: string; value: string; context: string; detail: string }
export interface StockRowModel {
  sku: string; name: string; brand: string; status: SkuStatus; statusLabel: string;
  stockState: StockMetric["state"]; stockStatusLabel: string; stockStale: boolean; balance: string; stockDetail: string;
  inventoryValue: string; coverage: string; coverageDetail: string;
  leadTime: string; leadTimeDetail: string; sales30: string; salesDetail: string;
  risk: RiskMetric["level"]; riskLabel: string; riskReason: string;
  lastSale: string; movement: string; excess: string;
}
export interface DashboardModel {
  origin: { kind: "independent_synthetic" | "imported_local"; id: string; label: string; description: string };
  demandWindowDays?: 30 | 60 | 90;
  referenceDate: string; referenceLabel: string;
  kpis: MetricCardModel[]; stockKpis: MetricCardModel[];
  risks: { level: RiskMetric["level"]; label: string; count: number; displayCount: string }[];
  financial: { label: string; value: string; detail: string }[];
  windows: { days: number; label: string; units: string; revenue: string; detail: string }[];
  priorities: StockRowModel[]; rows: StockRowModel[];
  validStockLabel: string; excludedStockLabel: string; coverageLabel: string;
}
export interface StockFilters { search: string; brand: string; status: "all" | SkuStatus; risk: "all" | RiskMetric["level"] }
