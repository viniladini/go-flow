import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
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
export async function checkDashboardBuild(): Promise<number> {
  const roots = [path.join(root, ".next", "server"), path.join(root, ".next", "static"), path.join(root, "public")];
  const files = (await Promise.all(roots.map(walk))).flat();
  const rootTraces = (await readdir(path.join(root, ".next"))).filter((name) => name.endsWith(".nft.json")).map((name) => path.join(root, ".next", name));
  files.push(...rootTraces);
  const privateRoots = ["data", "private", "challenge-private", "references-private"].map((name) => path.join(root, name).toLowerCase() + path.sep);
  for (const file of files) {
    if (file.toLowerCase().endsWith(".csv")) throw new Error("Arquivo CSV encontrado no output público.");
    if (!/\.(?:js|json|html|rsc|txt|map|svg)$/.test(file)) continue;
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
  for (const page of ["index.html", "estoque.html", "compras.html", "oportunidades.html"]) {
    const html = await readFile(path.join(root, ".next", "server", "app", page), "utf8");
    if (!html.includes('data-source="goflow-demo-v1"') || !html.includes("DEMO-FLOW-")) {
      throw new Error("Origem sintética não confirmada no HTML de " + page);
    }
    if (html.includes('data-source="goflow-imported-v1"')) throw new Error("Origem importada incorporada ao HTML estático.");
  }
  return files.length;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  checkDashboardBuild().then((count) => console.log("Build verificado: " + count + " arquivos inspecionados; HTML sintético confirmado, sem referências ou traces de artefatos privados."))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falha na inspeção do build."); process.exitCode = 1; });
}
