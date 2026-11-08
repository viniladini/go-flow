/** Normalized money uses integer BRL cents; quantities use physical units. */
export type PurchaseUnit = "un" | "cx 12 un";
export type SkuStatus = "ativo" | "descontinuado";
export type FileName = "skus.csv" | "fornecedores.csv" | "vendas_diarias.csv" | "estoque_diario.csv" | "compras.csv";
export type RawSku = Record<"sku" | "marca" | "descricao" | "categoria" | "status" | "custo_unitario" | "preco_venda" | "fornecedor" | "unidade_compra" | "moq", string>;
export type RawSale = Record<"sku" | "data" | "unidades_vendidas" | "receita", string>;
export type RawStock = Record<"sku" | "data" | "estoque_disponivel", string>;
export type RawPurchase = Record<"po_id" | "fornecedor" | "sku" | "data_pedido" | "data_recebimento" | "quantidade" | "unidade", string>;
export type RawSupplier = Record<"fornecedor" | "nome_fornecedor", string>;
export interface Trace { file: FileName; records: number[] }
export interface Sku {
  sku: string; marca: string; descricao: string; categoria: string; status: SkuStatus;
  custo_unitario_centavos: number; preco_venda_centavos: number;
  fornecedor: string; unidade_compra: PurchaseUnit; moq: number; source: Trace;
}
export interface Sale { sku: string; data: string; unidades_vendidas: number; receita_centavos: number; source: Trace }
export interface Stock { sku: string; data: string; estoque_disponivel: number; source: Trace }
export interface Purchase {
  po_id: string; fornecedor: string; sku: string; data_pedido: string;
  data_recebimento: string | null; quantidade: number; unidade: PurchaseUnit;
  quantidade_unidades: number; source: Trace;
}
export interface Supplier { fornecedor: string; nome_fornecedor: string; source: Trace }
export interface Issue {
  file: FileName; records: number[]; code: string; severity: "warning" | "error";
  field?: string; sku?: string; date?: string;
}
export interface ParsedRecord { values: Record<string, string>; record: number }
export interface ParsedTable { file: FileName; rows: ParsedRecord[]; issues: Issue[] }
export interface Dataset {
  referenceDate: string; skus: Sku[]; sales: Sale[]; stocks: Stock[];
  purchases: Purchase[]; suppliers: Supplier[]; issues: Issue[];
  policy: "exploratory_exact_dedup_conflict_quarantine";
}
export interface AnalyticsConfig {
  referenceDate: string;
  demandWindowDays: 30 | 60 | 90;
  maxStockAgeDays: number;
  minLeadTimeSamples: number;
  leadTimeBufferStd: number;
  excessDays: number;
  lowMovementDays: number;
}
export interface StockMetric {
  state: "positive" | "zero" | "negative" | "missing" | "no_history";
  lastObservedDate: string | null; lastObservedBalance: number | null; ageDays: number | null;
  stale: boolean; usableUnits: number | null; valueCents: number | null;
}
export interface SalesWindow {
  days: number; start: string; end: string;
  status: "complete" | "partial" | "no_evidence";
  observedUnits: number; observedRevenueCents: number;
  recordedDays: number; explicitZeroDays: number; missingSalesDays: number;
  nonpositiveStockDays: number; missingStockDays: number;
  calendarMean: number | null; calendarStdDev: number | null;
  estimatedDailyDemand: number | null;
  demandStatus: "sufficient_observed_proxy" | "insufficient" | "potentially_censored";
}
export interface LeadTimeMetric {
  status: "sufficient" | "insufficient"; sampleSize: number;
  meanDays: number | null; medianDays: number | null; sampleStdDevDays: number | null;
  minDays: number | null; maxDays: number | null;
  pendingOrders: number; pendingUnits: number;
}
export interface CoverageMetric {
  status: "available" | "zero_demand" | "negative_stock" | "insufficient";
  days: number | null; demandWindowDays: number;
}
export interface RiskMetric {
  level: "critical" | "attention" | "low" | "insufficient" | "anomaly" | "discontinued";
  reason: string; replenishmentDays: number | null;
}
export interface MovementMetric {
  lastObservedSaleDate: string | null; daysSinceLastObservedSale: number | null;
  lowMovement: "identified" | "not_identified" | "insufficient";
  lowMovementCapitalCents: number | null;
  excess: "identified" | "not_identified" | "zero_observed_demand" | "insufficient";
  excessUnits: number | null; excessCapitalCents: number | null;
}
export interface SkuMetrics {
  sku: string; status: SkuStatus; stock: StockMetric;
  sales: SalesWindow[]; coverage: CoverageMetric; leadTime: LeadTimeMetric;
  risk: RiskMetric; movement: MovementMetric; qualityCodes: string[];
}
export interface DashboardMetrics {
  referenceDate: string; skuCount: number;
  activeSkuCount: number; discontinuedSkuCount: number;
  inventoryValueCents: number | null; activeCapitalCents: number | null; discontinuedCapitalCents: number | null;
  validInventorySkuCount: number; excludedInventorySkuCount: number;
  risks: Record<RiskMetric["level"], number>;
  observedSales: { days: number; units: number; revenueCents: number; completeSkuCount: number; partialOrMissingSkuCount: number }[];
  excessCapitalCents: number | null; excessEligibleSkuCount: number;
  lowMovementCapitalCents: number | null; lowMovementEligibleSkuCount: number;
  normalizationIssueCount: number; exploratory: true;
}
export interface AnalyticsResult { config: AnalyticsConfig; dashboard: DashboardMetrics; skus: SkuMetrics[] }

