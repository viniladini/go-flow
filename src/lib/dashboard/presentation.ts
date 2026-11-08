import { analyzeDataset } from "@/lib/analytics";
import { createDemoDataset } from "./demo-dataset";
import { formatDate, formatDays, formatMoney, formatNumber, UNAVAILABLE } from "./format";
import type { DashboardModel, StockRowModel } from "./models";
import type { RiskMetric, Dataset, AnalyticsResult } from "@/lib/analytics/types";

export const RISK_LABELS: Record<RiskMetric["level"], string> = {
  critical: "Crítico", attention: "Atenção", low: "Baixo", insufficient: "Dados insuficientes", anomaly: "Anomalia", discontinued: "Descontinuado",
};
const stockLabels = { positive: "Com estoque", zero: "Sem estoque", negative: "Saldo negativo", missing: "Saldo ausente", no_history: "Sem histórico" };

/** Presentation only: every business value comes from the existing engine. */
export function createDemoDashboard(): DashboardModel {
  const data = createDemoDataset();
  const analytics = analyzeDataset(data);
  return createDashboardModel(data, analytics, { kind: "independent_synthetic", id: "goflow-demo-v1", label: "Demonstração · dados sintéticos",
    description: "Cenários fictícios independentes, calculados pelo motor analítico. Não representam resultados de uma operação real." });
}
export function createDashboardModel(data: Dataset, analytics: AnalyticsResult, origin: DashboardModel["origin"]): DashboardModel {
  const days = analytics.config.demandWindowDays;
  const summary = analytics.dashboard;
  const catalog = new Map(data.skus.map((sku) => [sku.sku, sku]));
  const rows: StockRowModel[] = analytics.skus.map((metric) => {
    const sku = catalog.get(metric.sku)!;
    const sales = metric.sales.find((w) => w.days === days)!;
    return {
      sku: sku.sku, name: sku.descricao, brand: sku.marca, status: sku.status,
      statusLabel: sku.status === "ativo" ? "Ativo" : "Descontinuado",
      stockState: metric.stock.state,
      stockStatusLabel: metric.stock.state === "missing" ? stockLabels.missing : metric.stock.stale ? "Saldo defasado" : stockLabels[metric.stock.state],
      stockStale: metric.stock.stale,
      balance: formatNumber(metric.stock.lastObservedBalance),
      stockDetail: stockLabels[metric.stock.state] + (metric.stock.stale ? " · defasado" : "") +
        (metric.stock.lastObservedDate ? " · " + formatDate(metric.stock.lastObservedDate) : ""),
      inventoryValue: formatMoney(metric.stock.valueCents), coverage: formatDays(metric.coverage.days),
      coverageDetail: metric.coverage.status === "available" ? "Proxy de vendas observadas · janela de " + days + " dias" :
        metric.coverage.status === "zero_demand" ? "Vendas explicitamente iguais a zero; cobertura não determinada." :
        metric.coverage.status === "negative_stock" ? "Saldo negativo precisa de reconciliação." : "Histórico incompleto, potencialmente censurado ou estoque não utilizável.",
      leadTime: formatDays(metric.leadTime.meanDays),
      leadTimeDetail: "Amostra: " + formatNumber(metric.leadTime.sampleSize) + " recebimentos · " +
        (metric.leadTime.status === "sufficient" ? "suficiente" : "insuficiente") + " · desvio amostral: " +
        formatDays(metric.leadTime.sampleStdDevDays) + " · pendentes: " + formatNumber(metric.leadTime.pendingOrders),
      sales30: sales.status === "no_evidence" ? UNAVAILABLE : formatNumber(sales.observedUnits),
      salesDetail: formatNumber(sales.recordedDays) + "/" + days + " dias registrados · " + (sales.status === "complete" ? "calendário completo" : "histórico parcial"),
      risk: metric.risk.level, riskLabel: RISK_LABELS[metric.risk.level], riskReason: metric.risk.reason,
      lastSale: formatDate(metric.movement.lastObservedSaleDate),
      movement: metric.movement.lowMovement === "identified" ? "Baixa movimentação identificada" : metric.movement.lowMovement === "insufficient" ? "Baixo giro: dados insuficientes" : "Baixa movimentação não identificada",
      excess: metric.movement.excess === "identified" ? formatMoney(metric.movement.excessCapitalCents) :
        metric.movement.excess === "not_identified" ? "Não identificado" : metric.movement.excess === "zero_observed_demand" ? "Venda zero; excesso não determinado" : UNAVAILABLE,
    };
  });
  const sales30 = summary.observedSales.find((w) => w.days === days)!;
  const coverageCount = analytics.skus.filter((s) => s.coverage.status === "available").length;
  const risks = (Object.keys(RISK_LABELS) as RiskMetric["level"][]).map((level) => ({
    level, label: RISK_LABELS[level], count: summary.risks[level], displayCount: formatNumber(summary.risks[level]),
  }));
  return {
    origin, demandWindowDays: days,
    referenceDate: analytics.config.referenceDate, referenceLabel: formatDate(analytics.config.referenceDate),
    kpis: [
      { id: "inventory", label: "Valor ao custo", value: formatMoney(summary.inventoryValueCents), context: "Capital em estoque utilizável", detail: formatNumber(summary.validInventorySkuCount) + " SKUs válidos · " + formatNumber(summary.excludedInventorySkuCount) + " excluídos" },
      { id: "sales", label: "Vendas observadas · " + days + " dias", value: formatNumber(sales30.units), context: "Unidades observadas no período", detail: formatNumber(sales30.completeSkuCount) + " SKUs com calendário completo" },
      { id: "risk", label: "Risco crítico", value: formatNumber(summary.risks.critical), context: "SKUs com cobertura abaixo da reposição", detail: "Comparação com lead time médio observado" },
      { id: "excess", label: "Excesso potencial", value: formatMoney(summary.excessCapitalCents), context: "Capital acima de 90 dias de cobertura", detail: formatNumber(summary.excessEligibleSkuCount) + " SKUs avaliáveis" },
    ],
    stockKpis: [
      { id: "catalog", label: origin.kind === "independent_synthetic" ? "Catálogo demonstrativo" : "Catálogo importado", value: formatNumber(summary.skuCount), context: "SKUs da fonte ativa", detail: formatNumber(summary.activeSkuCount) + " ativos · " + formatNumber(summary.discontinuedSkuCount) + " descontinuados" },
      { id: "inventory", label: "Valor ao custo", value: formatMoney(summary.inventoryValueCents), context: "Somente posições válidas", detail: formatNumber(summary.validInventorySkuCount) + " SKUs avaliáveis" },
      { id: "coverage", label: "Cobertura disponível", value: formatNumber(coverageCount), context: "SKUs com evidência suficiente", detail: "Consulta em dias na lista abaixo" },
      { id: "anomaly", label: "Anomalias atuais", value: formatNumber(summary.risks.anomaly), context: "SKUs ativos com saldo negativo", detail: "Reconciliar antes de planejar reposição" },
    ],
    risks,
    financial: [
      { label: "Capital em ativos", value: formatMoney(summary.activeCapitalCents), detail: "Posições atuais válidas ao custo" },
      { label: "Capital em descontinuados", value: formatMoney(summary.discontinuedCapitalCents), detail: "Separado da reposição rotineira" },
      { label: "Capital de baixa movimentação", value: formatMoney(summary.lowMovementCapitalCents), detail: "Limiar de 60 dias; pode sobrepor o excesso" },
      { label: "Receita em risco", value: UNAVAILABLE, detail: "O motor não estima vendas perdidas" },
    ],
    windows: summary.observedSales.map((w) => ({
      days: w.days, label: formatNumber(w.days) + " dias", units: formatNumber(w.units), revenue: formatMoney(w.revenueCents),
      detail: formatNumber(w.completeSkuCount) + " SKUs completos · " + formatNumber(w.partialOrMissingSkuCount) + " parciais ou sem histórico",
    })),
    priorities: rows.filter((r) => ["anomaly", "critical", "attention"].includes(r.risk)).slice(0, 4),
    rows, validStockLabel: formatNumber(summary.validInventorySkuCount), excludedStockLabel: formatNumber(summary.excludedInventorySkuCount),
    coverageLabel: formatNumber(coverageCount),
  };
}
