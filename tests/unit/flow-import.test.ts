import { afterEach, describe, expect, it, vi } from "vitest";
import { COLUMNS, normalizeTables } from "@/lib/analytics/normalization";
import { shiftDate } from "@/lib/analytics/math";
import { FILE_TYPES, inspectText } from "@/lib/flow-import/recognition";
import { validateImport } from "@/lib/flow-import/validation";
import { validateParameters, emptyParameterForm } from "@/lib/flow-import/parameters";
import { createImportSession } from "@/lib/flow-import/session";
import { getImportedSkuEvidence, prepareImportedEngineInputs } from "@/lib/flow-import/adapters";
import { templateCsv } from "@/lib/flow-import/templates";
import { IMPORT_LIMITS } from "@/lib/flow-import/types";
import { importFixture, assignmentsFor, syntheticCsv, syntheticParameters } from "../fixtures/flow-import";
import type { FileName } from "@/lib/analytics/types";

const run = (changes: Partial<Record<FileName, string>> = {}, parameters = syntheticParameters()) => {
  const files = importFixture(changes);
  return validateImport(files, assignmentsFor(files), parameters);
};
afterEach(() => vi.unstubAllGlobals());
describe("reconhecimento versionado por conteúdo", () => {
  it.each(FILE_TYPES)("identifica %s com nome alterado", (type) => {
    const result = inspectText("id", "nome-sem-significado.txt", 100, templateCsv(type));
    expect(result.recognition.assigned).toBe(type);
    expect(result.recognition.sampleTypesValid).toBe(true);
  });
  it("aceita BOM, CRLF, aspas, vírgulas e quebra de linha dentro de uma célula", () => {
    const files = importFixture({ "fornecedores.csv": '\uFEFFfornecedor,nome_fornecedor\r\nFICTICIO-01,"Nome, fictício\r\ncom quebra"\r\n' });
    expect(validateImport(files, assignmentsFor(files), syntheticParameters()).report.errors).toBe(0);
  });
  it("aceita colunas reordenadas sem inventar ou perder campos", () => {
    const result = run({ "fornecedores.csv": 'nome_fornecedor,fornecedor\n"Fornecedor fictício",FICTICIO-01' });
    expect(result.operation?.dataset.suppliers[0].fornecedor).toBe("FICTICIO-01");
  });
  it("detecta classificação ambígua e permite revisão manual sem aceitar colunas extras", () => {
    const files = importFixture({ "estoque_diario.csv": "sku,data,estoque_disponivel,unidades_vendidas,receita\nEXEMPLO-01,2032-04-01,47,3,25.29" });
    const file = files.find((f) => f.recognition.candidates.length === 2)!;
    expect(file.recognition.assigned).toBeNull();
    const assignments = assignmentsFor(files); assignments[file.recognition.id] = "estoque_diario.csv";
    expect(validateImport(files, assignments, syntheticParameters()).report.issues.some((i) => i.code === "invalid_columns")).toBe(true);
  });
  it("recusa classificação manual incompatível com o contrato", () => {
    const files = importFixture(), assignments = assignmentsFor(files);
    assignments[files[0].recognition.id] = "compras.csv";
    expect(validateImport(files, assignments, syntheticParameters()).operation).toBeNull();
  });
  it("reporta tipos duplicados e ausentes", () => {
    const files = importFixture(); files[1] = { ...files[0], recognition: { ...files[0].recognition, id: "duplicado" } };
    const report = validateImport(files, assignmentsFor(files), syntheticParameters()).report;
    expect(report.issues.map((i) => i.code)).toContain("duplicate_type");
    expect(report.issues.map((i) => i.code)).toContain("missing_type");
  });
  it.each(["sku,data,data", "coluna_inventada", "sku;data;estoque_disponivel"])("não adivinha cabeçalho %s", (header) => {
    expect(inspectText("id", "estoque_diario.csv", 100, header).recognition.assigned).toBeNull();
  });
  it("reporta sintaxe inválida, codificação inválida e tamanho excessivo", () => {
    expect(inspectText("id", "x", 1, '"aberto').recognition.problem).toBeTruthy();
    expect(inspectText("id", "x", 1, "\uFFFD").recognition.problem).toBeTruthy();
    expect(inspectText("id", "x", IMPORT_LIMITS.fileBytes + 1, "").recognition.problem).toBeTruthy();
  });
});
describe("parâmetros explícitos sem premissas do case", () => {
  it("não fornece defaults de operação importada", () => {
    expect(Object.values(emptyParameterForm()).every((v) => v === "")).toBe(true);
    expect(validateParameters(emptyParameterForm()).parameters).toBeNull();
  });
  it("converte reais e porcentagens sem ponto flutuante monetário", () => {
    expect(validateParameters(syntheticParameters()).parameters).toMatchObject({ budgetCents: 456789, serviceBps: 9500, annualCapitalBps: 975, monthlyStorageBps: 35 });
  });
  it.each(["-1", "1.234,56", "1,234.56", "NaN", "Infinity", "0.001", "9007199254740992"])("recusa orçamento %s", (budget) => {
    expect(validateParameters({ ...syntheticParameters(), budget }).parameters).toBeNull();
  });
  it("aceita orçamento zero, sem substituí-lo por outro orçamento", () => {
    expect(run({}, { ...syntheticParameters(), budget: "0" }).operation?.parameters.budgetCents).toBe(0);
  });
  it.each(["2032-02-30", "01/04/2032", "", "2032-4-1"])("recusa referência inválida %s", (referenceDate) => {
    expect(validateParameters({ ...syntheticParameters(), referenceDate }).parameters).toBeNull();
  });
  it("valida ordem e comprimento do horizonte e limites das metas", () => {
    expect(validateParameters({ ...syntheticParameters(), horizonStart: "2032-04-01" }).parameters).toBeNull();
    expect(validateParameters({ ...syntheticParameters(), horizonEnd: "2035-01-01" }).parameters).toBeNull();
    expect(validateParameters({ ...syntheticParameters(), servicePercent: "0" }).parameters).toBeNull();
    expect(validateParameters({ ...syntheticParameters(), monthlyStoragePercent: "101" }).parameters).toBeNull();
  });
});
describe("validação canônica, erros e alertas", () => {
  it("normaliza os cinco modelos e preserva rastreabilidade e caixas", () => {
    const result = run();
    expect(result.report.canProcess).toBe(true);
    expect(result.operation?.contractVersion).toBe("goflow-operational-csv/v1");
    expect(result.operation?.dataset.purchases[0]).toMatchObject({ quantidade: 2, quantidade_unidades: 24, unidade: "cx 12 un", source: { records: [2] } });
    expect(result.operation?.dataset.skus[0]).toMatchObject({ custo_unitario_centavos: 317, moq: 2 });
    expect(result.report.files.every((f) => f.inputRecords === 1 && f.acceptedRecords === 1)).toBe(true);
  });
  it("mantém o limite e comportamento do normalizador legado", () => {
    expect(() => normalizeTables([], "2037-04-19")).toThrow("referência permitida");
  });
  it.each(["2032-02-30", "01/04/2032"])("bloqueia data de CSV %s com campo e registro", (date) => {
    const report = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", [["EXEMPLO-01", date, "3", "25.29"]]) }).report;
    expect(report.canProcess).toBe(false);
    expect(report.issues.find((i) => i.code === "invalid_date")).toMatchObject({ field: "data", records: [2] });
  });
  it.each(["1.234,56", "-1", "0.001", "NaN", "Infinity"])("bloqueia dinheiro inválido no CSV %s", (value) => {
    expect(run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", [["EXEMPLO-01", "2032-04-01", "3", value]]) }).report.canProcess).toBe(false);
  });
  it("bloqueia referências inválidas e não retorna dataset parcial", () => {
    const result = run({ "fornecedores.csv": syntheticCsv("fornecedores.csv", [["OUTRO-FICTICIO", "Outro fornecedor"]]) });
    expect(result.operation).toBeNull();
    expect(result.report.issues.some((i) => i.code === "unknown_supplier")).toBe(true);
  });
  it("preserva saldo negativo como alerta, sem transformá-lo em zero", () => {
    const result = run({ "estoque_diario.csv": syntheticCsv("estoque_diario.csv", [["EXEMPLO-01", "2032-04-01", "-7"]]) });
    expect(result.operation?.dataset.stocks[0].estoque_disponivel).toBe(-7);
    expect(result.report.canProcess).toBe(true);
    expect(result.report.issues.find((i) => i.code === "negative_stock")?.severity).toBe("warning");
  });
  it("deduplica exatas explicitamente e bloqueia conflitos lógicos", () => {
    const row = ["EXEMPLO-01", "2032-04-01", "3", "25.29"];
    const exact = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", [row, row]) });
    expect(exact.operation?.dataset.sales[0].source.records).toEqual([2, 3]);
    expect(exact.report.issues.some((i) => i.code === "exact_duplicate_deduplicated")).toBe(true);
    const conflict = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", [row, [row[0], row[1], "4", "25.29"]]) });
    expect(conflict.operation).toBeNull();
    expect(conflict.report.issues.some((i) => i.code === "logical_conflict_quarantined")).toBe(true);
  });
  it("recebimento futuro vira pendência, sem contaminar disponibilidade", () => {
    const result = run({ "compras.csv": syntheticCsv("compras.csv", [["P-FICTICIO", "FICTICIO-01", "EXEMPLO-01", "2032-03-21", "2032-04-05", "2", "cx 12 un"]]) });
    expect(result.operation?.dataset.purchases[0].data_recebimento).toBeNull();
    expect(result.report.issues.some((i) => i.code === "future_receipt_not_available")).toBe(true);
    const evidence = getImportedSkuEvidence(result.operation!, "EXEMPLO-01")!;
    expect(evidence.stock.usableUnits).toBe(47);
    expect(evidence.leadTime.sampleSize).toBe(0);
    expect(evidence.leadTime.pendingUnits).toBe(24);
  });
  it("descarta observações futuras e não chama ausência de demanda zero", () => {
    const result = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", [["EXEMPLO-01", "2032-04-02", "100", "100.00"]]) });
    expect(result.operation?.dataset.sales).toEqual([]);
    expect(getImportedSkuEvidence(result.operation!, "EXEMPLO-01")?.sales.estimatedDailyDemand).toBeNull();
  });
  it("bloqueia recebimento anterior ao pedido", () => {
    expect(run({ "compras.csv": syntheticCsv("compras.csv", [["P-FICTICIO", "FICTICIO-01", "EXEMPLO-01", "2032-04-01", "2032-03-30", "2", "cx 12 un"]]) }).report.issues.some((i) => i.code === "receipt_before_order")).toBe(true);
  });
  it("alerta sobre divergência histórica de MOQ e unidade sem reescrever o pedido", () => {
    const result = run({ "compras.csv": syntheticCsv("compras.csv", [["P-FICTICIO", "FICTICIO-01", "EXEMPLO-01", "2032-03-21", "", "5", "un"]]) });
    expect(result.operation?.dataset.purchases[0].quantidade_unidades).toBe(5);
    expect(result.report.issues.some((i) => i.code === "catalog_purchase_mismatch")).toBe(true);
  });
  it("bloqueia MOQ, unidades e quantidades fora do contrato", () => {
    const row = ["EXEMPLO-01", "Marca fictícia", "Produto", "Exemplo", "ativo", "3.17", "8.43", "FICTICIO-01", "pallet", "0"];
    expect(run({ "skus.csv": syntheticCsv("skus.csv", [row]) }).report.canProcess).toBe(false);
    expect(run({ "compras.csv": syntheticCsv("compras.csv", [["P-FICTICIO", "FICTICIO-01", "EXEMPLO-01", "2032-03-21", "", "0.5", "un"]]) }).report.canProcess).toBe(false);
  });
  it("bloqueia produtos monetários inseguros, mesmo com campos isoladamente válidos", () => {
    const rows = [["EXEMPLO-01", "Marca", "Produto", "Teste", "ativo", "90071992547409.91", "8.43", "FICTICIO-01", "un", "1"]];
    const result = run({ "skus.csv": syntheticCsv("skus.csv", rows) });
    expect(result.operation).toBeNull();
    expect(result.report.issues.some((i) => i.code === "unsafe_stock_value")).toBe(true);
  });
  it("limita mensagens exibidas, mantém a contagem completa e prioriza impeditivos", () => {
    const rows = Array.from({ length: 100 }, (_, n) => ["SKU-INEXISTENTE-" + n, "2032-04-01", "1", "1.00"]);
    const result = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", rows) });
    expect(result.report.errors).toBe(100);
    expect(result.report.issues).toHaveLength(IMPORT_LIMITS.displayedIssues);
    expect(result.report.hiddenIssues).toBeGreaterThan(0);
    expect(result.operation).toBeNull();
  });
  it("não esconde erro impeditivo que aparece após muitos alertas", () => {
    const rows = Array.from({ length: 90 }, (_, n) => ["EXEMPLO-01", shiftDate("2032-04-01", -n), "3", "25.29"]).flatMap((row) => [row, row]);
    rows.push(["SKU-INEXISTENTE", "2032-04-01", "3", "25.29"]);
    const result = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", rows) });
    expect(result.report.warnings).toBe(90);
    expect(result.report.errors).toBe(1);
    expect(result.report.issues).toHaveLength(80);
    expect(result.report.issues.some((i) => i.code === "unknown_sku")).toBe(true);
    expect(result.operation).toBeNull();
  });
});

describe("isolamento da sessão e adaptadores", () => {
  it("reutiliza regras analíticas para uma referência operacional independente", () => {
    const operation = run().operation!, evidence = getImportedSkuEvidence(operation, "EXEMPLO-01")!;
    expect(evidence.stock.valueCents).toBe(47 * 317);
    expect(evidence.sales.observedUnits).toBe(3);
    expect(evidence.leadTime.meanDays).toBe(9);
    expect(evidence.sales.estimatedDailyDemand).toBeNull();
    expect(prepareImportedEngineInputs(operation).buying.status).toBe("unavailable");
    expect(getImportedSkuEvidence(operation, "SKU-INEXISTENTE")).toBeNull();
  });
  it("mantém uma referência única em memória, limpa e impede commit obsoleto", () => {
    const store = createImportSession(), operation = run().operation!, notify = vi.fn();
    const unsubscribe = store.subscribe(notify), revision = store.clear();
    expect(store.commit(operation, revision)).toBe(true);
    expect(store.getSnapshot().operation).toBe(operation);
    const replacementRevision = store.clear();
    expect(store.commit(operation, revision)).toBe(false);
    expect(store.getSnapshot().source).toBe("demo");
    expect(store.getSnapshot().operation).toBeNull();
    expect(store.commit(operation, replacementRevision)).toBe(true);
    unsubscribe(); expect(notify).toHaveBeenCalledTimes(4);
    expect(createImportSession().getSnapshot().operation).toBeNull();
  });
  it("não depende de rede ou persistência de dados", () => {
    const forbidden = () => { throw new Error("Efeito externo proibido no importador"); };
    for (const key of ["fetch", "XMLHttpRequest", "WebSocket", "localStorage", "indexedDB"]) vi.stubGlobal(key, forbidden);
    expect(run().report.canProcess).toBe(true);
    expect(createImportSession().commit(run().operation!, 0)).toBe(true);
  });
  it("é determinístico para entradas idênticas e para a ordem de seleção dos arquivos", () => {
    const files = importFixture();
    const first = validateImport(files, assignmentsFor(files), syntheticParameters());
    expect(validateImport(files, assignmentsFor(files), syntheticParameters())).toEqual(first);
    expect(validateImport([...files].reverse(), assignmentsFor(files), syntheticParameters())).toEqual(first);
  });
  it("processa histórico sintético maior sem dependência dos arquivos confidenciais", () => {
    const rows = Array.from({ length: 12000 }, (_, n) => ["EXEMPLO-01", "2032-04-01", "3", "25.29", String(n)]);
    // Multiple independent SKUs and explicit daily records, not repetitions of private data.
    const skus = rows.map((_, n) => ["TESTE-" + n, "Fictícia", "Teste", "Teste", "ativo", "1.01", "2.03", "FICTICIO-01", "un", "1"]);
    const sales = rows.map((_, n) => ["TESTE-" + n, "2032-04-01", "3", "6.09"]);
    const stocks = rows.map((_, n) => ["TESTE-" + n, "2032-04-01", "17"]);
    const result = run({ "skus.csv": syntheticCsv("skus.csv", skus), "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", sales),
      "estoque_diario.csv": syntheticCsv("estoque_diario.csv", stocks), "compras.csv": COLUMNS["compras.csv"].join(",") });
    expect(result.report.canProcess).toBe(true);
    expect(result.operation?.dataset.skus).toHaveLength(12000);
    expect(result.operation?.dataset.sales).toHaveLength(12000);
  }, 15000);
  it("preserva todas as referências de muitas duplicatas exatas sem excluir silenciosamente", () => {
    const rows = Array.from({ length: 40000 }, () => ["EXEMPLO-01", "2032-04-01", "3", "25.29"]);
    const result = run({ "vendas_diarias.csv": syntheticCsv("vendas_diarias.csv", rows) });
    expect(result.report.canProcess).toBe(true);
    expect(result.operation?.dataset.sales).toHaveLength(1);
    expect(result.operation?.dataset.sales[0].source.records).toHaveLength(40000);
    expect(result.report.issues.filter((i) => i.code === "exact_duplicate_deduplicated")).toHaveLength(1);
  }, 15000);
});
