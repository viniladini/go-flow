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
  animate.mockClear(); cancel.mockClear(); route.push.mockClear();
  vi.stubGlobal("Worker", class { postMessage() {} terminate() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network in shell motion"); }));
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  vi.stubGlobal("Animation", class {});
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
