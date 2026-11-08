import { purchaseQuantities, stableCompare } from "./policy.ts";
import { generateAlternatives, makeAlternative, maximumLots } from "./alternatives.ts";
import type { AlternativeDecision, BuyingConfig, EligibleNeed, PurchaseAlternative } from "./types.ts";

interface Candidate {
  alternative: PurchaseAlternative; cost: number; benefit: number; effectiveCost: bigint;
  tier: number; date: string; riskRank: number;
}
const rank = { critical: 0, attention: 1, low: 2, insufficient: 3, anomaly: 4, discontinued: 5 };
function compare(a: Candidate, b: Candidate) {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const date = stableCompare(a.date, b.date); if (date) return date;
  if (a.riskRank !== b.riskRank) return a.riskRank - b.riskRank;
  const left = BigInt(a.benefit) * b.effectiveCost, right = BigInt(b.benefit) * a.effectiveCost;
  if (left !== right) return left > right ? -1 : 1;
  if (a.benefit !== b.benefit) return b.benefit - a.benefit;
  if (a.cost !== b.cost) return a.cost - b.cost;
  return stableCompare(a.alternative.sku, b.alternative.sku) || a.alternative.lotCount - b.alternative.lotCount;
}
export function selectAlternatives(needs: readonly EligibleNeed[], config: BuyingConfig) {
  const pools = new Map(needs.map((need) => [need.sku.sku, new Map(generateAlternatives(need, config).map((a) => [a.lotCount, a]))]));
  const chosen = new Map<string, PurchaseAlternative>();
  let remaining = config.budgetCents, iterations = 0;
  while (true) {
    const candidates: Candidate[] = [];
    for (const need of needs) {
      const current = chosen.get(need.sku.sku);
      const pool = pools.get(need.sku.sku)!;
      const lot = purchaseQuantities(need.sku, 1);
      // An affordable partial upgrade prevents rounding UP past the remaining budget.
      const affordable = Math.min(maximumLots(need), (current?.lotCount ?? 0) + Math.floor(remaining / lot.costCents));
      if (affordable > (current?.lotCount ?? 0) && !pool.has(affordable)) pool.set(affordable, makeAlternative(need, affordable, config));
      for (const alternative of pool.values()) {
        if (alternative.lotCount <= (current?.lotCount ?? 0)) continue;
        const cost = alternative.estimatedCostCents - (current?.estimatedCostCents ?? 0);
        if (cost <= 0 || cost > remaining) continue;
        const served = alternative.benefit.additionalServedMicroUnits - (current?.benefit.additionalServedMicroUnits ?? 0);
        const safety = alternative.benefit.addedSafetyMicroUnits - (current?.benefit.addedSafetyMicroUnits ?? 0);
        if (served <= 0 && safety <= 0) continue;
        const tier = served > 0 ? 0 : 1;
        candidates.push({
          alternative, cost, tier, benefit: tier === 0 ? served : safety,
          effectiveCost: BigInt(cost) + BigInt(alternative.projection.carryingCostCents - (current?.projection.carryingCostCents ?? 0)),
          date: tier === 0 ? current?.projection.firstRemediableShortfallDate ?? need.priorityDate : config.horizonEnd,
          riskRank: rank[need.risk],
        });
      }
    }
    if (!candidates.length) break;
    candidates.sort(compare);
    const best = candidates[0];
    chosen.set(best.alternative.sku, best.alternative);
    remaining -= best.cost;
    if (++iterations > needs.length * 10) throw new Error("Limite de transições da heurística excedido.");
  }
  const alternatives: AlternativeDecision[] = [...pools.values()].flatMap((pool) => [...pool.values()])
    .sort((a, b) => stableCompare(a.sku, b.sku) || a.lotCount - b.lotCount).map((alternative) => {
      const selected = chosen.get(alternative.sku);
      if (selected?.id === alternative.id) return { alternative, selected: true, reason: "selected", explanation: "Selecionada pela heurística com benefício marginal positivo e validação de orçamento." };
      if (alternative.estimatedCostCents > config.budgetCents) return { alternative, selected: false, reason: "financial_infeasible", explanation: "Custo integral da alternativa excede o orçamento total do plano." };
      if (alternative.benefit.additionalServedMicroUnits <= 0 && alternative.benefit.addedSafetyMicroUnits <= 0) return { alternative, selected: false, reason: "no_estimable_benefit", explanation: "Sem atendimento ou buffer adicional estimável no cenário." };
      if (selected && alternative.lotCount < selected.lotCount) return { alternative, selected: false, reason: "superseded_for_sku", explanation: "Substituída por outra quantidade do mesmo SKU; não somar alternativas." };
      return { alternative, selected: false, reason: "budget_competition", explanation: "Não selecionada após a alocação do orçamento entre alternativas concorrentes." };
    });
  return { chosen: [...chosen.values()].sort((a, b) => stableCompare(a.sku, b.sku)), alternatives, remaining };
}

