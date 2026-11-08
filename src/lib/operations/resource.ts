import { getOperationalDemo, type OperationalResult } from "./service";
import type { ImportSession } from "../flow-import/session";
import type { OperationalRequest, OperationalResponse } from "./operations.worker";
export interface OperationalWorker {
  postMessage(message: OperationalRequest): void; terminate(): void;
  onmessage: ((event: MessageEvent<OperationalResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
export interface OperationalSnapshot { revision: number; status: "ready" | "loading" | "error"; result: OperationalResult | null; error: string | null }
export function createOperationalResource(session: ImportSession, factory: () => OperationalWorker, initialDemo?: OperationalResult) {
  const publicDemo = initialDemo ?? getOperationalDemo();
  if (publicDemo.source !== "demo" || publicDemo.model.origin.kind !== "independent_synthetic") throw new Error("A inicialização pública só aceita demonstração sintética.");
  const initial = session.getSnapshot();
  let state: OperationalSnapshot = { revision: initial.revision, status: initial.operation ? "loading" : "ready", result: initial.operation ? null : publicDemo, error: null };
  const listeners = new Set<() => void>();
  let worker: OperationalWorker | null = null, unsubscribe: (() => void) | null = null;
  const update = (next: OperationalSnapshot) => { state = next; listeners.forEach((listener) => listener()); };
  const stop = () => { worker?.terminate(); worker = null; };
  const refresh = () => {
    stop();
    const { operation, revision } = session.getSnapshot();
    if (!operation) { update({ revision, status: "ready", result: publicDemo, error: null }); return; }
    update({ revision, status: "loading", result: null, error: null });
    try {
      const current = factory(); worker = current;
      current.onmessage = ({ data }) => {
        if (worker !== current || data.revision !== session.getSnapshot().revision) return;
        if (data.kind === "result") {
          stop();
          if (data.result.source !== "imported_local" || data.result.model.origin.kind !== "imported_local" || data.result.model.referenceDate !== operation.parameters.referenceDate) {
            update({ revision, status: "error", result: null, error: "Resultado incompatível com a fonte ativa. Revise a importação." }); return;
          }
          update({ revision, status: "ready", result: data.result, error: null });
        }
        else if (data.kind === "error") { stop(); update({ revision, status: "error", result: null, error: data.message }); }
      };
      current.onerror = (event) => { event.preventDefault(); if (worker !== current) return; stop(); update({ revision, status: "error", result: null, error: "Falha no Worker de análise local. Tente recalcular ou revisar a importação." }); };
      current.postMessage({ kind: "compute", operation, revision });
    } catch { stop(); update({ revision, status: "error", result: null, error: "Web Worker de análise indisponível. Nenhum dado foi enviado; use um navegador atualizado." }); }
  };
  return { getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { unsubscribe?.(); unsubscribe = session.subscribe(refresh); if (session.getSnapshot().operation || state.status === "loading") refresh(); },
    retry: refresh,
    dispose: () => { unsubscribe?.(); unsubscribe = null; stop(); },
  };
}
export type OperationalResource = ReturnType<typeof createOperationalResource>;
