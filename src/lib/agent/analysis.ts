import "server-only";
import { analyzeOperationalDataset, operationalAnalyticsConfig } from "../analytics";
import { createDashboardModel } from "../dashboard/presentation";
import { formatDate, formatDays } from "../dashboard/format";
import { AgentError } from "./contracts";
import type { AgentAnalysis, AnalysisFollowUpContext } from "./contracts";
import type { createOperationalDemo } from "../operations/demo";
import { buildAnalysisBrief } from "./analysis-brief";

export type AnalysisInvalidReason = "invalid_json" | "invalid_evidence_selection" | "response_shape_invalid" |
  "unexpected_finish_reason" | "unexpected_tool_calls" | "content_missing" | "content_too_large";
export class AnalysisValidationError extends AgentError {
  constructor(public readonly diagnosticReason: AnalysisInvalidReason, message: string) { super("INVALID_ANALYSIS", message, 422); }
}

/** Read-only: reuse analytics without invoking Smart Buying or creating drafts. */
export function demoAnalysisContext({ dataset, parameters }: ReturnType<typeof createOperationalDemo>, prompt = "Analisar risco de ruptura", previous?: AnalysisFollowUpContext) {
  const analytics = analyzeOperationalDataset(dataset, operationalAnalyticsConfig(parameters.referenceDate, parameters.demandWindowDays));
  const { brief, context } = buildAnalysisBrief(dataset, analytics, prompt, previous);
  const model = createDashboardModel(dataset, analytics, {
    kind: "independent_synthetic", id: "goflow-demo-v1", label: "Demonstração sintética", description: "Dados fictícios independentes.",
  });
  const facts = [
    { id: "risk", text: "Classificação de risco por SKU: " + model.risks.map((risk) => `${risk.label}: ${risk.displayCount}`).join("; ") + "." },
    ...model.kpis.map((metric) => ({ id: metric.id === "risk" ? "risk_detail" : metric.id, text: `${metric.label}: ${metric.value}. ${metric.context}. ${metric.detail}.` })),
    ...model.stockKpis.filter((metric) => metric.id !== "inventory").map((metric) => ({ id: metric.id, text: `${metric.label}: ${metric.value}. ${metric.context}. ${metric.detail}.` })),
    ...brief.indicators.map((metric) => ({ id: `brief_${metric.id}`, text: `${metric.label}: ${metric.value}. ${metric.detail}` })),
    ...brief.items.map((row) => ({ id: row.sku, text: `${row.sku} · ${row.name}: ${row.riskLabel}. ${row.reason} Cobertura: ${formatDays(row.coverageDays)}; lead time médio: ${formatDays(row.leadTimeDays)}; déficit estimado de cobertura: ${formatDays(row.coverageDeficitDays)}.` })),
    { id: "methodology", text: "Cobertura usa vendas observadas, não demanda garantida. O risco compara cobertura e lead time observado com buffer de variabilidade. Dados insuficientes e anomalias não comprovam ruptura. Pedidos pendentes não são estoque recebido; projeções não garantem serviço." },
  ];
  return {
    referenceDate: parameters.referenceDate,
    explanation: `Referência ${formatDate(parameters.referenceDate)} · vendas observadas em janela de ${parameters.demandWindowDays} dias.`,
    facts, brief, context,
  };
}

export function verifiedAnalysis(context: ReturnType<typeof demoAnalysisContext>, content: string, model: string): AgentAnalysis {
  let selected: unknown;
  try { selected = JSON.parse(content); } catch { throw new AnalysisValidationError("invalid_json", "A análise não retornou evidências verificáveis. Nenhuma proposta foi criada."); }
  const ids = (selected as { factIds?: unknown } | null)?.factIds;
  const known = new Map(context.facts.map((fact) => [fact.id, fact]));
  if (!selected || typeof selected !== "object" || Array.isArray(selected) || Object.keys(selected).length !== 1 ||
    !Array.isArray(ids) || ids.length < 1 || ids.length > 8 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !known.has(id))) {
    throw new AnalysisValidationError("invalid_evidence_selection", "A análise não retornou evidências verificáveis. Nenhuma proposta foi criada.");
  }
  // The model only selects evidence IDs. Never display its free text or numbers.
  const required = [...context.brief.indicators.map((metric) => `brief_${metric.id}`), ...context.brief.items.map((row) => row.sku)];
  const relevant = new Set([...required, "methodology", ...(context.context.topic === "opportunities" ? ["inventory", "excess"] : ["risk", "risk_detail", "coverage", "anomaly"])]);
  return { kind: "analysis", source: "demo", model, referenceDate: context.referenceDate, executedAt: new Date().toISOString(), explanation: context.explanation,
    evidence: [...new Set([...required, ...ids.filter((id) => relevant.has(id))])].slice(0, 10).map((id) => known.get(id)!),
    brief: context.brief, context: context.context,
    limitations: ["Demonstração sintética. Estimativas condicionais, sem comprovação de ruptura real. Nenhuma proposta, compra ou contato com fornecedor foi executado."] };
}
