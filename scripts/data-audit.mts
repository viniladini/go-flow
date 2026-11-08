import { parseCsv, numberValue, dateValue, unitFactor, duplicateAnalysis, keyOf } from "../src/lib/analytics/primitives.ts";
export { parseCsv, numberValue, dateValue, unitFactor, duplicateAnalysis } from "../src/lib/analytics/primitives.ts";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const BASE = "2037-04-18";
const START = "2035-10-20";
const DAY = 86_400_000;
const root = fileURLToPath(new URL("../", import.meta.url));
type Row = Record<string, string>;
type Spec = { columns: string[]; key: string[]; dates: string[]; numbers: string[]; integers: string[]; optional?: string[] };
const specs: Record<string, Spec> = {
  "skus.csv": {
    columns: ["sku", "marca", "descricao", "categoria", "status", "custo_unitario", "preco_venda", "fornecedor", "unidade_compra", "moq"],
    key: ["sku"], dates: [], numbers: ["custo_unitario", "preco_venda", "moq"], integers: ["moq"],
  },
  "fornecedores.csv": { columns: ["fornecedor", "nome_fornecedor"], key: ["fornecedor"], dates: [], numbers: [], integers: [] },
  "vendas_diarias.csv": {
    columns: ["sku", "data", "unidades_vendidas", "receita"],
    key: ["sku", "data"], dates: ["data"], numbers: ["unidades_vendidas", "receita"], integers: ["unidades_vendidas"],
  },
  "estoque_diario.csv": {
    columns: ["sku", "data", "estoque_disponivel"],
    key: ["sku", "data"], dates: ["data"], numbers: ["estoque_disponivel"], integers: ["estoque_disponivel"],
  },
  "compras.csv": {
    columns: ["po_id", "fornecedor", "sku", "data_pedido", "data_recebimento", "quantidade", "unidade"],
    key: ["po_id", "sku"], dates: ["data_pedido", "data_recebimento"], numbers: ["quantidade"], integers: ["quantidade"], optional: ["data_recebimento"],
  },
};

// Strict CSV parser: quoted delimiters, escaped quotes, embedded newlines, BOM,
// CRLF and trailing empty fields. Malformed syntax fails without exposing cells.
const baseTime = dateValue(BASE)!;

