import { shiftDate } from "../analytics/math";
import { demoReferenceDate } from "./demo-calendar";
import type { Dataset, FileName } from "../analytics/types";
import type { OperationalParameters } from "../flow-import/types";

/** Independent ledger, reproducible for a supplied clock. No I/O or private inputs. */
export function createOperationalDemo(now: Date = new Date()) {
  const referenceDate = demoReferenceDate(now);
  const parameters: OperationalParameters = { operation: "Operação demonstrativa", referenceDate,
    horizonStart: shiftDate(referenceDate, 2), horizonEnd: shiftDate(referenceDate, 90), budgetCents: 12_500_000, serviceBps: 9500,
    annualCapitalBps: 900, monthlyStorageBps: 85, maxDiscountBps: 2500, demandWindowDays: 30 };
  const dataset: Dataset = { referenceDate: parameters.referenceDate, policy: "exploratory_exact_dedup_conflict_quarantine",
    skus: [], suppliers: [], sales: [], stocks: [], purchases: [], issues: [] };
  const trace = (file: FileName, row: number) => ({ file, records: [row + 2] });
  for (let n = 0; n < 8; n++) dataset.suppliers.push({ fornecedor: "DEMO-FOR-" + n, nome_fornecedor: "Fornecedor fictício " + (n + 1), source: trace("fornecedores.csv", n) });
  for (let n = 0; n < 500; n++) {
    const sku = "DEMO-FLOW-" + String(n + 1).padStart(4, "0"), fornecedor = "DEMO-FOR-" + (n % 8);
    const factor = n % 4 === 0 ? 12 : 1, moq = 1 + n % 3, lot = factor * moq;
    const baseRate = 2 + n % 5, kind = n % 10, cost = 317 + (n * 137) % 6500, price = cost * 2 + 177;
    dataset.skus.push({ sku, fornecedor, marca: "Marca fictícia " + (1 + n % 6), descricao: "Produto demonstrativo " + (n + 1),
      categoria: "Categoria " + (1 + n % 4), status: n % 19 === 0 ? "descontinuado" : "ativo",
      custo_unitario_centavos: cost, preco_venda_centavos: price, unidade_compra: factor === 12 ? "cx 12 un" : "un", moq, source: trace("skus.csv", n) });
    const quantities = Array.from({ length: 120 }, (_, day) => kind === 2 || (kind === 1 && day >= 55) || (kind === 3 && day % 11 === 0) ? 0 : baseRate + (day % 7 === 0 ? 1 : 0));
    const total = quantities.reduce((sum, amount) => sum + amount, 0);
    const delivered = Math.max(lot, Math.ceil(total * 18 / 100 / lot) * lot);
    const target = kind === 0 ? 2 + n % 7 : kind === 4 ? total * 3 + 30 : kind === 2 ? lot * 10 + 20 : kind === 8 ? 0 : kind === 9 ? Math.ceil((baseRate + 0.15) * 10) : baseRate * 40 + 50;
    let balance = total - 3 * delivered + target;
    // Sufficient opening stock and three real receipts reconcile every subsequent closing position.
    if (balance < 0) throw new Error("Gerador demonstrativo inconsistente.");
    const first = shiftDate(parameters.referenceDate, -119);
    for (const [j, day] of [10, 30, 50].entries()) {
      const received = shiftDate(first, day);
      dataset.purchases.push({ po_id: "DEMO-PO-" + n + "-" + j, sku, fornecedor, data_pedido: shiftDate(received, -[7, 11, 9][j]),
        data_recebimento: received, quantidade: delivered / factor, unidade: factor === 12 ? "cx 12 un" : "un", quantidade_unidades: delivered, source: trace("compras.csv", dataset.purchases.length) });
    }
    for (let day = 0; day < 120; day++) {
      if ([10, 30, 50].includes(day)) balance += delivered;
      const data = shiftDate(first, day), units = quantities[day];
      balance -= units;
      if (balance < 0) throw new Error("Consumo sintético sem disponibilidade.");
      if (!(kind === 3 && day % 11 === 0)) dataset.sales.push({ sku, data, unidades_vendidas: units, receita_centavos: units * price, source: trace("vendas_diarias.csv", dataset.sales.length) });
      dataset.stocks.push({ sku, data, estoque_disponivel: balance, source: trace("estoque_diario.csv", dataset.stocks.length) });
    }
    if (n % 5 === 0) dataset.purchases.push({ po_id: "DEMO-PENDENTE-" + n, sku, fornecedor, data_pedido: shiftDate(parameters.referenceDate, -2), data_recebimento: null,
      quantidade: moq * 2, unidade: factor === 12 ? "cx 12 un" : "un", quantidade_unidades: lot * 2, source: trace("compras.csv", dataset.purchases.length) });
  }
  return { dataset, parameters };
}
