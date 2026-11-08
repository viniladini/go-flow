# Flow Import

## Contrato e arquitetura

Rota `/importar`. Contrato `goflow-operational-csv/v1`, definido pelos cabeçalhos
exportados em `src/lib/analytics/normalization.ts` (COLUMNS). São cinco tabelas:
catálogo de SKUs, fornecedores, vendas diárias, estoque diário e compras.
Não há integração ERP, mapeamento universal ou novos campos obrigatórios no CSV.

`src/lib/flow-import/` separa contratos, reconhecimento, parâmetros, validação,
templates, Worker, sessão e adaptadores. O provider client-side fica no layout
persistente. Navegação interna mantém uma única referência ao dataset normalizado;
recarregar, fechar a aba ou limpar elimina a sessão. Não existe recuperação automática.

Uma extração mínima em analytics disponibiliza `normalizeOperationalTables` com
referência explicitamente informada, reutilizando integralmente as regras auditadas.
`normalizeTables` mantém sua assinatura, defaults e limite legado, sem mudar testes
ou comportamento dos motores existentes. O acúmulo interno de referências de duplicatas
usa append em vez de copiar todo o vetor a cada linha, eliminando custo quadrático
sem mudar registros aceitos, política ou rastreabilidade. Não se duplica fórmula.

## Reconhecimento e formato

O nome do arquivo não determina seu tipo. A comparação usa conjuntos exatos de
colunas, largura dos registros e amostra de tipos (até vinte registros). A ordem
das colunas pode variar; nomes, capitalização e campos devem respeitar COLUMNS.
Conjuntos que correspondem a mais de um tipo exigem escolha manual. Corrigir a
classificação não dispensa validação das colunas nem permite ignorar campos extras.
A confirmação completa sempre valida todas as linhas elegíveis, não apenas a amostra.

CSV UTF-8, separador vírgula, aspas duplas, BOM opcional, LF/CRLF e quebras dentro
de células entre aspas são aceitos. Não há conversão silenciosa de separadores,
decimal brasileiro, espaços externos ou datas ambíguas. Campos textuais são dados,
nunca HTML ou código. O importador não executa fórmulas de planilhas.

Datas: ISO estrito AAAA-MM-DD. Dinheiro no CSV: decimal com ponto, sem separador de
milhar, até duas casas; conversão exata para centavos inteiros. Quantidades: inteiros
seguros. MOQ na unidade comercial; `un` tem fator físico um e `cx 12 un`, doze.
Recebimento vazio é pendente. Custo do catálogo refere-se à unidade física conforme
a interpretação já documentada pelo motor analítico.

## Modelo canônico e parâmetros

`ImportedOperation` contém versão, origem `imported_local`, parâmetros explícitos,
Dataset compatível com analytics e metadados da sessão. Dataset mantém as cinco
entidades, referências dos registros lógicos CSV e issues. Nomes dos arquivos
selecionados ficam somente nos metadados em memória, sem substituir nomes lógicos
de tabela na rastreabilidade. Não há cópias de strings CSV na sessão concluída.

O formulário começa vazio e exige operação, referência, início/fim do horizonte,
orçamento, meta de serviço, capital anual, armazenagem mensal, desconto máximo e
janela observada. Não utiliza parâmetros particulares do desafio nem defaults da
demonstração. O formulário aceita ponto ou vírgula decimal, sem milhar. Orçamento
zero é permitido; dinheiro deve caber em centavos seguros. Percentuais devem estar
entre zero e cem, com serviço estritamente positivo. São validações do produto,
não garantias estatísticas. Horizonte posterior à referência, com até 366 dias.

Não há leitura de Markdown nesta versão. `parametros.md` deve ser consultado pelo
usuário localmente e transcrito no formulário. Campanhas, crescimento sazonal e
previsões não são inferidos. Não se aplicam campanhas do case à operação importada.

## Erros, alertas e duplicatas

Impedem a ativação: tipo ausente/duplicado/não classificado, colunas inválidas,
sintaxe, campos obrigatórios, valores/datas inválidos, referências inexistentes,
conflitos por chave lógica e totais monetários fora da faixa segura.
Nenhum dataset parcial é ativado após erro, mesmo havendo linhas aproveitáveis.

Alertas: saldo negativo, duplicatas exatas, históricos incompletos, escassez de
recebimentos, pendências, divergências de cadastro histórico, custo zero e exclusões
temporais. Antes de processar, o usuário deve reconhecer os alertas. Isso não torna
a política exploratória operacionalmente aprovada.

A política existente `exploratory_exact_dedup_conflict_quarantine` permanece:
duplicatas exatamente iguais são consolidadas em memória com todas as referências;
variantes conflitantes de uma chave são quarentenadas e bloqueiam a importação.
Não há edição ou exclusão nos arquivos originais. Históricos futuros são excluídos;
recebimentos futuros tornam-se pendentes. Saldos negativos não viram disponibilidade.
Ausência de venda não vira zero; censura e lacunas podem impedir a proxy de demanda.
Compras recebidas não são somadas novamente ao saldo de estoque.

Resumo por arquivo mostra origem, período informado e contagens recebidas/aceitas.
O período informado inclui registros futuros, identificados pelos alertas; as
entidades canônicas contêm apenas observações elegíveis até a referência.
Issues exibem arquivo, campo e registro lógico quando disponíveis, sem amostras de
células. Uma linha lógica CSV pode ocupar várias linhas físicas.
No máximo oitenta ocorrências são mostradas, priorizando erros; contagens e bloqueio
consideram todas as ocorrências. A rastreabilidade canônica não é descartada.

## Worker, limites e privacidade

