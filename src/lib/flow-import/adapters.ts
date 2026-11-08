import { calculateStock, calculateCoverage } from "../analytics/inventory";
import { calculateSalesWindow } from "../analytics/sales";
import { calculateLeadTime } from "../analytics/lead-time";
import { classifyRisk } from "../analytics/risk";
import type { ImportedOperation } from "./types";

/** No case defaults: only the operation's explicit reference/window and existing pure rules. */
export function getImportedSkuEvidence(operation: ImportedOperation, skuId: string) {
  const { dataset, parameters } = operation;
  const sku = dataset.skus.find((s) => s.sku === skuId);
  if (!sku) return null;
  const issues = dataset.issues.filter((i) => i.sku === skuId);
  const stock = calculateStock(sku, dataset.stocks, parameters.referenceDate, 0, issues);
  const sales = calculateSalesWindow(skuId, dataset.sales, dataset.stocks, parameters.referenceDate, parameters.demandWindowDays, issues);
  const leadTime = calculateLeadTime(skuId, dataset.purchases, parameters.referenceDate, 3);
  const coverage = calculateCoverage(stock, sales.estimatedDailyDemand, parameters.demandWindowDays);
  return { stock, sales, leadTime, coverage, risk: classifyRisk(sku.status, coverage, leadTime, 1) };
}
/** @deprecated Legacy case preflight. Active pages use operations/service and its explicit policy. */
export function prepareImportedEngineInputs(operation: ImportedOperation) {
  return {
    dataset: operation.dataset, parameters: operation.parameters,
    analytics: { status: "pure_rules_ready" as const, explanation: "Regras puras disponíveis; as quatro abas usam o serviço operacional com referência e janela explícitas." },
    buying: { status: "unavailable" as const, explanation: "Esta prévia legada não executa a política fixa do case em importações. A integração ativa usa createOperationalBuyingPlan com política operacional explícita." },
  };
}
