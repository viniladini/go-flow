import { analyzeDataset, analyzeOperationalDataset, operationalAnalyticsConfig } from "../analytics/index.ts";
import { shiftDate } from "../analytics/math.ts";
import { MICRO_UNITS, ceilRatio, purchaseQuantities, stableCompare, toMicro } from "./policy.ts";
import { projectPurchase, scenarioCalendar } from "./projection.ts";
import type { BuyingConfig, BuyingResult, EligibleNeed, NeedAssessment, BuyingAlert } from "./types.ts";
import type { Dataset } from "../analytics/types.ts";

export function generateNeeds(data: Dataset, config: BuyingConfig) {
  const canonical = {
    ...data, skus: [...data.skus].sort((a, b) => stableCompare(a.sku, b.sku)),
    sales: [...data.sales].sort((a, b) => stableCompare(a.sku + a.data, b.sku + b.data)),
    stocks: [...data.stocks].sort((a, b) => stableCompare(a.sku + a.data, b.sku + b.data)),
    purchases: [...data.purchases].sort((a, b) => stableCompare(a.po_id + a.sku, b.po_id + b.sku)),
  };
  const analytics = config.operational ? analyzeOperationalDataset(canonical, operationalAnalyticsConfig(config.referenceDate, config.demandWindowDays)) : analyzeDataset(canonical, { demandWindowDays: config.demandWindowDays });
  const metrics = new Map(analytics.skus.map((m) => [m.sku, m]));
  const suppliers = new Set(data.suppliers.map((s) => s.fornecedor));
  const needs: EligibleNeed[] = [], assessments: NeedAssessment[] = [], alerts: BuyingAlert[] = [];
  const dispositionOpportunities: BuyingResult["dispositionOpportunities"] = [];
  for (const sku of canonical.skus) {
    const metric = metrics.get(sku.sku)!;
    const assessment: NeedAssessment = {
      sku: sku.sku, status: "eligible", selectionStatus: "not_applicable", reason: "", risk: metric.risk.level,
      targetPurchaseUnits: null, safetyStockUnits: null, baseline: null,
      pendingOrdersNotCredited: metric.leadTime.pendingOrders, pendingUnitsNotCredited: metric.leadTime.pendingUnits,
    };
    assessments.push(assessment);
    const block = (status: NeedAssessment["status"], reason: string) => Object.assign(assessment, { status, reason });
    if (sku.status === "descontinuado") {
      dispositionOpportunities.push({ sku: sku.sku, usableUnits: metric.stock.usableUnits, valueCents: metric.stock.valueCents, action: "manual_disposition_review" });
      block("discontinued", "Descontinuado: revisar destinação ou liquidação separadamente; sem reposição rotineira."); continue;
    }
    if (metric.stock.state === "negative") { block("negative_stock", "Saldo negativo não é disponibilidade: reconciliar antes de planejar."); continue; }
    try { purchaseQuantities(sku, 1); } catch {
      block("invalid_constraints", "Custo positivo, unidade e MOQ válidos são necessários."); continue;
    }
    if (!suppliers.has(sku.fornecedor)) { block("invalid_constraints", "Fornecedor não resolvido."); continue; }
    const window = metric.sales.find((w) => w.days === config.demandWindowDays)!;
    if (metric.stock.usableUnits === null || window.estimatedDailyDemand === null || window.calendarStdDev === null) {
      block("insufficient_data", "Faltam saldo atual utilizável ou calendário de vendas sem lacunas/censura suficiente para uma proxy."); continue;
    }
    if (window.estimatedDailyDemand === 0) { block("zero_observed_demand", "Proxy observada zero; sem benefício de reposição estimável."); continue; }
    if (metric.leadTime.status !== "sufficient" || metric.leadTime.meanDays === null || metric.leadTime.sampleStdDevDays === null || metric.risk.replenishmentDays === null) {
      block("insufficient_data", "Lead time ou sua variabilidade têm amostra insuficiente."); continue;
    }
    const leadTimeDays = Math.ceil(metric.risk.replenishmentDays);
    const arrivalDate = shiftDate(config.orderDate, leadTimeDays);
    const calendar = scenarioCalendar(window.estimatedDailyDemand, config);
    const baseline = projectPurchase(calendar, metric.stock.usableUnits, 0, arrivalDate, sku.custo_unitario_centavos, config);
    assessment.baseline = baseline;
    if (arrivalDate > config.horizonEnd) { block("arrival_after_horizon", "Chegada estimada fora do horizonte; nenhuma compra proposta."); continue; }
    const peakBps = Math.max(10000, ...calendar.filter((d) => d.date >= arrivalDate).map((d) =>
      d.campaign === "black_friday" ? config.scenario.blackFridayMultiplierBps : d.campaign === "christmas" ? config.scenario.christmasMultiplierBps : 10000));
    const factor = peakBps / 10000;
    // One-sided normal 96,5% factor, under explicitly conditional independence/stationarity assumptions.
    const safetyStockUnits = config.scenario.safetyStock === "none" ? 0 : Math.ceil(1.8119106729525971 * Math.sqrt(
      metric.leadTime.meanDays * (window.calendarStdDev * factor) ** 2 +
      (window.estimatedDailyDemand * factor) ** 2 * metric.leadTime.sampleStdDevDays ** 2));
    if (!Number.isSafeInteger(safetyStockUnits)) throw new Error("Estoque de segurança fora do intervalo seguro.");
    const safetyGap = Math.max(0, toMicro(safetyStockUnits) - baseline.endingStockMicroUnits);
    const target = ceilRatio(BigInt(baseline.remediableUnservedMicroUnits) + BigInt(safetyGap), BigInt(MICRO_UNITS));
    Object.assign(assessment, { targetPurchaseUnits: target, safetyStockUnits });
    if (!target) { block("no_need", "Estoque projetado suficiente para o cenário e buffer; sem compra necessária."); continue; }
    const warnings: BuyingAlert[] = [];
    if (metric.leadTime.pendingOrders) warnings.push({ sku: sku.sku, code: "pending_orders_uncertain", message: "Pedidos abertos não foram creditados ao estoque nem descontados do orçamento; confirmar para evitar compra duplicada." });
    if (baseline.firstUnservedDate && baseline.firstUnservedDate < arrivalDate) warnings.push({ sku: sku.sku, code: "prearrival_shortfall", message: "Há demanda de cenário não atendida antes da chegada; a compra não recupera esse período." });
    for (const campaign of baseline.campaigns) {
      if (arrivalDate > campaign.end) warnings.push({ sku: sku.sku, code: "arrival_after_" + campaign.campaign, message: "Lead time considerado não permite atender esta campanha: " + campaign.campaign + "." });
      else if (arrivalDate > campaign.start) warnings.push({ sku: sku.sku, code: "arrival_during_" + campaign.campaign, message: "Chegada estimada durante a campanha; início não coberto." });
    }
    alerts.push(...warnings);
    needs.push({ sku, risk: metric.risk.level, coverageDays: metric.coverage.days,
      observedDailySales: window.estimatedDailyDemand, observedDailyStdDev: window.calendarStdDev,
      leadTime: metric.leadTime, leadTimeDays, arrivalDate, usableStockUnits: metric.stock.usableUnits,
      safetyStockUnits, targetPurchaseUnits: target, calendar, baseline,
      priorityDate: baseline.firstRemediableShortfallDate ?? config.horizonEnd, warnings });
    assessment.reason = "Necessidade calculada sob cenário condicional; comparar alternativas e orçamento.";
  }
  return { needs, assessments, alerts, dispositionOpportunities };
}

