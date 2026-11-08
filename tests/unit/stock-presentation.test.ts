import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDemoDashboard } from "@/lib/dashboard/presentation";
import { StockExplorer } from "@/components/stock-explorer";
import { StockCriteriaPanel } from "@/components/stock-criteria-panel";

const model = createDemoDashboard();
const mainRow = (html: string, sku: string) => {
  const match = html.match(new RegExp('<tr data-sku="' + sku + '">([\\s\\S]*?)</tr>'));
  expect(match, "Linha principal do SKU precisa existir").not.toBeNull();
  return match![1];
};

describe("estado físico e risco estimado", () => {
  it("mostra Sem estoque para saldo zero mesmo com demanda e risco indeterminados", () => {
    const row = model.rows.find((r) => r.sku === "DEMO-FLOW-07")!;
    expect(row).toMatchObject({
      balance: "0", stockState: "zero", stockStatusLabel: "Sem estoque",
      coverage: "Indisponível", risk: "insufficient", riskLabel: "Dados insuficientes",
    });
    const html = renderToStaticMarkup(createElement(StockExplorer, { rows: [row], risks: model.risks }));
    const cells = mainRow(html, row.sku);
    expect(html).toContain("Estoque físico (un.)");
    expect(html).toContain("Risco estimado");
    expect(cells).toContain("Sem estoque");
    expect(cells).toContain("Dados insuficientes");
    expect(cells).not.toContain("Ruptura");
    expect(html).toContain("Saldo zero atual não comprova ruptura histórica nem demanda não atendida.");
  });

  it.each([
    ["DEMO-FLOW-01", "Com estoque", "critical"],
    ["DEMO-FLOW-02", "Com estoque", "low"],
    ["DEMO-FLOW-03", "Com estoque", "low"],
    ["DEMO-FLOW-04", "Com estoque", "insufficient"],
    ["DEMO-FLOW-05", "Saldo negativo", "anomaly"],
    ["DEMO-FLOW-06", "Com estoque", "discontinued"],
    ["DEMO-FLOW-07", "Sem estoque", "insufficient"],
    ["DEMO-FLOW-08", "Com estoque", "insufficient"],
    ["DEMO-FLOW-09", "Com estoque", "attention"],
    ["DEMO-FLOW-10", "Sem histórico", "insufficient"],
  ])("preserva estado e risco independentes em %s", (sku, label, risk) => {
    const row = model.rows.find((r) => r.sku === sku)!;
    expect(row.stockStatusLabel).toBe(label);
    expect(row.risk).toBe(risk);
    const html = renderToStaticMarkup(createElement(StockExplorer, { rows: [row], risks: model.risks }));
    expect(mainRow(html, sku)).toContain(label);
    expect(mainRow(html, sku)).toContain(row.riskLabel);
  });
});

describe("tabela compacta e critérios acessíveis", () => {
  it("mantém somente indicadores essenciais na linha principal", () => {
    const html = renderToStaticMarkup(createElement(StockExplorer, { rows: model.rows, risks: model.risks }));
    for (const row of model.rows) {
      const cells = mainRow(html, row.sku);
      expect(cells).toContain(row.balance);
      expect(cells).toContain(row.inventoryValue);
      for (const explanation of [row.stockDetail, row.salesDetail, row.coverageDetail, row.leadTimeDetail, row.riskReason]) {
        if (explanation !== row.stockStatusLabel) expect(cells).not.toContain(explanation);
        expect(html).toContain(explanation);
      }
    }
  });

  it("oferece um disclosure nativo por SKU, fechado inicialmente e ligado ao painel", () => {
    const html = renderToStaticMarkup(createElement(StockExplorer, { rows: model.rows, risks: model.risks }));
    const disclosures = [...html.matchAll(/<details\b([^>]*)>/g)];
    expect(disclosures).toHaveLength(model.rows.length);
    expect(disclosures.every(([, attributes]) => !/\bopen\b/.test(attributes))).toBe(true);
    for (const row of model.rows) {
      expect(html).toContain('<summary aria-controls="criteria-panel-' + row.sku + '">Ver critérios');
      expect(html).toContain('id="criteria-panel-' + row.sku + '"');
      expect(html).toContain('aria-labelledby="criteria-panel-' + row.sku + '-title"');
    }
    expect(html).toContain('colSpan="7"');
  });

  it("reúne os critérios e limitações sem afirmar ruptura comprovada", () => {
    const row = model.rows.find((r) => r.sku === "DEMO-FLOW-07")!;
    const html = renderToStaticMarkup(createElement(StockCriteriaPanel, { row, id: "painel-teste" }));
    expect(html).toContain('role="region"');
    expect(html).toContain("Dados sintéticos");
    for (const field of [row.stockDetail, row.coverageDetail, row.leadTimeDetail, row.salesDetail, row.riskReason, row.movement]) {
      expect(html).toContain(field);
    }
    expect(html).toContain("não comprova ruptura histórica");
    expect(html).toContain("Última venda positiva");
  });
});
