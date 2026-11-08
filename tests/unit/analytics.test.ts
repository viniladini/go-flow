import { describe, expect, it } from "vitest";
import { analyzeDataset, DEFAULT_CONFIG, getSkuMetrics, resolveConfig } from "@/lib/analytics/index.ts";
import { COLUMNS, moneyCents, normalizeTables, parseTable } from "@/lib/analytics/normalization.ts";
import { calculateCoverage } from "@/lib/analytics/inventory.ts";
import { calculateLeadTime } from "@/lib/analytics/lead-time.ts";
import { classifyRisk } from "@/lib/analytics/risk.ts";
import { shiftDate, sumIntegers } from "@/lib/analytics/math.ts";
import type { FileName, SkuMetrics, StockMetric } from "@/lib/analytics/types.ts";

const BASE = "2037-04-18";
type Row = Record<string, string>;
const supplier = { fornecedor: "F_TESTE", nome_fornecedor: "Fornecedor sintético" };
const sku = { sku: "TESTE", marca: "Marca sintética", descricao: "Produto sintético", categoria: "Teste",
  status: "ativo", custo_unitario: "2.50", preco_venda: "5.00", fornecedor: supplier.fornecedor, unidade_compra: "un", moq: "1" };
const purchase = (id: string, order: string, receipt = "", quantity = "1", unit = "un"): Row => ({
  po_id: id, fornecedor: supplier.fornecedor, sku: sku.sku, data_pedido: order,
  data_recebimento: receipt, quantidade: quantity, unidade: unit,
});
function series(days: number, units = 2, balance = 100) {
  const sales: Row[] = [], stocks: Row[] = [];
  for (let i = 0; i < days; i++) {
    const data = shiftDate(BASE, -i);
    sales.push({ sku: sku.sku, data, unidades_vendidas: String(units), receita: String(units * 5) });
    stocks.push({ sku: sku.sku, data, estoque_disponivel: String(balance) });
  }
  return { sales, stocks };
}
function dataset(overrides: Partial<Record<FileName, Row[]>> = {}, base = BASE) {
  const raw: Record<FileName, Row[]> = {
    "skus.csv": [sku], "fornecedores.csv": [supplier], "vendas_diarias.csv": [],
    "estoque_diario.csv": [{ sku: sku.sku, data: BASE, estoque_disponivel: "100" }], "compras.csv": [],
    ...overrides,
  };
  return normalizeTables((Object.keys(COLUMNS) as FileName[]).map((file) => {
    const quote = (v: string) => '"' + v.replace(/"/g, '""') + '"';
    const text = [COLUMNS[file].join(","), ...raw[file].map((row) => COLUMNS[file].map((field) => quote(row[field])).join(","))].join("\n");
    return parseTable(file, text);
  }), base);
}
function metric(data = dataset(), overrides: Parameters<typeof analyzeDataset>[1] = {}): SkuMetrics {
  return getSkuMetrics(analyzeDataset(data, overrides), sku.sku)!;
}

describe("normalização e rastreabilidade", () => {
  it("converte moeda exatamente para centavos, sem arredondar silenciosamente", () => {
    expect(moneyCents("0.29")).toBe(29);
    expect(moneyCents("123.4")).toBe(12340);
    for (const value of ["1.001", "-1", "1,20", "NaN", "9007199254740992"]) expect(moneyCents(value)).toBeNull();
  });
  it("reporta largura inválida e recusa colunas não confirmadas", () => {
    expect(parseTable("fornecedores.csv", "fornecedor,nome_fornecedor\nA").issues[0].code).toBe("invalid_width");
    expect(() => parseTable("fornecedores.csv", "id,nome\nA,B")).toThrow();
  });
  it("deduplica somente em memória e preserva as duas referências", () => {
    const row = { sku: sku.sku, data: BASE, unidades_vendidas: "2", receita: "10.00" };
    const data = dataset({ "vendas_diarias.csv": [row, { ...row }] });
    expect(data.sales).toHaveLength(1);
    expect(data.sales[0].source.records).toEqual([2, 3]);
    expect(data.issues.some((i) => i.code === "exact_duplicate_deduplicated")).toBe(true);
    expect(metric(data).sales[0].observedUnits).toBe(2);
    expect(analyzeDataset(data).dashboard.exploratory).toBe(true);
  });
  it("quarentena TODAS as variantes conflitantes de vendas", () => {
    const row = { sku: sku.sku, data: BASE, unidades_vendidas: "2", receita: "10.00" };
    const data = dataset({ "vendas_diarias.csv": [row, { ...row, unidades_vendidas: "3" }] });
    expect(data.sales).toHaveLength(0);
    expect(data.issues.filter((i) => i.code === "logical_conflict_quarantined")).toHaveLength(2);
    expect(metric(data).coverage.status).toBe("insufficient");
  });
  it("não usa saldo anterior para disfarçar conflito na posição mais recente", () => {
    const data = dataset({ "estoque_diario.csv": [
      { sku: sku.sku, data: shiftDate(BASE, -1), estoque_disponivel: "10" },
      { sku: sku.sku, data: BASE, estoque_disponivel: "20" },
      { sku: sku.sku, data: BASE, estoque_disponivel: "30" },
    ] });
    const m = metric(data, { maxStockAgeDays: 2 });
    expect(m.stock.state).toBe("missing");
    expect(m.stock.lastObservedBalance).toBe(10);
    expect(m.stock.valueCents).toBeNull();
  });
  it("quarentena vendas negativas e datas impossíveis com referência ao registro", () => {
    const data = dataset({ "vendas_diarias.csv": [
      { sku: sku.sku, data: BASE, unidades_vendidas: "-1", receita: "0" },
      { sku: sku.sku, data: "2026-02-30", unidades_vendidas: "1", receita: "5" },
    ] });
    expect(data.sales).toHaveLength(0);
    expect(data.issues.every((i) => i.records.length > 0)).toBe(true);
  });
  it("valida integridade sem inventar cadastros", () => {
    const data = dataset({ "vendas_diarias.csv": [{ sku: "DESCONHECIDO", data: BASE, unidades_vendidas: "1", receita: "5" }] });
    expect(data.sales).toHaveLength(0);
    expect(data.issues[0].code).toBe("unknown_sku");
  });
  it("preserva caixas e MOQ, derivando unidades físicas corretamente", () => {
    const data = dataset({ "skus.csv": [{ ...sku, unidade_compra: "cx 12 un", moq: "2" }],
      "compras.csv": [purchase("P", BASE, "", "2", "cx 12 un")] });
    expect(data.purchases[0]).toMatchObject({ quantidade: 2, unidade: "cx 12 un", quantidade_unidades: 24 });
    expect(metric(data).leadTime.pendingUnits).toBe(24);
  });
});

describe("estoque e valor ao custo", () => {
  it("valoriza somente saldo utilizável em centavos", () => {
    expect(metric().stock).toMatchObject({ state: "positive", usableUnits: 100, valueCents: 25000, ageDays: 0 });
  });
  it("diferencia zero válido de ausência", () => {
    const m = metric(dataset({ "estoque_diario.csv": [{ sku: sku.sku, data: BASE, estoque_disponivel: "0" }] }));
    expect(m.stock).toMatchObject({ state: "zero", usableUnits: 0, valueCents: 0 });
  });
  it("mantém negativo como anomalia, sem transformá-lo em zero", () => {
    const m = metric(dataset({ "estoque_diario.csv": [{ sku: sku.sku, data: BASE, estoque_disponivel: "-3" }] }));
    expect(m.stock).toMatchObject({ state: "negative", lastObservedBalance: -3, usableUnits: null, valueCents: null });
    expect(m.risk.level).toBe("anomaly");
  });
  it("diferencia ausência de histórico e saldo inválido", () => {
    expect(metric(dataset({ "estoque_diario.csv": [] })).stock.state).toBe("no_history");
    expect(metric(dataset({ "estoque_diario.csv": [{ sku: sku.sku, data: BASE, estoque_disponivel: "" }] })).stock.state).toBe("missing");
  });
  it("recupera último saldo mas exclui saldo defasado da valorização atual por padrão", () => {
    const data = dataset({ "estoque_diario.csv": [{ sku: sku.sku, data: shiftDate(BASE, -1), estoque_disponivel: "10" }] });
    expect(metric(data).stock).toMatchObject({ lastObservedBalance: 10, stale: true, valueCents: null });
    expect(metric(data, { maxStockAgeDays: 1 }).stock.valueCents).toBe(2500);
  });
  it("nunca escolhe observação futura", () => {
    const data = dataset({ "estoque_diario.csv": [
      { sku: sku.sku, data: BASE, estoque_disponivel: "5" },
      { sku: sku.sku, data: shiftDate(BASE, 1), estoque_disponivel: "99999" },
    ] });
    expect(metric(data).stock.lastObservedBalance).toBe(5);
    expect(data.issues.some((i) => i.code === "future_excluded")).toBe(true);
  });
});

describe("janelas e demanda observada", () => {
  it("inclui a data-base e exatamente 30, 60 e 90 dias corridos", () => {
    const { sales, stocks } = series(91);
    sales.push({ sku: sku.sku, data: shiftDate(BASE, 1), unidades_vendidas: "99999", receita: "99999" });
    const windows = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks })).sales;
    expect(windows.map((w) => w.observedUnits)).toEqual([60, 120, 180]);
    expect(windows.map((w) => w.observedRevenueCents)).toEqual([30000, 60000, 90000]);
    expect(windows[0].start).toBe("2037-03-20");
    expect(windows.every((w) => w.end === BASE && w.status === "complete")).toBe(true);
  });
  it("calcula média e desvio populacional sobre dias corridos completos", () => {
    const { sales, stocks } = series(30);
    sales.forEach((r, i) => { r.unidades_vendidas = i % 2 ? "1" : "3"; r.receita = "5"; });
    const w = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks })).sales[0];
    expect(w.calendarMean).toBeCloseTo(2);
    expect(w.calendarStdDev).toBeCloseTo(1);
  });
  it("distingue zeros explícitos de dias sem linha", () => {
    const { sales, stocks } = series(30, 0);
    const zero = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks }));
    expect(zero.sales[0]).toMatchObject({ explicitZeroDays: 30, missingSalesDays: 0, calendarMean: 0, calendarStdDev: 0 });
    expect(zero.coverage).toMatchObject({ status: "zero_demand", days: null });
    const missing = metric(dataset({ "vendas_diarias.csv": sales.slice(1), "estoque_diario.csv": stocks }));
    expect(missing.sales[0]).toMatchObject({ explicitZeroDays: 29, missingSalesDays: 1, calendarMean: null, estimatedDailyDemand: null });
  });
  it("não estima demanda com observações insuficientes", () => {
    const { sales, stocks } = series(2);
    const m = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks }));
    expect(m.sales[0]).toMatchObject({ status: "partial", observedUnits: 4, calendarMean: null });
    expect(m.coverage.status).toBe("insufficient");
    expect(m.risk.level).toBe("insufficient");
  });
  it.each(["0", "-1"])("sinaliza possível censura com fechamento %s", (balance) => {
    const { sales, stocks } = series(30);
    stocks[0].estoque_disponivel = balance;
    const w = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks })).sales[0];
    expect(w.calendarMean).toBe(2);
    expect(w.demandStatus).toBe("potentially_censored");
    expect(w.estimatedDailyDemand).toBeNull();
  });
  it("não inventa disponibilidade quando falta posição diária", () => {
    const { sales, stocks } = series(30);
    const w = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks.slice(1) })).sales[0];
    expect(w.missingStockDays).toBe(1);
    expect(w.estimatedDailyDemand).toBeNull();
  });
});

