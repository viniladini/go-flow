import { computeOperation } from "./service";
import type { ImportedOperation } from "../flow-import/types";
import type { OperationalResult } from "./service";
export type OperationalRequest = { kind: "compute"; operation: ImportedOperation; revision: number };
export type OperationalResponse = { kind: "result"; revision: number; result: OperationalResult } | { kind: "error"; revision: number; message: string };
const scope = self as unknown as { onmessage: ((event: MessageEvent<OperationalRequest>) => void) | null; postMessage(message: OperationalResponse): void };
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ kind: "result", revision: data.revision, result: computeOperation(data.operation) }); }
  catch { scope.postMessage({ kind: "error", revision: data.revision, message: "Não foi possível calcular os indicadores da fonte importada. Revise os dados no Flow Import." }); }
};
