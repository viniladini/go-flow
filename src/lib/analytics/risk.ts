import type { CoverageMetric, LeadTimeMetric, RiskMetric, SkuStatus } from "./types.ts";

export function classifyRisk(status: SkuStatus, coverage: CoverageMetric, lead: LeadTimeMetric, bufferStd = 1): RiskMetric {
  if (status === "descontinuado") return { level: "discontinued", reason: "SKU descontinuado: avaliar destinação, sem reposição rotineira.", replenishmentDays: null };
  if (coverage.status === "negative_stock") return { level: "anomaly", reason: "Saldo negativo: reconciliar estoque antes de classificar risco.", replenishmentDays: null };
  if (coverage.status !== "available" || coverage.days === null || lead.status !== "sufficient" || lead.meanDays === null || (bufferStd > 0 && lead.sampleStdDevDays === null)) {
    return { level: "insufficient", reason: coverage.status === "zero_demand" ? "Vendas observadas iguais a zero; cobertura e risco não determinados." : "Faltam estoque atual, evidência de vendas sem censura ou amostra de lead time.", replenishmentDays: null };
  }
  const horizon = lead.meanDays + bufferStd * (lead.sampleStdDevDays ?? 0);
  if (!Number.isFinite(horizon)) return { level: "insufficient", reason: "Horizonte de reposição fora do intervalo numérico finito.", replenishmentDays: null };
  if (coverage.days <= lead.meanDays) return { level: "critical", reason: "Cobertura menor ou igual ao lead time médio observado.", replenishmentDays: horizon };
  if (coverage.days <= horizon) return { level: "attention", reason: "Cobertura dentro do lead time médio acrescido do buffer de variabilidade.", replenishmentDays: horizon };
  return { level: "low", reason: "Cobertura superior ao horizonte de reposição configurado; não é garantia de serviço.", replenishmentDays: horizon };
}