export function purchaseUnits(row: Row): number | null {
  const quantity = numberValue(row.quantidade);
  const factor = unitFactor(row.unidade);
  return quantity !== null && Number.isSafeInteger(quantity) && quantity > 0 &&
    factor !== null && Number.isSafeInteger(quantity * factor) ? quantity * factor : null;
}
export function respectsMoq(row: Row, sku?: Row): boolean | null {
  const units = purchaseUnits(row);
  const factor = sku ? unitFactor(sku.unidade_compra) : null;
  const moq = sku ? numberValue(sku.moq) : null;
  if (!sku || units === null || !factor || moq === null ||
      !Number.isSafeInteger(moq) || moq <= 0 || !Number.isSafeInteger(moq * factor)) return null;
  return units % (moq * factor) === 0;
}
export function purchaseState(row: Row): string {
  const ordered = dateValue(row.data_pedido);
  const received = dateValue(row.data_recebimento);
  if (ordered === null || ordered > baseTime) return "fora_da_base_ou_pedido_invalido";
  if (!row.data_recebimento.trim()) return "pendente_sem_recebimento";
  if (received === null || received < ordered) return "recebimento_invalido";
  return received <= baseTime ? "recebido_na_base" : "recebimento_futuro_nao_disponivel_na_base";
}
function counts(values: string[]) {
  const result: Record<string, number> = {};
  for (const value of values) result[value || "(vazio)"] = (result[value || "(vazio)"] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
function summary(values: number[]) {
  if (!values.length) return { n: 0, min: null, p50: null, p90: null, p95: null, max: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return { n: values.length, min: sorted[0], p50: percentile(0.5), p90: percentile(0.9), p95: percentile(0.95), max: sorted.at(-1)!, mean: Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(4)) };
}
function validHistorical(row: Row) { const d = dateValue(row.data); return d !== null && d <= baseTime && d >= dateValue(START)!; }
function integer(value: string) { const n = numberValue(value); return n !== null && Number.isSafeInteger(n); }
function groupBy(rows: Row[], field: string) {
  const result = new Map<string, Row[]>();
  for (const row of rows) { const group = result.get(row[field]) ?? []; group.push(row); result.set(row[field], group); }
  return result;
}

async function load(name: string, spec: Spec) {
  const buffer = await readFile(path.join(root, "data", name));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  const records = parseCsv(text);
  const header = records.shift();
  if (!header || JSON.stringify(header) !== JSON.stringify(spec.columns)) throw new Error("Cabeçalho inesperado em " + name);
  const malformed = records.filter((r) => r.length !== header.length).length;
  const rows = records.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((field, i) => [field, r[i]])));
  const dup = duplicateAnalysis(rows, spec.key);
  const missing = Object.fromEntries(header.map((field) => [field, rows.filter((r) => !r[field].trim()).length]));
  const whitespace = Object.fromEntries(header.map((field) => [field, rows.filter((r) => r[field] !== r[field].trim()).length]));
  const numeric = Object.fromEntries(spec.numbers.map((field) => {
    const valid = rows.map((r) => numberValue(r[field])).filter((n): n is number => n !== null);
    return [field, {
      missing: missing[field], invalidNonEmpty: rows.filter((r) => r[field].trim() && numberValue(r[field]) === null).length,
      negative: valid.filter((n) => n < 0).length, zero: valid.filter((n) => n === 0).length,
      nonInteger: spec.integers.includes(field) ? valid.filter((n) => !Number.isSafeInteger(n)).length : null,
      moreThanTwoDecimalPlaces: spec.integers.includes(field) ? null : rows.filter((r) => numberValue(r[field]) !== null && (r[field].split(".")[1]?.length ?? 0) > 2).length,
      ...summary(valid),
    }];
  }));
  const temporal = Object.fromEntries(spec.dates.map((field) => {
    const valid = rows.map((r) => r[field]).filter((d) => dateValue(d) !== null).sort();
    return [field, { min: valid[0] ?? null, max: valid.at(-1) ?? null, distinctDays: new Set(valid).size,
      invalidNonEmpty: rows.filter((r) => r[field].trim() && dateValue(r[field]) === null).length,
      empty: missing[field], beforeHistory: valid.filter((d) => d < START).length, afterBase: valid.filter((d) => d > BASE).length }];
  }));
  return { rows, dup, file: {
    records: records.length, validWidthRecords: rows.length, malformedWidthRecords: malformed,
    bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"),
    logicalKey: spec.key, missing, missingRequired: Object.entries(missing).filter(([field]) => !spec.optional?.includes(field)).reduce((s, [, n]) => s + n, 0),
    surroundingWhitespace: whitespace, numeric, temporal,
    duplicates: { exactGroups: dup.exactGroups, exactRowsInGroups: dup.exactRowsInGroups, exactExcess: dup.exactExcess, logicalGroups: dup.logicalGroups, logicalRowsInGroups: dup.logicalRowsInGroups, logicalExcess: dup.logicalExcess, conflictingGroups: dup.conflictingGroups, conflictingRowsAfterExactDedup: dup.conflictingRowsAfterExactDedup },
  } };
}

