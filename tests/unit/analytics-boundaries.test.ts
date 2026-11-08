import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

describe("isolamento dos dados privados na aplicação", () => {
  const eslint = new ESLint();
  beforeAll(async () => { await eslint.calculateConfigForFile("src/boundary-check.ts"); }, 20_000);
  it.each([
    'import { readFile } from "node:fs/promises";',
    'import data from "../../private/analytics-result.json";',
    'const data = import("../../private/analytics-local.mts");',
    'const data = import("../../data/modulo");',
    'const data = import(caminho);',
    'const data = require("node:fs");',
  ])("bloqueia acesso privado ou indireto: %s", async (code) => {
    const [result] = await eslint.lintText(code, { filePath: "src/boundary-check.ts" });
    expect(result.messages.some((m) => m.ruleId === "no-restricted-imports" || m.ruleId === "no-restricted-syntax")).toBe(true);
  });
});
