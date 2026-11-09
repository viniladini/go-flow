import { describe, expect, it, vi } from "vitest";
import { analyzeOperationalDataset, operationalAnalyticsConfig } from "@/lib/analytics";
import { buildAnalysisBrief, coverageDeficitDays, rankAnalyticSkus } from "@/lib/agent/analysis-brief";
import { demoAnalysisContext, verifiedAnalysis } from "@/lib/agent/analysis";
import { parseAgentRequest, parseAnalysisContext } from "@/lib/agent/contracts";
import { resolveAgentIntent } from "@/lib/agent/intent";
import { buyingFixture } from "../fixtures/buying";
import { operationalFixture } from "../fixtures/operational";
import type { SkuMetrics } from "@/lib/analytics/types";

vi.mock("server-only", () => ({}));
function metrics() {
  const dataset = buyingFixture([{ id: "DEMO-FLOW-0001", stock: 10 }, { id: "DEMO-FLOW-0002", stock: 2 }, { id: "DEMO-FLOW-0003", stock: 1 }]);
  const analytics = analyzeOperationalDataset(dataset, operationalAnalyticsConfig(dataset.referenceDate, 30));
  return { dataset, analytics };
}
function row(sku = "DEMO-FLOW-0001", coverage = 1.25, lead = 4.5): SkuMetrics {
  const metric = metrics().analytics.skus[0];
  return { ...metric, sku, status: "ativo", stock: { ...metric.stock, stale: false }, coverage: { status: "available", days: coverage, demandWindowDays: 30 },
    leadTime: { ...metric.leadTime, status: "sufficient", meanDays: lead, pendingOrders: 0 },
    risk: { level: "critical", reason: "Cobertura abaixo do prazo médio observado.", replenishmentDays: lead } };
}
describe("análise fundamentada e adaptativa", () => {
  it("calcula déficit fracionário sem arredondar ou alterar o risco do motor", () => {
    const metric = row(); const original = structuredClone(metric);
    expect(coverageDeficitDays(metric)).toBe(3.25);
    expect(coverageDeficitDays(row(undefined, 4.5, 4.5))).toBe(0);
    expect(coverageDeficitDays(row(undefined, 7, 4.5))).toBe(0);
    expect(coverageDeficitDays(row(undefined, 0.1, 0.3))).toBeCloseTo(0.2, 14);
    expect(coverageDeficitDays(row(undefined, -1, 3))).toBeNull();
    expect(metric).toEqual(original);
  });
  it.each(["insufficient", "zero_demand", "negative_stock"] as const)("não fabrica déficit com cobertura %s", (status) => {
    const metric = row(); metric.coverage.status = status; expect(coverageDeficitDays(metric)).toBeNull();
  });
  it("mantém desconhecido quando faltam dados de prazo, há defasagem ou descontinuação", () => {
    for (const change of ["lead", "stale", "discontinued", "infinite"] as const) {
      const metric = row();
      if (change === "lead") metric.leadTime.status = "insufficient";
      if (change === "stale") metric.stock.stale = true;
      if (change === "discontinued") metric.status = "descontinuado";
      if (change === "infinite") metric.coverage.days = Infinity;
      expect(coverageDeficitDays(metric)).toBeNull();
    }
  });
  it("prioriza severidade, maior déficit e SKU, sem usar a ordem de entrada", () => {
    const small = row("DEMO-FLOW-0001", 2, 3), large = row("DEMO-FLOW-0003", 1, 8), tied = row("DEMO-FLOW-0002", 1, 8);
    const attention = row("DEMO-FLOW-0004", 1, 20); attention.risk.level = "attention";
    const rows = [small, attention, large, tied];
    expect(rankAnalyticSkus(rows, "risk").map((metric) => metric.sku)).toEqual([tied.sku, large.sku, small.sku, attention.sku]);
    expect(rankAnalyticSkus([...rows].reverse(), "risk")).toEqual(rankAnalyticSkus(rows, "risk"));
    expect(rankAnalyticSkus(rows, "coverage")[0].sku).toBe(attention.sku);
    expect(rows[0]).toBe(small);
  });
  it("prioriza prazos e capital pelas métricas existentes, sem somar categorias sobrepostas", () => {
    const a = row("DEMO-FLOW-0001", 1, 2), b = row("DEMO-FLOW-0002", 1, 8);
    a.movement = { ...a.movement, excess: "identified", excessCapitalCents: 1200, lowMovementCapitalCents: 1200 };
    b.movement = { ...b.movement, excess: "identified", excessCapitalCents: 2000, lowMovementCapitalCents: null };
    expect(rankAnalyticSkus([a, b], "lead_time")[0].sku).toBe(b.sku);
    expect(rankAnalyticSkus([a, b], "opportunities")[0].sku).toBe(b.sku);
  });
  it("agregados e itens vêm do motor real e não apenas dos primeiros registros", () => {
    const { dataset, analytics } = metrics();
    const { brief } = buildAnalysisBrief(dataset, analytics, "Analise risco de ruptura");
    expect(brief.indicators.find((item) => item.id === "critical")!.value).toBe(String(analytics.dashboard.risks.critical));
    expect(brief.items.map((item) => item.sku)).toEqual(rankAnalyticSkus(analytics.skus, "risk").slice(0, 5).map((metric) => metric.sku));
    for (const item of brief.items) expect(item.coverageDeficitDays).toBe(coverageDeficitDays(analytics.skus.find((metric) => metric.sku === item.sku)!));
    expect(brief.summary).not.toMatch(/ruptura confirmada|compra executada/);
  });
  it("seis perguntas produzem títulos, critérios, indicadores e recomendações apropriados", () => {
    const { dataset, analytics } = metrics();
    const questions = ["Analise risco", "Quais as prioridades?", "Por que o risco?", "Qual a cobertura?", "Qual o lead time?", "Onde há capital parado?"];
    const replies = questions.map((question) => buildAnalysisBrief(dataset, analytics, question).brief);
    expect(new Set(replies.map((brief) => brief.topic)).size).toBe(6);
    expect(new Set(replies.map((brief) => brief.title)).size).toBe(6);
    expect(new Set(replies.map((brief) => brief.summary)).size).toBeGreaterThanOrEqual(5);
    expect(replies[3].indicators.map((item) => item.id)).toEqual(["deficit", "evaluated"]);
    expect(replies[4].indicators[0].id).toBe("lead");
    expect(replies[5].indicators[0].id).toBe("excess");
    for (const brief of replies) {
      expect(brief.items.length).toBeLessThanOrEqual(5);
      expect(new Set(brief.recommendations.map((item) => item.id)).size).toBe(brief.recommendations.length);
      for (const recommendation of brief.recommendations) expect(recommendation.evidenceIds.every((id) => brief.items.some((item) => item.sku === id))).toBe(true);
    }
  });
  it("seleção da IA não remove prioridades nem promove evidência irrelevante", () => {
    const { dataset, parameters } = operationalFixture("DEMO-FLOW-0001");
    const context = demoAnalysisContext({ dataset, parameters }, "Analise cobertura");
    const response = verifiedAnalysis(context, JSON.stringify({ factIds: ["excess"] }), "fixture-model");
    expect(response.evidence.some((fact) => fact.id === "excess")).toBe(false);
    for (const item of response.brief!.items) expect(response.evidence.some((fact) => fact.id === item.sku)).toBe(true);
    expect(response).not.toHaveProperty("proposals");
    expect(() => verifiedAnalysis(context, '{"factIds":["fake"],"quantity":999}', "fixture-model")).toThrow();
  });
  it("acompanhamento mantém IDs públicos, recalcula métricas e sinaliza mudanças da base", () => {
    const { dataset, analytics } = metrics();
    const first = buildAnalysisBrief(dataset, analytics, "Analise risco");
    const same = buildAnalysisBrief(dataset, analytics, "E a cobertura desses itens?", first.context);
    expect(same.brief.topic).toBe("coverage"); expect(same.brief.refreshed).toBe(false);
    expect(same.brief.items.every((item) => first.context.skuCodes.includes(item.sku))).toBe(true);
    const changed = structuredClone(analytics); changed.skus[0].coverage.days = 123.25;
    const fresh = buildAnalysisBrief(dataset, changed, "E a cobertura desses itens?", first.context);
    expect(fresh.brief.refreshed).toBe(true); expect(fresh.context.snapshotId).not.toBe(first.context.snapshotId);
    const date = structuredClone(analytics); date.config.referenceDate = "2032-12-12";
    expect(buildAnalysisBrief(dataset, date, "E esses itens?", first.context).brief.refreshed).toBe(true);
  });
  it("contexto não transporta fatos e não autoriza planejamento ou execução", () => {
    const { dataset, analytics } = metrics();
    const { context } = buildAnalysisBrief(dataset, analytics, "Analise risco");
    expect(Object.keys(parseAnalysisContext(context)).sort()).toEqual(["referenceDate", "skuCodes", "snapshotId", "topic"]);
    expect(() => parseAnalysisContext({ ...context, metrics: { private: 999 } })).toThrow();
    expect(() => parseAnalysisContext({ ...context, skuCodes: ["PRIVATE-SKU"] })).toThrow();
    expect(() => parseAnalysisContext({ ...context, source: "imported_local" })).toThrow();
    expect(resolveAgentIntent("E esses itens?", true)).toBe("analysis");
    expect(() => resolveAgentIntent("Execute todas as compras", true)).toThrow();
    expect(() => parseAgentRequest({ source: "imported_local", requestId: crypto.randomUUID(), prompt: "E esses itens?", analysisContext: context })).toThrow();
  });
  it("oportunidades de um SKU não recebem os valores financeiros do catálogo inteiro", () => {
    const dataset = buyingFixture([{ id: "DEMO-FLOW-0001", stock: 300, costCents: 250 }, { id: "DEMO-FLOW-0002", stock: 500, costCents: 400 }]);
    const analytics = analyzeOperationalDataset(dataset, operationalAnalyticsConfig(dataset.referenceDate, 30));
    const one = buildAnalysisBrief(dataset, analytics, "Analise capital parado do DEMO-FLOW-0001");
    const all = buildAnalysisBrief(dataset, analytics, "Analise capital parado");
    expect(one.brief.items.map((item) => item.sku)).toEqual(["DEMO-FLOW-0001"]);
    expect(one.brief.indicators[0].value).not.toBe(all.brief.indicators[0].value);
    expect(one.brief.indicators[0].value).toBe("R$ 525,00");
    expect(() => buildAnalysisBrief(dataset, analytics, "Analise cobertura de DEMO-FLOW-9999")).toThrow();
  });
  it("não amplia silenciosamente o escopo de acompanhamento quando falta evidência", () => {
    const { dataset, analytics } = metrics();
    analytics.skus[0].coverage.status = "insufficient";
    const initial = buildAnalysisBrief(dataset, analytics, "Analise risco do DEMO-FLOW-0001");
    const coverage = buildAnalysisBrief(dataset, analytics, "E a cobertura desses itens?", initial.context);
    expect(coverage.brief.items).toEqual([]);
    expect(coverage.context.skuCodes).toEqual(["DEMO-FLOW-0001"]);
    const causes = buildAnalysisBrief(dataset, analytics, "Por que esses itens?", coverage.context);
    expect(causes.brief.items.map((item) => item.sku)).toEqual(["DEMO-FLOW-0001"]);
    const empty = buildAnalysisBrief(dataset, analytics, "E esses itens?", { ...initial.context, skuCodes: [] });
    expect(empty.brief.items).toEqual([]);
  });
  it("mudança de identificação do material também invalida o fingerprint", () => {
    const { dataset, analytics } = metrics();
    const previous = buildAnalysisBrief(dataset, analytics, "Analise risco");
    dataset.skus[0].descricao = "Descrição sintética atualizada";
    expect(buildAnalysisBrief(dataset, analytics, "E esses itens?", previous.context).brief.refreshed).toBe(true);
  });
  it("perguntas sobre causas mantêm o assunto e uma pergunta explícita muda de tema", () => {
    const dataset = buyingFixture([{ id: "DEMO-FLOW-0001", stock: 300 }]);
    const analytics = analyzeOperationalDataset(dataset, operationalAnalyticsConfig(dataset.referenceDate, 30));
    const opportunity = buildAnalysisBrief(dataset, analytics, "Onde há capital parado?");
    const causes = buildAnalysisBrief(dataset, analytics, "Por que esses itens?", opportunity.context);
    expect(causes.brief.topic).toBe("causes"); expect(causes.context.topic).toBe("opportunities");
    expect(causes.brief.indicators[0].id).toBe("excess"); expect(causes.brief.summary).toContain("capital");
    const risk = buildAnalysisBrief(dataset, analytics, "E o risco de ruptura desses itens?", causes.context);
    expect(risk.brief.topic).toBe("risk"); expect(risk.context.skuCodes).toEqual(opportunity.context.skuCodes);
    const lead = buildAnalysisBrief(dataset, analytics, "Explique o lead time");
    expect(lead.brief.topic).toBe("causes"); expect(lead.brief.indicators[0].id).toBe("lead");
  });
});
