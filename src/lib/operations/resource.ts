import { getOperationalDemo, type OperationalResult } from "./service";
import { demoReferenceDate } from "./demo-calendar";
import type { ImportSession } from "../flow-import/session";
import type { OperationalRequest, OperationalResponse } from "./operations.worker";
export interface OperationalWorker {
  postMessage(message: OperationalRequest): void; terminate(): void;
  onmessage: ((event: MessageEvent<OperationalResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
export interface OperationalSnapshot { revision: number; status: "ready" | "loading" | "error"; result: OperationalResult | null; error: string | null }
export function createOperationalResource(session: ImportSession, factory: () => OperationalWorker, initialDemo?: OperationalResult) {
  let publicDemo = initialDemo ?? getOperationalDemo();
  if (publicDemo.source !== "demo" || publicDemo.model.origin.kind !== "independent_synthetic") throw new Error("A inicialização pública só aceita demonstração sintética.");
  const initial = session.getSnapshot();
  let state: OperationalSnapshot = { revision: initial.revision, status: initial.operation ? "loading" : "ready", result: initial.operation ? null : publicDemo, error: null };
  const listeners = new Set<() => void>();
  let worker: OperationalWorker | null = null, unsubscribe: (() => void) | null = null;
  let dayTimer: ReturnType<typeof setInterval> | undefined;
  const update = (next: OperationalSnapshot) => { state = next; listeners.forEach((listener) => listener()); };
  const stop = () => { worker?.terminate(); worker = null; };
  const refresh = () => {
    stop();
    const { operation, revision } = session.getSnapshot();
    if (!operation && publicDemo.parameters.referenceDate === demoReferenceDate()) {
      update({ revision, status: "ready", result: publicDemo, error: null }); return;
    }
    const demoAt = Date.now();
    const expectedDate = operation?.parameters.referenceDate ?? demoReferenceDate(new Date(demoAt));
    update({ revision, status: "loading", result: null, error: null });
    try {
      const current = factory(); worker = current;
      current.onmessage = ({ data }) => {
        if (worker !== current || data.revision !== session.getSnapshot().revision) return;
        if (data.kind === "result") {
          stop();
          if (data.result.source !== (operation ? "imported_local" : "demo") || data.result.model.origin.kind !== (operation ? "imported_local" : "independent_synthetic") || data.result.model.referenceDate !== expectedDate || data.result.parameters.referenceDate !== expectedDate) {
            update({ revision, status: "error", result: null, error: "Resultado incompatível com a fonte ativa. Revise a importação." }); return;
          }
          if (!operation) publicDemo = data.result;
          update({ revision, status: "ready", result: data.result, error: null });
        }
        else if (data.kind === "error") { stop(); update({ revision, status: "error", result: null, error: data.message }); }
      };
      current.onerror = (event) => { event.preventDefault(); if (worker !== current) return; stop(); update({ revision, status: "error", result: null, error: "Falha no Worker de análise local. Tente recalcular ou revisar a importação." }); };
      current.postMessage({ kind: "compute", operation, revision, ...(!operation ? { demoAt } : {}) });
    } catch { stop(); update({ revision, status: "error", result: null, error: "Web Worker de análise indisponível. Nenhum dado foi enviado; use um navegador atualizado." }); }
  };
  return { getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => {
      unsubscribe?.(); unsubscribe = session.subscribe(refresh);
      if (session.getSnapshot().operation || state.status === "loading" || publicDemo.parameters.referenceDate !== demoReferenceDate()) refresh();
      clearInterval(dayTimer);
      // Refresh stale prerendered data only after hydration, and never rewrite an import.
      dayTimer = setInterval(() => { if (!session.getSnapshot().operation && publicDemo.parameters.referenceDate !== demoReferenceDate()) refresh(); }, 30000);
    },
    retry: refresh,
    dispose: () => { unsubscribe?.(); unsubscribe = null; clearInterval(dayTimer); stop(); },
  };
}
export type OperationalResource = ReturnType<typeof createOperationalResource>;
