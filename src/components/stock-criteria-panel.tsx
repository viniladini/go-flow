import type { StockRowModel } from "@/lib/dashboard/models";
import { RiskBadge } from "@/components/dashboard-primitives";

export function PhysicalStockBadge({ row }: { row: Pick<StockRowModel, "stockState" | "stockStatusLabel" | "stockStale"> }) {
  return <span className="stock-state-badge" data-state={row.stockState} data-stale={row.stockStale || undefined}>{row.stockStatusLabel}</span>;
}

export function StockCriteriaPanel({ row, id, sourceLabel = "Dados sintéticos", windowDays = 30 }: { row: StockRowModel; id: string; sourceLabel?: string; windowDays?: number }) {
  return <section id={id} className="stock-criteria-panel" role="region" aria-labelledby={id + "-title"}>
    <header><h3 id={id + "-title"}>Critérios · {row.name}</h3><p>{sourceLabel} · {row.sku}</p></header>
    <dl className="stock-criteria-grid">
      <div><dt>Estoque físico observado</dt><dd><PhysicalStockBadge row={row} /><p>{row.stockDetail}</p><p>Saldo observado: {row.balance} · Valor ao custo: {row.inventoryValue}</p></dd></div>
      <div><dt>Risco estimado</dt><dd><RiskBadge row={row} /><p>{row.riskReason}</p></dd></div>
      <div><dt>Vendas observadas · {windowDays} dias</dt><dd>{row.sales30}<p>{row.salesDetail}</p></dd></div>
      <div><dt>Cobertura</dt><dd>{row.coverage}<p>{row.coverageDetail}</p></dd></div>
      <div><dt>Lead time médio</dt><dd>{row.leadTime}<p>{row.leadTimeDetail}</p></dd></div>
      <div><dt>Última venda positiva</dt><dd>{row.lastSale}<p>{row.movement}</p></dd></div>
      <div><dt>Excesso potencial</dt><dd>{row.excess}</dd></div>
    </dl>
    <p className="stock-observation-note">O saldo é uma observação na data indicada. Saldo zero atual não comprova ruptura histórica nem demanda não atendida. O risco estimado depende da evidência disponível de vendas e reposição.</p>
  </section>;
}
