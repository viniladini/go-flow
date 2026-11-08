import { AGENT_TOOL, AGENT_LIMITS, AgentError, parseAgentRequest, validReviewToken } from "./contracts";
import type { AgentAction, AgentReceipt } from "./contracts";
import type { AgentTransport } from "./client";
import type { ImportSession } from "../flow-import/session";
export interface AgentSnapshot { draft: string; phase: "idle" | "running" | "reviewing" | "done" | "error"; receipts: AgentReceipt[]; error: string | null; notice: string | null }
function validAction(action: AgentAction) {
  if (!(action?.source === "demo" && typeof action.id === "string" && /^[a-f0-9-]{36}$/i.test(action.id) && typeof action.model === "string" && action.model.length > 0 && action.tool?.name === AGENT_TOOL && Array.isArray(action.proposals) &&
    ["pending_review", "approved", "rejected", "no_proposal"].includes(action.status) && Number.isSafeInteger(action.budget?.usedCents) && action.budget.usedCents >= 0 &&
    Number.isSafeInteger(action.budget.totalCents) && action.budget.usedCents <= action.budget.totalCents && action.budget.remainingCents === action.budget.totalCents - action.budget.usedCents &&
    action.tool.arguments?.budgetCents === action.budget.totalCents && Number.isFinite(Date.parse(action.createdAt)) && Number.isFinite(Date.parse(action.expiresAt)) &&
    Array.isArray(action.limitations) && Array.isArray(action.alerts))) return false;
  if ((action.status === "no_proposal") !== (action.proposals.length === 0)) return false;
  let total = BigInt(0);
  for (const p of action.proposals) {
    if (!Number.isSafeInteger(p.estimatedCostCents) || p.estimatedCostCents <= 0 || p.status !== "draft" || p.humanApprovalRequired !== true) return false;
    total += BigInt(p.estimatedCostCents);
  }
  return total === BigInt(action.budget.usedCents);
}
export function createAgentSession(source: ImportSession, transport: AgentTransport) {
  let state: AgentSnapshot = { draft: "", phase: "idle", receipts: [], error: null, notice: null };
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null, unsubscribe: (() => void) | null = null;
  const update = (patch: Partial<AgentSnapshot>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const allowed = () => source.getSnapshot().source === "demo" && source.getSnapshot().operation === null;
  const busy = () => state.phase === "running" || state.phase === "reviewing";
  const cancel = () => { controller?.abort(); controller = null; };
  const fail = (error: unknown) => update({ phase: "error", error: error instanceof AgentError ? error.message : "Não foi possível concluir a execução. Nenhum sucesso foi confirmado.", notice: null });
  const same = (current: AbortController, revision: number) => controller === current && !current.signal.aborted && allowed() && source.getSnapshot().revision === revision;
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => {
      unsubscribe?.();
      unsubscribe = source.subscribe(() => { cancel(); update({ draft: "", phase: "idle", error: null, notice: null }); });
    },
    dispose: () => { cancel(); unsubscribe?.(); unsubscribe = null; },
    setDraft: (draft: string) => { if (allowed() && !busy()) update({ draft: draft.slice(0, AGENT_LIMITS.promptChars), error: null, notice: null }); },
    execute: async () => {
      // Guard before constructing ANY network payload. Imported context is never accepted here.
      if (!allowed() || busy()) return false;
      let request;
      try { request = parseAgentRequest({ source: "demo", requestId: crypto.randomUUID(), prompt: state.draft }); }
      catch (error) { fail(error); return false; }
      const revision = source.getSnapshot().revision, current = new AbortController(); controller = current;
      update({ phase: "running", error: null, notice: null });
      try {
        const receipt = await transport.execute(request, current.signal);
        if (!same(current, revision)) return false;
        if (!validAction(receipt?.action) || !["pending_review", "no_proposal"].includes(receipt.action.status) || !validReviewToken(receipt.reviewToken)) throw new AgentError("INVALID_RESULT", "Resposta operacional inválida; nenhuma ação foi adicionada à sessão.");
        const receipts = [receipt, ...state.receipts.filter((r) => r.action.id !== receipt.action.id)].slice(0, AGENT_LIMITS.sessionRecords);
        update({ phase: "done", draft: "", receipts, notice: receipt.action.status === "no_proposal" ? "Ferramenta concluída sem proposta viável. A Central registra a análise, sem compra recomendada." : "Proposta calculada e registrada na Central de Ações, aguardando revisão humana." });
        return true;
      } catch (error) { if (same(current, revision)) fail(error); return false; }
      finally { if (controller === current) controller = null; }
    },
    review: async (id: string, decision: "approve" | "reject") => {
      if (!allowed() || busy()) return false;
      const receipt = state.receipts.find((r) => r.action.id === id);
      if (!receipt || receipt.action.status !== "pending_review") return false;
      const current = new AbortController(), revision = source.getSnapshot().revision; controller = current;
      update({ phase: "reviewing", error: null, notice: null });
      try {
        const action = await transport.review({ source: "demo", id, decision, reviewToken: receipt.reviewToken }, current.signal);
        if (!same(current, revision)) return false;
        if (!validAction(action) || action.id !== id || action.status !== (decision === "approve" ? "approved" : "rejected")) throw new AgentError("INVALID_REVIEW", "A revisão não foi confirmada pelo servidor.");
        update({ phase: "done", receipts: state.receipts.map((r) => r.action.id === id ? { ...r, action } : r), notice: "Revisão registrada. Nenhuma compra foi executada." }); return true;
      } catch (error) { if (same(current, revision)) fail(error); return false; }
      finally { if (controller === current) controller = null; }
    },
  };
}
export type AgentSession = ReturnType<typeof createAgentSession>;
