import type { StockRowModel, StockFilters } from "./models";

const normalizeSearch = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
export function filterStockRows(rows: readonly StockRowModel[], filters: StockFilters): StockRowModel[] {
  const query = normalizeSearch(filters.search);
  return rows.filter((r) => (!query || normalizeSearch([r.sku, r.name, r.brand].join(" ")).includes(query)) &&
    (filters.brand === "all" || r.brand === filters.brand) && (filters.status === "all" || r.status === filters.status) &&
    (filters.risk === "all" || r.risk === filters.risk));
}
