import { SYNTHETIC_RULES, MICRO_UNITS, ceilRatio, purchaseQuantities } from "./policy.ts";
import { projectPurchase } from "./projection.ts";
import type { BuyingConfig, EligibleNeed, PurchaseAlternative } from "./types.ts";

export function maximumLots(need: EligibleNeed): number {
  return ceilRatio(BigInt(need.targetPurchaseUnits), BigInt(purchaseQuantities(need.sku, 1).physicalUnits));
}
export function makeAlternative(need: EligibleNeed, lots: number, config: BuyingConfig): PurchaseAlternative {
  if (lots > maximumLots(need)) throw new Error("Quantidade acima da necessidade arredondada por MOQ.");
  const quantity = purchaseQuantities(need.sku, lots);
  const projection = projectPurchase(need.calendar, need.usableStockUnits, quantity.physicalUnits, need.arrivalDate, need.sku.custo_unitario_centavos, config);
  const additionalServedMicroUnits = projection.servedMicroUnits - need.baseline.servedMicroUnits;
  const safetyTarget = need.safetyStockUnits * MICRO_UNITS;
  const addedSafetyMicroUnits = Math.min(safetyTarget, projection.endingStockMicroUnits) - Math.min(safetyTarget, need.baseline.endingStockMicroUnits);
  const service = additionalServedMicroUnits / MICRO_UNITS, buffer = addedSafetyMicroUnits / MICRO_UNITS;
  return {
    id: need.sku.sku + "::lots=" + lots, sku: need.sku.sku, supplier: need.sku.fornecedor, orderDate: config.orderDate,
    purchaseUnit: need.sku.unidade_compra, quantityPurchaseUnits: quantity.quantityPurchaseUnits,
    physicalUnits: quantity.physicalUnits, estimatedCostCents: quantity.costCents, lotCount: lots,
    leadTimeDays: need.leadTimeDays, estimatedArrivalDate: need.arrivalDate,
    leadTimeEvidence: { sampleSize: need.leadTime.sampleSize, meanDays: need.leadTime.meanDays, sampleStdDevDays: need.leadTime.sampleStdDevDays },
    risk: need.risk, urgency: need.baseline.firstUnservedDate && need.baseline.firstUnservedDate < need.arrivalDate ? "before_replenishment" : "within_horizon",
    priorityDate: need.priorityDate,
    benefit: { additionalServedUnits: service, addedSafetyBufferUnits: buffer, additionalServedMicroUnits, addedSafetyMicroUnits,
      interpretation: "conditional_scenario_improvement" },
    projection, confidence: "conditional",
    assumptions: [
      "Projeção condicional baseada na proxy de vendas observadas; não é demanda real ou previsão validada.",
      config.operational ? "Nenhuma campanha ou crescimento sazonal foi inferido; cenário constante explicitamente identificado." : "Sazonalidade hipotética em pontos-base: Black Friday=" + config.scenario.blackFridayMultiplierBps + "; Natal=" + config.scenario.christmasMultiplierBps + ".",
      "Chegada no início da data estimada, sem confirmação do fornecedor; lead time do analytics arredondado para cima.",
      "Déficits anteriores à chegada não são recuperados; não há informação de backorders.",
      "Pendências não creditadas; recebimentos até a base já estão representados no saldo, sem soma novamente.",
      config.scenario.safetyStock === "none" ? "Cenário sem buffer de segurança." : "Buffer normal aproximado de 96,5%, sob independência e estacionariedade; sem garantia de serviço.",
      "Custo estimado pelo custo unitário atual do catálogo, por unidade física; não é cotação do fornecedor.",
    ],
    explanation: service > 0 ? "Alternativa acrescenta " + service + " unidades de atendimento no cenário e " + buffer + " unidades de buffer; respeita MOQ e unidade de compra." :
      "Alternativa acrescenta " + buffer + " unidades ao buffer de segurança estimado, sem aumento do atendimento nominal no horizonte.",
  };
}
export function generateAlternatives(need: EligibleNeed, config: BuyingConfig): PurchaseAlternative[] {
  const lot = purchaseQuantities(need.sku, 1);
  const max = maximumLots(need);
  const levels = new Set<number>([1, max, Math.min(max, Math.floor(config.budgetCents / lot.costCents))]);
  levels.add(ceilRatio(BigInt(need.baseline.remediableUnservedMicroUnits), BigInt(lot.physicalUnits) * BigInt(MICRO_UNITS)));
  for (const period of config.operational ? [] : [SYNTHETIC_RULES.blackFriday, SYNTHETIC_RULES.christmas]) {
    const partial = projectPurchase(need.calendar.filter((day) => day.date <= period.end), need.usableStockUnits, 0,
      need.arrivalDate, need.sku.custo_unitario_centavos, { ...config, horizonEnd: period.end });
    levels.add(ceilRatio(BigInt(partial.remediableUnservedMicroUnits), BigInt(lot.physicalUnits) * BigInt(MICRO_UNITS)));
  }
  // Unaffordable full-horizon quantities can overflow even when a single lot is valid.
  // Preserve the smallest-lot diagnostic and all affordable alternatives without quoting unsafe totals.
  const safeLots = Number(BigInt(Number.MAX_SAFE_INTEGER) / BigInt(lot.costCents));
  return [...levels].filter((lots) => lots > 0 && lots <= max && lots <= safeLots).sort((a, b) => a - b).map((lots) => makeAlternative(need, lots, config));
}

