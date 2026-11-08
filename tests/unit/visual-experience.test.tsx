// @vitest-environment happy-dom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardOverview } from "@/components/dashboard-overview";
import { ProductFlow } from "@/components/product-flow";
import { computeOperation } from "@/lib/operations/service";
import { formatNumber } from "@/lib/dashboard/format";
import { operationalFixture } from "../fixtures/operational";
import type { DashboardModel } from "@/lib/dashboard/models";

const imported = computeOperation(operationalFixture()).model;
const demo: DashboardModel = { ...imported, origin: { ...imported.origin, kind: "independent_synthetic", id: "goflow-demo-v1" } };
function render(model: DashboardModel) { const el = document.createElement("div"); el.innerHTML = renderToStaticMarkup(<DashboardOverview model={model} />); return el; }

describe("v5: apresentação de resultados existentes", () => {
  it("mantém origem e métricas do motor na home editorial", () => {
    const el = render(demo);
    expect(el.querySelector("h1")?.textContent).toBe("olá, time gogroup.");
    expect(el.querySelector('[data-source="goflow-demo-v1"]')).not.toBeNull();
    for (const metric of demo.kpis.filter((item) => ["risk", "excess", "inventory"].includes(item.id))) expect(el.querySelector(`[data-metric="${metric.id}"] .metric-value`)?.textContent).toBe(metric.value);
    expect(el.querySelectorAll(".home-metrics .metric-card")).toHaveLength(3);
    expect(el.querySelector('.home-agent-orb svg[aria-label="Flow Orb, mascote do go.agent"]')).not.toBeNull();
    expect(el.querySelector('.home-agent-card a[href="/agente"]')).not.toBeNull();
  });
  it("go.pulse conta apenas classificações sinalizadas da fonte ativa", () => {
    const el = render(imported);
    const expected = imported.risks.filter((r) => ["critical", "attention", "anomaly", "insufficient"].includes(r.level)).reduce((n, r) => n + r.count, 0);
    expect(el.querySelector(".go-pulse strong")?.textContent).toBe(`${formatNumber(expected)} SKUs com sinais para revisão`);
    expect(el.querySelector(".go-pulse a")?.getAttribute("href")).toBe("/estoque#filtros-estoque");
    expect(el.querySelector('[data-source="goflow-imported-v1"]')).not.toBeNull();
  });
  it("gráfico usa cobertura apresentada em dias, distingue zero e indisponibilidade", () => {
    const model = { ...demo, rows: [
      { ...demo.rows[0], sku: "SYNTH-A", coverage: "1.234,5 dias" },
      { ...demo.rows[0], sku: "SYNTH-B", coverage: "0 dias" },
      { ...demo.rows[0], sku: "SYNTH-C", coverage: "Indisponível" },
    ] };
    const el = render(model);
    expect(el.querySelector('[data-coverage-days="1234.5"]')?.textContent).toContain("1.234,5 dias");
    expect(el.querySelector('[data-coverage-days="0"]')).not.toBeNull();
    expect(el.querySelector('.coverage-chart [data-sku="SYNTH-C"]')).toBeNull();
    expect(el.querySelector(".coverage-chart figcaption")?.textContent).toContain("0–1.234,5 dias");
    expect(el.querySelector('[data-sku="SYNTH-B"] .coverage-bar')?.getAttribute("style")).toContain("height:0%");
    expect(el.textContent).toContain("Sem tendência temporal inferida");
  });
  it("importação mantém análise local explícita, sem misturar recomendações da demo", () => {
    const el = render(imported);
    expect(el.querySelector(".home-agent-card")?.textContent).toContain("IA externa permanece indisponível");
    expect(el.querySelector('.home-agent-card a[href="/compras"]')).not.toBeNull();
    expect(el.querySelector('[data-source="goflow-demo-v1"]')).toBeNull();
  });
  it("origem vazia mostra indisponibilidade, sem NaN, Infinity ou gráfico fictício", () => {
    const el = render({ ...demo, rows: [], risks: [], priorities: [], kpis: [], financial: [], windows: [] });
    expect(el.textContent).toContain("Sem SKUs disponíveis na fonte ativa");
    expect(el.textContent).toContain("Gráfico indisponível");
    expect(el.querySelector(".coverage-chart")).toBeNull();
    expect(el.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("apresentação não altera o modelo nem inventa interatividade na faixa do produto", () => {
    const before = structuredClone(imported); render(imported); expect(imported).toEqual(before);
    const el = document.createElement("div"); el.innerHTML = renderToStaticMarkup(<ProductFlow />);
    expect(el.querySelectorAll("li")).toHaveLength(4);
    expect(el.querySelectorAll("a, button, input")).toHaveLength(0);
    expect(el.textContent).toContain("decisão com critério");
  });
});
