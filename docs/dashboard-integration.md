# Integração segura do dashboard

## Causa da ausência de indicadores

src/app/page.tsx renderizava travessões e textos fixos de espera. A rota dinâmica
de estoque também tinha apenas um estado vazio. Nenhuma das páginas importava
ou chamava o motor. Portanto, não havia processamento em andamento nem chamada
de dados incompleta: faltava a camada de integração.

## Origem adotada

A aplicação exibe SOMENTE demonstração sintética independente, identificada
como goflow-demo-v1. Não representa resultados de uma operação real.

O leitor de originais em private/analytics-local.mts é um CLI privado ignorado pelo
Git, não um serviço autenticado. A arquitetura atual não oferece autorização
por usuário ou isolamento de acesso aos resultados privados no navegador.
Por isso não foi conectado à interface. Os resultados reais permanecem nos
relatórios locais já existentes; não foram lidos para gerar a demonstração.

A documentação de segurança do Next.js recomenda uma camada de acesso com
autorização e DTOs mínimos. server-only impede importação do módulo em componentes
client, mas os dados passados para renderização ainda podem alcançar HTML/RSC.
Um Server Component sozinho não torna confidenciais os valores exibidos.
Fonte: [Segurança de dados no Next.js](https://nextjs.org/docs/app/guides/data-security).

Não existe argumento de origem, toggle, variável de ambiente, query string,
rota privada de ativação, API, server action ou fallback para arquivos originais.

## Fluxo

src/lib/dashboard/demo-dataset.ts
-> parseTable / normalizeTables
-> analyzeDataset (motor existente, configuração padrão)
-> presentation.ts (DTOs de apresentação)
-> service.ts (server-only, cache por renderização)
-> Visão geral e Saúde do estoque.

demo-dataset.ts contém dez cenários escritos independentemente: códigos e nomes
DEMO, custos, quantidades, posições, vendas e compras fictícias. Não lê arquivos,
não amostra o histórico privado e não reutiliza resultados auditados.
Os cenários incluem dados completos, dias ausentes, saldo negativo, zero,
descontinuado e ausência de histórico. São fixtures para demonstrar indicadores,
não uma reconstrução contábil realista de movimentos.

presentation.ts não reimplementa cobertura, risco, excesso, demanda ou lead time.
Usa os resultados do motor; apenas formata, associa metadados sintéticos e organiza
contagens de estados já calculados. Os componentes não contêm fórmulas de negócio.

## Telas conectadas

- /: valor ao custo, vendas observadas em 30 dias, risco crítico, excesso potencial,
  distribuição de risco, capital por status, baixa movimentação e janelas 30/60/90.
- /estoque: catálogo, valor ao custo, disponibilidade de cobertura e anomalias;
  lista por SKU com saldo, valor, vendas observadas, cobertura, lead time e critérios.
- Busca local por SKU, nome e marca, insensível a acentos/maiúsculas; filtros
  combinados de marca, status e risco; limpeza e estado sem resultados.
- O atalho de marcas do header leva aos filtros da lista. Os filtros não alteram
  os KPIs do catálogo completo, como explicado na tela.
- As demais quatro rotas continuam informativas; go.agent não executa ações.

Os clientes recebem somente StockRowModel, com identificadores e nomes
sintéticos, valores formatados e explicações. Não recebem registros CSV,
fornecedores, datas de pedidos/recebimentos, hashes ou referências de origem.

## Interpretação e indisponibilidade

A base continua em 18/04/2037. Janelas incluem a base e os critérios do motor
permanecem inalterados; não foram relaxados para preencher a interface.

Dinheiro é formatado em pt-BR a partir de centavos; datas em pt-BR com UTC.
Zero válido é mostrado como zero. null/valor não finito vira Indisponível.
Saldo negativo continua visível como anomalia, sem subtrair capital válido.
Sem evidência suficiente ou com possível censura, cobertura permanece indisponível.
Lead time mostra média descritiva e, nos detalhes, n, suficiência, desvio amostral
e pendências; não transforma pedidos abertos em recebidos.

Nível de serviço, receita em risco e tendências diárias permanecem indisponíveis.
O motor não calcula demanda real, vendas perdidas, previsões ou execução do agente.
Janelas de venda são acumuladas e sobrepostas; não devem ser somadas.
Capital de baixa movimentação pode sobrepor capital em excesso.
A deduplicação continua sendo política exploratória, conforme analytics-engine.md.

## Prerenderização e inspeção

Sem Cache Components ou APIs dinâmicas nestas páginas, o Next.js 16 prerenderiza
/ e /estoque como rotas estáticas no build atual. Isso é aceitável aqui porque
o serviço usa apenas inputs sintéticos versionáveis. Não há indicador privado
no caminho de renderização. Forçar renderização dinâmica não substituiria
autorização e não foi usado para tentar tornar resultados privados seguros.
Fonte: [Cache e configuração de rotas no Next.js 16](https://nextjs.org/docs/app/guides/caching-without-cache-components).

O hook postbuild executa scripts/check-dashboard-build.mts:
1. inspeciona .next/server, .next/static, public/ e traces NFT de raiz;
2. rejeita CSVs, referências aos relatórios/CLI privados e dependências em
   data/, private/, challenge-private/ ou references-private/ nos traces;
3. exige o marcador goflow-demo-v1 e SKUs DEMO no HTML das duas telas.

Essa inspeção complementa os testes de isolamento de imports e a revisão do fluxo
de dados. Ela verifica artefatos conhecidos e traces; não é um detector universal
de todo texto confidencial que alguém possa copiar manualmente no futuro.
A proteção principal é o serviço sem I/O e de origem sintética fixa.
O verificador não lê CSVs ou relatórios privados.

O JSON de escopo do motor foi salvo sem BOM para o Turbopack consumi-lo.
A inicialização pesada do ESLint nos testes de isolamento acontece uma vez em
beforeAll, preservando as seis asserções de bloqueio existentes.

## Como verificar

~~~sh
npm run test:run
npm run lint
npm run build
npm run check:dashboard-build
npm run start -- --hostname 127.0.0.1 --port 3100
~~~

Abra http://127.0.0.1:3100/ e /estoque. Confira o aviso de dados sintéticos
e a data-base. Busque DEMO-FLOW-01, combine filtros e consulte Ver critérios.
A origem pode ser conferida também no atributo data-source=goflow-demo-v1.

Os testes comparam os DTOs aos resultados de analyzeDataset e renderizam as
duas páginas com o serviço. Um teste injeta um valor sentinela na resposta do
serviço para verificar que a página não mantém KPI fixo. Os testes da integração
bloqueiam leitura/escrita de arquivos e usam somente fixtures sintéticas.
O verificador de build também tem testes negativos para artefatos privados.
Nenhuma dependência foi instalada para esta integração.
