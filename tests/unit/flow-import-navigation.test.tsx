// @vitest-environment happy-dom
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportSessionProvider, useImportSession, useImportWizard } from "@/components/import-session-provider";
import { FlowImport } from "@/components/flow-import";
import { AppShell } from "@/components/app-shell";
import { inspectText } from "@/lib/flow-import/recognition";
import { validateImport } from "@/lib/flow-import/validation";
import { templateCsv } from "@/lib/flow-import/templates";
import { FILE_TYPES } from "@/lib/flow-import/recognition";
import { syntheticParameters } from "../fixtures/flow-import";
import type { ImportWorker, ImportWizard } from "@/lib/flow-import/wizard";
import type { ImportedOperation, InspectedFile, WorkerRequest, WorkerResponse } from "@/lib/flow-import/types";
import type { ImportSession } from "@/lib/flow-import/session";

// Only the router transport is mocked; real provider, page, controls, store and validators mount.
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/importar" }));
class MemoryWorker implements ImportWorker {
  static instances: MemoryWorker[] = [];
  onmessage: ImportWorker["onmessage"] = null; onerror: ImportWorker["onerror"] = null;
  stopped = false; messages: WorkerRequest[] = [];
  paused = false; pending: (() => void)[] = [];
  files: InspectedFile[] = []; operation: ImportedOperation | null = null;
  constructor() { MemoryWorker.instances.push(this); }
  terminate() { this.stopped = true; }
  postMessage(message: WorkerRequest) {
    this.messages.push(message);
    const run = () => {
      if (this.stopped) return;
      let response: WorkerResponse;
      if (message.kind === "inspect") {
        // Independent templates, no filesystem, network, or confidential CSVs.
        this.files = message.files.map((file, i) => inspectText("file-" + i, file.name, 100, templateCsv(FILE_TYPES[i])));
        response = { kind: "recognized", files: this.files.map((f) => f.recognition) };
      } else if (message.kind === "validate") {
        const result = validateImport(this.files, message.assignments, message.parameters);
        this.operation = result.operation; response = { kind: "validated", report: result.report };
      } else {
        response = this.operation ? { kind: "processed", operation: this.operation } : { kind: "failure", message: "Sem validação" };
      }
      this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
    };
    if (this.paused) this.pending.push(run); else queueMicrotask(run);
  }
}
let current: { wizard: ImportWizard; session: ImportSession };
function RouterHarness() {
  const [route, setRoute] = useState("/importar");
  const { session, snapshot } = useImportSession(), { wizard } = useImportWizard();
  useEffect(() => { current = { session, wizard }; }, [session, wizard]);
  return <div onClick={(event) => {
    const anchor = (event.target as Element).closest("a");
    const href = anchor?.getAttribute("href");
    if (href?.startsWith("/")) { event.preventDefault(); setRoute(href); }
  }}><AppShell>{route === "/importar" ? <FlowImport /> : <div data-route={route} data-source={snapshot.source}>{snapshot.operation?.parameters.operation ?? "Demonstração"}</div>}</AppShell></div>;
}
let root: Root, container: HTMLDivElement;
async function click(selector: string) {
  const target = container.querySelector<HTMLElement>(selector);
  expect(target, selector).not.toBeNull();
  await act(async () => target!.click());
}
async function button(text: string) {
  const target = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.includes(text));
  expect(target, text).toBeDefined();
  await act(async () => target!.click());
}
async function selectFiles() {
  const input = container.querySelector<HTMLInputElement>("#import-files")!;
  Object.defineProperty(input, "files", { configurable: true, value: FILE_TYPES.map((type) => new File([templateCsv(type)], type)) });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function parametersAndValidate() {
  await button("Confirmar correspondências");
  await act(async () => { for (const [key, value] of Object.entries(syntheticParameters())) current.wizard.setParameter(key as keyof ReturnType<typeof syntheticParameters>, value); });
  await act(async () => container.querySelector(".wizard-stage form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function complete() {
  await selectFiles(); await parametersAndValidate();
  await click(".import-ack input"); await button("Reconhecer e processar");
  expect(current.session.getSnapshot().source).toBe("imported_local");
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  MemoryWorker.instances = [];
  vi.stubGlobal("Worker", MemoryWorker);
  vi.stubGlobal("fetch", () => { throw new Error("Importação não pode chamar rede"); });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ImportSessionProvider><RouterHarness /></ImportSessionProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("integração React: navegação, retorno e limpeza", () => {
  it("preserva dataset, parâmetros e fonte nas seis páginas e retorna ao resumo final", async () => {
    await complete();
    const session = current.session, operation = session.getSnapshot().operation;
    for (const route of ["/", "/estoque", "/compras", "/oportunidades", "/agente", "/acoes"]) {
      await click(`nav[aria-label="Navegação principal"] a[href="${route}"]`);
      expect(container.querySelector("[data-route]")?.getAttribute("data-route")).toBe(route);
      expect(current.session).toBe(session);
      expect(current.session.getSnapshot().operation).toBe(operation);
      expect(container.querySelector("[data-route]")?.getAttribute("data-source")).toBe("imported_local");
    }
    await click('nav[aria-label="Navegação principal"] a[href="/importar"]');
    expect(container.textContent).toContain("Sessão importada pronta");
    expect(container.querySelector(".wizard-stage")?.getAttribute("data-step")).toBe("4");
    expect(current.session.getSnapshot().operation?.parameters).toBe(operation?.parameters);
    expect(container.querySelector('a[href="/"].import-button')?.textContent).toContain("Visão geral");
  });
  it("não encerra Worker nem perde arquivos/associações ao sair antes de processar", async () => {
    await selectFiles();
    const before = current.wizard.getSnapshot(), worker = MemoryWorker.instances[0];
    await click('nav[aria-label="Navegação principal"] a[href="/estoque"]');
    expect(worker.stopped).toBe(false);
    await click('nav[aria-label="Navegação principal"] a[href="/importar"]');
    expect(current.wizard.getSnapshot().files).toBe(before.files);
    expect(current.wizard.getSnapshot().assignments).toBe(before.assignments);
    expect(container.querySelectorAll(".import-file-list > div")).toHaveLength(5);
    await parametersAndValidate();
    expect(current.wizard.getSnapshot().report?.canProcess).toBe(true);
  });
  it("conclui validação em andamento após sair da página e restaura o resultado ao voltar", async () => {
    await selectFiles(); await button("Confirmar correspondências");
    await act(async () => { for (const [key, value] of Object.entries(syntheticParameters())) current.wizard.setParameter(key as keyof ReturnType<typeof syntheticParameters>, value); });
    const worker = MemoryWorker.instances[0]; worker.paused = true;
    await act(async () => container.querySelector(".wizard-stage form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(current.wizard.getSnapshot().busy).toBe("validate");
    await click('nav[aria-label="Navegação principal"] a[href="/estoque"]');
    expect(worker.stopped).toBe(false);
    await act(async () => { worker.paused = false; worker.pending.splice(0).forEach((run) => queueMicrotask(run)); });
    expect(current.wizard.getSnapshot().report?.canProcess).toBe(true);
    await click('nav[aria-label="Navegação principal"] a[href="/importar"]');
    expect(container.textContent).toContain("Validação concluída");
    expect(current.wizard.getSnapshot().form.operation).toBe(syntheticParameters().operation);
  });
  it("limpar exige confirmação; cancelar preserva a sessão e confirmar remove dados/progresso", async () => {
    await complete(); const operation = current.session.getSnapshot().operation;
    await button("Limpar sessão");
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    await button("Cancelar"); expect(current.session.getSnapshot().operation).toBe(operation);
    await button("Limpar sessão"); await button("Confirmar limpeza");
    expect(current.session.getSnapshot().operation).toBeNull();
    expect(current.session.getSnapshot().source).toBe("demo");
    expect(current.wizard.getSnapshot().form.operation).toBe("");
    expect(container.querySelector(".wizard-stage")?.getAttribute("data-step")).toBe("1");
  });
  it("substituir exige confirmação e limpa parâmetros e origem anterior", async () => {
    await complete(); const operation = current.session.getSnapshot().operation;
    await button("Substituir importação"); await button("Cancelar");
    expect(current.session.getSnapshot().operation).toBe(operation);
    await button("Substituir importação"); await button("Confirmar substituição");
    expect(current.session.getSnapshot().operation).toBeNull();
    expect(current.wizard.getSnapshot().files).toEqual([]);
    expect(current.wizard.getSnapshot().form.operation).toBe("");
    await selectFiles(); expect(current.wizard.getSnapshot().step).toBe(1);
    expect(current.session.getSnapshot().source).toBe("demo");
  });
  it("mantém somente uma etapa visível e volta sem perder progresso", async () => {
    await selectFiles();
    expect(container.querySelectorAll(".wizard-stage")).toHaveLength(1);
    expect(container.querySelector("#import-files")).toBeNull();
    await button("Voltar"); expect(container.querySelector("#import-files")).not.toBeNull();
    await button("Continuar com os arquivos lidos");
    expect(container.querySelectorAll(".import-file-list > div")).toHaveLength(5);
    await parametersAndValidate(); const form = current.wizard.getSnapshot().form;
    await button("Voltar"); await button("Confirmar correspondências");
    expect(current.wizard.getSnapshot().form).toBe(form);
    expect(container.querySelectorAll(".wizard-stage")).toHaveLength(1);
  });
  it("não processa alertas sem confirmação nem duplica o envio em cliques repetidos", async () => {
    await selectFiles(); await parametersAndValidate();
    const process = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Reconhecer e processar"))!;
    expect(process.disabled).toBe(true); expect(current.session.getSnapshot().operation).toBeNull();
    await click(".import-ack input");
    await act(async () => { process.click(); process.click(); });
    expect(MemoryWorker.instances[0].messages.filter((m) => m.kind === "process")).toHaveLength(1);
    expect(container.textContent).toContain("Sessão importada pronta");
  });
});
