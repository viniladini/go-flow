"use client";
import Link from "next/link";
import { useState } from "react";
import { useOperationalSource } from "./import-session-provider";
import { BuyingAlertGroups } from "./buying-alert-groups";
import { DashboardOverview } from "./dashboard-overview";
import { DemoNotice, MetricCards } from "./dashboard-primitives";
import { StockExplorer } from "./stock-explorer";
import { formatDate, formatDays, formatMoney, formatNumber, formatPercentBps } from "@/lib/dashboard/format";
import { RISK_LABELS } from "@/lib/dashboard/presentation";
import type { DashboardModel } from "@/lib/dashboard/models";
import type { OperationalResult } from "@/lib/operations/service";

export type OperationalSection = "overview" | "stock" | "buying" | "opportunities";
export function OperationalView({ section, fallback }: { section: OperationalSection; fallback?: DashboardModel }) {
  const source = useOperationalSource();
  if (!source) {
    if (fallback && section === "overview") return <DashboardOverview model={fallback} />;
    if (fallback && section === "stock") return <StockView model={fallback} />;
    return <p role="status">Preparando a fonte operacional…</p>;
  }
  if (source.state.status !== "ready" || !source.state.result) return <section className="panel" aria-live="polite"><h1>{source.state.status === "error" ? "Indicadores indisponíveis" : "Calculando a fonte ativa…"}</h1><p role={source.state.status === "error" ? "alert" : "status"}>{source.state.error ?? "Processamento local. Nenhum indicador demonstrativo será exibido no lugar da operação importada."}</p>{source.state.status === "error" && <button className="import-button" onClick={source.retry}>Recalcular localmente</button>}<p><Link className="text-link" href="/importar">Conferir origem e parâmetros</Link></p></section>;
  const result = source.state.result;
  return <div key={source.state.revision} data-operation-source={result.source} data-section={section}>
    {!result.model.rows.length && <p className="notice" role="status">A fonte ativa está vazia. Nenhum registro da demonstração foi acrescentado.</p>}
    {section === "overview" ? <DashboardOverview model={result.model} /> : section === "stock" ? <StockView model={result.model} /> : section === "buying" ? <BuyingView result={result} /> : <OpportunitiesView result={result} />}
  </div>;
}
function StockView({ model }: { model: DashboardModel }) {
  return <><div className="page-heading"><div><p className="eyebrow">Inteligência operacional</p><h1>saúde do estoque</h1><p className="page-description">Disponibilidade, cobertura e equilíbrio para cada produto.</p></div></div>
    <DemoNotice model={model} /><MetricCards metrics={model.stockKpis} /><StockExplorer rows={model.rows} risks={model.risks} windowDays={model.demandWindowDays} originLabel={model.origin.kind === "imported_local" ? "Dados importados locais por SKU" : "Dados demonstrativos por SKU"} /></>;
}
function BuyingView({ result }: { result: OperationalResult }) {
  const [search, setSearch] = useState(""), [limit, setLimit] = useState(50);
  const plan = result.buying;
  const proposals = plan?.proposals.filter((p) => [p.sku, p.supplier].join(" ").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) ?? [];
  return <><div className="page-heading"><div><p className="eyebrow">Planejamento operacional</p><h1>planejamento de compras</h1><p className="page-description">Rascunhos determinísticos, sujeitos à revisão humana.</p></div></div>
    <section className="purchase-intro" aria-label="Resumo financeiro do planejamento"><article><span>orçamento disponível</span><strong>{plan ? formatMoney(plan.budget.totalCents) : "Indisponível"}</strong><small>Limite para novas recomendações</small></article><article><span>proposta calculada</span><strong>{plan ? formatMoney(plan.budget.usedCents) : "Indisponível"}</strong><small>{plan ? `${plan.proposals.length} rascunhos sujeitos à revisão` : "Planejamento ainda indisponível"}</small></article></section>
    <Link className="purchase-agent-cta" href={result.source === "demo" ? "/agente" : "/compras#propostas-calculadas"}>{result.source === "demo" ? "gerar proposta com go.agent" : "revisar planejamento local"}<span aria-hidden="true">→</span></Link>
    <DemoNotice model={result.model} />
    <p className="panel-footnote">Horizonte {formatDate(result.parameters.horizonStart)} a {formatDate(result.parameters.horizonEnd)} · meta {formatPercentBps(result.parameters.serviceBps)}, sem garantia. Sem campanhas inferidas ou buffer calibrado. A emissão proposta usa o início do horizonte.</p>
    {!plan ? <p className="import-error" role="alert">{result.buyingError}</p> : <>
      <details className="purchase-budget-details"><summary>Conferir orçamento, saldo e limites</summary><MetricCards metrics={[
        { id: "budget", label: "Orçamento informado", value: formatMoney(plan.budget.totalCents), context: "Somente novas recomendações", detail: "Pedidos anteriores não debitados novamente" },
        { id: "sales", label: "Valor planejado", value: formatMoney(plan.budget.usedCents), context: "Aquisição das propostas válidas", detail: "Custos de carregamento separados" },
        { id: "remaining", label: "Saldo não utilizado", value: formatMoney(plan.budget.remainingCents), context: "Limite financeiro respeitado", detail: "Heurística, sem prova de ótimo global" },
        { id: "catalog", label: "Propostas", value: formatNumber(plan.proposals.length), context: "Rascunhos por SKU", detail: "Nenhum pedido enviado" },
      ]} /></details>
      <section className="panel" id="propostas-calculadas"><h2>Propostas de compra</h2><label className="operational-search">Buscar SKU ou fornecedor<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(50); }} /></label>
        <p className="filter-result" role="status">{Math.min(limit, proposals.length)} de {proposals.length} propostas correspondentes.</p>
        {proposals.length ? <div className="stock-table-region" role="region" aria-label="Propostas de compra" tabIndex={0}><table className="stock-table"><caption className="sr-only">Custos em reais e quantidades nas unidades comerciais e físicas</caption><thead><tr><th scope="col">SKU / fornecedor</th><th scope="col">Compra</th><th scope="col">Unidades físicas</th><th scope="col">Custo estimado</th><th scope="col">Lead time / chegada</th><th scope="col">Risco / critérios</th></tr></thead><tbody>{proposals.slice(0, limit).map((p) => <tr key={p.sku}><th scope="row">{p.sku}<small>{p.supplier}</small></th><td>{formatNumber(p.quantityPurchaseUnits)} {p.purchaseUnit}</td><td>{formatNumber(p.physicalUnits)}</td><td>{formatMoney(p.estimatedCostCents)}</td><td>{formatDays(p.leadTimeDays)}<small>{formatDate(p.estimatedArrivalDate)} · chegada estimada</small></td><td>{RISK_LABELS[p.risk]}<details><summary>Ver critérios</summary><p>{p.explanation}</p><p>Pedido: {formatDate(p.orderDate)} · prioridade: {formatDate(p.priorityDate)} · benefício condicional: {formatNumber(p.benefit.additionalServedUnits)} unidades de atendimento adicional no cenário.</p>{p.assumptions.map((a) => <p key={a}>{a}</p>)}</details></td></tr>)}</tbody></table></div> : <p className="stock-no-results">Nenhuma proposta viável para os dados, critérios e orçamento atuais. Confira os motivos por SKU abaixo.</p>}
        {limit < proposals.length && <button className="import-button secondary" onClick={() => setLimit(limit + 50)}>Mostrar mais propostas</button>}
      </section>
      <section className="panel operational-notes"><h2>Restrições e motivos por SKU</h2><p>Pendências não são estoque recebido. Quantidades recebidas já compõem o saldo; nenhuma soma em duplicidade.</p><details><summary>Conferir avaliações ({plan.assessments.length})</summary>{plan.assessments.map((a) => <p key={a.sku}><strong>{a.sku}</strong> · {a.reason} · pendentes não creditados: {formatNumber(a.pendingOrdersNotCredited)} pedidos / {formatNumber(a.pendingUnitsNotCredited)} unidades físicas.</p>)}</details><details><summary>Alternativas não selecionadas ({plan.alternatives.filter((a) => !a.selected).length})</summary>{plan.alternatives.filter((a) => !a.selected).map((a) => <p key={a.alternative.id}>{a.alternative.sku} · {formatNumber(a.alternative.quantityPurchaseUnits)} {a.alternative.purchaseUnit} · {formatMoney(a.alternative.estimatedCostCents)} · {a.explanation}</p>)}</details><details><summary>Metodologia e limitações</summary>{plan.limitations.map((l) => <p key={l}>{l}</p>)}</details><BuyingAlertGroups alerts={plan.alerts} /></section>
    </>}
  </>;
}
function OpportunitiesView({ result }: { result: OperationalResult }) {
  const [filter, setFilter] = useState("all"), [limit, setLimit] = useState(50);
  const opportunities = result.opportunities.filter((o) => filter === "all" || o.kind === filter);
  return <><div className="page-heading"><div><p className="eyebrow">Sinais para revisão humana</p><h1>oportunidades</h1><p className="page-description">Excesso, movimentação e destinação calculados pelo motor.</p></div></div><DemoNotice model={result.model} />
    <MetricCards metrics={[{ id: "excess", label: "Excesso potencial", value: result.model.kpis.find((k) => k.id === "excess")!.value, context: "Capital acima do limiar de cobertura", detail: "Não é economia garantida" }, { id: "inventory", label: "Baixa movimentação", value: result.model.financial.find((f) => f.label === "Capital de baixa movimentação")!.value, context: "Capital identificado pelo motor", detail: "Pode sobrepor excesso e descontinuados" }, { id: "catalog", label: "Sinais identificados", value: formatNumber(result.opportunities.length), context: "Um SKU pode ter mais de um sinal", detail: "Não somar os capitais das categorias" }]} />
    <div className="opportunities-composition"><section className="panel"><h2>Revisar oportunidades</h2><label className="operational-search">Tipo de oportunidade<select value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(50); }}><option value="all">Todos</option><option value="excess">Excesso potencial</option><option value="low_movement">Baixa movimentação</option><option value="discontinued">Descontinuados</option></select></label>
      <p className="filter-result" role="status">{Math.min(limit, opportunities.length)} de {opportunities.length} sinais.</p>
      {opportunities.length ? <div className="stock-table-region" role="region" aria-label="Oportunidades calculadas" tabIndex={0}><table className="stock-table"><thead><tr><th scope="col">Produto / SKU</th><th scope="col">Sinal</th><th scope="col">Capital identificado</th><th scope="col">Interpretação</th></tr></thead><tbody>{opportunities.slice(0, limit).map((o) => <tr key={o.sku + o.kind}><th scope="row">{o.name}<small>{o.sku}</small></th><td>{o.label}</td><td>{formatMoney(o.valueCents)}</td><td>{o.explanation}</td></tr>)}</tbody></table></div> : <p className="stock-no-results">Nenhuma oportunidade identificada com evidência suficiente nesta seleção. Falta de dados não significa ausência de risco.</p>}
      {limit < opportunities.length && <button className="import-button secondary" onClick={() => setLimit(limit + 50)}>Mostrar mais oportunidades</button>}
      <p className="panel-footnote">Nenhuma liquidação ou ação comercial foi executada. Capitais podem se sobrepor; não são estimativas de lucro.</p>
    </section><div className="opportunity-color-grid" aria-hidden="true"><span /><span /><span /><span /></div></div>
  </>;
}
