import { describe, expect, it } from "vitest";
import { createImportWizard, type ImportWorker } from "@/lib/flow-import/wizard";
import { createImportSession } from "@/lib/flow-import/session";
import { validateImport } from "@/lib/flow-import/validation";
import { importFixture, assignmentsFor, syntheticParameters } from "../fixtures/flow-import";
import type { WorkerRequest, WorkerResponse, ImportReport } from "@/lib/flow-import/types";

class ControlledWorker implements ImportWorker {
  messages: WorkerRequest[] = []; stopped = false;
  onmessage: ImportWorker["onmessage"] = null; onerror: ImportWorker["onerror"] = null;
  postMessage(message: WorkerRequest) { this.messages.push(message); }
  terminate() { this.stopped = true; }
  emit(data: WorkerResponse) { this.onmessage?.({ data } as MessageEvent<WorkerResponse>); }
}
function setup() {
  const workers: ControlledWorker[] = [], session = createImportSession();
  const wizard = createImportWizard(session, () => { const worker = new ControlledWorker(); workers.push(worker); return worker; });
  const files = importFixture(), result = validateImport(files, assignmentsFor(files), syntheticParameters());
  const select = () => { wizard.select([{} as File]); workers.at(-1)!.emit({ kind: "recognized", files: files.map((f) => f.recognition) }); };
  const enterParameters = () => { wizard.next(); for (const [key, value] of Object.entries(syntheticParameters())) wizard.setParameter(key as keyof ReturnType<typeof syntheticParameters>, value); };
  return { wizard, session, workers, files, result, select, enterParameters };
}
describe("transições do wizard sem efeitos de renderização", () => {
  it("avança automaticamente para identificação com os cinco arquivos reconhecidos", () => {
    const { wizard, select } = setup(); select();
    expect(wizard.getSnapshot().step).toBe(1);
    expect(wizard.getSnapshot().files).toHaveLength(5);
  });
  it("mantém seleção quando faltam arquivos, há estrutura inválida ou tipos duplicados", () => {
    for (const variant of ["missing", "invalid", "duplicate", "unknown"]) {
      const { wizard, workers, files } = setup(); wizard.select([{} as File]);
      let recognized = files.map((f) => ({ ...f.recognition }));
      if (variant === "missing") recognized = recognized.slice(1);
      if (variant === "invalid") recognized[0].problem = "Sintaxe inválida";
      if (variant === "duplicate") recognized[0].assigned = recognized[1].assigned;
      if (variant === "unknown") { recognized[0].candidates = []; recognized[0].assigned = null; }
      workers[0].emit({ kind: "recognized", files: recognized });
      expect(wizard.getSnapshot().step).toBe(0);
      expect(wizard.getSnapshot().error).toBeTruthy();
      wizard.next(); expect(wizard.getSnapshot().step).toBe(0);
    }
  });
  it("exige resolver ambiguidades e confirmar identificação antes de validar", () => {
    const { wizard, workers, files } = setup(); wizard.select([{} as File]);
    const recognized = files.map((f) => ({ ...f.recognition }));
    recognized[0].assigned = null; recognized[0].candidates = ["skus.csv", "compras.csv"];
    workers[0].emit({ kind: "recognized", files: recognized }); wizard.next();
    expect(wizard.getSnapshot().step).toBe(1);
    expect(workers[0].messages.some((m) => m.kind === "validate")).toBe(false);
    wizard.setAssignment(recognized[0].id, "skus.csv"); wizard.next();
    expect(wizard.getSnapshot().step).toBe(2);
    expect(workers[0].messages.some((m) => m.kind === "validate")).toBe(false); // Required parameters still absent.
  });
  it("erros bloqueiam processamento; alertas exigem reconhecimento explícito", () => {
    const { wizard, workers, result, select, enterParameters } = setup(); select(); enterParameters(); wizard.validate();
    workers[0].emit({ kind: "validated", report: { ...result.report, canProcess: false, errors: 1 } });
    wizard.acknowledge(true); expect(wizard.process()).toBe(false);
    wizard.validate(); workers[0].emit({ kind: "validated", report: result.report });
    expect(wizard.getSnapshot().step).toBe(2); expect(wizard.process()).toBe(false);
    wizard.acknowledge(true); expect(wizard.process()).toBe(true);
    expect(wizard.process()).toBe(false);
    expect(workers[0].messages.filter((m) => m.kind === "process")).toHaveLength(1);
  });
  it("processa automaticamente uma validação sem erros/alertas, uma única vez", () => {
    const { wizard, workers, result, select, enterParameters } = setup(); select(); enterParameters(); wizard.validate();
    const report: ImportReport = { ...result.report, warnings: 0, issues: [], hiddenIssues: 0 };
    workers[0].emit({ kind: "validated", report }); workers[0].emit({ kind: "validated", report });
    expect(wizard.getSnapshot().step).toBe(3);
    expect(workers[0].messages.filter((m) => m.kind === "process")).toHaveLength(1);
    wizard.next(); wizard.validate(); wizard.process();
    expect(workers[0].messages.filter((m) => m.kind === "process")).toHaveLength(1);
  });
  it("volta sem perder arquivos, associações, parâmetros ou relatório", () => {
    const { wizard, workers, result, select, enterParameters } = setup(); select(); enterParameters(); wizard.validate();
    workers[0].emit({ kind: "validated", report: result.report });
    const before = wizard.getSnapshot(); wizard.back(); wizard.back();
    expect(wizard.getSnapshot().step).toBe(0);
    expect(wizard.getSnapshot().files).toBe(before.files);
    expect(wizard.getSnapshot().assignments).toBe(before.assignments);
    expect(wizard.getSnapshot().form).toBe(before.form);
    wizard.next(); wizard.next();
    expect(wizard.getSnapshot().report).toBe(before.report);
    expect(workers[0].messages.filter((m) => m.kind === "validate")).toHaveLength(1);
  });
  it("alterar parâmetros/associações invalida relatório e reconhecimento de alertas", () => {
    const { wizard, workers, result, select, enterParameters } = setup(); select(); enterParameters(); wizard.validate();
    workers[0].emit({ kind: "validated", report: result.report }); wizard.acknowledge(true);
    wizard.setParameter("budget", "3.21");
    expect(wizard.getSnapshot().report).toBeNull(); expect(wizard.process()).toBe(false);
    expect(wizard.getSnapshot().acknowledged).toBe(false);
  });
  it("ignora respostas obsoletas após substituir ou limpar a importação", () => {
    const { wizard, workers, result, select, enterParameters, session } = setup(); select(); enterParameters(); wizard.validate();
    workers[0].emit({ kind: "validated", report: result.report }); wizard.acknowledge(true); wizard.process();
    const old = workers[0]; wizard.select([{} as File]);
    old.emit({ kind: "processed", operation: result.operation! });
    expect(old.stopped).toBe(true); expect(session.getSnapshot().operation).toBeNull();
    const current = workers[1]; wizard.clear(); current.emit({ kind: "recognized", files: [] });
    expect(wizard.getSnapshot().files).toEqual([]); expect(wizard.getSnapshot().busy).toBeNull();
  });
  it("validação não pode ser disparada duas vezes pelo mesmo evento", () => {
    const { wizard, workers, select, enterParameters } = setup(); select(); enterParameters();
    expect(wizard.validate()).toBe(true); expect(wizard.validate()).toBe(false);
    expect(workers[0].messages.filter((m) => m.kind === "validate")).toHaveLength(1);
  });
  it("guarda resultado final, fonte e parâmetros e limpa tudo explicitamente", () => {
    const { wizard, workers, result, select, enterParameters, session } = setup(); select(); enterParameters(); wizard.validate();
    workers[0].emit({ kind: "validated", report: result.report }); wizard.acknowledge(true); wizard.process();
    workers[0].emit({ kind: "processed", operation: result.operation! });
    expect(session.getSnapshot().operation).toBe(result.operation);
    expect(session.getSnapshot().source).toBe("imported_local");
    expect(wizard.getSnapshot().step).toBe(3); expect(workers[0].stopped).toBe(true);
    wizard.clear(); expect(session.getSnapshot().source).toBe("demo");
    expect(wizard.getSnapshot().files).toEqual([]); expect(wizard.getSnapshot().form.operation).toBe("");
  });
});