O Worker recebe objetos File locais, lê sequencialmente, conserva o conteúdo durante
revisão e validação e envia somente reconhecimento/resumo à interface. Após Processar,
o dataset normalizado atravessa structured clone uma vez; o Worker é encerrado.
O provider do layout raiz é dono do Worker e do wizard; sair da tela por navegação
client-side não o encerra. Limpar, substituir ou desmontar o provider raiz encerra o
Worker. Resultados obsoletos são descartados por identidade e revisão da sessão.
Referência técnica: [MDN, Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

Sem upload, API route, Server Action, chamadas externas, logs dos arquivos,
localStorage, sessionStorage, cookies, IndexedDB ou integração com IA.
ESLint bloqueia rede, persistência e console no módulo e nos componentes de importação.
Os nomes, valores e metadados reais só aparecem na interface local após seleção,
nunca em SSR, metadados HTML, URLs ou artefatos estáticos. Temas continuam armazenando
somente a preferência visual independente, conforme o design system.

Limites conservadores: cinco arquivos por seleção, 35 MiB por arquivo, 100 MiB no
total e quinhentos mil registros por arquivo. Ainda há parsing e normalização em
memória, sem streaming, podendo exigir memória adicional. Navegadores sem Worker
recebem mensagem explícita, sem fallback para servidor. O progresso indica arquivos
lidos, estruturas verificadas e normalização real; não usa contagem simulada.

## Como importar e testar

Execute `npm run dev`, abra `/importar`, baixe os cinco modelos fictícios independentes
ou selecione cinco arquivos locais. Uma etapa principal é exibida por vez. A leitura
dos cinco arquivos reconhecíveis avança para Identificar; seleção incompleta, estrutura
inválida ou tipos repetidos permanece em Selecionar com explicação. Correspondências
ambíguas exigem correção e confirmação. Confirme as correspondências, preencha os
parâmetros e valide. Erros bloqueiam; alertas permanecem visíveis e exigem reconhecimento
e ação explícita de processamento. Validação sem erros/alertas processa automaticamente.
Voltar mantém arquivos, associações, parâmetros e relatório, sem reler nem normalizar
novamente. Ao editar parâmetros ou associações, o relatório e o reconhecimento dos
alertas são invalidados. Eventos, não efeitos de renderização, comandam os avanços;
guardas síncronas impedem validações/processamentos duplicados.
Modelos são exemplos de formato com histórico
deliberadamente curto; seus registros não devem ser tratados como operação real.
Verifique a origem no cabeçalho. Navegue internamente e retorne à conferência;
o dataset permanece. Limpar volta à demonstração; nova seleção substitui a origem
anterior, incluindo os parâmetros previamente preenchidos. Limpar e substituir exigem
confirmação em diálogo; cancelar preserva tudo. Conclusão mostra resumo e link client-side
para Visão geral. Recarregar deve eliminar
os dados. Use DevTools/Network para confirmar que
nenhum arquivo ou registro é enviado; o carregamento estático do Worker é esperado.

Testes usam fixtures inteiramente sintéticas e um conjunto maior gerado em memória:
`npm run test:run -- tests/unit/flow-import.test.ts tests/unit/flow-import-worker.test.ts`.
Testes adicionais: `flow-import-wizard.test.ts` e `flow-import-navigation.test.tsx`.
A integração monta provider, shell e tela reais com ReactDOM/happy-dom, trocando
rotas client-side com transporte de navegação simulado. Verifica as seis abas, retorno,
rascunho com Worker vivo, resumo concluído, confirmação, limpeza e substituição.
Não substitui uma verificação visual em um navegador completo com roteador Next.js.
Validação geral: `npm test -- --run`, `npm run lint`, `npm run build`.
O pós-build verifica ausência de CSVs/dependências privadas nos artefatos públicos.

## Integração e próxima etapa

O cabeçalho identifica a fonte ativa. As quatro abas operacionais acompanham a sessão,
com cálculos em Worker local, conforme [integração operacional](operational-integration.md).
`getImportedSkuEvidence` reutiliza estoque, vendas, lead time, cobertura e risco das
funções puras, com referência e janela explícitas da operação, sem limite de data do case.
Os critérios metodológicos continuam explícitos: saldo somente na referência, três
recebimentos para suficiência e buffer de lead time de um desvio; não são parâmetros
financeiros inferidos. Nenhuma análise volumosa é disparada automaticamente na UI.

O helper legado `prepareImportedEngineInputs` mantém sua prévia histórica para
compatibilidade. A integração ativa utiliza `computeOperation` e a nova entrada
`createOperationalBuyingPlan`, com política completa informada pelo usuário e sem
fallback para regras do case. A API legada e seus testes são preservados.

## Correção 13.1: ciclo de vida e fluxo guiado

O provider já ficava no layout raiz e os links internos já usavam next/link.
O defeito reproduzido estava no rascunho: a página mantinha leitura, associações,
parâmetros e validação em estados locais, com cleanup que encerrava o Worker ao sair.
Só o resultado após Processar era compartilhado. Sair antes do commit perdia o
dataset mantido no Worker, mesmo quando a interface de página era restaurada.
O controller do wizard agora acompanha o provider, inclusive durante processamento.
Não há singleton no servidor nem persistência em disco ou armazenamento do navegador.

O painel central monta uma única etapa, com conteúdo extenso rolável dentro dela,
ações acessíveis e foco no título ao trocar de etapa. A entrada usa opacity/transform
por 160 ms, desativados por prefers-reduced-motion. Resumo concluído é restaurado
ao voltar a `/importar`; a fonte ativa também alimenta as quatro abas operacionais.
