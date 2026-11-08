import { COLUMNS, normalizeTables, parseTable } from "@/lib/analytics/normalization";
import { DEFAULT_CONFIG } from "@/lib/analytics";
import { shiftDate } from "@/lib/analytics/math";
import type { Dataset, FileName } from "@/lib/analytics/types";

/**
 * Independent synthetic scenarios, authored without reading or sampling private data.
 * Names, IDs, prices, quantities and histories here are fictional demonstration inputs.
 */
const scenarios = [
  { id: "DEMO-FLOW-01", name: "Sérum Horizonte · demo", brand: "Aurora Demo", balance: 12, units: 4, cost: "18.00", lead: 12 },
  { id: "DEMO-FLOW-02", name: "Creme Maré · demo", brand: "Brisa Demo", balance: 800, units: 2, cost: "12.50", lead: 8 },
  { id: "DEMO-FLOW-03", name: "Bálsamo Pôr do Sol · demo", brand: "Aurora Demo", balance: 90, units: 3, cost: "9.00", lead: 10 },
  { id: "DEMO-FLOW-04", name: "Óleo Pausa · demo", brand: "Brisa Demo", balance: 100, units: 0, cost: "15.00", lead: 9 },
  { id: "DEMO-FLOW-05", name: "Gel Essência · demo", brand: "Aurora Demo", balance: -2, units: 2, cost: "11.00", lead: 11 },
  { id: "DEMO-FLOW-06", name: "Loção Traço · demo", brand: "Brisa Demo", balance: 40, units: 1, cost: "8.00", lead: 7, discontinued: true },
  { id: "DEMO-FLOW-07", name: "Espuma Amanhecer · demo", brand: "Aurora Demo", balance: 0, units: 2, cost: "10.00", lead: 10 },
  { id: "DEMO-FLOW-08", name: "Máscara Intervalo · demo", brand: "Brisa Demo", balance: 24, units: 2, cost: "20.00", lead: 10, sparse: true },
  { id: "DEMO-FLOW-09", name: "Fluido Caminho · demo", brand: "Aurora Demo", balance: 33, units: 3, cost: "14.00", lead: 9 },
  { id: "DEMO-FLOW-10", name: "Creme Primeiro Passo · demo", brand: "Brisa Demo", balance: 0, units: 0, cost: "16.00", lead: 6, noHistory: true },
] as const;

export function createDemoDataset(): Dataset {
  const base = DEFAULT_CONFIG.referenceDate;
  const tables: Record<FileName, Record<string, string>[]> = {
    "skus.csv": [], "fornecedores.csv": [{ fornecedor: "DEMO-SUPPLIER", nome_fornecedor: "Fornecedor fictício da demonstração" }],
    "vendas_diarias.csv": [], "estoque_diario.csv": [], "compras.csv": [],
  };
  for (const scenario of scenarios) {
    const discontinued = "discontinued" in scenario && scenario.discontinued;
    const sparse = "sparse" in scenario && scenario.sparse;
    const noHistory = "noHistory" in scenario && scenario.noHistory;
    tables["skus.csv"].push({
      sku: scenario.id, marca: scenario.brand, descricao: scenario.name, categoria: "Cuidados · demonstração",
      status: discontinued ? "descontinuado" : "ativo", custo_unitario: scenario.cost, preco_venda: "50.00",
      fornecedor: "DEMO-SUPPLIER", unidade_compra: "un", moq: "1",
    });
    if (noHistory) continue;
    for (let day = 0; day < 90; day++) {
      const data = shiftDate(base, -day);
      if (!(sparse && day % 5 === 0)) tables["vendas_diarias.csv"].push({
        sku: scenario.id, data, unidades_vendidas: String(scenario.units), receita: String(scenario.units * 50),
      });
      tables["estoque_diario.csv"].push({ sku: scenario.id, data, estoque_disponivel: String(scenario.balance) });
    }
    for (let sample = 0; sample < 3; sample++) {
      const received = shiftDate(base, -15 - sample * 20);
      tables["compras.csv"].push({
        po_id: "DEMO-PO-" + scenario.id + "-" + sample, sku: scenario.id, fornecedor: "DEMO-SUPPLIER",
        data_pedido: shiftDate(received, -scenario.lead - sample), data_recebimento: received, quantidade: "120", unidade: "un",
      });
    }
    tables["compras.csv"].push({
      po_id: "DEMO-PENDING-" + scenario.id, sku: scenario.id, fornecedor: "DEMO-SUPPLIER",
      data_pedido: shiftDate(base, -3), data_recebimento: "", quantidade: "24", unidade: "un",
    });
  }
  const parsed = (Object.keys(COLUMNS) as FileName[]).map((file) => {
    const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
    return parseTable(file, [COLUMNS[file].join(","), ...tables[file].map((row) => COLUMNS[file].map((field) => quote(row[field])).join(","))].join("\n"));
  });
  return normalizeTables(parsed, base);
}
