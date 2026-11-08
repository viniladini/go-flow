import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export function checkPublicText(name: string, content: string): void {
  const normalized = content.replace(/\\/g, "/").toLowerCase();
  for (const forbidden of ["analytics-local.mts", "analytics-result.json", "data-audit.md", "data-audit.json"]) {
    if (normalized.includes(forbidden)) throw new Error("Referência a artefato privado no output: " + name);
  }
}
async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
  }));
  return nested.flat();
}
async function findDashboardHtml(root: string, files: string[]): Promise<Map<string, string[]>> {
  const server = path.join(root, ".next", "server");
  const manifestPath = path.join(root, ".next", "prerender-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    routes: Record<string, { dataRoute?: string | null }>;
  };
  const appRoutes = JSON.parse(await readFile(path.join(root, ".next", "app-path-routes-manifest.json"), "utf8")) as Record<string, string>;
  const metadata = await Promise.all(files.filter((file) => file.startsWith(server + path.sep) && file.endsWith(".meta")).map(async (file) => ({
    file,
    cache: (JSON.parse(await readFile(file, "utf8")) as {
      routeCache?: { key: string; owner: { kind: string; sourceRoute: string }; isFallback: boolean };
    }).routeCache,
  })));
  const result = new Map<string, string[]>();
  for (const route of ["/", "/estoque", "/compras", "/oportunidades"]) {
    const dataRoute = manifest.routes?.[route]?.dataRoute;
    if (typeof dataRoute !== "string" || !dataRoute.startsWith("/") || !dataRoute.endsWith(".rsc")) {
      throw new Error(`Artefato estático esperado para a rota ${route} não consta em ${path.relative(root, manifestPath)} (dataRoute RSC ausente).`);
    }
    // Legacy App Router output follows dataRoute; scoped Next.js 16 output
    // records its route identity and cache key in the adjacent .meta file.
    const stem = dataRoute.slice(0, -4);
    const candidates = new Set([path.join(server, "app", stem + ".html")]);
    for (const { file, cache } of metadata) {
      if (cache && cache.owner.kind === "APP_PAGE" && appRoutes[cache.owner.sourceRoute] === route && !cache.isFallback && cache.key.endsWith("/$" + stem)) {
        candidates.add(file.slice(0, -5) + ".html");
      }
    }
    const found = [...candidates].filter((file) => files.includes(file));
    if (!found.length) {
      throw new Error(`HTML estático não encontrado para a rota ${route}. Candidatos: ${[...candidates].map((file) => path.relative(root, file)).join(", ")}. Inspecionados ${files.filter((file) => file.endsWith(".html")).length} HTMLs; confira os manifests e metadados do Next.js.`);
    }
    result.set(route, found);
  }
  return result;
}
export async function checkDashboardBuild(root: string = projectRoot): Promise<number> {
  const roots = [path.join(root, ".next", "server"), path.join(root, ".next", "static"), path.join(root, "public")];
  const files = (await Promise.all(roots.map(walk))).flat();
  const rootTraces = (await readdir(path.join(root, ".next"))).filter((name) => name.endsWith(".nft.json")).map((name) => path.join(root, ".next", name));
  files.push(...rootTraces);
  const privateRoots = ["data", "private", "challenge-private", "references-private"].map((name) => path.join(root, name).toLowerCase() + path.sep);
  for (const file of files) {
    if (file.toLowerCase().endsWith(".csv")) throw new Error("Arquivo CSV encontrado no output público.");
    if (!/\.(?:js|json|html|rsc|txt|map|svg|meta)$/.test(file)) continue;
    const text = await readFile(file, "utf8");
    checkPublicText(path.relative(root, file), text);
    if (file.startsWith(path.join(root, ".next", "static") + path.sep) && /GROQ_API_KEY|dangerouslyAllowBrowser/.test(text)) throw new Error("Configuração/SDK da Groq encontrado em artefato client-side.");
    if (file.endsWith(".nft.json")) {
      const trace = JSON.parse(text) as { files: string[] };
      for (const dependency of trace.files) {
        const resolved = path.resolve(path.dirname(file), dependency).toLowerCase();
        if (privateRoots.some((directory) => resolved.startsWith(directory))) throw new Error("Dependência privada no trace do build.");
      }
    }
  }
  for (const [route, pages] of await findDashboardHtml(root, files)) {
    for (const page of pages) {
      const html = await readFile(page, "utf8");
      if (!html.includes('data-source="goflow-demo-v1"') || !html.includes("DEMO-FLOW-")) {
        throw new Error("Origem sintética não confirmada no HTML da rota " + route);
      }
      if (html.includes('data-source="goflow-imported-v1"')) throw new Error("Origem importada incorporada ao HTML estático.");
    }
  }
  return files.length;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  checkDashboardBuild().then((count) => console.log("Build verificado: " + count + " arquivos inspecionados; HTML sintético confirmado, sem referências ou traces de artefatos privados."))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falha na inspeção do build."); process.exitCode = 1; });
}
