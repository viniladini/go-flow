import { computeOperation } from "./service";
import type { ImportedOperation } from "../flow-import/types";
import type { OperationalResult } from "./service";
export type OperationalRequest = { kind: "compute"; operation: ImportedOperation | null; revision: number; demoAt?: number };
export type OperationalResponse = { kind: "result"; revision: number; result: OperationalResult } | { kind: "error"; revision: number; message: string };
const scope = self as unknown as { onmessage: ((event: MessageEvent<OperationalRequest>) => void) | null; postMessage(message: OperationalResponse): void };
scope.onmessage = ({ data }) => {
  if (!data.operation && (data.operation !== null || typeof data.demoAt !== "number" || !Number.isFinite(data.demoAt))) {
    scope.postMessage({ kind: "error", revision: data.revision, message: "Relógio do cenário demonstrativo indisponível." }); return;
  }
  try { scope.postMessage({ kind: "result", revision: data.revision, result: computeOperation(data.operation, data.operation ? undefined : new Date(data.demoAt ?? Date.now())) }); }
  catch { scope.postMessage({ kind: "error", revision: data.revision, message: "Não foi possível calcular os indicadores da fonte importada. Revise os dados no Flow Import." }); }
};
