import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function isDistributablePath(name: string): boolean {
  const parts = name.replaceAll("\\", "/").toLowerCase().split("/");
  if (!name || path.isAbsolute(name) || parts.some((part) => !part || part === ".." || part.includes(":"))) return false;
  if (parts.some((part) => [".git", ".next", ".vercel", "node_modules", "data", "private", "challenge-private", "references-private", "coverage", "build", "out", ".vitest"].includes(part))) return false;
  const base = parts.at(-1)!;
  return !(base.startsWith(".env") && base !== ".env.example") &&
    !/\.(?:csv|pem|key|p12|pfx|log|tsbuildinfo)$/.test(base) &&
    !/^data-audit\.(?:md|json)$/.test(base) && base !== "next-env.d.ts";
}

/** Copies the reviewed working tree, never its history or build. Does not initialize Git. */
export async function preparePublicRelease(source: string, destination: string): Promise<number> {
  const root = await realpath(source);
  const parent = await realpath(path.dirname(path.resolve(destination)));
  const target = path.join(parent, path.basename(destination));
  const relative = path.relative(root, target);
  if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Destino deve ficar fora do repositório original.");
  const names = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0"))].filter(isDistributablePath).sort();
  const reviewed: { name: string; bytes: Buffer }[] = [];
  for (const name of names) {
    const file = path.resolve(root, name);
    try {
      if (!(await lstat(file)).isFile() || await realpath(file) !== file) throw new Error("Arquivo irregular na distribuição.");
      reviewed.push({ name, bytes: await readFile(file) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // No overwrite, deletion, checkout, Git initialization or network operation.
  await mkdir(target);
  for (const { name, bytes } of reviewed) {
    const file = path.join(target, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx" });
  }
  const manifest = reviewed.map(({ name, bytes }) => ({ path: name, sha256: createHash("sha256").update(bytes).digest("hex") }));
  await writeFile(path.join(target, "RELEASE_MANIFEST.json"), JSON.stringify({ version: 1, historyIncluded: false, files: manifest }, null, 2), { flag: "wx" });
  return reviewed.length;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const destination = process.argv[2];
  if (!destination) throw new Error("Informe um diretório novo fora do repositório original.");
  preparePublicRelease(fileURLToPath(new URL("../", import.meta.url)), destination)
    .then((count) => console.log(`Cópia sem histórico preparada: ${count} arquivos. Nenhum commit ou push executado.`))
    .catch(() => { console.error("Falha ao preparar cópia. O destino deve ser novo e conter somente arquivos regulares revisados."); process.exitCode = 1; });
}