describe("cobertura", () => {
  const stock: StockMetric = { state: "positive", lastObservedDate: BASE, lastObservedBalance: 100, ageDays: 0, stale: false, usableUnits: 100, valueCents: 25000 };
  it("divide estoque utilizável pela proxy diária estimada", () => {
    expect(calculateCoverage(stock, 2, 30)).toMatchObject({ status: "available", days: 50 });
    expect(calculateCoverage({ ...stock, state: "zero", usableUnits: 0 }, 2, 30).days).toBe(0);
  });
  it.each([0, null, NaN, Infinity, -1])("não produz infinito/NaN com demanda %s", (demand) => {
    const c = calculateCoverage(stock, demand, 30);
    expect(c.days).toBeNull();
    expect(c.status).toBe(demand === 0 ? "zero_demand" : "insufficient");
  });
});

describe("lead time e pendências", () => {
  it("calcula média, mediana, desvio amostral e n em dias corridos", () => {
    const data = dataset({ "compras.csv": [
      purchase("A", "2037-03-21", "2037-03-21"),
      purchase("B", "2037-03-21", "2037-03-23"),
      purchase("C", "2037-03-21", "2037-03-25"),
    ] });
    expect(metric(data).leadTime).toMatchObject({ status: "sufficient", sampleSize: 3, meanDays: 2, medianDays: 2, sampleStdDevDays: 2, minDays: 0, maxDays: 4 });
  });
  it("não usa pedidos pendentes, futuros ou emitidos após a base no lead time", () => {
    const data = dataset({ "compras.csv": [
      purchase("A", "2037-03-21"), purchase("B", "2037-03-21", "2037-04-20"),
      purchase("C", "2037-04-20", "2037-04-21"),
    ] });
    expect(data.purchases).toHaveLength(2);
    expect(data.purchases.every((p) => p.data_recebimento === null)).toBe(true);
    expect(metric(data).leadTime).toMatchObject({ sampleSize: 0, meanDays: null, medianDays: null, sampleStdDevDays: null, pendingOrders: 2 });
  });
  it("diferencia lead time zero de amostra ausente ou pequena", () => {
    const data = dataset({ "compras.csv": [purchase("A", BASE, BASE)] });
    expect(metric(data).leadTime).toMatchObject({ status: "insufficient", sampleSize: 1, meanDays: 0, sampleStdDevDays: null });
    expect(calculateLeadTime(sku.sku, data.purchases, BASE, 1).status).toBe("sufficient");
  });
  it("quarentena recebimentos anteriores à emissão", () => {
    const data = dataset({ "compras.csv": [purchase("A", "2037-03-22", "2037-03-21")] });
    expect(data.purchases).toHaveLength(0);
    expect(data.issues.some((i) => i.code === "receipt_before_order")).toBe(true);
  });
});

