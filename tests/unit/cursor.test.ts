// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let host: HTMLDivElement, stylesheet: HTMLStyleElement;
// happy-dom exposes caret-color on the authored element but omits inherited
// computed values. Resolve that inherited property; browser rendering is not
// simulated by this test. Cursor/user-select use their computed values below.
function caretColor(element: Element): string {
  return getComputedStyle(element).caretColor || (element.parentElement ? caretColor(element.parentElement) : "auto");
}
beforeEach(() => {
  const globals = readFileSync(resolve("src/app/globals.css"), "utf8");
  stylesheet = document.createElement("style");
  stylesheet.textContent = globals.slice(globals.indexOf(":root")) + readFileSync(resolve("src/app/signature-motion.css"), "utf8");
  document.head.append(stylesheet);
  host = document.createElement("div"); document.body.append(host);
});
afterEach(() => {
  window.getSelection()?.removeAllRanges(); host.remove(); stylesheet.remove();
});

describe("cursores globais sem bloquear selecao ou edicao", () => {
  it.each(["dashboard", "agent-workspace", "agent-records", "stock-table-region", "shell-navigation"])("texto estatico de %s continua copiavel e sem caret", (className) => {
    host.className = className;
    host.innerHTML = '<h1 tabindex="-1">Resumo</h1><p>Descricao <strong>Indicador</strong></p><div class="metric-card"><span>123,45</span></div><table><tbody><tr><td><code>SKU-DEMO-1</code></td></tr></tbody></table><div role="region" tabindex="0">Tabela acessivel</div>';
    for (const element of host.querySelectorAll("h1, p, strong, .metric-card, span, td, code, [role=region]")) {
      const style = getComputedStyle(element);
      expect(style.cursor).toBe("default"); expect(caretColor(element)).toBe("transparent");
      expect(style.userSelect).not.toBe("none"); expect(style.pointerEvents).not.toBe("none");
    }
    const heading = host.querySelector<HTMLElement>("h1")!; heading.focus();
    expect(document.activeElement).toBe(heading);
    const range = document.createRange(); range.selectNodeContents(host.querySelector("code")!);
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.toString()).toBe("SKU-DEMO-1");
  });
  it("controles e seus textos/icones preservam pointer, inclusive menus e cards clicaveis", () => {
    host.innerHTML = '<a href="/agente" class="agent-card"><span>Agente</span></a><button><span>Enviar</span><svg><path /></svg></button><details><summary><strong>Revisar</strong></summary></details><label for="search">Buscar</label><select><option>Demo</option></select><div role="button" tabindex="0"><span>Abrir</span></div><div role="tab">Aba</div><div role="menuitem">Menu</div><input type="checkbox"><input type="radio"><input type="range"><input type="file"><input type="color"><input type="submit"><a>Texto sem destino</a>';
    for (const element of host.querySelectorAll("a[href], a[href] span, button, button span, button svg, button path, summary, summary strong, label, select, [role], [role=button] span, input")) {
      expect(getComputedStyle(element).cursor).toBe("pointer");
    }
    expect(getComputedStyle(host.querySelector("a:not([href])")!).cursor).toBe("default");
    const button = host.querySelector("button")!; let clicks = 0;
    button.addEventListener("click", () => clicks++); button.click();
    expect(clicks).toBe(1); button.focus(); expect(document.activeElement).toBe(button);
  });
  it.each([undefined, "text", "search", "number", "email", "password", "tel", "url", "date", "time"])("input %s conserva cursor de texto, caret e foco", (type) => {
    const input = document.createElement("input"); if (type) input.type = type;
    host.append(input); input.focus(); input.value = "42";
    expect(getComputedStyle(input).cursor).toBe("text");
    expect(getComputedStyle(input).caretColor).toBe("auto");
    expect(document.activeElement).toBe(input); expect(getComputedStyle(input).userSelect).not.toBe("none");
  });
  it("textarea e contenteditable restauram caret herdado sem tornar ilhas estaticas editaveis", () => {
    host.innerHTML = '<textarea id="agent-prompt">Mensagem</textarea><div contenteditable="true"><span>Editor</span><strong contenteditable="false">Codigo fixo</strong><button>Acao</button></div><div contenteditable=""><span>Outro editor</span></div><div contenteditable="plaintext-only">Texto simples</div>';
    for (const element of host.querySelectorAll("textarea, [contenteditable=true], [contenteditable=true] > span, [contenteditable=''], [contenteditable=''] span, [contenteditable=plaintext-only]")) {
      const style = getComputedStyle(element);
      expect(style.cursor).toBe("text"); expect(caretColor(element)).toBe("auto"); expect(style.userSelect).not.toBe("none");
    }
    const island = host.querySelector("[contenteditable=false]")!;
    expect(getComputedStyle(island).cursor).toBe("default"); expect(getComputedStyle(island).caretColor).toBe("transparent");
    expect(getComputedStyle(host.querySelector("button")!).cursor).toBe("pointer");
    const textarea = host.querySelector("textarea")!; textarea.focus(); textarea.setSelectionRange(0, 4);
    expect(document.activeElement).toBe(textarea); expect(textarea.selectionEnd).toBe(4);
  });
  it("disabled conserva not-allowed e readonly continua selecionavel", () => {
    host.innerHTML = '<button disabled><span>Enviar</span></button><input disabled><textarea disabled></textarea><select disabled></select><div role="button" aria-disabled="true"><span>Indisponivel</span></div><input readonly value="SKU-DEMO-1">';
    for (const element of host.querySelectorAll(":disabled, button span, [aria-disabled=true], [aria-disabled=true] span")) expect(getComputedStyle(element).cursor).toBe("not-allowed");
    const readonly = host.querySelector<HTMLInputElement>("input[readonly]")!;
    expect(getComputedStyle(readonly).cursor).toBe("text"); expect(getComputedStyle(readonly).userSelect).not.toBe("none");
    readonly.focus(); readonly.select(); expect(readonly.selectionEnd).toBe(readonly.value.length);
  });
  it("mantem intactas as excecoes especificas da apresentacao", () => {
    host.innerHTML = '<div id="goflow-presentation"><h1 tabindex="-1">Titulo</h1><button><span>Pular</span></button><button disabled>Pendente</button><textarea>Mensagem</textarea></div>';
    const title = host.querySelector("h1")!, input = host.querySelector("textarea")!;
    expect(getComputedStyle(title).cursor).toBe("default"); expect(getComputedStyle(title).caretColor).toBe("transparent");
    expect(getComputedStyle(title).userSelect).toBe("none");
    expect(getComputedStyle(host.querySelector("button span")!).cursor).toBe("pointer");
    expect(getComputedStyle(host.querySelector("button:disabled")!).cursor).toBe("default");
    expect(getComputedStyle(input).cursor).toBe("text"); expect(getComputedStyle(input).caretColor).toBe("auto");
    expect(getComputedStyle(input).userSelect).toBe("text");
  });
});
