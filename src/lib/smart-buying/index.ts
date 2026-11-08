import { SYNTHETIC_RULES, assertNormalizedInput, purchaseQuantities, resolveBuyingConfig, stableCompare } from "./policy.ts";
import { generateNeeds } from "./needs.ts";
import { selectAlternatives } from "./selection.ts";
import { validateProposals } from "./validation.ts";
import type { BuyingInput, BuyingResult, OperationalBuyingPolicy } from "./types.ts";
import type { Dataset } from "../analytics/types.ts";

export function createOperationalBuyingPlan(input: { dataset: Dataset; origin: BuyingInput["origin"]; policy: OperationalBuyingPolicy }): BuyingResult {
  if (!input.policy) throw new Error("Política operacional obrigatória.");
  return createSmartBuyingPlan(input);
}

export function createSmartBuyingPlan(input: BuyingInput): BuyingResult {
  const config = resolveBuyingConfig(input);
  assertNormalizedInput(input.dataset);
  const generated = generateNeeds(input.dataset, config);
  const selection = selectAlternatives(generated.needs, config);
  const validation = validateProposals(selection.chosen, generated.needs, config);
  if (!validation.valid || validation.totalCostCents === null) throw new Error("Plano rejeitado pela validação: " + validation.errors.join(","));
  const selectedIds = new Set(selection.chosen.map((p) => p.sku));
  for (const assessment of generated.assessments) {
    if (assessment.status !== "eligible") continue;
    const need = generated.needs.find((n) => n.sku.sku === assessment.sku)!;
    assessment.selectionStatus = selectedIds.has(assessment.sku) ? "selected" :
      purchaseQuantities(need.sku, 1).costCents > config.budgetCents ? "financial_infeasible" : "budget_competition";
    if (assessment.selectionStatus !== "selected") assessment.reason += assessment.selectionStatus === "financial_infeasible" ?
      " O menor lote excede o orçamento total deste plano." : " Outras alternativas consumiram o orçamento disponível.";
  }
  const alerts = [...generated.alerts,
    { code: "conditional_scenario", message: config.operational ? "Projeções condicionais; meta informada de " + (config.operational.serviceBps / 100).toLocaleString("pt-BR") + "% não é garantia. Sem buffer de segurança calibrado; nenhuma campanha foi inferida." : "Todas as projeções são condicionais; meta de 96,5% não é garantia de atendimento." },
    { code: "existing_orders_not_deducted", message: "Orçamento aplica-se somente às novas propostas; não se descontam compromissos já emitidos sem regra que o determine." },
    { code: "exploratory_duplicate_policy", message: "Tratamento de duplicatas segue a política exploratória auditada e exige confirmação antes de uso operacional." },
  ];
  if (config.scenario.blackFridayMultiplierBps !== 10000 || config.scenario.christmasMultiplierBps !== 10000) alerts.push({
    code: "hypothetical_seasonality", message: "Multiplicadores de campanha são hipóteses explícitas do cenário, não crescimento observado.",
  });
  if (input.dataset.issues.length) alerts.push({ code: "source_quality_issues", message: "Há " + input.dataset.issues.length + " avisos/erros de normalização; revisar as evidências locais." });
  alerts.sort((a, b) => stableCompare((a.sku ?? "") + a.code, (b.sku ?? "") + b.code));
  return {
    version: 1, origin: input.origin, config, methodology: "deterministic_greedy_upgrades_v1",
    globallyOptimal: false, requiresHumanApproval: true,
    budget: { totalCents: config.budgetCents, usedCents: validation.totalCostCents,
      remainingCents: config.budgetCents - validation.totalCostCents, scope: "new_proposals_only", existingOrdersDeductedCents: 0 },
    proposals: selection.chosen.map((p) => ({ ...p, status: "draft", humanApprovalRequired: true })),
    alternatives: selection.alternatives, assessments: generated.assessments, alerts,
    dispositionOpportunities: generated.dispositionOpportunities,
    limitations: [
      "Uma proposta por SKU, em uma data de emissão configurada; não otimiza calendário de múltiplos pedidos.",
      "Não é ótimo global. Quantidades discretas de MOQ e alternativas limitadas usam heurística explicável.",
      "Proxy exige vendas diárias explícitas e disponibilidade; não preenche dias ausentes com zero.",
      "Não estima vendas perdidas observadas, lucro incremental, receita futura garantida ou nível de serviço realizado.",
      "Cenário não incorpora pendências sem confirmação; pode haver risco de compra duplicada.",
      config.operational ? "Sem buffer de segurança calibrado; a meta de serviço informada não é garantia de atendimento." : "Buffer normal depende de independência/estacionariedade; demanda e lead time podem não satisfazer essas hipóteses.",
      "Taxas de carregamento estimadas por rateio simples em 365 dias/ano e 30 dias/mês; não consomem o orçamento de aquisição.",
      "Liquidação não executada. Limite de desconto: " + (config.operational ? config.operational.maxDiscountBps : SYNTHETIC_RULES.maxLiquidationDiscountBps) + " pontos-base, apenas como restrição futura.",
    ],
  };
}
export { SYNTHETIC_RULES } from "./policy.ts";
export { generateNeeds } from "./needs.ts";
export { generateAlternatives } from "./alternatives.ts";
export { selectAlternatives } from "./selection.ts";
export { validateProposals } from "./validation.ts";
export type * from "./types.ts";

