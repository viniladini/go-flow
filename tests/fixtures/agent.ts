import { createOperationalBuyingPlan } from "@/lib/smart-buying";
import { operationalFixture } from "./operational";
import { AGENT_TOOL } from "@/lib/agent/contracts";
import type { AgentReceipt, AgentAnalysisResponse } from "@/lib/agent/contracts";
export function agentAnalysis(): AgentAnalysisResponse {
  return { analysis: { kind: "analysis", source: "demo", model: "fixture-model", referenceDate: "2026-11-08", executedAt: "2026-11-08T15:00:00Z",
    explanation: "Análise da demonstração sintética. Nenhuma proposta foi criada.", evidence: [{ id: "risk", text: "Risco crítico: 1 SKU na fixture sintética independente." }], limitations: ["Demonstração, sem pedidos ou propostas."] } };
}
export function agentReceipt(): AgentReceipt {
  const demo = operationalFixture("DEMO-AGENT-FIXTURE");
  const plan = createOperationalBuyingPlan({ dataset: demo.dataset, origin: "independent_synthetic", policy: demo.parameters });
  const proposal = plan.proposals[0], used = proposal.estimatedCostCents;
  return { reviewToken: "fixture." + "f".repeat(64), action: { id: "c4fb2f8a-c227-42ca-b14a-0be1d7cd63e4", source: "demo", model: "fixture-model",
    createdAt: "2032-01-01T12:00:00.000Z", expiresAt: "2032-01-01T12:30:00.000Z", referenceDate: demo.parameters.referenceDate,
    horizonStart: demo.parameters.horizonStart, horizonEnd: demo.parameters.horizonEnd,
    tool: { name: AGENT_TOOL, arguments: { budgetCents: demo.parameters.budgetCents, skuCodes: [] }, executedAt: "2032-01-01T12:00:00.000Z" },
    budget: { ...plan.budget, usedCents: used, remainingCents: demo.parameters.budgetCents - used }, proposals: [proposal], status: "pending_review", reviewedAt: null,
    explanation: "Resultado sintético calculado para os testes da sessão.", limitations: ["Nenhum pedido enviado."], alerts: [], alertCount: 0 } };
}
