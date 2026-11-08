import { COLUMNS, normalizeOperationalTables } from "../analytics/normalization";
import { dateValue, unitFactor } from "../analytics/primitives";
import { shiftDate } from "../analytics/math";
import type { Dataset, FileName, ParsedTable } from "../analytics/types";
import { FILE_TYPES } from "./recognition";
import { validateParameters } from "./parameters";
import { CONTRACT_VERSION, IMPORT_LIMITS, type FileSummary, type ImportIssue, type InspectedFile, type ParameterForm, type Progress, type ValidationResult } from "./types";

const messages: Record<string, string> = {
  invalid_width: "Quantidade de células diferente do cabeçalho.", invalid_field: "Campo obrigatório vazio, inválido ou com espaços externos.",
  invalid_date: "Data inválida ou ambígua. Use AAAA-MM-DD.", invalid_integer: "Quantidade deve ser inteira e segura, respeitando o sinal permitido.",
  invalid_money: "Valor monetário inválido. Use ponto decimal, até duas casas, sem milhar.", revenue_without_units: "Receita positiva sem unidades vendidas.",
  receipt_before_order: "Recebimento anterior à emissão do pedido.", unknown_sku: "SKU não encontrado no catálogo válido.", unknown_supplier: "Fornecedor não encontrado no cadastro válido.",
  exact_duplicate_deduplicated: "Duplicata exata consolidada em memória; todas as referências foram preservadas. Revise a origem.",
  logical_conflict_quarantined: "Chave lógica com valores conflitantes. Corrija o arquivo; análise bloqueada.",
  future_excluded: "Registro posterior à referência excluído dos cálculos.", future_receipt_not_available: "Recebimento futuro tratado como pendente, sem disponibilidade confirmada.",
  negative_stock: "Saldo negativo preservado como anomalia; não é estoque utilizável.",
  catalog_purchase_mismatch: "Compra histórica diverge do fornecedor, unidade ou múltiplo do MOQ atual. Revise sem reescrever o histórico.",
};
export function validateImport(files: readonly InspectedFile[], assignments: Record<string, FileName | null>, form: ParameterForm,
  progress: (progress: Progress) => void = () => {}): ValidationResult {
  const shown: ImportIssue[] = []; let errors = 0, warnings = 0;
  const add = (issue: ImportIssue) => {
    if (issue.severity === "error") errors++; else warnings++;
    if (shown.length < IMPORT_LIMITS.displayedIssues) shown.push(issue);
    else if (issue.severity === "error") {
      const warning = shown.findIndex((item) => item.severity === "warning");
      if (warning !== -1) shown[warning] = issue;
    }
  };
  const parameterResult = validateParameters(form);
  parameterResult.issues.forEach(add);
  const summaries: FileSummary[] = [], tables: ParsedTable[] = [];
  const selected = new Map<FileName, InspectedFile>();
  for (const file of files) {
    const { recognition } = file, type = assignments[recognition.id];
    if (recognition.problem) add({ severity: "error", code: "invalid_file", fileId: recognition.id, message: recognition.problem });
    if (!type || !FILE_TYPES.includes(type)) { add({ severity: "error", code: "unclassified", fileId: recognition.id, message: "Identifique o tipo deste arquivo antes de validar." }); continue; }
    if (selected.has(type)) add({ severity: "error", code: "duplicate_type", fileId: recognition.id, message: "Há mais de um arquivo atribuído ao mesmo tipo. Substitua a seleção completa." });
    else selected.set(type, file);
  }
  for (const type of FILE_TYPES) {
    const file = selected.get(type);
    if (!file) { add({ severity: "error", code: "missing_type", message: "Falta o tipo obrigatório: " + type }); continue; }
    const id = file.recognition.id, columns = COLUMNS[type];
    if (file.header.length !== columns.length || new Set(file.header).size !== file.header.length || !columns.every((c) => file.header.includes(c))) {
      add({ severity: "error", code: "invalid_columns", fileId: id, message: "Colunas ausentes ou extras. Use exatamente o contrato escolhido; a ordem pode variar." }); continue;
    }
    const indices = columns.map((c) => file.header.indexOf(c));
    const table: ParsedTable = { file: type, rows: [], issues: [] };
    let start: string | null = null, end: string | null = null;
    for (let i = 0; i < file.rows.length; i++) {
      const row = file.rows[i], record = i + 2;
      if (row.length !== columns.length) { table.issues.push({ file: type, records: [record], code: "invalid_width", severity: "error" }); continue; }
      const values = Object.fromEntries(columns.map((c, n) => [c, row[indices[n]]]));
      const date = values.data ?? values.data_pedido;
      if (date && dateValue(date) !== null) { if (!start || date < start) start = date; if (!end || date > end) end = date; }
      table.rows.push({ record, values });
    }
    if (!file.rows.length) add({ severity: type === "skus.csv" || type === "fornecedores.csv" ? "error" : "warning", code: "empty_table", fileId: id, message: "Arquivo sem registros. Históricos vazios não significam demanda zero." });
    summaries.push({ id, name: file.recognition.name, type, inputRecords: file.rows.length, acceptedRecords: 0, start, end });
    tables.push(table);
    progress({ phase: "validate", completed: tables.length, total: 5 });
  }
  const finish = (dataset: Dataset | null): ValidationResult => ({
    report: { canProcess: errors === 0 && dataset !== null, errors, warnings, issues: shown, hiddenIssues: Math.max(0, errors + warnings - shown.length), files: summaries },
    operation: errors || !dataset || !parameterResult.parameters ? null : { contractVersion: CONTRACT_VERSION, source: "imported_local", parameters: parameterResult.parameters,
      dataset, metadata: { files: summaries, warnings, duplicatePolicy: dataset.policy } },
  });
  if (errors || !parameterResult.parameters) return finish(null);
  progress({ phase: "normalize", completed: 0, total: 1 });
  const dataset = normalizeOperationalTables(tables, parameterResult.parameters.referenceDate);
  for (const issue of dataset.issues) add({ severity: issue.severity, code: issue.code, field: issue.field,
    fileId: selected.get(issue.file)?.recognition.id, records: issue.records.slice(0, 5), message: messages[issue.code] ?? "Revise este registro conforme o contrato." });
  const counts: Record<FileName, number> = { "skus.csv": dataset.skus.length, "fornecedores.csv": dataset.suppliers.length,
    "vendas_diarias.csv": dataset.sales.length, "estoque_diario.csv": dataset.stocks.length, "compras.csv": dataset.purchases.length };
  for (const summary of summaries) summary.acceptedRecords = counts[summary.type];
  if (!errors) {
    checkNumericBounds(dataset, (issue) => add({ ...issue, fileId: issue.field === "estoque_disponivel" ? selected.get("estoque_diario.csv")?.recognition.id : undefined }));
    checkEvidence(dataset, parameterResult.parameters.demandWindowDays, add);
  }
  progress({ phase: "normalize", completed: 1, total: 1 });
  return finish(dataset);
}
function checkNumericBounds(data: Dataset, add: (issue: ImportIssue) => void) {
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  const catalog = new Map(data.skus.map((s) => [s.sku, s]));
  let inventory = BigInt(0), units = BigInt(0), revenue = BigInt(0), pending = BigInt(0);
  const latest = new Map<string, (typeof data.stocks)[number]>();
  for (const row of data.stocks) {
    if (!latest.has(row.sku) || latest.get(row.sku)!.data < row.data) latest.set(row.sku, row);
    if (BigInt(Math.max(0, row.estoque_disponivel)) * BigInt(catalog.get(row.sku)!.custo_unitario_centavos) > maximum) {
      add({ severity: "error", code: "unsafe_stock_value", field: "estoque_disponivel", records: row.source.records.slice(0, 5), message: "Valor de estoque fora do intervalo monetário seguro." });
    }
  }
  for (const row of latest.values()) inventory += BigInt(Math.max(0, row.estoque_disponivel)) * BigInt(catalog.get(row.sku)!.custo_unitario_centavos);
  for (const row of data.sales) { units += BigInt(row.unidades_vendidas); revenue += BigInt(row.receita_centavos); }
  for (const row of data.purchases) if (!row.data_recebimento) pending += BigInt(row.quantidade_unidades);
  if ([inventory, units, revenue, pending].some((v) => v > maximum)) add({ severity: "error", code: "unsafe_aggregate", message: "Um total excede o intervalo inteiro seguro; revise a escala antes de analisar." });
  if (data.skus.some((s) => BigInt(s.moq) * BigInt(unitFactor(s.unidade_compra)!) * BigInt(s.custo_unitario_centavos) > maximum)) add({ severity: "warning", code: "unsafe_purchase_lot", message: "Há lote de compra com custo fora do intervalo seguro. O motor de compras não poderá recomendá-lo." });
  if (data.skus.some((s) => s.custo_unitario_centavos === 0)) add({ severity: "warning", code: "zero_cost", message: "Há custo zero no catálogo; compras exigirão cotação positiva." });
}
function checkEvidence(data: Dataset, windowDays: number, add: (issue: ImportIssue) => void) {
  const start = shiftDate(data.referenceDate, 1 - windowDays);
  const sales = new Map<string, number>(), stocks = new Map<string, number>(), received = new Map<string, number>();
  for (const row of data.sales) if (row.data >= start) sales.set(row.sku, (sales.get(row.sku) ?? 0) + 1);
  for (const row of data.stocks) if (row.data >= start && row.estoque_disponivel > 0) stocks.set(row.sku, (stocks.get(row.sku) ?? 0) + 1);
  for (const row of data.purchases) if (row.data_recebimento) received.set(row.sku, (received.get(row.sku) ?? 0) + 1);
  if (data.skus.some((s) => sales.get(s.sku) !== windowDays || stocks.get(s.sku) !== windowDays)) add({ severity: "warning", code: "insufficient_demand_evidence", message: "Há calendários incompletos ou possível censura por indisponibilidade. Ausência de linha não vira demanda zero; algumas métricas ficarão indisponíveis." });
  if (data.skus.some((s) => (received.get(s.sku) ?? 0) < 3)) add({ severity: "warning", code: "insufficient_lead_time", message: "Há SKUs com menos de três recebimentos confirmados; lead time pode ser insuficiente para planejamento." });
  if (data.purchases.some((p) => !p.data_recebimento)) add({ severity: "warning", code: "pending_orders", message: "Pedidos pendentes não são estoque disponível e não consomem novamente o orçamento das novas recomendações." });
}
