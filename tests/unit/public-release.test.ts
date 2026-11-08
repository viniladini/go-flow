import { describe, expect, it } from "vitest";
import { isDistributablePath } from "../../scripts/prepare-public-release.mts";
import { SYNTHETIC_RULES } from "@/lib/smart-buying";
import { DEFAULT_CONFIG } from "@/lib/analytics";
import { normalizeTables } from "@/lib/analytics/normalization";

describe("distribuicao limpa independente", () => {
  it("exclui historico, dados, segredos e builds anteriores", () => {
    for (const name of [".git/config", ".next/server/page.html", "data/arquivo.csv", "private/audit.json", ".env.local", ".env.production", "public/arquivo.csv", "node_modules/library/index.js", "docs/data-audit.md", "../outside.ts", "C:/outside.ts", "key.pem"]) expect(isDistributablePath(name), name).toBe(false);
  });
  it("inclui somente configuracao de ambiente vazia e fontes distribuiveis", () => {
    for (const name of [".env.example", "src/app/page.tsx", "package-lock.json", "docs/PRODUCT_SPEC.md", ".gitignore"]) expect(isDistributablePath(name), name).toBe(true);
  });
  it("perfil sintetico e analytics usam a mesma referencia explicita", () => {
    expect(SYNTHETIC_RULES.referenceDate).toBe("2037-04-18");
    expect(DEFAULT_CONFIG.referenceDate).toBe(SYNTHETIC_RULES.referenceDate);
    expect(SYNTHETIC_RULES.maxBudgetCents).toBe(86_400_000);
    expect(SYNTHETIC_RULES.targetServiceBps).toBe(9650);
  });
  it("normalizador legado continua rejeitando futuro em relacao ao perfil sintetico", () => {
    expect(() => normalizeTables([], "2037-04-19")).toThrow("referência permitida");
  });
});
