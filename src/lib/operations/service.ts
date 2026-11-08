import { analyzeOperationalDataset, operationalAnalyticsConfig } from "../analytics/index";
import { createOperationalBuyingPlan } from "../smart-buying/index";
import { createDashboardModel } from "../dashboard/presentation";
import type { DashboardModel } from "../dashboard/models";
import type { BuyingResult } from "../smart-buying/types";
import type { ImportedOperation, OperationalParameters } from "../flow-import/types";
import { createOperationalDemo } from "./demo";
import { demoReferenceDate } from "./demo-calendar";

export interface Opportunity {
  sku: string; name: string; kind: "excess" | "low_movement" | "discontinued";
  label: string; valueCents: number | null; explanation: string;
}
export interface OperationalResult {
  source: "demo" | "imported_local"; parameters: OperationalParameters; model: DashboardModel;
  buying: BuyingResult | null; buyingError: string | null; opportunities: Opportunity[];
}
/** No private cache. Every imported computation uses exactly one supplied dataset. */
export function computeOperation(operation: ImportedOperation | null, now: Date = new Date()): OperationalResult {
  const { dataset, parameters } = operation ?? createOperationalDemo(now);
  const source = operation ? "imported_local" : "demo";
  const analytics = analyzeOperationalDataset(dataset, operationalAnalyticsConfig(parameters.referenceDate, parameters.demandWindowDays));
  const model = createDashboardModel(dataset, analytics, operation ? { kind: "imported_local", id: "goflow-imported-v1",
    label: "Importação local · fonte ativa", description: "Dados selecionados nesta aba, calculados exclusivamente no navegador. Sessão somente em memória." } :
    { kind: "independent_synthetic", id: "goflow-demo-v1", label: "Demonstração · dados sintéticos", description: "Históricos fictícios independentes e conciliados. Não representam resultados de uma operação real." });
  const catalog = new Map(dataset.skus.map((s) => [s.sku, s]));
  const opportunities: Opportunity[] = [];
  for (const metric of analytics.skus) {
    const name = catalog.get(metric.sku)!.descricao;
    if (metric.movement.excess === "identified") opportunities.push({ sku: metric.sku, name, kind: "excess", label: "Excesso potencial",
      valueCents: metric.movement.excessCapitalCents, explanation: "Capital acima do limiar metodológico de cobertura. Não representa economia garantida." });
    if (metric.movement.lowMovement === "identified") opportunities.push({ sku: metric.sku, name, kind: "low_movement", label: "Baixa movimentação",
      valueCents: metric.movement.lowMovementCapitalCents, explanation: "Sem venda positiva observada no período avaliável. Não implica obsolescência." });
    if (metric.status === "descontinuado") opportunities.push({ sku: metric.sku, name, kind: "discontinued", label: "Revisar destinação",
      valueCents: metric.stock.valueCents, explanation: "Descontinuado: revisão manual de destinação, sem compra rotineira ou desconto executado." });
  }
  let buying: BuyingResult | null = null, buyingError: string | null = null;
  try { buying = createOperationalBuyingPlan({ dataset, origin: operation ? "provided_dataset" : "independent_synthetic", policy: parameters }); }
  catch { buyingError = "Planejamento indisponível: confira os parâmetros e limites numéricos da operação. O horizonte deve terminar até 366 dias após a referência."; }
  return { source, parameters, model, buying, buyingError, opportunities };
}
// Only independently synthetic results may be cached across SSR requests.
let demo: OperationalResult | undefined;
export function getOperationalDemo(): OperationalResult {
  if (!demo || demo.parameters.referenceDate !== demoReferenceDate()) demo = computeOperation(null);
  return demo;
}
