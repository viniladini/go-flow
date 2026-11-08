import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,mts,js,mjs}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/private/**", "**/data/**", "**/scripts/**", "**/tools/**", "**/*.csv", "node:fs", "node:fs/*", "fs", "fs/*"],
          message: "Dados privados são acessíveis somente por ferramentas locais fora de src/.",
        }],
      }],
      "no-restricted-syntax": ["error", {
        selector: "ImportExpression[source.type!='Literal']",
        message: "Imports dinâmicos em src/ devem usar caminho literal verificável.",
      }, {
        selector: "ImportExpression[source.value=/private|\\.csv|scripts|tools|data|node:fs|^fs/]",
        message: "Não carregue arquivos ou ferramentas privadas na aplicação.",
      }, {
        selector: "CallExpression[callee.name='require']",
        message: "Use imports estáticos verificáveis na aplicação.",
      }],
    },
  },
  {
    files: ["src/lib/flow-import/**/*.{ts,tsx}", "src/lib/operations/**/*.{ts,tsx}", "src/lib/agent/session.ts", "src/components/agent-workspace.tsx", "src/components/operational-view.tsx", "src/components/flow-import.tsx", "src/components/import-session-provider.tsx"],
    rules: {
      "no-console": "error",
      "no-restricted-globals": ["error", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "navigator", "localStorage", "sessionStorage", "indexedDB", "caches"],
      "no-restricted-properties": ["error", ...["fetch", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "cookie", "XMLHttpRequest", "WebSocket", "EventSource"].map((property) => ({ property, message: "Flow Import processa dados apenas em memória, sem rede ou persistência." }))],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/agent/client.ts", "src/lib/agent/session.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/private/**", "**/data/**", "**/scripts/**", "**/tools/**", "**/*.csv", "node:fs", "node:fs/*", "fs", "fs/*", "groq-sdk", "groq-sdk/*", "**/agent/server", "**/agent/server.*", "**/agent/execution", "**/agent/execution.*"], message: "Clientes não podem acessar SDK, configuração ou execução do agente no servidor." }] }],
    },
  },
  { files: ["src/lib/agent/**/*.{ts,tsx}", "src/components/agent-workspace.tsx", "src/app/api/agente/route.ts"], rules: { "no-console": "error" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
