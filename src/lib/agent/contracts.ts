import type { PurchaseProposal, BuyingResult } from "../smart-buying/types";
export const AGENT_TOOL = "plan_demo_purchases" as const;
export const AGENT_LIMITS = { promptChars: 1000, bodyBytes: 4096, reviewBodyBytes: 262144, receiptChars: 250000, receiptBytes: 1048576, bodyTimeoutMs: 5000, toolBytes: 2048, selectedSkus: 20, timeoutMs: 30000, records: 50, sessionRecords: 20, ttlMs: 30 * 60 * 1000 } as const;
export function validReviewToken(value: unknown): value is string {
  return typeof value === "string" && value.length <= AGENT_LIMITS.receiptChars && /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value);
}
export interface ToolArguments { budgetCents: number; skuCodes: string[] }
export type ReviewStatus = "pending_review" | "approved" | "rejected" | "no_proposal";
export interface AgentAction {
  id: string; source: "demo"; model: string; createdAt: string; expiresAt: string;
  tool: { name: typeof AGENT_TOOL; arguments: ToolArguments; executedAt: string };
  referenceDate: string; horizonStart: string; horizonEnd: string;
  budget: BuyingResult["budget"]; proposals: PurchaseProposal[];
  status: ReviewStatus; reviewedAt: string | null;
  explanation: string; limitations: string[]; alerts: string[]; alertCount: number;
  alertDetails?: BuyingResult["alerts"];
}
export interface AgentReceipt { action: AgentAction; reviewToken: string }
export interface AgentAnalysis {
  kind: "analysis"; source: "demo"; model: string; referenceDate: string; executedAt: string;
  explanation: string; evidence: { id: string; text: string }[]; limitations: string[];
}
export interface AgentAnalysisResponse { analysis: AgentAnalysis }
export type AgentExecutionResponse = AgentReceipt | AgentAnalysisResponse;
export interface AgentRequest { source: "demo"; requestId: string; prompt: string }
export interface ReviewRequest { source: "demo"; id: string; reviewToken: string; decision: "approve" | "reject" }
export class AgentError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = "AgentError"; }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentError("INVALID_INPUT", "Solicitação inválida.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) throw new AgentError("INVALID_INPUT", "Campos inesperados ou obrigatórios ausentes.");
  if (value.source !== "demo") throw new AgentError("DEMO_ONLY", "IA externa disponível exclusivamente na fonte demonstrativa.", 403);
}
export function parseAgentRequest(value: unknown): AgentRequest {
  const v = object(value); keys(v, ["source", "requestId", "prompt"]);
  if (typeof v.requestId !== "string" || !uuid.test(v.requestId) || typeof v.prompt !== "string" || v.prompt.trim().length < 6 || v.prompt.length > AGENT_LIMITS.promptChars) throw new AgentError("INVALID_INPUT", "Informe uma solicitação entre 6 e 1.000 caracteres.");
  return { source: "demo", requestId: v.requestId, prompt: v.prompt.trim() };
}
export function parseReviewRequest(value: unknown): ReviewRequest {
  const v = object(value); keys(v, ["source", "id", "reviewToken", "decision"]);
  if (typeof v.id !== "string" || !uuid.test(v.id) || !validReviewToken(v.reviewToken) || !["approve", "reject"].includes(String(v.decision))) throw new AgentError("INVALID_REVIEW", "Revisão inválida.");
  return { source: "demo", id: v.id, reviewToken: v.reviewToken, decision: v.decision as ReviewRequest["decision"] };
}
export function parseToolArguments(text: string, maximumBudget: number, known: ReadonlySet<string>): ToolArguments {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > AGENT_LIMITS.toolBytes) throw new AgentError("INVALID_TOOL", "Argumentos da ferramenta inválidos.", 422);
  let value: unknown; try { value = JSON.parse(text); } catch { throw new AgentError("INVALID_TOOL", "Argumentos da ferramenta não são JSON válido.", 422); }
  const v = object(value);
  if (Object.keys(v).length !== 2 || !Number.isSafeInteger(v.budgetCents) || (v.budgetCents as number) < 0 || (v.budgetCents as number) > maximumBudget ||
      !Array.isArray(v.skuCodes) || v.skuCodes.length > AGENT_LIMITS.selectedSkus || v.skuCodes.some((sku) => typeof sku !== "string" || !known.has(sku)) || new Set(v.skuCodes).size !== v.skuCodes.length) throw new AgentError("INVALID_TOOL", "Orçamento ou SKUs não pertencem às restrições da demonstração.", 422);
  return { budgetCents: v.budgetCents as number, skuCodes: [...v.skuCodes].sort() };
}
