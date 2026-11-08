import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESLint } from "eslint";
import { FILE_TYPES } from "@/lib/flow-import/recognition";
import { templateCsv } from "@/lib/flow-import/templates";
import { IMPORT_LIMITS, type WorkerRequest, type WorkerResponse } from "@/lib/flow-import/types";
import { syntheticParameters } from "../fixtures/flow-import";

describe("protocolo local do Web Worker", () => {
  const responses: WorkerResponse[] = [];
  const scope = { postMessage: (message: WorkerResponse) => responses.push(message), onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null };
  beforeEach(async () => {
    responses.length = 0; scope.onmessage = null; vi.resetModules();
    vi.stubGlobal("self", scope);
    for (const key of ["fetch", "XMLHttpRequest", "WebSocket"]) vi.stubGlobal(key, () => { throw new Error("Rede proibida"); });
    await import("@/lib/flow-import/import.worker");
  });
  afterEach(() => vi.unstubAllGlobals());
  const dispatch = async (data: WorkerRequest) => { await scope.onmessage!({ data } as MessageEvent<WorkerRequest>); };
  const inspect = () => dispatch({ kind: "inspect", files: FILE_TYPES.map((type, n) => new File([templateCsv(type)], "renomeado-" + n + ".csv")) });
  const assignments = () => Object.fromEntries(FILE_TYPES.map((type, n) => ["file-" + n, type]));
  it("só retorna dataset após validar e processar; reconhecimento não transfere registros", async () => {
    await inspect();
    expect(responses.filter((r) => r.kind === "progress")).toHaveLength(5);
    expect(responses.some((r) => r.kind === "processed")).toBe(false);
    const recognized = responses.find((r) => r.kind === "recognized");
    expect(recognized?.kind === "recognized" && recognized.files.every((f) => !("rows" in f))).toBe(true);
    await dispatch({ kind: "validate", assignments: assignments(), parameters: syntheticParameters() });
    expect(responses.find((r) => r.kind === "validated")?.kind).toBe("validated");
    expect(responses.some((r) => r.kind === "processed")).toBe(false);
    await dispatch({ kind: "process" });
    const processed = responses.find((r) => r.kind === "processed");
    expect(processed?.kind === "processed" && processed.operation.dataset.skus.length).toBe(1);
    responses.length = 0;
    await dispatch({ kind: "process" });
    expect(responses[0].kind).toBe("failure");
  });
  it("validação inválida não permite processar", async () => {
    await inspect();
    await dispatch({ kind: "validate", assignments: assignments(), parameters: { ...syntheticParameters(), budget: "" } });
    await dispatch({ kind: "process" });
    expect(responses.some((r) => r.kind === "processed")).toBe(false);
    expect(responses.at(-1)?.kind).toBe("failure");
  });
  it("nova inspeção elimina o resultado anterior sem misturar origens", async () => {
    await inspect();
    await dispatch({ kind: "validate", assignments: assignments(), parameters: syntheticParameters() });
    await inspect();
    await dispatch({ kind: "process" });
    expect(responses.at(-1)?.kind).toBe("failure");
  });
  it("barra tamanho excessivo antes de ler bytes", async () => {
    const text = vi.fn();
    await dispatch({ kind: "inspect", files: [{ name: "grande.csv", size: IMPORT_LIMITS.fileBytes + 1, text } as unknown as File] });
    expect(text).not.toHaveBeenCalled();
    expect(responses.at(-1)?.kind).toBe("failure");
  });
});

describe("barreira estática contra rede e persistência", () => {
  const eslint = new ESLint();
  it.each([
    'fetch("/api/upload", { method: "POST" });',
    'window.fetch("/api/upload");',
    'navigator.sendBeacon("/upload", payload);',
    'localStorage.setItem("dataset", payload);',
    'window.indexedDB.open("dataset");',
    'document.cookie = payload;',
  ])("bloqueia %s", async (code) => {
    const [result] = await eslint.lintText(code, { filePath: "src/lib/flow-import/boundary-check.ts" });
    expect(result.messages.some((m) => ["no-restricted-globals", "no-restricted-properties"].includes(m.ruleId ?? ""))).toBe(true);
  }, 20000);
  it("bloqueia logs no processamento de dados locais", async () => {
    const [result] = await eslint.lintText("console.log(dataset);", { filePath: "src/lib/flow-import/boundary-check.ts" });
    expect(result.messages.some((m) => m.ruleId === "no-console")).toBe(true);
  });
});
