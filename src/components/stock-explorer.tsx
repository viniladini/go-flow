"use client";

import { Fragment, useContext, useMemo, useState } from "react";
import { StockSearchContext } from "./stock-search-context";
import { Search, X } from "lucide-react";
import { filterStockRows } from "@/lib/dashboard/filters";
import type { DashboardModel, StockFilters, StockRowModel } from "@/lib/dashboard/models";
import { RiskBadge } from "@/components/dashboard-primitives";
import { PhysicalStockBadge, StockCriteriaPanel } from "@/components/stock-criteria-panel";

const INITIAL_FILTERS: StockFilters = { search: "", brand: "all", status: "all", risk: "all" };
export function StockExplorer({ rows, risks, originLabel = "Dados demonstrativos por SKU", windowDays = 30 }: { rows: StockRowModel[]; risks: DashboardModel["risks"]; originLabel?: string; windowDays?: number }) {
  const search = useContext(StockSearchContext);
  const [localFilters, setFilters] = useState<StockFilters>(INITIAL_FILTERS);
  const filters = useMemo(() => ({ ...localFilters, search: search?.query ?? localFilters.search }), [localFilters, search?.query]);
  const [limit, setLimit] = useState(50);
  const applyFilters = (next: StockFilters) => { setFilters(next); search?.setQuery(next.search); setLimit(50); };
  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand))].sort(), [rows]);
  const visible = useMemo(() => filterStockRows(rows, filters), [rows, filters]);
  const active = Object.keys(INITIAL_FILTERS).some((key) => filters[key as keyof StockFilters] !== INITIAL_FILTERS[key as keyof StockFilters]);
  return <section className="panel stock-explorer" aria-labelledby="stock-list-title">
    <header className="panel-heading"><div><h2 id="stock-list-title">Catálogo em perspectiva</h2><p>{originLabel}. Filtros afetam apenas esta lista; os indicadores acima consideram o catálogo completo.</p></div></header>
    <div className="stock-filters" id="filtros-estoque">
      <label className="search-filter">Buscar SKU<span><Search size={17} aria-hidden="true" /><input type="search" placeholder="Código, produto ou marca" value={filters.search} onChange={(event) => applyFilters({ ...filters, search: event.target.value })} /></span></label>
      <label>Marca<select value={filters.brand} onChange={(event) => applyFilters({ ...filters, brand: event.target.value })}><option value="all">Todas as marcas</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select></label>
      <label>Status do SKU<select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value as StockFilters["status"] })}><option value="all">Todos os status</option><option value="ativo">Ativo</option><option value="descontinuado">Descontinuado</option></select></label>
      <label>Risco estimado<select value={filters.risk} onChange={(event) => applyFilters({ ...filters, risk: event.target.value as StockFilters["risk"] })}><option value="all">Todos os riscos</option>{risks.map((risk) => <option key={risk.level} value={risk.level}>{risk.label}</option>)}</select></label>
      <button className="clear-filters" disabled={!active} onClick={() => applyFilters(INITIAL_FILTERS)}><X size={15} aria-hidden="true" /> Limpar</button>
    </div>
    <p className="filter-result" role="status" aria-live="polite">{visible.length} de {rows.length} SKUs da fonte exibida</p>
    {visible.length ? <div className="stock-table-region" role="region" aria-labelledby="stock-list-title" tabIndex={0}>
      <table className="stock-table"><caption className="sr-only">{originLabel}. Use rolagem horizontal para consultar todas as colunas.</caption>
        <thead><tr><th scope="col">Produto / SKU</th><th scope="col">Estoque físico (un.)</th><th scope="col">Valor ao custo</th><th scope="col">Vendas · {windowDays} dias</th><th scope="col">Cobertura</th><th scope="col">Lead time médio</th><th scope="col">Risco estimado</th></tr></thead>
        <tbody>{visible.slice(0, limit).map((row) => <Fragment key={row.sku}>
          <tr data-sku={row.sku}>
            <th scope="row"><strong>{row.name}</strong><span>{row.sku}</span><small>{row.brand} · {row.statusLabel}</small></th>
            <td><strong>{row.balance}</strong><PhysicalStockBadge row={row} /></td>
            <td className="numeric-cell">{row.inventoryValue}</td>
            <td>{row.sales30}</td>
            <td>{row.coverage}</td>
            <td>{row.leadTime}</td>
            <td><span className="stock-risk-bar" data-level={row.risk} aria-hidden="true" /><RiskBadge row={row} /></td>
          </tr>
          <tr className="stock-criteria-row"><td colSpan={7}>
            <details className="stock-criteria">
              <summary aria-controls={"criteria-panel-" + row.sku}>Ver critérios<span className="sr-only"> de {row.name} ({row.sku})</span></summary>
              <StockCriteriaPanel row={row} id={"criteria-panel-" + row.sku} sourceLabel={originLabel} windowDays={windowDays} />
            </details>
          </td></tr>
        </Fragment>)}</tbody>
      </table>
    </div> : <div className="stock-no-results"><h3>Nenhum SKU encontrado</h3><p>Ajuste os termos da busca ou limpe os filtros para consultar os cenários disponíveis.</p></div>}
    {limit < visible.length && <button className="import-button secondary" onClick={() => setLimit(limit + 50)}>Mostrar mais SKUs ({Math.min(limit, visible.length)} de {visible.length})</button>}
    <p className="panel-footnote">Saldos negativos são anomalias. Dias sem venda registrada não são preenchidos com zero. Cobertura usa uma proxy de vendas observadas, não uma previsão de demanda.</p>
  </section>;
}
