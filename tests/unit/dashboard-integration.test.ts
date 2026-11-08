import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeDataset } from "@/lib/analytics";
import { createDemoDataset } from "@/lib/dashboard/demo-dataset";
import { createDemoDashboard } from "@/lib/dashboard/presentation";
import { filterStockRows } from "@/lib/dashboard/filters";
import { formatDate, formatDays, formatMoney, formatNumber, UNAVAILABLE } from "@/lib/dashboard/format";
import type { StockFilters } from "@/lib/dashboard/models";

vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(() => { throw new Error("Leitura de arquivos proibida nesta integração sintética."); }),
  writeFile: vi.fn(() => { throw new Error("Escrita de arquivos proibida nesta integração sintética."); }),
}));
import * as service from "@/lib/dashboard/service";
import Home from "@/app/page";
import StockPage from "@/app/estoque/page";
import { readFile, writeFile } from "node:fs/promises";

const ALL: StockFilters = { search: "", brand: "all", status: "all", risk: "all" };
afterEach(() => vi.restoreAllMocks());

describe("serviço de indicadores sintéticos", () => {
  it("usa o motor existente, preservando os agregados e a data-base", () => {
    const expected = analyzeDataset(createDemoDataset());
    const model = service.getDashboard();
    expect(model.origin).toMatchObject({ kind: "independent_synthetic", id: "goflow-demo-v1" });
    expect(model.referenceDate).toBe("2037-04-18");
    expect(model.referenceLabel).toBe("18/04/2037");
    expect(model.kpis.find((k) => k.id === "inventory")?.value).toBe(formatMoney(expected.dashboard.inventoryValueCents));
    expect(model.kpis.find((k) => k.id === "risk")?.value).toBe(formatNumber(expected.dashboard.risks.critical));
    expect(model.kpis.find((k) => k.id === "excess")?.value).toBe(formatMoney(expected.dashboard.excessCapitalCents));
    for (const risk of model.risks) expect(risk.count).toBe(expected.dashboard.risks[risk.level]);
    for (const window of model.windows) {
      const metric = expected.dashboard.observedSales.find((w) => w.days === window.days)!;
      expect(window.units).toBe(formatNumber(metric.units));
      expect(window.revenue).toBe(formatMoney(metric.revenueCents));
    }
  });
  it("é determinístico e não acessa arquivos locais", () => {
    expect(createDemoDashboard()).toEqual(createDemoDashboard());
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("não envia origens, hashes nem registros brutos para a apresentação", () => {
    const model = createDemoDashboard();
    expect(model.rows.every((r) => r.sku.startsWith("DEMO-FLOW-"))).toBe(true);
    const payload = JSON.stringify(model);
    for (const field of ["source", "records", "data_pedido", "data_recebimento", "fornecedor", "sha256"]) {
      expect(payload).not.toContain('"' + field + '"');
    }
  });
  it("preserva indisponibilidade, saldo zero e anomalias sem fabricar cobertura", () => {
    const model = createDemoDashboard();
    expect(model.rows.find((r) => r.sku === "DEMO-FLOW-10")).toMatchObject({ balance: UNAVAILABLE, stockState: "no_history", coverage: UNAVAILABLE });
    expect(model.rows.find((r) => r.sku === "DEMO-FLOW-07")).toMatchObject({ balance: "0", stockState: "zero", coverage: UNAVAILABLE });
    expect(model.rows.find((r) => r.sku === "DEMO-FLOW-05")).toMatchObject({ balance: "-2", risk: "anomaly", inventoryValue: UNAVAILABLE });
    expect(model.rows.find((r) => r.sku === "DEMO-FLOW-04")?.coverage).toBe(UNAVAILABLE);
    expect(model.financial.find((r) => r.label === "Receita em risco")?.value).toBe(UNAVAILABLE);
    expect(model.rows.find((r) => r.sku === "DEMO-FLOW-06")?.risk).toBe("discontinued");
  });
});

describe("formatação brasileira", () => {
  it("converte centavos somente para apresentação e mantém zero distinto de null", () => {
    expect(formatMoney(12345).replace(/\s/g, " ")).toBe("R$ 123,45");
    expect(formatMoney(0).replace(/\s/g, " ")).toBe("R$ 0,00");
    expect(formatMoney(null)).toBe(UNAVAILABLE);
    expect(formatDays(2.5)).toBe("2,5 dias");
    expect(formatDate("2037-04-18")).toBe("18/04/2037");
    expect(formatDate(null)).toBe(UNAVAILABLE);
  });
});

describe("busca e filtros de SKUs", () => {
  const rows = createDemoDashboard().rows;
  it("busca código, nome e marca sem diferenciar acentos ou maiúsculas", () => {
    expect(filterStockRows(rows, { ...ALL, search: "SERUM HORIZONTE" }).map((r) => r.sku)).toEqual(["DEMO-FLOW-01"]);
    expect(filterStockRows(rows, { ...ALL, search: "demo-flow-09" }).map((r) => r.sku)).toEqual(["DEMO-FLOW-09"]);
    expect(filterStockRows(rows, { ...ALL, search: "BRISA DEMO" }).every((r) => r.brand === "Brisa Demo")).toBe(true);
  });
  it("combina marca, status e risco sem modificar a lista ou os indicadores", () => {
    const before = structuredClone(rows);
    const result = filterStockRows(rows, { ...ALL, brand: "Brisa Demo", status: "descontinuado", risk: "discontinued" });
    expect(result.map((r) => r.sku)).toEqual(["DEMO-FLOW-06"]);
    expect(rows).toEqual(before);
    expect(filterStockRows(rows, ALL)).toEqual(rows);
  });
  it("retorna um estado vazio para consulta sem correspondência", () => {
    expect(filterStockRows(rows, { ...ALL, search: "produto inexistente" })).toEqual([]);
    expect(filterStockRows(rows, { ...ALL, brand: "marca inexistente" })).toEqual([]);
  });
});

describe("conexão das páginas ao serviço", () => {
  it("Visão geral apresenta o valor retornado pelo serviço, não um placeholder fixo", () => {
    const model = createDemoDashboard();
    model.kpis[0].value = "R$ 123,45";
    const spy = vi.spyOn(service, "getDashboard").mockReturnValue(model);
    const html = renderToStaticMarkup(createElement(Home));
    expect(spy).toHaveBeenCalledOnce();
    expect(html).toContain("R$ 123,45");
    expect(html).toContain('data-source="goflow-demo-v1"');
    expect(html).toContain("Históricos fictícios independentes para explorar estoque, compras e inteligência operacional.");
    expect(html).not.toContain("Aguardando processamento");
  });
  it("Saúde do estoque apresenta os mesmos SKUs calculados e filtros acessíveis", () => {
    const model = createDemoDashboard();
    const spy = vi.spyOn(service, "getDashboard").mockReturnValue(model);
    const html = renderToStaticMarkup(createElement(StockPage));
    expect(spy).toHaveBeenCalledOnce();
    expect(html).toContain('data-source="goflow-demo-v1"');
    for (const row of model.rows) expect(html).toContain('data-sku="' + row.sku + '"');
    expect(html).toContain("Buscar SKU");
    expect(html).toContain("Todas as marcas");
    expect(html).toContain("Todos os riscos");
    expect(html).toContain("Dados demonstrativos por SKU");
  });
});
