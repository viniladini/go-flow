import { SYNTHETIC_RULES, purchaseQuantities, stableCompare } from "./policy.ts";
import { makeAlternative, maximumLots } from "./alternatives.ts";
import type { BuyingConfig, EligibleNeed, PurchaseAlternative } from "./types.ts";

export function validateProposals(proposals: readonly PurchaseAlternative[], needs: readonly EligibleNeed[], config: BuyingConfig) {
  const errors: string[] = [], ids = new Set<string>();
  const map = new Map(needs.map((n) => [n.sku.sku, n]));
  let total = BigInt(0);
  for (const proposal of proposals) {
    if (ids.has(proposal.sku)) errors.push("duplicate_sku:" + proposal.sku);
    ids.add(proposal.sku);
    const need = map.get(proposal.sku);
    if (!need || need.sku.status !== "ativo") { errors.push("ineligible_sku:" + proposal.sku); continue; }
    try {
      const lots = proposal.quantityPurchaseUnits / need.sku.moq;
      if (lots !== proposal.lotCount || lots > maximumLots(need)) throw new Error("Lotes inválidos.");
      const q = purchaseQuantities(need.sku, lots);
      if (proposal.purchaseUnit !== need.sku.unidade_compra || q.physicalUnits !== proposal.physicalUnits || q.costCents !== proposal.estimatedCostCents) errors.push("quantity_or_cost:" + proposal.sku);
      if (proposal.orderDate < config.horizonStart || proposal.orderDate > config.horizonEnd ||
        proposal.orderDate !== config.orderDate || proposal.estimatedArrivalDate !== need.arrivalDate ||
        proposal.estimatedArrivalDate > config.horizonEnd || proposal.leadTimeDays !== need.leadTimeDays ||
        proposal.supplier !== need.sku.fornecedor) errors.push("timing_or_supplier:" + proposal.sku);
      const expected = makeAlternative(need, lots, config);
      if (JSON.stringify(proposal.benefit) !== JSON.stringify(expected.benefit) ||
          JSON.stringify(proposal.projection) !== JSON.stringify(expected.projection) ||
          JSON.stringify(proposal.leadTimeEvidence) !== JSON.stringify(expected.leadTimeEvidence) || proposal.urgency !== expected.urgency || proposal.priorityDate !== expected.priorityDate ||
          proposal.risk !== expected.risk || proposal.confidence !== "conditional" || proposal.id !== expected.id) errors.push("projection_or_evidence:" + proposal.sku);
      if (proposal.benefit.additionalServedMicroUnits <= 0 && proposal.benefit.addedSafetyMicroUnits <= 0) errors.push("no_benefit:" + proposal.sku);
      if (!Number.isSafeInteger(proposal.estimatedCostCents) || proposal.estimatedCostCents <= 0) errors.push("invalid_money:" + proposal.sku);
      else total += BigInt(proposal.estimatedCostCents);
    } catch { errors.push("invalid_proposal:" + proposal.sku); }
  }
  if (total > BigInt(config.budgetCents) || total > BigInt(config.operational ? config.operational.budgetCents : SYNTHETIC_RULES.maxBudgetCents)) errors.push("budget_exceeded");
  return { valid: errors.length === 0, errors: errors.sort(stableCompare), totalCostCents: total > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(total) };
}