export async function audit() {
  const files = Object.fromEntries(await Promise.all(Object.entries(specs).map(async ([name, spec]) => [name, await load(name, spec)] as const)));
  const skuRows = files["skus.csv"].dup.unambiguous.filter((r) => r.sku.trim());
  const suppliers = files["fornecedores.csv"].dup.unambiguous.filter((r) => r.fornecedor.trim());
  const skuMap = new Map(skuRows.map((r) => [r.sku, r]));
  const supplierMap = new Map(suppliers.map((r) => [r.fornecedor, r]));
  const sales = files["vendas_diarias.csv"];
  const stocks = files["estoque_diario.csv"];
  const purchases = files["compras.csv"];
  const saleRows = sales.dup.unambiguous.filter(validHistorical);
  const stockRows = stocks.dup.unambiguous.filter(validHistorical);
  const purchaseRows = purchases.dup.unambiguous;
  const integrity = {
    unknownOrAmbiguousSkuRows: Object.fromEntries(["vendas_diarias.csv", "estoque_diario.csv", "compras.csv"].map((name) => [name, files[name].rows.filter((r) => !skuMap.has(r.sku)).length])),
    unknownOrAmbiguousSupplierRows: Object.fromEntries(["skus.csv", "compras.csv"].map((name) => [name, files[name].rows.filter((r) => !supplierMap.has(r.fornecedor)).length])),
    purchaseSupplierDifferentFromCurrentCatalog: purchases.rows.filter((r) => skuMap.has(r.sku) && r.fornecedor !== skuMap.get(r.sku)!.fornecedor).length,
    catalogSkusWithoutSales: skuRows.filter((s) => !saleRows.some((r) => r.sku === s.sku)).length,
    catalogSkusWithoutStock: skuRows.filter((s) => !stockRows.some((r) => r.sku === s.sku)).length,
    catalogSkusWithoutPurchases: skuRows.filter((s) => !purchaseRows.some((r) => r.sku === s.sku && dateValue(r.data_pedido) !== null && r.data_pedido <= BASE)).length,
    suppliersWithoutCatalogSkus: suppliers.filter((s) => !skuRows.some((r) => r.fornecedor === s.fornecedor)).length,
  };
  const received = purchaseRows.filter((r) => purchaseState(r) === "recebido_na_base");
  const pending = purchaseRows.filter((r) => purchaseState(r) === "pendente_sem_recebimento");
  const conversion = purchaseUnits;
  const moqCheck = (r: Row) => respectsMoq(r, skuMap.get(r.sku));
  const leadTimes = received.map((r) => (dateValue(r.data_recebimento)! - dateValue(r.data_pedido)!) / DAY);
  const orderGroups = groupBy(purchaseRows, "po_id");
  const purchasing = {
    rawStates: counts(purchases.rows.map(purchaseState)),
    analysisStates: counts(purchaseRows.map(purchaseState)),
    analysisRows: purchaseRows.length,
    uniqueOrderIds: orderGroups.size,
    multiLineOrderIds: [...orderGroups.values()].filter((r) => r.length > 1).length,
    orderIdsWithMultipleSuppliers: [...orderGroups.values()].filter((rs) => new Set(rs.map((r) => r.fornecedor)).size > 1).length,
    orderIdsWithMultipleOrderDates: [...orderGroups.values()].filter((rs) => new Set(rs.map((r) => r.data_pedido)).size > 1).length,
    unitsRaw: counts(purchases.rows.map((r) => r.unidade)),
    invalidUnitRows: purchases.rows.filter((r) => unitFactor(r.unidade) === null).length,
    unitDifferentFromCurrentCatalog: purchases.rows.filter((r) => skuMap.has(r.sku) && r.unidade !== skuMap.get(r.sku)!.unidade_compra).length,
    moqFailures: purchaseRows.filter((r) => moqCheck(r) === false).length,
    moqNotEvaluable: purchaseRows.filter((r) => moqCheck(r) === null).length,
    receivedConvertedUnits: received.reduce((s, r) => s + (conversion(r) ?? 0), 0),
    receivedConversionExcludedRows: received.filter((r) => conversion(r) === null).length,
    pendingConvertedUnits: pending.reduce((s, r) => s + (conversion(r) ?? 0), 0),
    pendingConversionExcludedRows: pending.filter((r) => conversion(r) === null).length,
    receiptBeforeOrder: purchases.rows.filter((r) => dateValue(r.data_pedido) !== null && dateValue(r.data_recebimento) !== null && r.data_recebimento < r.data_pedido).length,
    leadTimeDays: summary(leadTimes),
    leadTimesOver90Days: leadTimes.filter((n) => n > 90).length,
    leadTimesZeroDays: leadTimes.filter((n) => n === 0).length,
    pendingAgeDays: summary(pending.map((r) => (baseTime - dateValue(r.data_pedido)!) / DAY)),
    currentDiscontinuedSkuPurchaseRows: purchaseRows.filter((r) => skuMap.get(r.sku)?.status === "descontinuado").length,
  };
  const stockBySku = groupBy(stockRows, "sku");
  const salesByKey = new Map(saleRows.map((r) => [keyOf(r, ["sku", "data"]), r]));
  const stockByKey = new Map(stockRows.map((r) => [keyOf(r, ["sku", "data"]), r]));
  // Only valid actual receipts as of BASE; never impute a receipt date for pending POs.
  const receipts = new Map<string, number>();
  for (const row of received) {
    const quantity = conversion(row);
    if (quantity === null) continue;
    const key = keyOf({ sku: row.sku, data: row.data_recebimento }, ["sku", "data"]);
    receipts.set(key, (receipts.get(key) ?? 0) + quantity);
  }
  let internalMissingStockDays = 0, leadingUnobservedStockDays = 0, trailingUnobservedStockDays = 0;
  let noSaleStockDays = 0, noSalePositiveStockDays = 0, noSaleNonpositiveStockDays = 0;
  let nonpositiveStockDays = 0, consecutiveNonpositiveTransitions = 0, maxNonpositiveRun = 0;
  let negativeStockRows = 0, negativeStockSkus = 0, openingAfterStartSkus = 0;
  let transitionsWithObservedSales = 0, nonzeroLedgerResiduals = 0, ledgerPositiveResiduals = 0, ledgerNegativeResiduals = 0, transitionsWithoutObservedSales = 0;
  let stockIncreaseWithoutKnownReceipt = 0;
  const negativeAtBaseSkus = new Set<string>();
  const zeroAtBaseSkus = new Set<string>();
  for (const [sku, rows] of stockBySku) {
    rows.sort((a, b) => a.data.localeCompare(b.data));
    const first = rows[0], last = rows.at(-1)!;
    if (first.data > START) openingAfterStartSkus++;
    leadingUnobservedStockDays += (dateValue(first.data)! - dateValue(START)!) / DAY;
    trailingUnobservedStockDays += (baseTime - dateValue(last.data)!) / DAY;
    let hasNegative = false, run = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], current = numberValue(row.estoque_disponivel);
      const previous = rows[i - 1];
      const distance = previous ? (dateValue(row.data)! - dateValue(previous.data)!) / DAY : 0;
      const consecutive = !!previous && distance === 1;
      if (previous) internalMissingStockDays += distance - 1;
      if (current !== null && current < 0) { negativeStockRows++; hasNegative = true; }
      if (row.data === BASE && current !== null && current < 0) negativeAtBaseSkus.add(sku);
      if (row.data === BASE && current === 0) zeroAtBaseSkus.add(sku);
      if (current !== null && current <= 0) {
        nonpositiveStockDays++;
        run = consecutive ? run + 1 : 1;
        if (consecutive && numberValue(previous.estoque_disponivel) !== null && numberValue(previous.estoque_disponivel)! <= 0) consecutiveNonpositiveTransitions++;
        maxNonpositiveRun = Math.max(maxNonpositiveRun, run);
      } else run = 0;
      const key = keyOf(row, ["sku", "data"]);
      const sale = salesByKey.get(key);
      if (!sale) {
        noSaleStockDays++;
        if (current !== null && current > 0) noSalePositiveStockDays++;
        if (current !== null && current <= 0) noSaleNonpositiveStockDays++;
      }
      if (!consecutive || current === null || !Number.isSafeInteger(current) || !integer(previous.estoque_disponivel)) continue;
      const before = numberValue(previous.estoque_disponivel)!;
      if (current > before && !receipts.has(key)) stockIncreaseWithoutKnownReceipt++;
      if (!sale) { transitionsWithoutObservedSales++; continue; }
      const sold = numberValue(sale.unidades_vendidas);
      if (sold === null || !Number.isSafeInteger(sold) || sold < 0) continue;
      transitionsWithObservedSales++;
      const residual = current - before - (receipts.get(key) ?? 0) + sold;
      if (residual !== 0) nonzeroLedgerResiduals++;
      if (residual > 0) ledgerPositiveResiduals++;
      if (residual < 0) ledgerNegativeResiduals++;
    }
    if (hasNegative) negativeStockSkus++;
  }
  const observedSalesWithNoStock = saleRows.filter((r) => !stockByKey.has(keyOf(r, ["sku", "data"]))).length;
  const observedSalesAtNonpositiveClose = saleRows.filter((r) => {
    const stock = stockByKey.get(keyOf(r, ["sku", "data"]));
    const amount = stock && numberValue(stock.estoque_disponivel);
    return (numberValue(r.unidades_vendidas) ?? 0) > 0 && amount !== undefined && amount !== null && amount <= 0;
  }).length;
  const salesAnomalies = {
    analysisRows: saleRows.length,
    rawZeroUnitsWithPositiveRevenue: sales.rows.filter((r) => numberValue(r.unidades_vendidas) === 0 && (numberValue(r.receita) ?? 0) > 0).length,
    rawPositiveUnitsWithNonpositiveRevenue: sales.rows.filter((r) => (numberValue(r.unidades_vendidas) ?? 0) > 0 && numberValue(r.receita) !== null && numberValue(r.receita)! <= 0).length,
    observedSalesWithNoStock, observedSalesAtNonpositiveClose,
    missingSkuDaysWithinObservedStockSpan: noSaleStockDays,
    missingSalesWithPositiveClosingStock: noSalePositiveStockDays,
    missingSalesWithNonpositiveClosingStock: noSaleNonpositiveStockDays,
  };
  const inventory = {
    analysisRows: stockRows.length, observedSkuCount: stockBySku.size, negativeStockRows, negativeStockSkus,
    nonpositiveStockDays, consecutiveNonpositiveTransitions, maxNonpositiveRun,
    baseDateNegativeSkus: negativeAtBaseSkus.size, baseDateZeroSkus: zeroAtBaseSkus.size,
    catalogSkusWithoutBaseStock: skuRows.filter((r) => !stockByKey.has(keyOf({ sku: r.sku, data: BASE }, ["sku", "data"]))).length,
    internalMissingStockDays, leadingUnobservedStockDays, trailingUnobservedStockDays, openingAfterStartSkus,
    stockIncreaseWithoutKnownReceipt, transitionsWithObservedSales, transitionsWithoutObservedSales,
    nonzeroLedgerResiduals, ledgerPositiveResiduals, ledgerNegativeResiduals,
  };
  const catalog = {
    rawStatusCounts: counts(files["skus.csv"].rows.map((r) => r.status)),
    unambiguousSkuCount: skuRows.length, expectedSkuCount: 500,
    statusCounts: counts(skuRows.map((r) => r.status)),
    invalidStatuses: skuRows.filter((r) => !["ativo", "descontinuado"].includes(r.status)).length,
    units: counts(skuRows.map((r) => r.unidade_compra)),
    invalidUnits: skuRows.filter((r) => unitFactor(r.unidade_compra) === null).length,
    invalidMoq: skuRows.filter((r) => !integer(r.moq) || numberValue(r.moq)! <= 0).length,
    priceBelowCost: skuRows.filter((r) => numberValue(r.preco_venda) !== null && numberValue(r.custo_unitario) !== null && numberValue(r.preco_venda)! < numberValue(r.custo_unitario)!).length,
    supplierCount: suppliers.length,
  };
  // Guardrails detect programming mistakes, not whether the source data is clean.
  for (const file of Object.values(files)) {
    if (file.rows.length !== file.dup.unique.length + file.dup.exactExcess) throw new Error("Falha na reconciliação de duplicatas.");
    if (file.file.records !== file.file.validWidthRecords + file.file.malformedWidthRecords) throw new Error("Falha na reconciliação de registros.");
    if (file.dup.unique.length !== file.dup.unambiguous.length + file.dup.conflictingRowsAfterExactDedup) throw new Error("Falha na reconciliação de chaves conflitantes.");
  }
  if (Object.values(purchasing.analysisStates).reduce((s, n) => s + n, 0) !== purchaseRows.length) throw new Error("Falha na classificação dos pedidos.");
  for (const [name, loaded] of Object.entries(files)) {
    const after = createHash("sha256").update(await readFile(path.join(root, "data", name))).digest("hex");
    if (after !== loaded.file.sha256) throw new Error("Arquivo de origem mudou durante a auditoria.");
  }
  return {
    schemaVersion: 1, referenceDate: BASE, historyStart: START, runtime: process.version,
    files: Object.fromEntries(Object.entries(files).map(([name, v]) => [name, v.file])),
    catalog, integrity, purchasing, sales: salesAnomalies, inventory,
  };
}

