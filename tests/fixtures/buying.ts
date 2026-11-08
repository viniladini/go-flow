import { COLUMNS, normalizeTables, parseTable } from "@/lib/analytics/normalization";
import { shiftDate } from "@/lib/analytics/math";
import type { FileName, PurchaseUnit, SkuStatus } from "@/lib/analytics/types";
export interface SyntheticBuyingSku {
  id: string; stock?: number; dailyUnits?: number; costCents?: number; moq?: number;
  unit?: PurchaseUnit; status?: SkuStatus; leadDays?: number[]; missingSaleDay?: number;
  variableSales?: boolean;
}
export type FixtureRow = Record<string, string>;
export function buyingFixture(specs: SyntheticBuyingSku[] = [{ id: "SYN-A" }], extra: Partial<Record<FileName, FixtureRow[]>> = {}) {
  const rows: Record<FileName, FixtureRow[]> = {
    "skus.csv": [], "fornecedores.csv": [{ fornecedor: "SYN-F", nome_fornecedor: "Fornecedor independente sintético" }],
    "vendas_diarias.csv": [], "estoque_diario.csv": [], "compras.csv": [],
  };
  for (const spec of specs) {
    const cost = spec.costCents ?? 250, moq = spec.moq ?? 1, unit = spec.unit ?? "un";
    rows["skus.csv"].push({
      sku: spec.id, marca: "Marca de teste", descricao: "Fixture sintética " + spec.id, categoria: "Teste",
      status: spec.status ?? "ativo", fornecedor: "SYN-F", unidade_compra: unit, moq: String(moq),
      custo_unitario: Math.floor(cost / 100) + "." + String(cost % 100).padStart(2, "0"), preco_venda: "50.00",
    });
    for (let day = 0; day < 90; day++) {
      const date = shiftDate("2037-04-18", -day);
      const amount = spec.variableSales ? (day % 2 ? 1 : 3) : spec.dailyUnits ?? 1;
      if (day !== spec.missingSaleDay) rows["vendas_diarias.csv"].push({ sku: spec.id, data: date, unidades_vendidas: String(amount), receita: String(amount * 50) });
      rows["estoque_diario.csv"].push({ sku: spec.id, data: date, estoque_disponivel: String(spec.stock ?? 10) });
    }
    (spec.leadDays ?? [10, 10, 10]).forEach((lead, index) => {
      const received = shiftDate("2037-04-18", -index * 5);
      rows["compras.csv"].push({
        po_id: "SYN-PO-" + spec.id + "-" + index, sku: spec.id, fornecedor: "SYN-F",
        data_pedido: shiftDate(received, -lead), data_recebimento: received, quantidade: String(moq), unidade: unit,
      });
    });
  }
  for (const file of Object.keys(extra) as FileName[]) rows[file].push(...extra[file]!);
  return normalizeTables((Object.keys(COLUMNS) as FileName[]).map((file) => {
    const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
    return parseTable(file, [COLUMNS[file].join(","), ...rows[file].map((row) => COLUMNS[file].map((column) => quote(row[column])).join(","))].join("\n"));
  }));
}
export const syntheticOrder = (changes: Partial<FixtureRow> = {}): FixtureRow => ({
  po_id: "SYN-EXTRA", fornecedor: "SYN-F", sku: "SYN-A", data_pedido: "2037-03-21",
  data_recebimento: "", quantidade: "1000", unidade: "un", ...changes,
});

