import { Boxes, CircleDollarSign, ListChecks, PackageCheck, ShieldCheck, ShoppingBag, TriangleAlert, ArrowUpRight, Database } from "lucide-react";
import type { DashboardModel, MetricCardModel, StockRowModel } from "@/lib/dashboard/models";

const icons = { inventory: CircleDollarSign, sales: ShoppingBag, risk: ListChecks, excess: Boxes, catalog: Boxes, coverage: PackageCheck, anomaly: ShieldCheck };
export function DemoNotice({ model }: { model: Pick<DashboardModel, "origin" | "referenceDate" | "referenceLabel"> }) {
  return <aside className="notice demo-notice" aria-label="Origem dos indicadores" data-source={model.origin.id}>
    <ShieldCheck size={20} aria-hidden="true" />
    <div><strong>{model.origin.label}</strong><p>{model.origin.kind === "independent_synthetic" ? "Históricos fictícios independentes para explorar estoque, compras e inteligência operacional." : model.origin.description} Data-base: <time dateTime={model.referenceDate}>{model.referenceLabel}</time>.</p></div>
  </aside>;
}
export function MetricCards({ metrics, home = false }: { metrics: MetricCardModel[]; home?: boolean }) {
  return <section aria-label="Indicadores calculados pelo motor" className={`metrics-grid${home ? " home-metrics" : ""}`}>
    {metrics.map((metric) => {
      const Icon = home ? metric.id === "risk" ? TriangleAlert : metric.id === "excess" ? ArrowUpRight : Database : icons[metric.id as keyof typeof icons] ?? Boxes;
      return <article className="metric-card" key={metric.id} data-metric={metric.id}>
        <div className="metric-top"><span>{metric.label}</span><Icon size={19} aria-hidden="true" /></div>
        <p className="metric-value">{metric.value}</p><p className={`metric-context${home ? " sr-only" : ""}`}>{metric.context}</p>
        <span className="pending-label">{metric.detail}</span>
      </article>;
    })}
  </section>;
}
export function RiskBadge({ row }: { row: Pick<StockRowModel, "risk" | "riskLabel"> }) {
  return <span className="risk-badge" data-level={row.risk}>{row.riskLabel}</span>;
}
