import { dateValue, duplicateAnalysis, numberValue, parseCsv, unitFactor } from "./primitives.ts";
import type { Dataset, FileName, Issue, ParsedTable, PurchaseUnit, Sku, Sale, Stock, Purchase, Supplier } from "./types.ts";

export const COLUMNS: Record<FileName, readonly string[]> = {
  "skus.csv": ["sku", "marca", "descricao", "categoria", "status", "custo_unitario", "preco_venda", "fornecedor", "unidade_compra", "moq"],
  "fornecedores.csv": ["fornecedor", "nome_fornecedor"],
  "vendas_diarias.csv": ["sku", "data", "unidades_vendidas", "receita"],
  "estoque_diario.csv": ["sku", "data", "estoque_disponivel"],
  "compras.csv": ["po_id", "fornecedor", "sku", "data_pedido", "data_recebimento", "quantidade", "unidade"],
};
const KEYS: Record<FileName, string[]> = {
  "skus.csv": ["sku"], "fornecedores.csv": ["fornecedor"],
  "vendas_diarias.csv": ["sku", "data"], "estoque_diario.csv": ["sku", "data"], "compras.csv": ["po_id", "sku"],
};
export function parseTable(file: FileName, text: string): ParsedTable {
  const records = parseCsv(text);
  const header = records.shift();
  if (JSON.stringify(header) !== JSON.stringify(COLUMNS[file])) throw new Error("Cabeçalho inválido: " + file);
  const result: ParsedTable = { file, rows: [], issues: [] };
  records.forEach((cells, index) => {
    const record = index + 2; // CSV logical record, not physical line (quoted newlines).
    if (cells.length !== COLUMNS[file].length) {
      result.issues.push({ file, records: [record], code: "invalid_width", severity: "error" });
    } else {
      result.rows.push({ record, values: Object.fromEntries(COLUMNS[file].map((field, i) => [field, cells[i]])) });
    }
  });
  return result;
}
export function moneyCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimal = ""] = value.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(decimal.padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
export function normalizeTables(tables: ParsedTable[], referenceDate = "2037-04-18"): Dataset {
  if (dateValue(referenceDate) === null || referenceDate > "2037-04-18") throw new Error("Data-base inválida ou posterior à referência permitida.");
  return normalizeOperationalTables(tables, referenceDate);
}
/** Explicit operational reference, without the legacy case defaults/ceiling. Same audited rules. */
export function normalizeOperationalTables(tables: ParsedTable[], referenceDate: string): Dataset {
  if (dateValue(referenceDate) === null) throw new Error("Data-base operacional inválida.");
  if (tables.length !== 5 || new Set(tables.map((t) => t.file)).size !== 5) throw new Error("São necessárias as cinco tabelas.");
  const data: Dataset = {
    referenceDate, skus: [], sales: [], stocks: [], purchases: [], suppliers: [],
    issues: tables.flatMap((t) => t.issues), policy: "exploratory_exact_dedup_conflict_quarantine",
  };
  for (const table of tables) {
    const { file } = table;
    const eligible = table.rows.filter(({ values: row, record }) => {
      const primary = file === "compras.csv" ? row.data_pedido : row.data;
      if (primary && dateValue(primary) !== null && primary > referenceDate) {
        data.issues.push({ file, records: [record], sku: row.sku, date: primary, code: "future_excluded", severity: "warning" });
        return false;
      }
      return true;
    });
    // Reuse the audited exact/logical policy BEFORE numeric coercion.
    const duplicate = duplicateAnalysis(eligible.map((r) => r.values), KEYS[file]);
    const byExact = new Map<string, number[]>();
    for (const { values, record } of eligible) {
      const key = JSON.stringify(values);
      const references = byExact.get(key);
      if (references) references.push(record);
      else byExact.set(key, [record]);
    }
    const accepted = new Set(duplicate.unambiguous.map((r) => JSON.stringify(r)));
    for (const row of duplicate.unique) {
      const records = byExact.get(JSON.stringify(row))!;
      const context = { file, records, sku: row.sku, date: row.data ?? row.data_pedido };
      if (records.length > 1) data.issues.push({ ...context, code: "exact_duplicate_deduplicated", severity: "warning" });
      if (!accepted.has(JSON.stringify(row))) {
        data.issues.push({ ...context, code: "logical_conflict_quarantined", severity: "error" });
        continue;
      }
      const errors: Issue[] = [];
      const fail = (field: string, code = "invalid_field") => errors.push({ ...context, field, code, severity: "error" });
      for (const field of COLUMNS[file]) {
        if (field === "data_recebimento" && row[field] === "") continue;
        if (!row[field].trim() || row[field] !== row[field].trim()) fail(field);
      }
      for (const field of ["data", "data_pedido", "data_recebimento"]) {
        if (field in row && row[field] !== "" && dateValue(row[field]) === null) fail(field, "invalid_date");
      }
      const quantity = (field: string, allowNegative = false) => {
        const n = numberValue(row[field]);
        if (n === null || !Number.isSafeInteger(n) || (!allowNegative && n < 0)) { fail(field, "invalid_integer"); return 0; }
        return n;
      };
      const money = (field: string) => {
        const n = moneyCents(row[field]);
        if (n === null) { fail(field, "invalid_money"); return 0; }
        return n;
      };
      const source = { file, records };
      let entity: Sku | Sale | Stock | Purchase | Supplier;
      if (file === "skus.csv") {
        if (!["ativo", "descontinuado"].includes(row.status)) fail("status");
        if (unitFactor(row.unidade_compra) === null) fail("unidade_compra");
        const moq = quantity("moq");
        if (moq <= 0 || !Number.isSafeInteger(moq * (unitFactor(row.unidade_compra) ?? 0))) fail("moq");
        entity = { sku: row.sku, marca: row.marca, descricao: row.descricao, categoria: row.categoria,
          status: row.status as Sku["status"], fornecedor: row.fornecedor, unidade_compra: row.unidade_compra as PurchaseUnit,
          moq, custo_unitario_centavos: money("custo_unitario"), preco_venda_centavos: money("preco_venda"), source };
      } else if (file === "fornecedores.csv") {
        entity = { fornecedor: row.fornecedor, nome_fornecedor: row.nome_fornecedor, source };
      } else if (file === "vendas_diarias.csv") {
        entity = { sku: row.sku, data: row.data, unidades_vendidas: quantity("unidades_vendidas"), receita_centavos: money("receita"), source };
        if (entity.unidades_vendidas === 0 && entity.receita_centavos > 0) fail("receita", "revenue_without_units");
      } else if (file === "estoque_diario.csv") {
        const balance = quantity("estoque_disponivel", true);
        if (balance < 0) data.issues.push({ ...context, field: "estoque_disponivel", code: "negative_stock", severity: "warning" });
        entity = { sku: row.sku, data: row.data, estoque_disponivel: balance, source };
      } else {
        if (unitFactor(row.unidade) === null) fail("unidade");
        const amount = quantity("quantidade");
        const units = amount * (unitFactor(row.unidade) ?? 0);
        if (amount <= 0 || !Number.isSafeInteger(units)) fail("quantidade");
        let received = row.data_recebimento || null;
        if (received && dateValue(received) !== null && received < row.data_pedido) fail("data_recebimento", "receipt_before_order");
        if (received && dateValue(received) !== null && received > referenceDate) {
          data.issues.push({ ...context, code: "future_receipt_not_available", severity: "warning" });
          received = null;
        }
        entity = { po_id: row.po_id, fornecedor: row.fornecedor, sku: row.sku, data_pedido: row.data_pedido,
          data_recebimento: received, quantidade: amount, unidade: row.unidade as PurchaseUnit, quantidade_unidades: units, source };
      }
      data.issues.push(...errors);
      if (errors.length) continue;
      if (file === "skus.csv") data.skus.push(entity as Sku);
      else if (file === "fornecedores.csv") data.suppliers.push(entity as Supplier);
      else if (file === "vendas_diarias.csv") data.sales.push(entity as Sale);
      else if (file === "estoque_diario.csv") data.stocks.push(entity as Stock);
      else data.purchases.push(entity as Purchase);
    }
  }
  const skuMap = new Map(data.skus.map((s) => [s.sku, s]));
  const supplierIds = new Set(data.suppliers.map((s) => s.fornecedor));
  // Referential failures are explicit; unusable catalog entities and rows are quarantined.
  data.skus = data.skus.filter((sku) => {
    if (supplierIds.has(sku.fornecedor)) return true;
    data.issues.push({ ...sku.source, sku: sku.sku, code: "unknown_supplier", severity: "error" });
    skuMap.delete(sku.sku);
    return false;
  });
  const known = <T extends Sale | Stock | Purchase>(row: T): boolean => {
    if (skuMap.has(row.sku)) return true;
    data.issues.push({ ...row.source, sku: row.sku, date: "data" in row ? row.data : row.data_pedido, code: "unknown_sku", severity: "error" });
    return false;
  };
  data.sales = data.sales.filter(known);
  data.stocks = data.stocks.filter(known);
  data.purchases = data.purchases.filter((row) => {
    if (!known(row)) return false;
    const sku = skuMap.get(row.sku)!;
    if (!supplierIds.has(row.fornecedor)) {
      data.issues.push({ ...row.source, sku: row.sku, date: row.data_pedido, code: "unknown_supplier", severity: "error" });
      return false;
    }
    if (sku.fornecedor !== row.fornecedor || sku.unidade_compra !== row.unidade ||
      row.quantidade_unidades % (sku.moq * unitFactor(sku.unidade_compra)!) !== 0) {
      data.issues.push({ ...row.source, sku: row.sku, date: row.data_pedido, code: "catalog_purchase_mismatch", severity: "warning" });
    }
    return true;
  });
  return data;
}

