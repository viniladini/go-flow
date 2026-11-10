import "server-only";
import { createHash } from "node:crypto";
import { aggregateDashboard } from "../analytics";
import type { AnalyticsResult, Dataset, SkuMetrics } from "../analytics/types";
import { RISK_LABELS } from "../dashboard/presentation";
import { formatDays, formatMoney, formatNumber } from "../dashboard/format";
import type { AnalysisBrief, AnalysisFollowUpContext, AnalysisTopic } from "./contracts";
import { AgentError } from "./contracts";
import { analyticText, analysisTopic } from "./analysis-topics";

export function coverageDeficitDays(metric: SkuMetrics): number | null {
  if (metric.status !== "ativo" || metric.stock.stale || metric.coverage.status !== "available" || metric.leadTime.status !== "sufficient" ||
    metric.coverage.days === null || metric.leadTime.meanDays === null || metric.coverage.days < 0 || metric.leadTime.meanDays < 0 || !Number.isFinite(metric.coverage.days) || !Number.isFinite(metric.leadTime.meanDays)) return null;
  return Math.max(0, metric.leadTime.meanDays - metric.coverage.days);
}
const riskOrder = { critical: 0, anomaly: 1, attention: 2, insufficient: 3, low: 4, discontinued: 5 };
const opportunityCapital = (row: SkuMetrics) => Math.max(row.movement.excessCapitalCents ?? -1, row.movement.lowMovementCapitalCents ?? -1, row.status === "descontinuado" ? row.stock.valueCents ?? -1 : -1);
export function rankAnalyticSkus(rows: readonly SkuMetrics[], topic: AnalysisTopic): SkuMetrics[] {
  const eligible = rows.filter((row) => topic === "opportunities" ? row.movement.excess === "identified" || row.movement.lowMovement === "identified" || row.status === "descontinuado" :
    topic === "coverage" ? coverageDeficitDays(row) !== null : topic === "lead_time" ? row.status === "ativo" && row.leadTime.status === "sufficient" && row.leadTime.meanDays !== null : row.status === "ativo");
  return [...eligible].sort((a, b) => {
    const compare = topic === "opportunities" ? opportunityCapital(b) - opportunityCapital(a) :
      topic === "lead_time" ? b.leadTime.meanDays! - a.leadTime.meanDays! || b.leadTime.pendingOrders - a.leadTime.pendingOrders :
        topic === "coverage" ? (coverageDeficitDays(b) ?? -1) - (coverageDeficitDays(a) ?? -1) || a.coverage.days! - b.coverage.days! :
          riskOrder[a.risk.level] - riskOrder[b.risk.level] || (coverageDeficitDays(b) ?? -1) - (coverageDeficitDays(a) ?? -1);
    return compare || a.sku.localeCompare(b.sku);
  });
}
const titles: Record<AnalysisTopic, string> = { risk: "Onde o estoque pede atenção", priorities: "O que revisar primeiro", causes: "O que explica a exposição", coverage: "O estoque cobre o prazo de reposição?", lead_time: "Onde os prazos pesam mais", opportunities: "Onde revisar o capital em estoque" };
const criteria: Record<AnalysisTopic, string> = {
  risk: "Risco crítico, anomalia, atenção e dados insuficientes; dentro de cada grupo, maior déficit válido de cobertura. Desempate por SKU.",
  priorities: "Risco crítico primeiro, depois anomalias e atenção; maior déficit válido dentro do grupo. Desempate por SKU.",
  causes: "Classificação do motor e maior diferença válida entre prazo médio e cobertura; são fatores observados, não prova de causalidade. Desempate por SKU.",
  coverage: "Maior déficit entre lead time médio e cobertura; depois menor cobertura. Exclui dados insuficientes e saldos defasados. Desempate por SKU.",
  lead_time: "Maior lead time médio com amostra suficiente; depois maior número de pedidos pendentes. Desempate por SKU.",
  opportunities: "Maior capital elegível ao custo entre excesso, baixo giro ou descontinuados. Categorias podem se sobrepor; os valores não são somados. Desempate por SKU.",
};
const nextSteps = {
  reconcile: "Confira o saldo e complete as evidências antes de decidir uma reposição.",
  pending: "Confirme o status e a previsão dos pedidos pendentes. Eles ainda não são estoque recebido.",
  lead: "Complete ou revise o histórico de recebimentos antes de confiar no prazo estimado.",
  planning: "Revise disponibilidade e prazo de chegada; se a exposição persistir, solicite um planejamento separado para revisão humana.",
  excess: "Revise giro e parâmetros de reposição antes de ampliar estoque. O capital identificado não é economia garantida.",
  discontinued: "Avalie a destinação em revisão manual; não faça reposição rotineira de descontinuados.",
  monitor: "Acompanhe cobertura e recebimentos; a classificação atual não garante atendimento futuro.",
};
function stepFor(row: SkuMetrics, topic: AnalysisTopic): keyof typeof nextSteps {
  if (row.status === "descontinuado") return "discontinued";
  if (row.stock.stale || ["negative", "missing", "no_history"].includes(row.stock.state) || row.risk.level === "anomaly" || row.risk.level === "insufficient" && row.leadTime.status === "sufficient") return "reconcile";
  if (topic === "opportunities") return "excess";
  if (row.leadTime.pendingOrders > 0) return "pending";
  if (row.leadTime.status !== "sufficient") return "lead";
  return ["critical", "attention"].includes(row.risk.level) ? "planning" : "monitor";
}
function recommendationText(row: SkuMetrics, step: keyof typeof nextSteps): string {
  if (step === "pending" && row.risk.level === "critical") return "Nos itens críticos, confirme se os pedidos pendentes podem chegar antes de a cobertura estimada terminar. Até a confirmação, não conte essas quantidades como estoque recebido.";
  if (step === "pending" && row.risk.level === "attention") return "Confira o prazo dos pedidos pendentes: a cobertura está dentro da margem de variabilidade do motor. Reavalie a exposição se a chegada não for confirmada.";
  if (step === "pending" && row.risk.level === "low") return "Nos itens de risco baixo, confira o andamento dos pedidos pendentes antes de ampliar a reposição, para evitar sobreposição de compras.";
  if (step === "reconcile" && row.stock.state === "negative") return "Concilie o saldo negativo com os registros de estoque antes de interpretar a necessidade de reposição.";
  if (step === "reconcile" && (row.stock.stale || ["missing", "no_history"].includes(row.stock.state))) return "Atualize ou confirme a posição de estoque; o saldo disponível não sustenta uma comparação atual de cobertura.";
  if (step === "reconcile") return "Complete as evidências de vendas e cobertura antes de concluir que é necessário repor. Dados insuficientes não representam demanda zero.";
  if (step === "planning" && row.risk.level === "critical") return "Revise primeiro saldo e prazo de chegada dos itens críticos. Se a exposição persistir, solicite um planejamento separado para revisão humana.";
  if (step === "planning" && row.risk.level === "attention") return "Confira a folga de cobertura frente à variação dos prazos antes de solicitar um planejamento para revisão.";
  if (step === "excess" && row.movement.lowMovement === "identified") return "Revise o consumo e a destinação dos itens de baixa movimentação antes de ampliar a reposição. O capital identificado não é economia garantida.";
  return nextSteps[step];
}
function explainSelection(items: AnalysisBrief["items"], focus: AnalysisTopic): string {
  if (focus === "lead_time") return "A ordem considera o maior prazo médio com amostra suficiente, não o maior risco. Prazo elevado não significa necessariamente ruptura: a cobertura e as demais evidências podem sustentar classificações diferentes.";
  if (focus === "coverage") return "A comparação começa pelo maior déficit válido; em empate, usa a menor cobertura e depois o SKU. Dados sem comparação válida não recebem déficit zero.";
  if (focus === "opportunities") return "Esses materiais aparecem pelos sinais de excesso, baixo giro ou descontinuação. A ordem usa o maior capital elegível de cada item, sem somar categorias sobrepostas; não é uma estimativa de economia realizada.";
  const first = items[0], differentRisk = items.find((item) => item.risk !== first?.risk);
  if (first && differentRisk) return `${first.sku} aparece antes de ${differentRisk.sku} porque a classe de risco ${first.riskLabel.toLowerCase()} precede ${differentRisk.riskLabel.toLowerCase()} nos critérios exibidos. O prazo isolado não determina essa ordem.`;
  const differentDeficit = items.find((item) => item.coverageDeficitDays !== first?.coverageDeficitDays);
  if (first?.coverageDeficitDays !== null && first?.coverageDeficitDays !== undefined && differentDeficit?.coverageDeficitDays !== null && differentDeficit?.coverageDeficitDays !== undefined) {
    if (formatDays(first.coverageDeficitDays) === formatDays(differentDeficit.coverageDeficitDays)) return "Na mesma classe de risco, a ordem usa os déficits do motor antes da formatação. Os rótulos arredondados aparecem iguais, mas os valores usados na comparação diferem; isso não representa empate.";
    return `Na mesma classe de risco, ${first.sku} aparece antes de ${differentDeficit.sku} pelo maior déficit estimado: ${formatDays(first.coverageDeficitDays)} frente a ${formatDays(differentDeficit.coverageDeficitDays)}. Isso não comprova falta física.`;
  }
  if (differentDeficit) return "Dentro da mesma classe, as comparações válidas de cobertura aparecem primeiro. Materiais sem essa evidência não recebem déficit zero nem uma conclusão automática sobre urgência.";
  if (first && items.length === 1) return `${first.sku} aparece pela classificação de risco ${first.riskLabel.toLowerCase()}. ${first.reason}`;
  if (items.length > 1 && items.every((item) => item.coverageDays !== null && item.leadTimeDays !== null && item.coverageDays === first.coverageDays && item.leadTimeDays === first.leadTimeDays && item.coverageDeficitDays === first.coverageDeficitDays)) {
    return "Esses materiais têm a mesma classe de risco e os mesmos valores de cobertura, prazo médio e déficit estimado. Por esses indicadores, a prioridade é equivalente; o SKU apenas desempata a exibição.";
  }
  if (items.length > 1 && first?.coverageDeficitDays !== null) return "Esses materiais empatam na classe de risco e no déficit usado na ordenação; o SKU desempata a exibição. Isso não significa que os demais indicadores sejam iguais.";
  return "A seleção segue a classificação do motor e a comparação válida entre cobertura e prazo. Quando faltam evidências, não é possível concluir a urgência apenas pelo saldo ou pelo lead time.";
}
export function buildAnalysisBrief(dataset: Dataset, analytics: AnalyticsResult, prompt: string, previous?: AnalysisFollowUpContext) {
  const topic = analysisTopic(prompt, previous?.topic);
  // "Why?" keeps the subject being discussed instead of defaulting to stock risk.
  const subject = topic === "causes" ? analysisTopic(analyticText(prompt).replace(/\b(por que|porque|causas?|motivos?|expli\w*)\b/g, ""), previous?.topic) : topic;
  const focus = subject === "causes" ? "risk" : subject;
  const snapshotId = createHash("sha256").update(JSON.stringify({ version: "analysis-brief-v1", analytics, catalog: dataset.skus.map((row) => ({ sku: row.sku, name: row.descricao, status: row.status })) })).digest("hex");
  const catalog = new Map(dataset.skus.map((row) => [row.sku, row]));
  const explicit = [...new Set(prompt.toUpperCase().match(/DEMO-FLOW-\d{4}\b/g) ?? [])];
  if (explicit.some((sku) => !catalog.has(sku)) || explicit.length > 5) throw new AgentError("INVALID_ANALYSIS_SCOPE", "Selecione até cinco SKUs existentes na demonstração.", 422);
  const requested = explicit.length ? explicit : previous?.skuCodes ?? [];
  const scoped = explicit.length || previous ? analytics.skus.filter((row) => requested.includes(row.sku)) : analytics.skus;
  const eligible = rankAnalyticSkus(scoped, focus), eligibleSkus = new Set(eligible.map((row) => row.sku));
  const explainMissing = topic === "causes" && ["coverage", "lead_time"].includes(focus);
  const ranked = explainMissing ? [...eligible, ...rankAnalyticSkus(scoped.filter((row) => !eligibleSkus.has(row.sku)), "causes")] : eligible;
  const rows = ranked.slice(0, 5);
  const summary = aggregateDashboard(scoped, analytics.config.referenceDate, analytics.dashboard.normalizationIssueCount);
  const scopedRisk = (level: SkuMetrics["risk"]["level"]) => summary.risks[level];
  const validCoverage = scoped.filter((row) => coverageDeficitDays(row) !== null);
  const deficitCount = validCoverage.filter((row) => coverageDeficitDays(row)! > 0).length;
  const indicator = (id: string, label: string, value: string, detail: string) => ({ id, label, value, detail });
  const indicators: AnalysisBrief["indicators"] = focus === "opportunities" ? [
    indicator("excess", "Excesso potencial no escopo", formatMoney(summary.excessCapitalCents), "Ao custo; pode se sobrepor ao baixo giro."),
    indicator("low_movement", "Baixo giro no escopo", formatMoney(summary.lowMovementCapitalCents), "Não somar ao excesso; não é economia garantida."),
  ] : focus === "coverage" ? [
    indicator("deficit", "Cobertura abaixo do prazo", formatNumber(deficitCount), "SKUs avaliáveis no escopo consultado; exposição estimada."),
    indicator("evaluated", "Comparações válidas", formatNumber(validCoverage.length), `De ${formatNumber(scoped.length)} SKUs no escopo.`),
  ] : focus === "lead_time" ? [
    indicator("lead", "Maior prazo médio no escopo", formatDays(rows[0]?.leadTime.meanDays ?? null), "Somente amostras suficientes; não é promessa de entrega."),
    indicator("missing_lead", "Amostra de prazo insuficiente", formatNumber(scoped.filter((row) => row.leadTime.status !== "sufficient").length), "Histórico de recebimentos que precisa ser completado."),
  ] : [
    indicator("critical", "Risco crítico no escopo", formatNumber(scopedRisk("critical")), "Comparação do motor; não comprova ruptura física."),
    indicator("attention", "Atenção no escopo", formatNumber(scopedRisk("attention")), "Cobertura dentro da margem de variabilidade configurada."),
    indicator("insufficient", "Dados insuficientes no escopo", formatNumber(scopedRisk("insufficient")), "Não tratar ausência de evidência como risco zero."),
  ];
  const summaries: Record<AnalysisTopic, string> = {
    risk: scopedRisk("critical") ? `${formatNumber(scopedRisk("critical"))} SKUs no escopo estão em risco crítico: a reposição pode chegar depois de a cobertura estimada terminar. Comece pelos itens expostos abaixo; isso não comprova falta física.` : "O motor não classificou risco crítico neste escopo. Confira os demais sinais e as lacunas de evidência antes de concluir que o atendimento está garantido.",
    priorities: `Entre ${formatNumber(scoped.length)} SKUs consultados, ${formatNumber(scopedRisk("critical"))} estão em risco crítico. Eu começaria pela exposição mais urgente abaixo, separando faltas de evidência de necessidade de reposição. Prioridade não é ordem de compra.`,
    causes: `A classificação inclui ${formatNumber(scopedRisk("insufficient"))} SKUs com dados insuficientes neste escopo. Nos demais, a comparação entre cobertura e prazo ajuda a explicar a exposição; ela não demonstra causalidade nem responsabilidade do fornecedor.`,
    coverage: deficitCount ? `${formatNumber(deficitCount)} de ${formatNumber(validCoverage.length)} SKUs avaliáveis têm cobertura abaixo do lead time médio. O déficit mostra essa diferença em dias, não uma quantidade a comprar ou uma ruptura confirmada.` : "Não há déficit positivo entre cobertura e lead time nas comparações válidas deste escopo. Isso não elimina incertezas nem resolve os itens sem dados suficientes.",
    lead_time: `O maior prazo médio observado neste escopo é ${formatDays(rows[0]?.leadTime.meanDays ?? null)}. Esta lista compara prazos, não urgência de reposição: prazo elevado não significa necessariamente risco de ruptura. A cobertura e a classificação de cada material completam a leitura.`,
    opportunities: `Há ${formatNumber(ranked.length)} materiais no escopo para revisar por excesso potencial, baixa movimentação ou descontinuação. Investigue destinação e parâmetros de reposição; o capital identificado não representa economia realizada.`,
  };
  const items: AnalysisBrief["items"] = rows.map((row) => ({ sku: row.sku, name: catalog.get(row.sku)!.descricao, risk: row.risk.level, riskLabel: RISK_LABELS[row.risk.level],
    reason: focus === "opportunities" ? row.status === "descontinuado" ? "Item descontinuado; revisar destinação, sem reposição rotineira." : `Capital elegível ao custo: ${formatMoney(opportunityCapital(row) < 0 ? null : opportunityCapital(row))}. Categorias potencialmente sobrepostas.` :
      focus === "lead_time" ? `${row.coverage.status !== "available" || row.stock.stale || row.coverage.days === null || row.leadTime.status !== "sufficient" || row.leadTime.meanDays === null ? "Sem comparação válida entre cobertura e prazo." : row.coverage.days > row.leadTime.meanDays ? "A cobertura estimada supera o prazo médio." : row.coverage.days === row.leadTime.meanDays ? "Cobertura e prazo médio coincidem, sem folga nessa comparação." : "A cobertura estimada termina antes do prazo médio."} ${formatNumber(row.leadTime.sampleSize)} recebimentos na amostra; ${formatNumber(row.leadTime.pendingOrders)} pedidos pendentes.` : row.risk.reason,
    coverageDays: row.coverage.status === "available" && !row.stock.stale ? row.coverage.days : null,
    leadTimeDays: row.leadTime.status === "sufficient" ? row.leadTime.meanDays : null, coverageDeficitDays: coverageDeficitDays(row) }));
  if (topic === "causes") summaries.causes = explainSelection(items, focus);
  const recommendations: AnalysisBrief["recommendations"] = [];
  for (const row of rows) {
    const step = stepFor(row, focus), text = recommendationText(row, step), existing = recommendations.find((item) => item.text === text);
    if (existing) { existing.skuCodes.push(row.sku); existing.evidenceIds.push(row.sku); }
    else recommendations.push({ id: `${step}_${recommendations.length}`, text, skuCodes: [row.sku], evidenceIds: [row.sku] });
  }
  const refreshed = !!previous && (previous.snapshotId !== snapshotId || previous.referenceDate !== analytics.config.referenceDate || requested.some((sku) => !catalog.has(sku)));
  const brief: AnalysisBrief = { topic, title: titles[topic], summary: rows.length ? summaries[topic] : "Não há itens elegíveis neste escopo para a comparação solicitada. Consulte os indicadores e complete as evidências antes de decidir.",
    criteria: topic === "causes" && focus !== "risk" ? `Comparações válidas: ${criteria[focus]} ${explainMissing ? "Itens sem evidência aparecem apenas para explicar a indisponibilidade. " : ""}Esses sinais não demonstram causalidade.` : criteria[topic], refreshed, indicators, items, recommendations };
  const context: AnalysisFollowUpContext = { topic: focus, skuCodes: requested.length ? requested.filter((sku) => catalog.has(sku)) : items.map((item) => item.sku), referenceDate: analytics.config.referenceDate, snapshotId };
  return { brief, context };
}
