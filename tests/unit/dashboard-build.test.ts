import { expect, it } from "vitest";
import { afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkDashboardBuild, checkPublicText } from "../../scripts/check-dashboard-build.mts";

it.each(["analytics-local.mts", "analytics-result.json", "data-audit.md", "data-audit.json"])("recusa artefato privado no output: %s", (name) => {
  expect(() => checkPublicText("output.js", "../../private/" + name)).toThrow();
});
it("permite schemas e cenários sintéticos sem confundi-los com registros originais", () => {
  expect(() => checkPublicText("output.js", 'skus.csv DEMO-FLOW-01 goflow-demo-v1')).not.toThrow();
});

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const demoHtml = '<main data-source="goflow-demo-v1">DEMO-FLOW-01</main>';
async function fixture(scoped: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), "goflow-build-"));
  temporaryRoots.push(root);
  const put = async (relative: string, text: string) => {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  await Promise.all(["public", ".next/static", ".next/server"].map((name) => mkdir(path.join(root, name), { recursive: true })));
  const routes: Record<string, { dataRoute: string }> = {};
  const appRoutes: Record<string, string> = {};
  const htmlPaths: string[] = [];
  for (const route of ["/", "/estoque", "/compras", "/oportunidades"]) {
    const stem = route === "/" ? "/index" : route;
    // Include a route group to verify discovery uses the manifest mapping.
    const sourceRoute = route === "/" ? "/(dashboard)/page" : route + "/page";
    const key = `/route-cache/APP_PAGE/fixture-${htmlPaths.length}/$${stem}`;
    const base = scoped ? ".next/server" + key : ".next/server/app" + stem;
    routes[route] = { dataRoute: stem + ".rsc" };
    appRoutes[sourceRoute] = route;
    htmlPaths.push(base + ".html");
    await put(base + ".html", demoHtml);
    await put(base + ".meta", JSON.stringify({ routeCache: { key, owner: { kind: "APP_PAGE", sourceRoute }, isFallback: false } }));
  }
  await put(".next/prerender-manifest.json", JSON.stringify({ version: 4, routes }));
  await put(".next/app-path-routes-manifest.json", JSON.stringify(appRoutes));
  return { root, put, htmlPaths };
}

it.each([false, true])("confirma as quatro rotas no layout scoped=%s", async (scoped) => {
  const { root } = await fixture(scoped);
  await expect(checkDashboardBuild(root)).resolves.toBe(8);
});
it.each([false, true])("falha com diagnóstico quando falta HTML, scoped=%s", async (scoped) => {
  const { root, htmlPaths } = await fixture(scoped);
  await rm(path.join(root, htmlPaths[0]));
  await expect(checkDashboardBuild(root)).rejects.toThrow(/HTML estático não encontrado para a rota \/\. Candidatos:.*index.html/);
});
it("recusa manifest sem prerender da rota raiz", async () => {
  const { root, put } = await fixture(true);
  await put(".next/prerender-manifest.json", '{"routes":{}}');
  await expect(checkDashboardBuild(root)).rejects.toThrow(/rota \/.*dataRoute RSC ausente/);
});
it("não aceita HTML de outra rota como substituto", async () => {
  const { root, put, htmlPaths } = await fixture(true);
  await rm(path.join(root, htmlPaths[0]));
  await put(".next/server/unrelated.html", demoHtml);
  await expect(checkDashboardBuild(root)).rejects.toThrow("HTML estático não encontrado para a rota /");
});
it.each([false, true])("preserva rejeições de privacidade no build completo, scoped=%s", async (scoped) => {
  const { root, put, htmlPaths } = await fixture(scoped);
  for (const name of ["analytics-local.mts", "analytics-result.json", "data-audit.md", "data-audit.json"]) {
    await put(htmlPaths[0], demoHtml + name);
    await expect(checkDashboardBuild(root)).rejects.toThrow("Referência a artefato privado");
  }
  await put(htmlPaths[0], demoHtml + '<div data-source="goflow-imported-v1"></div>');
  await expect(checkDashboardBuild(root)).rejects.toThrow("Origem importada incorporada");
  await put(htmlPaths[0], "<main>sem identificação sintética</main>");
  await expect(checkDashboardBuild(root)).rejects.toThrow("Origem sintética não confirmada");
});
it.each([
  ["public/leak.csv", "coluna", "Arquivo CSV"],
  [".next/static/client.js", "GROQ_API_KEY", "Configuração/SDK da Groq"],
  [".next/static/client.js", "dangerouslyAllowBrowser", "Configuração/SDK da Groq"],
  [".next/server/app/leak.meta", '{"note":"analytics-result.json"}', "Referência a artefato privado"],
  [".next/next-server.js.nft.json", '{"files":["../private/secret.json"]}', "Dependência privada no trace"],
  [".next/server/page.js.nft.json", '{"files":["../../data/secret.json"]}', "Dependência privada no trace"],
])("recusa vazamento em %s", async (file, content, message) => {
  const { root, put } = await fixture(true);
  await put(file, content);
  await expect(checkDashboardBuild(root)).rejects.toThrow(message);
});
