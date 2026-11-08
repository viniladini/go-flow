# Testes unitários

Os testes ficam em tests/unit/ e são descobertos pelo padrão *.test.{ts,mts,js,mjs}.
A configuração vitest.config.mts usa ambiente Node e importações explícitas de
test/expect do Vitest; o alias @/ aponta para src/, como no TypeScript da aplicação.

- npm test: modo watch em terminal interativo; em CI o Vitest executa uma vez.
- npm run test:run: execução única de todos os testes, adequada para CI.
- npm run data:audit:test: somente a suíte da auditoria, pelo mesmo Vitest.

Os seis testes existentes foram migrados do node:test, preservando os cenários
de parser, datas, duplicatas, unidades, MOQ e pendências. A conversão de unidades
é o teste inicial simples para conferir o funcionamento da configuração.
As funções TypeScript de scripts/data-audit.mts são carregadas pelo Vitest.

Use apenas entradas sintéticas criadas no próprio teste. Os testes não chamam
audit(), não executam o CLI da auditoria e não leem CSVs nem relatórios privados.
Não é necessário ter a pasta data/ para executar a suíte.

Configuração validada com Node 26 e Vitest 5.1.0. Essa versão do Vitest aceita
Node ^22.12.0, ^24.0.0 ou >=26.0.0. Para executar também o CLI TypeScript da
auditoria, use Node >=22.18 com suporte nativo a TypeScript.
Não foram adicionados ambiente DOM, plugins React ou ferramentas de cobertura.