describe("risco, excesso, baixo giro e consolidação", () => {
  it("explica níveis comparando cobertura com média e buffer de lead time", () => {
    const lead = metric(dataset({ "compras.csv": [
      purchase("A", "2037-03-21", "2037-03-21"), purchase("B", "2037-03-21", "2037-03-23"), purchase("C", "2037-03-21", "2037-03-25"),
    ] })).leadTime;
    expect([2, 3, 5].map((days) => classifyRisk("ativo", { status: "available", days, demandWindowDays: 30 }, lead).level)).toEqual(["critical", "attention", "low"]);
  });
  it("mantém descontinuados separados de reposição normal", () => {
    const data = dataset({ "skus.csv": [{ ...sku, status: "descontinuado" }] });
    expect(metric(data).risk.level).toBe("discontinued");
    expect(analyzeDataset(data).dashboard).toMatchObject({ activeCapitalCents: 0, discontinuedCapitalCents: 25000 });
  });
  it("identifica excesso com limiar configurável e valor em centavos", () => {
    const { sales, stocks } = series(90, 1, 200);
    const data = dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks });
    expect(metric(data).movement).toMatchObject({ excess: "identified", excessUnits: 110, excessCapitalCents: 27500, daysSinceLastObservedSale: 0 });
    expect(metric(data, { excessDays: 200 }).movement.excess).toBe("not_identified");
  });
  it("não transforma ausência de vendas em obsolescência", () => {
    const m = metric(dataset());
    expect(m.movement).toMatchObject({ lastObservedSaleDate: null, daysSinceLastObservedSale: null, lowMovement: "insufficient", lowMovementCapitalCents: null });
  });
  it("identifica capital de baixa movimentação com zeros explícitos e disponibilidade", () => {
    const { sales, stocks } = series(60, 0);
    const m = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks }));
    expect(m.movement).toMatchObject({ lowMovement: "identified", lowMovementCapitalCents: 25000, excess: "zero_observed_demand" });
  });
  it("preserva data da última venda positiva sem usar venda futura", () => {
    const { sales, stocks } = series(60, 0);
    sales.push({ sku: sku.sku, data: shiftDate(BASE, -65), unidades_vendidas: "1", receita: "5" },
      { sku: sku.sku, data: shiftDate(BASE, 1), unidades_vendidas: "3", receita: "15" });
    const m = metric(dataset({ "vendas_diarias.csv": sales, "estoque_diario.csv": stocks }));
    expect(m.movement.daysSinceLastObservedSale).toBe(65);
    expect(m.movement.lowMovement).toBe("identified");
  });
  it("consolida capitais com denominadores explícitos e não retorna registros brutos", () => {
    const data = dataset({ "skus.csv": [sku, { ...sku, sku: "D", status: "descontinuado" }, { ...sku, sku: "N" }],
      "estoque_diario.csv": [
        { sku: sku.sku, data: BASE, estoque_disponivel: "100" },
        { sku: "D", data: BASE, estoque_disponivel: "10" },
        { sku: "N", data: BASE, estoque_disponivel: "-2" },
      ] });
    const result = analyzeDataset(data);
    expect(result.dashboard).toMatchObject({ inventoryValueCents: 27500, activeCapitalCents: 25000, discontinuedCapitalCents: 2500, validInventorySkuCount: 2, excludedInventorySkuCount: 1 });
    expect(result.skus[0]).not.toHaveProperty("source");
    expect(getSkuMetrics(result, "INEXISTENTE")).toBeNull();
  });
  it("é determinístico e não modifica o dataset normalizado", () => {
    const data = dataset();
    const before = structuredClone(data);
    expect(analyzeDataset(data)).toEqual(analyzeDataset(data));
    expect(data).toEqual(before);
  });
  it("recusa configuração inválida, data futura e base divergente", () => {
    expect(() => resolveConfig({ excessDays: -1 })).toThrow();
    expect(() => resolveConfig({ referenceDate: "2037-04-19" })).toThrow();
    expect(() => analyzeDataset(dataset(), { referenceDate: "2037-04-17" })).toThrow();
    expect(DEFAULT_CONFIG.referenceDate).toBe(BASE);
  });
  it("falha explicitamente em estouro monetário, sem resultados imprecisos", () => {
    expect(() => sumIntegers([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});


it("não transforma ausência completa de estoque em capital zero", () => {
  const result = analyzeDataset(dataset({ "estoque_diario.csv": [] }));
  expect(result.dashboard).toMatchObject({ inventoryValueCents: null, activeCapitalCents: null, validInventorySkuCount: 0, excludedInventorySkuCount: 1, excessCapitalCents: null, lowMovementCapitalCents: null });
});
it("não retorna horizonte infinito mesmo com buffer extremo", () => {
  const lead = { status: "sufficient" as const, sampleSize: 3, meanDays: 2, medianDays: 2, sampleStdDevDays: 2, minDays: 0, maxDays: 4, pendingOrders: 0, pendingUnits: 0 };
  const risk = classifyRisk("ativo", { status: "available", days: 50, demandWindowDays: 30 }, lead, Number.MAX_VALUE);
  expect(risk).toMatchObject({ level: "insufficient", replenishmentDays: null });
});
