import type { AgentAnalysis } from "@/lib/agent/contracts";
import { formatDays } from "@/lib/dashboard/format";

function equivalentGroups(analysis: AgentAnalysis) {
  const groups: NonNullable<AgentAnalysis["brief"]>["items"][] = [];
  const key = (item: NonNullable<AgentAnalysis["brief"]>["items"][number]) => JSON.stringify([
    item.risk, item.riskLabel, item.reason, item.coverageDays, item.leadTimeDays, item.coverageDeficitDays,
    analysis.brief!.recommendations.filter((step) => step.skuCodes.includes(item.sku)).map((step) => step.text),
  ]);
  for (const item of analysis.brief?.items ?? []) {
    const last = groups.at(-1);
    // Only consecutive, exactly equal displayed evidence; never reorder priorities
    // or merge values merely because their rounded labels happen to match.
    if (last && key(last[0]) === key(item)) last.push(item);
    else groups.push([item]);
  }
  return groups;
}
/** Renders server-composed content; no calculations or generated prose in the view. */
export function AgentAnalysisResponse({ analysis }: { analysis: AgentAnalysis }) {
  const brief = analysis.brief;
  const concise = brief?.topic === "causes";
  const indicators = brief && <div className="action-outcome" role="group" aria-label="Indicadores da análise">{brief.indicators.map((metric) => <div key={metric.id}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div>;
  const recommendations = brief && brief.recommendations.length > 0 && <><h3>Próximos passos para revisão</h3><ul>{brief.recommendations.map((item) => <li key={item.id}>{item.text} <small>({item.skuCodes.join(", ")})</small></li>)}</ul></>;
  return <section className="panel" aria-label="Análise demonstrativa verificada">
    <header className="panel-heading"><div><p className="eyebrow">Leitura do cenário</p><h2>{brief?.title ?? "Análise demonstrativa"}</h2></div></header>
    {brief ? <>
      <p className="agent-explanation">{brief.summary}</p>
      {brief.refreshed && <p className="notice" role="status">A base mudou desde a pergunta anterior. Recalculei as evidências atuais para os materiais desta conversa.</p>}
      {!concise && <>
        {indicators}
        <h3>{brief.topic === "opportunities" ? "Materiais para revisar" : "Materiais em foco"}</h3>
        {brief.items.length > 0 ? <ol>{equivalentGroups(analysis).map((group) => {
          const item = group[0];
          return <li key={item.sku}>
            <p><strong>{group.map((entry) => `${entry.sku} · ${entry.name}`).join("; ")}</strong> <span className="status-badge">Risco: {item.riskLabel}</span></p>
            {group.length > 1 && <p className="panel-footnote">{group.length} materiais com o mesmo quadro de evidências exibido.</p>}
            <p>{item.reason}</p>
            {(analysis.context?.topic ?? brief.topic) !== "opportunities" && <p className="panel-footnote">Cobertura: {formatDays(item.coverageDays)} · lead time médio: {formatDays(item.leadTimeDays)} · déficit estimado: {formatDays(item.coverageDeficitDays)}.</p>}
          </li>;
        })}</ol> : <p>Nenhum material elegível para esta comparação.</p>}
        {recommendations}
      </>}
      <details><summary>{concise ? "Consultar indicadores, materiais e evidências" : "Consultar evidências e critérios"}</summary>
        <p className="panel-footnote">{brief.criteria}</p>
        {concise && <>{indicators}{recommendations}</>}
        {analysis.evidence.filter((fact) => !brief.indicators.some((metric) => fact.id === `brief_${metric.id}` && fact.text === `${metric.label}: ${metric.value}. ${metric.detail}`)).map((fact) => <p key={fact.id}>{fact.text}</p>)}
      </details>
      <p className="panel-footnote">{analysis.explanation} Análise em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(analysis.executedAt))}. {analysis.limitations.join(" ")}</p>
    </> : <><p className="agent-explanation">{analysis.explanation}</p>{analysis.evidence.map((fact) => <p key={fact.id}>{fact.text}</p>)}{analysis.limitations.map((item) => <p className="panel-footnote" key={item}>{item}</p>)}</>}
  </section>;
}
