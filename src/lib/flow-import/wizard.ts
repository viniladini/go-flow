import type { FileName } from "../analytics/types";
import { FILE_TYPES } from "./recognition";
import { emptyParameterForm, validateParameters } from "./parameters";
import type { ImportSession } from "./session";
import type { ImportReport, ParameterForm, Progress, Recognition, WorkerRequest, WorkerResponse } from "./types";

export interface ImportWorker {
  postMessage(message: WorkerRequest): void; terminate(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
export interface WizardSnapshot {
  step: 0 | 1 | 2 | 3; files: Recognition[]; assignments: Record<string, FileName | null>;
  form: ParameterForm; busy: "read" | "validate" | "process" | null;
  progress: Progress | null; report: ImportReport | null; error: string; acknowledged: boolean;
}
const initial = (): WizardSnapshot => ({ step: 0, files: [], assignments: {}, form: emptyParameterForm(), busy: null, progress: null, report: null, error: "", acknowledged: false });
export function identificationProblem(files: Recognition[], assignments: WizardSnapshot["assignments"]) {
  if (files.length !== 5) return "Selecione os cinco arquivos para continuar. A seleção atual está incompleta.";
  if (files.some((f) => f.problem)) return "Há arquivos com estrutura inválida. Substitua a seleção antes de continuar.";
  if (files.some((f) => !assignments[f.id])) return "Há arquivos sem classificação. Confira as correspondências.";
  if (FILE_TYPES.some((type) => files.filter((f) => assignments[f.id] === type).length !== 1)) return "Cada tipo esperado precisa de exatamente um arquivo. Corrija as correspondências.";
  return "";
}
function selectionProblem(files: Recognition[], assignments: WizardSnapshot["assignments"]) {
  const incomplete = files.length !== 5 || files.some((f) => f.problem || !f.candidates.length);
  const repeated = files.every((f) => f.assigned) && !!identificationProblem(files, assignments);
  return incomplete || repeated ? identificationProblem(files, assignments) || "Um arquivo não corresponde ao contrato. Substitua a seleção." : "";
}
/** Root-provider lifetime: route components only subscribe. No parsing/normalization changes. */
export function createImportWizard(session: ImportSession, makeWorker: () => ImportWorker) {
  let state = initial(), worker: ImportWorker | null = null, revision = session.getSnapshot().revision;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<WizardSnapshot>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const stop = () => { worker?.terminate(); worker = null; };
  const clear = () => { stop(); revision = session.clear(); state = initial(); listeners.forEach((listener) => listener()); };
  const fail = (message: string) => { stop(); update({ busy: null, progress: null, report: null, files: [], assignments: {}, step: 0, error: message }); };
  const process = () => {
    if (!worker || state.busy || !state.report?.canProcess || state.report.errors || (state.report.warnings && !state.acknowledged)) return false;
    update({ busy: "process", progress: null, step: 3, error: "" });
    worker.postMessage({ kind: "process" }); return true;
  };
  const validate = () => {
    if (!worker || state.busy || state.step !== 2) return false;
    const problem = identificationProblem(state.files, state.assignments);
    if (problem) { update({ error: problem }); return false; }
    update({ busy: "validate", report: null, acknowledged: false, progress: null, error: "" });
    worker.postMessage({ kind: "validate", assignments: state.assignments, parameters: state.form }); return true;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear,
    dispose: stop,
    select: (files: File[]) => {
      if (!files.length) return;
      clear();
      let current: ImportWorker;
      try { current = makeWorker(); } catch { fail("Não foi possível iniciar o Web Worker local. Use um navegador atualizado; nenhum arquivo foi enviado."); return; }
      worker = current; update({ busy: "read" });
      current.onmessage = ({ data }) => {
        if (worker !== current) return;
        if (data.kind === "progress") update({ progress: data.progress });
        else if (data.kind === "recognized") {
          const assignments = Object.fromEntries(data.files.map((f) => [f.id, f.assigned]));
          const problem = selectionProblem(data.files, assignments);
          update({ files: data.files, assignments, busy: null, progress: null, step: problem ? 0 : 1, error: problem });
        } else if (data.kind === "validated") {
          if (state.busy !== "validate") return;
          update({ report: data.report, busy: null, progress: null, step: 2 });
          if (data.report.canProcess && data.report.errors === 0 && data.report.warnings === 0) process();
        } else if (data.kind === "processed") {
          if (state.busy !== "process") return;
          if (!session.commit(data.operation, revision)) { fail("A sessão mudou durante o processamento. Selecione os arquivos novamente."); return; }
          stop(); update({ busy: null, progress: null, step: 3, error: "" });
        } else if (data.kind === "failure") fail(data.message);
      };
      current.onerror = (event) => { event.preventDefault(); if (worker === current) fail("Falha no processamento local. Substitua os arquivos para tentar novamente; nenhum dado foi enviado."); };
      current.postMessage({ kind: "inspect", files });
    },
    setAssignment: (id: string, type: FileName | null) => {
      if (state.busy || session.getSnapshot().operation) return;
      update({ assignments: { ...state.assignments, [id]: type }, report: null, acknowledged: false, error: "" });
    },
    setParameter: (key: keyof ParameterForm, value: string) => {
      if (state.busy || session.getSnapshot().operation) return;
      update({ form: { ...state.form, [key]: value }, report: null, acknowledged: false, error: "" });
    },
    next: () => {
      if (state.busy || session.getSnapshot().operation) return;
      if (state.step === 0) {
        const problem = selectionProblem(state.files, state.assignments);
        if (!problem) update({ step: 1, error: "" });
        else update({ error: problem });
      } else if (state.step === 1) {
        const problem = identificationProblem(state.files, state.assignments);
        if (problem) { update({ error: problem }); return; }
        update({ step: 2, error: "" });
        // Only previously entered, explicit and valid parameters can trigger safe revalidation.
        if (validateParameters(state.form).parameters && !state.report) validate();
      }
    },
    back: () => { if (!state.busy && !session.getSnapshot().operation && state.step > 0) update({ step: (state.step - 1) as WizardSnapshot["step"], error: "" }); },
    acknowledge: (value: boolean) => { if (!state.busy) update({ acknowledged: value }); },
    validate, process,
  };
}
export type ImportWizard = ReturnType<typeof createImportWizard>;
