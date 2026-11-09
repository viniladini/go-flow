import "server-only";
import { analyzeOperationalDataset, operationalAnalyticsConfig } from "../analytics";
import { createDashboardModel } from "../dashboard/presentation";
import { formatDate } from "../dashboard/format";
import { AgentError } from "./contracts";
import type { AgentAnalysis } from "./contracts";
import type { createOperationalDemo } from "../operations/demo";

export type AnalysisInvalidReason = "invalid_json" | "invalid_evidence_selection" | "response_shape_invalid" |
  "unexpected_finish_reason" | "unexpected_tool_calls" | "content_missing" | "content_too_large";
export class AnalysisValidationError extends AgentError {
  constructor(public readonly diagnosticReason: AnalysisInvalidReason, message: string) { super("INVALID_ANALYSIS", message, 422); }
}

/** Read-only: reuse analytics without invoking Smart Buying or creating drafts. */
export function demoAnalysisContext({ dataset, parameters }: ReturnType<typeof createOperationalDemo>) {
  const analytics = analyzeOperationalDataset(dataset, operationalAnalyticsConfig(parameters.referenceDate, parameters.demandWindowDays));
  const model = createDashboardModel(dataset, analytics, {
    kind: "independent_synthetic", id: "goflow-demo-v1", label: "Demonstração sintética", description: "Dados fictícios independentes.",
  });
  const facts = [
    { id: "risk", text: "Classificação de risco por SKU: " + model.risks.map((risk) => `${risk.label}: ${risk.displayCount}`).join("; ") + "." },
    ...model.kpis.map((metric) => ({ id: metric.id === "risk" ? "risk_detail" : metric.id, text: `${metric.label}: ${metric.value}. ${metric.context}. ${metric.detail}.` })),
    ...model.stockKpis.filter((metric) => metric.id !== "inventory").map((metric) => ({ id: metric.id, text: `${metric.label}: ${metric.value}. ${metric.context}. ${metric.detail}.` })),
    ...model.priorities.slice(0, 8).map((row) => ({ id: row.sku, text: `${row.sku}: ${row.riskLabel}. ${row.riskReason} Estoque: ${row.balance}; cobertura: ${row.coverage}; lead time: ${row.leadTime}. ${row.coverageDetail}. ${row.leadTimeDetail}.` })),
    { id: "methodology", text: "Cobertura usa vendas observadas, não demanda garantida. O risco compara cobertura e lead time observado com buffer de variabilidade. Dados insuficientes e anomalias não comprovam ruptura. Pedidos pendentes não são estoque recebido; projeções não garantem serviço." },
  ];
  return {
    referenceDate: parameters.referenceDate,
    explanation: `Análise da demonstração sintética · data-base ${formatDate(parameters.referenceDate)} · vendas observadas em janela de ${parameters.demandWindowDays} dias. Não é previsão real. Nenhuma proposta foi criada e nenhuma compra foi executada.`,
    facts,
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
  return { kind: "analysis", source: "demo", model, referenceDate: context.referenceDate, executedAt: new Date().toISOString(), explanation: context.explanation,
    evidence: [...new Set(["risk", ...ids, "methodology"])].map((id) => known.get(id)!),
    limitations: ["Dados exclusivamente demonstrativos e sintéticos.", "Diagnóstico exploratório do motor analítico existente; não representa ordem ou proposta de compra."] };
}
