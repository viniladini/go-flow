// @vitest-environment happy-dom
import React, { act, useContext, useEffect, useState } from "react";
import { StockSearchContext } from "@/components/stock-search-context";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { ImportSessionProvider, useImportSession } from "@/components/import-session-provider";
import { computeOperation, type OperationalResult } from "@/lib/operations/service";
import type { ImportSession } from "@/lib/flow-import/session";
import { operationalFixture } from "../fixtures/operational";

const route = vi.hoisted(() => ({ path: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: route.push }), usePathname: () => route.path }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
const calculated = computeOperation(operationalFixture());
const demo: OperationalResult = { ...calculated, source: "demo", model: { ...calculated.model, origin: { ...calculated.model.origin, kind: "independent_synthetic", id: "goflow-demo-v1" } } };
let root: Root, container: HTMLDivElement, mounts: number, session: ImportSession, reduce: boolean;
let sharedSearch: NonNullable<React.ContextType<typeof StockSearchContext>>;
const motionListeners = new Set<() => void>();
const cancel = vi.fn(), animate = vi.fn(() => ({ cancel }));
function Content() {
  const current = useImportSession(), [filter, setFilter] = useState("");
  const search = useContext(StockSearchContext);
  useEffect(() => { sharedSearch = search!; }, [search]);
  useEffect(() => { mounts++; session = current.session; }, [current.session]);
  return <><input aria-label="Filtro preservado" value={filter} onChange={(e) => setFilter(e.target.value)} /><button onClick={() => setFilter("SKU sintético")}>Definir filtro de teste</button></>;
}
function View() { return <ImportSessionProvider initialDemo={demo}><AppShell><Content /></AppShell></ImportSessionProvider>; }
async function navigate(path: string) { route.path = path; await act(async () => root.render(<View />)); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mounts = 0; reduce = false; route.path = "/";
  motionListeners.clear(); animate.mockClear(); cancel.mockClear(); route.push.mockClear();
  vi.stubGlobal("Worker", class { postMessage() {} terminate() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network in shell motion"); }));
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ get matches() { return reduce; }, addEventListener: (_type: string, listener: () => void) => motionListeners.add(listener), removeEventListener: (_type: string, listener: () => void) => motionListeners.delete(listener) }) as unknown as MediaQueryList);
  vi.stubGlobal("Animation", class {});
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function(this: HTMLDialogElement) { this.removeAttribute("open"); });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<View />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete (HTMLElement.prototype as unknown as Record<string, unknown>).animate; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("desloca o indicador persistente nas sete abas e anima sem remontar o conteúdo", async () => {
  const nav = container.querySelector('nav[aria-label="Navegação principal"]')!;
  const indicator = nav.querySelector(".nav-active-indicator"), content = container.querySelector("#conteudo"), input = content!.querySelector("input")!;
  await act(async () => content!.querySelector<HTMLButtonElement>("button")!.click());
  expect(animate).not.toHaveBeenCalled();
  for (const [index, path] of ["/", "/estoque", "/compras", "/oportunidades", "/agente", "/acoes", "/importar"].entries()) {
    await navigate(path);
    expect(nav.querySelector(".nav-active-indicator")).toBe(indicator);
    expect((nav as HTMLElement).style.getPropertyValue("--nav-index")).toBe(String(index));
    expect(nav.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe(path);
    expect(container.querySelector("#conteudo")).toBe(content); expect(content!.querySelector("input")).toBe(input);
    expect(input.value).toBe("SKU sintético");
  }
  expect(animate).toHaveBeenCalledTimes(6); expect(mounts).toBe(1); expect(fetch).not.toHaveBeenCalled();
});
it("preserva sessão importada e scroll ao transicionar; cancela movimentos anteriores", async () => {
  const imported = operationalFixture(); await act(async () => { session.commit(imported, 0); });
  const snapshot = session.getSnapshot(), main = container.querySelector<HTMLElement>("#conteudo")!;
  main.scrollTop = 170;
  await navigate("/estoque"); await navigate("/compras");
  expect(cancel).toHaveBeenCalled(); expect(session.getSnapshot()).toBe(snapshot);
  expect(main.scrollTop).toBe(170); expect(mounts).toBe(1);
});
it("reduced-motion mantém a navegação sem animação de conteúdo", async () => {
  reduce = true; await navigate("/acoes"); expect(animate).not.toHaveBeenCalled();
  expect(container.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/acoes");
});
it("clique sinaliza a rota pendente imediatamente e preserva o layout ao concluir", async () => {
  const main = container.querySelector("#conteudo");
  const link = container.querySelector<HTMLAnchorElement>('.sidebar a[href="/estoque"]')!;
  link.addEventListener("click", (event) => event.preventDefault());
  await act(async () => link.click());
  expect(container.querySelector(".workspace-shell")?.getAttribute("data-navigating")).toBe("true");
  expect(container.querySelector(".route-progress[role=status]")).not.toBeNull();
  await navigate("/estoque");
  expect(container.querySelector(".route-progress")).toBeNull();
  expect(container.querySelector("#conteudo")).toBe(main);
  expect(mounts).toBe(1);
});
it("View Transition aguarda o commit da rota, cancela uma intencao anterior e mantem o shell", async () => {
  const callbacks: Array<() => Promise<void>> = [], finishes: Array<() => void> = [];
  const skip = vi.fn();
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: vi.fn((update: () => Promise<void>) => {
    callbacks.push(update);
    return { skipTransition: skip, finished: new Promise<void>((resolve) => finishes.push(resolve)) };
  }) });
  const main = container.querySelector("#conteudo"), header = container.querySelector(".topbar");
  try {
    await act(async () => container.querySelector<HTMLAnchorElement>('.sidebar a[href="/estoque"]')!.click());
    await act(async () => container.querySelector<HTMLAnchorElement>('.sidebar a[href="/compras"]')!.click());
    expect(skip).toHaveBeenCalledTimes(1);
    await callbacks[0]();
    expect(route.push).not.toHaveBeenCalled();
    let committed!: Promise<void>;
    await act(async () => { committed = callbacks[1](); });
    expect(route.push).toHaveBeenCalledExactlyOnceWith("/compras");
    expect(container.querySelector('nav[aria-label="Navegação principal"]')?.getAttribute("style")).toContain("--nav-index: 2");
    await navigate("/compras"); await committed;
    expect(animate).not.toHaveBeenCalled(); // Native snapshots own the page.
    expect(container.querySelector("#conteudo")).toBe(main);
    expect(container.querySelector(".topbar")).toBe(header);
    expect(mounts).toBe(1);
  } finally { finishes.forEach((finish) => finish()); delete (document as unknown as Record<string, unknown>).startViewTransition; }
});
it("separa navegação rolável da marca/rodapé e preserva header e aparência", async () => {
  const header = container.querySelector(".topbar"), appearance = header!.querySelector(".appearance-control");
  const sidebar = container.querySelector(".sidebar")!;
  const region = sidebar.querySelector(".sidebar-nav-region")!;
  expect(region.querySelectorAll(".nav-item")).toHaveLength(7);
  expect(region.contains(sidebar.querySelector(".sidebar-brand"))).toBe(false);
  expect(region.contains(sidebar.querySelector(".sidebar-bottom"))).toBe(false);
  await navigate("/estoque");
  expect(container.querySelector(".topbar")).toBe(header);
  expect(header!.querySelector(".appearance-control")).toBe(appearance);
});
it("busca do header usa memória e navega sem transmitir o termo na URL", async () => {
  await act(async () => sharedSearch.setQuery("SYNTH-PRIVATE-SEARCH"));
  const input = container.querySelector<HTMLInputElement>(".shell-search input")!;
  expect(input.value).toBe("SYNTH-PRIVATE-SEARCH");
  await act(async () => { container.querySelector(".shell-search")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(route.push).toHaveBeenCalledExactlyOnceWith("/estoque#filtros-estoque");
  expect(window.location.search).not.toContain("SYNTH-PRIVATE-SEARCH"); expect(fetch).not.toHaveBeenCalled();
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(input);
});

it("mantem um indicador medido, com selecao pendente distinta do aria-current", async () => {
  const nav = container.querySelector<HTMLElement>('.sidebar .shell-navigation')!;
  const indicator = nav.querySelector(".nav-active-indicator");
  const target = nav.querySelector<HTMLAnchorElement>('a[href="/acoes"]')!;
  target.addEventListener("click", (event) => event.preventDefault());
  Object.defineProperty(target, "offsetTop", { configurable: true, value: 260 });
  Object.defineProperty(target, "offsetHeight", { configurable: true, value: 48 });
  await act(async () => target.click());
  expect(nav.style.getPropertyValue("--nav-y")).toBe("260px");
  expect(target.dataset.selected).toBe("true"); expect(target.getAttribute("aria-current")).toBeNull();
  expect(nav.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/");
  await navigate("/acoes");
  expect(nav.querySelector(".nav-active-indicator")).toBe(indicator);
  expect(target.getAttribute("aria-current")).toBe("page");
});
it("voltar/avancar e rota desconhecida preservam o indicador, header e foco de filtros", async () => {
  const header = container.querySelector(".topbar"), indicator = container.querySelector(".sidebar .nav-active-indicator");
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Filtro preservado"]')!;
  input.focus();
  for (const path of ["/estoque", "/compras", "/estoque", "/compras", "/nao-encontrada", "/"]) await navigate(path);
  expect(container.querySelector(".topbar")).toBe(header);
  expect(container.querySelector(".sidebar .nav-active-indicator")).toBe(indicator);
  expect(document.activeElement).toBe(input);
  expect(mounts).toBe(1);
});
it("clique no destino atual cancela a intencao anterior sem deixar pending preso", async () => {
  const link = container.querySelector<HTMLAnchorElement>('.sidebar a[href="/compras"]')!;
  link.addEventListener("click", (event) => event.preventDefault());
  await act(async () => link.click());
  expect(container.querySelector(".route-progress")).not.toBeNull();
  await act(async () => container.querySelector<HTMLAnchorElement>('.sidebar .nav-item[href="/"]')!.click());
  expect(container.querySelector(".route-progress")).toBeNull();
  expect(container.querySelector('.sidebar a[data-selected="true"]')?.getAttribute("href")).toBe("/");
  expect(route.push).toHaveBeenCalledWith("/");
});
it("drawer usa um unico animador, Escape fecha e restaura foco sem overlay residual", async () => {
  const button = container.querySelector<HTMLButtonElement>(".menu-button")!;
  const drawer = container.querySelector<HTMLDialogElement>(".mobile-drawer")!;
  await act(async () => button.click());
  expect(drawer.open).toBe(true);
  await act(async () => drawer.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true })));
  expect(drawer.open).toBe(false); expect(cancel).toHaveBeenCalled();
  expect(document.activeElement).toBe(button);
});
it("reduced motion durante fechamento conclui o drawer e cancela animacoes", async () => {
  const button = container.querySelector<HTMLButtonElement>(".menu-button")!;
  await act(async () => button.click());
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  animate.mockReturnValueOnce({ cancel, finished } as unknown as ReturnType<typeof animate>);
  const drawer = container.querySelector<HTMLDialogElement>(".mobile-drawer")!;
  await act(async () => drawer.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(drawer.open).toBe(true);
  reduce = true; await act(async () => { motionListeners.forEach((listener) => listener()); });
  expect(drawer.open).toBe(false); expect(document.activeElement).toBe(button);
  await act(async () => finish()); expect(drawer.open).toBe(false);
});
it("falha da View Transition navega imediatamente com fallback sem animadores concorrentes", async () => {
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: () => { throw new Error("unsupported snapshot"); } });
  try {
    await act(async () => container.querySelector<HTMLAnchorElement>('.sidebar a[href="/agente"]')!.click());
    expect(route.push).toHaveBeenCalledExactlyOnceWith("/agente");
    expect(document.documentElement.dataset.routeMotion).toBeUndefined();
    expect(animate).not.toHaveBeenCalled();
    await navigate("/agente");
    expect(animate).toHaveBeenCalledOnce();
    expect(container.querySelector(".route-progress")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#conteudo"));
  } finally { delete (document as unknown as Record<string, unknown>).startViewTransition; }
});
it("mudar reduced motion durante entrada cancela o movimento sem perder o destino", async () => {
  await navigate("/agente");
  expect(animate).toHaveBeenCalledOnce();
  reduce = true; await act(async () => motionListeners.forEach((listener) => listener()));
  expect(cancel).toHaveBeenCalled();
  expect(container.querySelector('.sidebar [aria-current="page"]')?.getAttribute("href")).toBe("/agente");
});
it("foco do destino aguarda o drawer fechar quando a rota monta durante a saida", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>(".menu-button")!.click());
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  animate.mockReturnValueOnce({ cancel, finished } as unknown as ReturnType<typeof animate>);
  const link = container.querySelector<HTMLAnchorElement>('.mobile-drawer a[href="/estoque"]')!;
  link.addEventListener("click", (event) => event.preventDefault());
  await act(async () => link.click());
  const drawer = container.querySelector<HTMLDialogElement>(".mobile-drawer")!;
  expect(drawer.open).toBe(true);
  await navigate("/estoque");
  await act(async () => finish());
  expect(drawer.open).toBe(false);
  expect(document.activeElement).toBe(container.querySelector("#conteudo"));
});