function reportMarkdown(result: Awaited<ReturnType<typeof audit>>) {
  const { files, catalog, integrity, purchasing, sales, inventory } = result;
  const json = (value: unknown) => "~~~json\n" + JSON.stringify(value, null, 2) + "\n~~~";
  const overview = Object.entries(files).map(([name, f]) => {
    const range = Object.entries(f.temporal).map(([field, t]) => field + ": " + (t.min ?? "—") + " a " + (t.max ?? "—")).join("; ") || "Não há campo temporal";
    return "| " + [name, f.records, f.duplicates.exactExcess, f.duplicates.logicalGroups, f.duplicates.conflictingGroups, range].join(" | ") + " |";
  }).join("\n");
  return [
    "# Auditoria privada de dados — go.flow", "",
    "**Confidencial. Relatório agregado derivado dos dados privados. Não publicar.**",
    "Data-base: " + BASE + ". Histórico esperado desde " + START + ". Execução local: npm run data:audit. Node.js: " + process.version + " (requer Node >= 22.18 com suporte nativo a TypeScript). Nenhuma dependência adicionada.", "",
    "## Metodologia e reprodução",
    "- Somente leitura dos cinco CSVs explicitamente definidos em scripts/data-audit.mts. Parser estrito de CSV UTF-8 (BOM, CRLF, vírgulas e quebras de linha em campos entre aspas). Falha de sintaxe, encoding ou cabeçalho interrompe a execução; erros não exibem células.",
    "- Cada registro de dados conta uma vez, excluindo o cabeçalho. Linhas com largura inválida são contadas e excluídas das verificações por coluna; não há truncamento silencioso. Campos vazios ou só com espaços são nulos; espaços não são normalizados.",
    "- Número: representação decimal com ponto, sem separadores de milhar; valores finitos no intervalo seguro do JavaScript. Inteiros obrigatórios para unidades, saldos, MOQ e quantidades. Zero, negativos e precisão monetária são auditados separadamente. Datas ISO estritas em UTC; lead times em dias corridos.",
    "- SHA-256 e tamanho de cada origem no anexo permitem identificar a versão auditada; os hashes são conferidos novamente ao fim. Não há consulta a rede, endpoint, cópia dos CSVs ou alteração da aplicação.",
    "- O relatório JSON e este Markdown são determinísticos para os mesmos arquivos e a mesma versão de Node. Não é gravado horário de execução. Falha de processo retorna código diferente de zero; achados de qualidade são relatados sem declarar os dados aprovados.", "",
    "## Contagens observadas",
    "| Arquivo | Registros | Repetições exatas excedentes | Grupos de chave repetida | Grupos conflitantes | Cobertura temporal |\n| --- | ---: | ---: | ---: | ---: | --- |\n" + overview, "",
    "### Leitura dos achados observados",
    "- Catálogo: " + catalog.unambiguousSkuCount + " SKUs; " + (catalog.statusCounts.ativo ?? 0) + " ativos e " + (catalog.statusCounts.descontinuado ?? 0) + " descontinuados; " + catalog.supplierCount + " fornecedores.",
    "- Vendas: " + files["vendas_diarias.csv"].duplicates.exactExcess + " repetições exatas excedentes em " + files["vendas_diarias.csv"].duplicates.exactGroups + " grupos; " + sales.analysisRows + " linhas após deduplicação exploratória. Grupos com variantes conflitantes: " + files["vendas_diarias.csv"].duplicates.conflictingGroups + ".",
    "- Estoque: " + inventory.negativeStockRows + " saldos negativos em " + inventory.negativeStockSkus + " SKUs; " + inventory.internalMissingStockDays + " SKU-dias faltantes entre a primeira e a última posição; " + inventory.catalogSkusWithoutBaseStock + " SKUs sem saldo observado na data-base.",
    "- Cruzamentos: " + sales.observedSalesWithNoStock + " linhas de venda sem posição de estoque no mesmo SKU-dia; " + inventory.nonzeroLedgerResiduals + " resíduos não nulos entre " + inventory.transitionsWithObservedSales + " transições consecutivas avaliáveis.",
    "- Dias com posição de estoque e sem venda registrada: " + sales.missingSkuDaysWithinObservedStockSpan + ", dos quais " + sales.missingSalesWithPositiveClosingStock + " com saldo positivo e " + sales.missingSalesWithNonpositiveClosingStock + " com saldo não positivo. São ausências, não demanda zero.",
    "- Compras: " + (purchasing.analysisStates.recebido_na_base ?? 0) + " linhas recebidas até a base e " + (purchasing.analysisStates.pendente_sem_recebimento ?? 0) + " pendentes sem recebimento; " + purchasing.moqFailures + " violações avaliáveis de MOQ e " + purchasing.moqNotEvaluable + " não avaliáveis.",
    "- Nulos obrigatórios: " + Object.values(files).reduce((sum, f) => sum + f.missingRequired, 0) + "; registros com largura inválida: " + Object.values(files).reduce((sum, f) => sum + f.malformedWidthRecords, 0) + ". Nulos opcionais de data_recebimento são informados separadamente e não equivalem a erro.",
    "",
    "### Catálogo e fornecedores", json(catalog), "",
    "## Duplicatas e decisões de tratamento",
    "- Duplicata exata = todos os campos CSV decodificados iguais, preservando espaços e representação numérica. Diferenças apenas na sintaxe das aspas ou terminadores de linha não distinguem registros.",
    "- Chaves lógicas: SKU no catálogo; fornecedor no cadastro; SKU + data em vendas/estoque; po_id + SKU em compras. Esta última é uma hipótese de identidade de linha e precisa ser confirmada se um pedido puder repetir o mesmo SKU.",
    "- As estatísticas de arquivo, nulos, números e integridade referencial contam linhas originais de largura válida. logicalExcess conta ocorrências além da primeira por chave; exactExcess conta somente repetições idênticas. As duas medidas se sobrepõem e não devem ser somadas.",
    "- Apenas para cruzamentos exploratórios, mantém-se uma ocorrência de cada linha exata e retiram-se TODAS as variantes de chaves conflitantes. Não se escolhe a maior venda, não se soma uma duplicata e não se declara a deduplicação aprovada para indicadores.",
    "- Filtragem temporal dos cruzamentos diários: " + START + " até " + BASE + ", inclusive. Datas futuras permanecem nas estatísticas brutas, mas não entram no histórico. Compras emitidas até a base e recebidas depois dela não ficam disponíveis na base.",
    "- Nenhum CSV é sobrescrito. Os indicadores devem aguardar confirmação da origem das duplicatas e política formal de tratamento.", "",
    "## Integridade entre entidades", json(integrity),
    "Referências inexistentes ou ambíguas são contadas por linha original. Ausência de compras para saldo inicial, especialmente de SKU iniciado após " + START + ", não prova erro: o dicionário prevê saldos de abertura sem PO. Divergência entre fornecedor histórico e catálogo atual exige confirmação, não correção automática.", "",
    "## Unidades, MOQ, compras e lead times", json(purchasing),
    "- Conversão explícita: un = 1; cx 12 un = 12 unidades físicas. MOQ está na unidade de compra do catálogo. O teste é quantidade física % (MOQ × fator da unidade de compra) = 0, com quantidade inteira positiva.",
    "- Uma unidade diferente do catálogo é reportada mesmo que a quantidade física respeite o MOQ. MOQ inválido, unidade desconhecida ou SKU ambíguo tornam o teste não avaliável.",
    "- rawStates usa linhas originais; analysisStates e demais cruzamentos usam linhas sem conflito, após deduplicação exata. Volumes de compras convertidos são quantidades físicas pedidas/recebidas dessas linhas e não saldo disponível atual.",
    "- Recebimento vazio = pendente; recebimento posterior à base = não disponível na base. Lead times usam exclusivamente recebimentos válidos até a base, com data de emissão válida e recebimento não anterior à emissão. Incluem lead time zero; percentis pelo método nearest-rank, média descritiva.",
    "- A idade de pedido pendente é apenas tempo desde emissão: sem prazo prometido, não mede atraso. Lead times > 90 dias são uma triagem explícita, não um limite contratual.",
    "- Compras associadas ao status atual descontinuado não demonstram compra irregular no passado: não há data de descontinuação. Não usar esses SKUs em reposição rotineira sem decisão explícita.",
    "- Lead times de pedidos já recebidos têm viés de sobrevivência: pedidos ainda abertos não podem ser imputados como recebidos nem descartados ao estimar risco futuro.", "",
    "## Estoque, rupturas possíveis e reconciliação exploratória", json(inventory),
    "- Saldo de fechamento <= 0 é sinal de possível indisponibilidade, não observação direta de demanda perdida. Saldos negativos são anomalias preservadas, sem clamp para zero. Saldo final zero também pode refletir venda que esgotou o estoque naquele dia.",
    "- maxNonpositiveRun mede a maior sequência de dias consecutivos com saldo <= 0 por SKU; lacunas e saldos inválidos interrompem a sequência. As contagens são SKU-dias, não clientes ou pedidos.",
    "- Lacunas internas são dias entre primeiro e último saldo observado. Ausências antes da primeira posição não são imputadas como estoque zero nem produto disponível. Entradas tardias podem ser lançamento ou início de observação.",
    "- Reconciliação: saldo atual − saldo anterior − recebimentos registrados no dia + vendas registradas no dia. Avaliada apenas com saldos inteiros consecutivos, venda observada não negativa e recebimentos válidos convertidos. O primeiro saldo é abertura e não é reconciliado.",
    "- A ausência de recebimento no arquivo vale apenas como ausência de recebimento CONHECIDO nesta comparação, nunca como prova de inexistência. Ajustes, devoluções, transferências, horários de corte, chaves conflitantes ou compras inválidas podem explicar resíduos; eles não são atribuídos automaticamente a fraude/erro nem corrigidos.",
    "- Aumento de estoque sem recebimento conhecido é uma triagem adicional, inclusive em dias sem venda observada. Não representa entrada confirmada não registrada.", "",
    "## Vendas, dias ausentes e riscos de viés", json(sales),
    "- Dias sem linha de venda NÃO são convertidos em demanda zero. As contagens de ausência usam somente dias com saldo de estoque observado, após exclusão de conflitos. Não são contagens de vendas perdidas.",
    "- Ausência com estoque positivo pode refletir nenhuma venda, falha de captura, indisponibilidade no site ou outros fatores; não basta para concluir demanda zero. Ausência com estoque <= 0 pode sinalizar demanda censurada por ruptura.",
    "- Venda positiva e fechamento não positivo não demonstram inconsistência intradiária: o saldo é ao final do dia. O histórico não contém disponibilidade intradiária, tráfego ou pedidos não atendidos.",
    "- Médias apenas em dias com venda superestimam a média por dia calendário; preencher todos os ausentes com zero pode subestimar demanda durante rupturas. Excluir rupturas também muda a população observada.",
    "- Status atual não reconstrói status histórico, e lançamentos tardios não devem receber zeros antes da entrada. Não inferir sazonalidade sem distinguir calendário, promoções, cobertura e disponibilidade.",
    "- É necessário definir calendário observável/ativo por SKU e tratamento de censura e falhas de captura antes de prever demanda ou calcular nível de serviço.", "",
    "## Fatos, hipóteses e pontos ainda não resolvidos",
    "**Fatos observados:** contagens e distribuições acima e no anexo são calculadas dos arquivos identificados pelos hashes, sob os filtros explicitados. Não há previsão, otimização ou estimativa financeira nesta auditoria.",
    "**Hipóteses de triagem:** chave de linha de compras; suspeita de ruptura a partir do saldo final; referência ao catálogo atual para MOQ/fornecedor/unidade históricos; interpretação do resíduo de movimentos. Nenhuma foi promovida a fato causal.",
    "**Antes dos indicadores:** confirmar duplicatas de vendas e granularidade de compras; explicar saldos negativos e resíduos; validar unidades/MOQ e fornecedores divergentes; tratar referências/datas inválidas se houver; obter calendário de disponibilidade e descontinuação; confirmar saldos de abertura, cobertura e tratamento de dias sem vendas; considerar pendências e recebimentos futuros sem vazamento temporal. Achado zero em uma regra não valida as demais.",
    "Testes automatizados cobrem parser, datas, conversão, duplicatas e classificação temporal. Invariantes reconciliam totais e hashes a cada execução.", "",
    "## Anexo técnico agregado: arquivos, nulos, números, datas e hashes", json(files), "",
  ].join("\n\n") + "\n";
}
async function main() {
  const result = await audit();
  const directory = path.join(root, "private");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "data-audit.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
  await writeFile(path.join(directory, "data-audit.md"), reportMarkdown(result), "utf8");
  console.log("Auditoria local concluída. Relatórios privados: private/data-audit.md e private/data-audit.json");
  console.log(JSON.stringify({
    referenceDate: result.referenceDate,
    records: Object.fromEntries(Object.entries(result.files).map(([name, f]) => [name, f.records])),
    status: result.catalog.statusCounts,
    exactDuplicateExcess: Object.fromEntries(Object.entries(result.files).map(([name, f]) => [name, f.duplicates.exactExcess])),
    conflictingKeys: Object.fromEntries(Object.entries(result.files).map(([name, f]) => [name, f.duplicates.conflictingGroups])),
    negativeInventoryRows: result.inventory.negativeStockRows,
    purchaseStates: result.purchasing.analysisStates,
  }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    // Avoid accidentally printing cells/records or credentials through exceptions.
    console.error("Auditoria interrompida. Verifique acesso local, UTF-8, sintaxe CSV, cabeçalhos e estabilidade das origens. Nenhum dado individual foi exibido.");
    process.exitCode = 1;
  });
}
