import { inspectText } from "./recognition";
import { validateImport } from "./validation";
import { IMPORT_LIMITS, type ImportedOperation, type InspectedFile, type WorkerRequest, type WorkerResponse } from "./types";

const scope = self as unknown as { postMessage: (message: WorkerResponse) => void; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null };
let inspected: InspectedFile[] = [], operation: ImportedOperation | null = null;
let busy = false;
scope.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.kind === "inspect") {
      inspected = []; operation = null;
      if (data.files.length < 1 || data.files.length > 5 || data.files.some((f) => f.size > IMPORT_LIMITS.fileBytes) ||
          data.files.reduce((n, f) => n + f.size, 0) > IMPORT_LIMITS.totalBytes) {
        scope.postMessage({ kind: "failure", message: "Selecione até cinco CSVs: no máximo 35 MiB por arquivo e 100 MiB no total." }); return;
      }
      for (let i = 0; i < data.files.length; i++) {
        const file = data.files[i];
        inspected.push(inspectText("file-" + i, file.name, file.size, await file.text()));
        scope.postMessage({ kind: "progress", progress: { phase: "read", completed: i + 1, total: data.files.length } });
      }
      scope.postMessage({ kind: "recognized", files: inspected.map((f) => f.recognition) });
    } else if (data.kind === "validate") {
      operation = null;
      const result = validateImport(inspected, data.assignments, data.parameters, (progress) => scope.postMessage({ kind: "progress", progress }));
      operation = result.operation;
      scope.postMessage({ kind: "validated", report: result.report });
    } else if (data.kind === "process") {
      if (!operation) { scope.postMessage({ kind: "failure", message: "Conclua uma validação sem erros antes de processar." }); return; }
      scope.postMessage({ kind: "processed", operation });
      // Structured clone happens once. The UI terminates this worker after committing.
      operation = null; inspected = [];
    }
  } catch {
    operation = null; inspected = [];
    scope.postMessage({ kind: "failure", message: "Não foi possível concluir a importação local. Revise formato, tamanho e limites numéricos dos arquivos." });
  } finally { busy = false; }
};
