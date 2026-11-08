# Integração operacional

As quatro rotas `/`, `/estoque`, `/compras` e `/oportunidades` consomem o mesmo recurso
do provider persistente. O cabeçalho identifica operação, origem e referência atuais.
Nenhuma página importa arquivos do desafio ou recebe registros importados via props
de Server Components. HTML estático e metadados contêm somente demonstração independente.

O layout fornece apenas o resultado sintético inicial ao provider, evitando repetir
a geração e o planejamento da demo na hidratação. Esse caminho não recebe importações.

## Demonstração e fonte ativa

`src/lib/operations/demo.ts` gera 500 SKUs, oito fornecedores e 120 dias de posições,
com vendas e recebimentos conciliados. Não usa arquivos, relógio, aleatoriedade ou
informações do desafio. Inclui unidades e caixas, MOQ, pendências, descontinuados,
saldo zero, calendários esparsos, excesso e baixo giro. Linhas ausentes não autorizam
o motor a preencher zeros. Parâmetros demonstrativos são independentes e identificados.
O gerador pequeno anterior permanece como API legada/fixture de regressão. As páginas
pedem explicitamente o modelo operacional público de 500 SKUs, inclusive no SSR.

`computeOperation` utiliza exclusivamente a operação recebida OU a demo. Reutiliza
analytics e o Smart Buying, sem concatenar origens ou duplicar fórmulas. O presenter
converte os resultados em DTOs. Oportunidades vêm dos critérios existentes de excesso,
baixa movimentação e descontinuação; categorias podem sobrepor capital. Não há receita
garantida, desconto executado ou estimativa inventada de lucro/economia.

`resource.ts` encerra o Worker anterior, remove resultados anteriores antes de calcular
e descarta respostas por revisão/identidade. Erro/carregamento de importação não usa
fallback da demo. O recurso acompanha o provider na navegação. Somente resultados
sintéticos são cacheados globalmente; importados permanecem em memória da aba.
Limpar restaura a demo e remove referências ativas à importação. Refresh pode apagar
a sessão, conforme o Flow Import.

O Worker de análise recebe dataset/parâmetros por structured clone local e devolve
métricas, DTOs e propostas. Termina ao devolver o resultado. Não há upload, API route,
Server Action, Groq, persistência ou logs de registros. Requisições normais de assets
e navegação Next não contêm o payload operacional. ESLint bloqueia rede, armazenamento
e console no módulo operacional.

## Motores parametrizados

`analyzeOperationalDataset` exige referência e configuração explícitas e reutiliza o
corpo de analytics. Defaults metodológicos documentados: saldo somente na referência,
três recebimentos para suficiência, horizonte de reposição de média mais um desvio,
excesso de noventa dias e baixo giro de sessenta. Referência e janela vêm da operação.
As APIs legadas preservam comportamento e testes.

`createOperationalBuyingPlan` exige referência, horizonte, orçamento em centavos,
janela, meta e taxas. Não herda orçamento/teto financeiro, horizonte ou referência
do case. Dados incompletos, datas incompatíveis e valores inseguros são recusados.
Para limitar a projeção/ponte, o fim do horizonte deve estar até 366 dias após a base.
Reutilizam-se necessidades, alternativas, priorização determinística e validação final.
MOQ é comercial; custo usa o equivalente físico. Recebidos já estão no saldo;
pendentes não são creditados e pedidos anteriores não debitam novamente o orçamento.
Carregamento usa taxas explícitas, separadas da aquisição.

A emissão proposta utiliza o início do horizonte. O cenário operacional é proxy
constante, sem campanhas inferidas e **sem buffer calibrado**. Não se aplica o quantil
fixo do case à meta informada: meta é objetivo, não garantia. Risco/cobertura/lead time
continuam calculados pelo analytics. Lacunas e censura podem impedir propostas.
Não há envio de pedidos ou alegação de ótimo global.

## Interface, compatibilidade e verificação

Visão geral/estoque reutilizam componentes existentes. Listas têm exibição incremental
para limitar DOM, mantendo filtros sobre o conjunto completo. Compras mostra orçamento,
propostas, critérios, alternativas, alertas e bloqueios por SKU. Oportunidades filtra
sinais calculados. O alias interno `sales30` é preservado, mas seu conteúdo e rótulo
seguem a janela explicitamente escolhida. Indisponível não vira zero.

O helper legado `prepareImportedEngineInputs` conserva sua prévia histórica sem
executar compras; não é o seletor das quatro abas. A integração ativa usa o serviço
operacional parametrizado.

Testes `operations.test.ts` e `operational-pages.test.tsx` usam fixtures sintéticas,
conferência independente do ledger, finanças, MOQ, temporalidade, pendências, troca,
limpeza e erros. UI usa componentes/provider reais e transporte simulado de rotas e
Worker; não equivale a E2E em navegador completo.
Verificação: `npm test -- --run`, `npm run lint`, `npm run build`.
Pós-build confere as quatro páginas como sintéticas e inspeciona artefatos/traces
por referências privadas; não é um classificador universal de segredos.
