import type { AgentAnalysis } from "@/lib/agent/contracts";
import { formatDays } from "@/lib/dashboard/format";

/** Renders server-composed content; no calculations or generated prose in the view. */
export function AgentAnalysisResponse({ analysis }: { analysis: AgentAnalysis }) {
  const brief = analysis.brief;
  return <section className="panel" aria-label="Análise demonstrativa verificada">
    <header className="panel-heading"><div><p className="eyebrow">Leitura do cenário</p><h2>{brief?.title ?? "Análise demonstrativa"}</h2></div></header>
    {brief ? <>
      <p className="agent-explanation">{brief.summary}</p>
      {brief.refreshed && <p className="notice" role="status">A base mudou desde a pergunta anterior. Recalculei as evidências atuais para os materiais desta conversa.</p>}
      <div className="action-outcome" role="group" aria-label="Indicadores da análise">{brief.indicators.map((metric) => <div key={metric.id}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div>
      <h3>{brief.topic === "opportunities" ? "Materiais para revisar" : brief.topic === "causes" ? "Fatores nos materiais em foco" : "Materiais em foco"}</h3>
      <p className="panel-footnote">{brief.criteria}</p>
      {brief.items.length > 0 ? <ol>{brief.items.map((item) => <li key={item.sku}>
        <p><strong>{item.sku} · {item.name}</strong> <span className="status-badge">Risco: {item.riskLabel}</span></p>
        <p>{item.reason}</p>
        {(analysis.context?.topic ?? brief.topic) !== "opportunities" && <p className="panel-footnote">Cobertura: {formatDays(item.coverageDays)} · lead time médio: {formatDays(item.leadTimeDays)} · déficit estimado: {formatDays(item.coverageDeficitDays)}.</p>}
      </li>)}</ol> : <p>Nenhum material elegível para esta comparação.</p>}
      {brief.recommendations.length > 0 && <><h3>Próximos passos para revisão</h3><ul>{brief.recommendations.map((item) => <li key={item.id}>{item.text} <small>({item.skuCodes.join(", ")})</small></li>)}</ul></>}
      <details><summary>Consultar evidências e critérios</summary>{analysis.evidence.map((fact) => <p key={fact.id}>{fact.text}</p>)}</details>
      <p className="panel-footnote">{analysis.explanation} Análise em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(analysis.executedAt))}. {analysis.limitations.join(" ")}</p>
    </> : <><p className="agent-explanation">{analysis.explanation}</p>{analysis.evidence.map((fact) => <p key={fact.id}>{fact.text}</p>)}{analysis.limitations.map((item) => <p className="panel-footnote" key={item}>{item}</p>)}</>}
  </section>;
}
