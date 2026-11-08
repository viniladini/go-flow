import Link from "next/link";
import { Activity, ArrowUpRight, CircleDollarSign, Sparkles } from "lucide-react";
import { FlowOrb } from "./flow-orb";
import { ProductFlow } from "./product-flow";
import { formatNumber } from "@/lib/dashboard/format";
import { Panel } from "@/components/ui";
import { DemoNotice, MetricCards, RiskBadge } from "@/components/dashboard-primitives";
import type { DashboardModel } from "@/lib/dashboard/models";

export function DashboardOverview({ model }: { model: DashboardModel }) {
  const imported = model.origin.kind === "imported_local";
  const pulse = model.risks.filter((risk) => ["critical", "attention", "anomaly", "insufficient"].includes(risk.level) && risk.count > 0);
  const signalCount = pulse.reduce((sum, risk) => sum + risk.count, 0);
  // Read only the established pt-BR display format. No coverage/demand formula here.
  const coverage = model.rows.flatMap((row) => {
    const match = /^(\d[\d.]*(?:,\d+)?) dias$/.exec(row.coverage);
    if (!match) return [];
    const days = Number(match[1].replaceAll(".", "").replace(",", "."));
    return Number.isFinite(days) && days >= 0 ? [{ row, days }] : [];
  }).slice(0, 6);
  const maxDays = Math.max(1, ...coverage.map((item) => item.days));
  const reviewCount = model.risks.filter((risk) => ["critical", "attention", "anomaly"].includes(risk.level)).reduce((sum, risk) => sum + risk.count, 0);
  const featured = ["risk", "excess", "inventory"].flatMap((id) => {
    const metric = model.kpis.find((item) => item.id === id);
    return metric ? [{ ...metric, label: id === "risk" ? "produtos em risco crítico" : id === "excess" ? "em excesso potencial" : "capital em estoque", detail: id === "risk" ? "risco estimado" : id === "excess" ? "capital identificado" : "ao custo" }] : [];
  });
  return <>
    <div className="page-heading overview-heading">
      <div><h1>olá, time gogroup.</h1><p className="page-description">Aqui está o panorama da sua operação.</p></div>
      <svg className="editorial-curve" viewBox="0 0 400 100" fill="none" aria-hidden="true"><path d="M0 90C60 90 45 20 100 40S155 80 195 30S275 20 305 50S365 80 400 70" /></svg>
    </div>
    <section className="go-pulse" aria-label="go.pulse · sinais calculados">
      <h2><Activity size={23} aria-hidden="true" />go.pulse</h2>
      <div><strong>{model.rows.length ? `${formatNumber(signalCount)} SKUs com sinais para revisão` : "Sem SKUs disponíveis na fonte ativa."}</strong><p>{model.rows.length ? pulse.length ? pulse.map((risk) => `${risk.displayCount} ${risk.label.toLowerCase()}`).join(" · ") : "Sem sinais críticos, atenção, anomalia ou dados insuficientes." : "Importe uma operação ou explore a demonstração."}</p></div>
      <Link href="/estoque#filtros-estoque">Explorar sinais <ArrowUpRight size={18} aria-hidden="true" /></Link>
    </section>
    <MetricCards metrics={featured} home />
    <div className="dashboard-grid home-grid">
      <Panel className="coverage-panel" title="cobertura de estoque" description="Dias calculados · proxy de vendas observadas" aside={<Link className="icon-link" href="/estoque" aria-label="Explorar saúde do estoque"><ArrowUpRight size={20} /></Link>}>
        <div className="coverage-layout">
        {coverage.length ? <figure className="coverage-chart"><figcaption>Amostra: primeiros {coverage.length} SKUs avaliáveis <span>Escala: 0–{formatNumber(maxDays)} dias</span></figcaption><ol style={{ gridTemplateColumns: `repeat(${coverage.length}, minmax(0, 1fr))` }}>{coverage.map(({ row, days }) => <li key={row.sku} data-coverage-days={days} data-sku={row.sku}>
          <div className="coverage-bar-track"><strong>{row.coverage}</strong><span className="coverage-bar" style={{ height: `${days / maxDays * 100}%` }} aria-hidden="true" /></div><span>{row.sku}</span>
        </li>)}</ol><p className="panel-footnote">Ordem do catálogo. Valores exibidos arredondados a uma casa decimal. Sem tendência temporal inferida.</p></figure> : <p className="panel-footnote">Gráfico indisponível: nenhum SKU com cobertura calculável na fonte ativa.</p>}
        <p className="panel-footnote">Cobertura disponível para {model.coverageLabel} SKUs. Falta de evidência não é classificada como risco baixo.</p>
        <aside className="coverage-summary"><strong>{model.coverageLabel}</strong><p>SKUs com cobertura calculável</p>{model.risks.filter((risk) => ["critical", "insufficient"].includes(risk.level)).map((risk) => <span key={risk.level} data-level={risk.level}>{risk.displayCount} {risk.label.toLowerCase()}</span>)}</aside>
        </div>
      </Panel>
      <section className="agent-card home-agent-card" aria-labelledby="agent-title">
        <h2 id="agent-title">próximo movimento</h2>
        <div className="home-agent-body"><div className="home-agent-orb"><FlowOrb /></div>
        <div className="agent-copy"><span className="agent-kicker"><Sparkles size={16} aria-hidden="true" /> go.agent</span>
          <p>{imported ? "Sua operação fica no navegador; a IA externa permanece indisponível nesta fonte." : reviewCount ? `${formatNumber(reviewCount)} SKUs pedem revisão. Vamos preparar uma proposta de compra com critério?` : "Quer analisar as prioridades e preparar uma proposta para revisão?"}</p>
          <Link className="button button-lime agent-circle-action" href="/agente" aria-label={imported ? "Conhecer o go.agent" : "Planejar com go.agent"}><ArrowUpRight size={22} aria-hidden="true" /></Link>
          {imported && <Link href="/compras" className="text-link">Consultar planejamento local <ArrowUpRight size={15} aria-hidden="true" /></Link>}
        </div></div>
      </section>
    </div>
    <DemoNotice model={model} />
    <div className="dashboard-grid home-secondary">
      <Panel title="Impacto financeiro" description="Capital calculado na fonte ativa." aside={<CircleDollarSign size={21} className="muted-icon" aria-hidden="true" />}>
        {model.financial.map((item) => <div className="financial-row" key={item.label}><span>{item.label}<small>{item.detail}</small></span><strong>{item.value}</strong></div>)}
        <p className="panel-footnote">Nível de serviço: indisponível. Não há medição de demanda não atendida.</p>
      </Panel>
      <Panel title="Prioridades da operação" description="Sinais do motor para revisão humana." aside={<Link className="text-link" href="/estoque">Explorar SKUs <ArrowUpRight size={15} aria-hidden="true" /></Link>}>
        {model.priorities.length ? <ul className="priority-list">{model.priorities.map((row) => <li key={row.sku}>
          <div><strong>{row.name}</strong><span>{row.sku}</span></div><RiskBadge row={row} /><p>{row.riskReason}</p>
        </li>)}</ul> : <p className="panel-footnote">Nenhum sinal crítico, de atenção ou anomalia identificado nos cenários.</p>}
      </Panel>
      <Panel className="sales-window-panel" title="Vendas observadas por janela" description="Períodos acumulados encerrados na data-base." aside={<span className="small-tag">30 / 60 / 90 dias</span>}>
        <div className="window-list">{model.windows.map((window) => <article key={window.days}>
          <div><h3>{window.label}</h3><span>{window.units} un.</span><strong>{window.revenue}</strong></div><p>{window.detail}</p>
        </article>)}</div>
        <p className="panel-footnote">Janelas sobrepostas: não somar. Vendas observadas não equivalem à demanda real. Tendência diária ainda indisponível.</p>
      </Panel>
    </div>
    <ProductFlow />
  </>;
}
