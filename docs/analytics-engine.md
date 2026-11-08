# Motor analítico determinístico

## Escopo e arquitetura

Atualização operacional: as quatro abas usam a fonte ativa, incluindo importação
exclusivamente client-side em Worker. A nova entrada `analyzeOperationalDataset`
reutiliza as mesmas fórmulas com referência/configuração explícitas, sem o limite
de data da API legada. Consulte [integração operacional](operational-integration.md).
As descrições anteriores de demonstração/CLI abaixo documentam os caminhos legados;
nenhum arquivo ou agregado privado é disponibilizado pelo servidor.

O motor em src/lib/analytics/ contém somente regras puras. Não importa fs, CSVs,
relatórios ou o CLI da auditoria. Não existe endpoint de dados privados. A integração visual usa somente cenários sintéticos independentes, descritos em dashboard-integration.md. O go.agent não executa ações nesta etapa.

- types.ts: contratos das cinco entidades confirmadas no dicionário e resultados.
- primitives.ts: parser CSV, datas, números, unidades e política de duplicatas
  extraídos da auditoria existente; scripts/data-audit.mts mantém seus exports.
- normalization.ts: schemas, parsing tabular, validação e normalização sem I/O.
- inventory.ts, sales.ts, lead-time.ts, risk.ts e movement.ts: regras independentes.
- math.ts: datas UTC, estatísticas e operações inteiras com detecção de overflow.
- index.ts: configuração, cálculo por SKU, consulta e consolidação do dashboard.

O package.json local ao diretório analítico define ESM para o CLI Node, sem alterar o tipo de módulo do projeto Next.

As colunas originais estão enumeradas em COLUMNS. Campos com sufixo _centavos
e quantidade_unidades são derivados e não novas colunas de origem. Os tipos Raw*
documentam o texto original, e os tipos normalizados preservam unidade e MOQ.

## Normalização e qualidade

Fluxo: leitura local -> parseTable -> normalizeTables -> analyzeDataset.
parseTable verifica exatamente os cabeçalhos e conta registros CSV lógicos,
incluindo campos entre aspas com quebras de linha; não confundir número do
registro com linha física. Falhas de sintaxe/cabeçalho interrompem o parsing.
Largura inválida gera issue e quarentena, sem truncamento.

Os arquivos originais nunca são modificados. Datas são ISO estritas, em UTC.
Custos e receita são centavos inteiros não negativos, sem arredondamento
silencioso; mais de duas casas decimais são rejeitadas. Quantidades, saldos e MOQ
são inteiros seguros. Saldo negativo é preservado como anomalia, não corrigido.
Venda negativa, receita inválida e datas impossíveis são colocadas em quarentena.
Preço/custo é o cadastro disponível; não existe histórico de preços/custos ou
status, portanto não se atribui retrospectivamente data de descontinuação.

Rastreabilidade:
- source.file e source.records identificam todas as ocorrências aceitas.
- issues contêm arquivo, registros, código, severidade e SKU/data quando conhecidos.
- O CLI privado registra SHA-256 das cinco origens e verifica estabilidade ao final.
- As saídas por SKU não incluem registros brutos; os issues completos ficam no
  resultado local separado, não em DTOs para componentes.

Política: exploratory_exact_dedup_conflict_quarantine. Reutiliza-se a política
exploratória da auditoria: repetições exatamente iguais nos campos decodificados
mantêm uma ocorrência e todas as referências; todas as variantes de uma chave
lógica conflitante são excluídas. Nada é excluído silenciosamente. Chaves:
SKU; fornecedor; SKU+data para venda/estoque; po_id+SKU para compra.
A política NÃO foi promovida a tratamento aprovado para decisões operacionais:
todo dashboard é explicitamente exploratory e cada SKU registra esse aviso.
Antes de uso operacional, a origem das duplicatas e a granularidade de compras
precisam de confirmação.

As referências SKU/fornecedor são verificadas; entidades não resolvidas são
quarentenadas e reportadas. Divergências com fornecedor/unidade/MOQ do catálogo
atual são avisos, preservando a transação histórica, sem assumir que o catálogo
atual representa integralmente o passado.

## Data-base e janelas

Referência padrão e limite máximo: 18/04/2037, independentemente do relógio
do computador. É possível normalizar para data anterior, mas não posterior;
o motor exige a mesma data na normalização e no cálculo. O catálogo é um
snapshot sem histórico: análises em bases anteriores têm essa limitação.

Janelas de 30, 60 e 90 dias INCLUEM a data-base:
início = base - (N - 1); fim = base, ambos inclusivos.
Registros diários e pedidos emitidos depois da base são excluídos antes dos
cruzamentos; recebimentos futuros são normalizados como indisponíveis/pendentes,
nunca como entrada confirmada. Não se usa informação de status futuro do SKU.

## Estoque e capital

Último saldo = maior data observada <= base. O retorno distingue positive,
zero, negative, missing (posição inválida/ambígua) e no_history.
Uma posição conflitante recente impede usar uma posição anterior como se fosse
válida; o saldo anterior continua rastreável em lastObservedBalance.

maxStockAgeDays = 0 por padrão: somente saldo na base participa da valorização e
cobertura. Saldo mais antigo é recuperado, mas marcado stale e não utilizável.
O parâmetro permite uma hipótese explícita de tolerância, sem fabricar atualização.

Valor = saldo utilizável em unidades físicas x custo unitário em centavos.
Zero válido vale zero; negativo, ausente e defasado por padrão valem null.
Não há compensação entre estoques negativos e positivos. Capital ativo e
descontinuado é separado. Valor consolidado é null se não há nenhuma posição
válida; cada agregado informa quantos SKUs foram avaliados/excluídos.
Uma categoria sem SKUs tem capital zero. Somatórios e produtos monetários fora
do intervalo de inteiros seguros falham explicitamente.

## Vendas observadas e proxy de demanda

Unidades e receita observadas são somadas para cada janela usando somente
registros válidos, após a política exploratória de duplicatas. status,
recordedDays, explicitZeroDays e missingSalesDays mostram a completude.
Uma soma de zero sem registros é observação ausente, NÃO demanda zero.

Média diária de calendário = soma / N e desvio padrão populacional dos N dias
somente quando há uma linha explícita válida em TODOS os N dias.
Dias sem linha permanecem desconhecidos; não há preenchimento com zero nem
média calculada apenas sobre os dias em que houve venda. Em janelas incompletas,
calendarMean, calendarStdDev e estimatedDailyDemand são null.

A proxy estimatedDailyDemand só fica disponível com calendário completo de
vendas e saldo de fechamento positivo em todos os dias. Fechamento <= 0 sinaliza
potentially_censored; falta de estoque histórico também impede a proxy.
Mesmo saldo positivo não comprova disponibilidade intradiária ou exposição no
site. A proxy é a média de vendas observadas sob essas condições, sem previsão,
correção de censura ou afirmação de demanda real. Zeros explícitos com evidência
de disponibilidade podem resultar em proxy zero.

Limitação deliberada: CSVs esparsos podem deixar muitas coberturas indisponíveis.
É preciso confirmar calendário de operação e política para dias sem venda antes
de flexibilizar esse critério. Não há estimativa de vendas perdidas.

## Cobertura, lead time e risco

Cobertura (dias) = estoque utilizável / proxy diária, usando a janela configurada
(30 dias por padrão). Demanda zero retorna zero_demand e days=null;
demanda insuficiente, estoque ausente ou defasado retorna insufficient.
Saldo negativo retorna negative_stock. Nunca se retorna Infinity ou NaN.

Lead time por SKU = recebimento - emissão, em dias corridos UTC, exclusivamente
para compras recebidas até a base. Pendentes/futuras não compõem a amostra.
Sem fallback automático para fornecedor. Retorna média, mediana, desvio padrão
AMOSTRAL (n-1), mínimo, máximo e n. n=0 produz null; n=1 permite média/mediana
inclusive iguais a zero, mas variabilidade é null. A suficiência padrão exige
três recebimentos. PendingOrders/PendingUnits ficam separados.

Unidades: un=1; cx 12 un=12 unidades físicas. A quantidade na unidade original
é preservada. MOQ continua na unidade de compra do catálogo. Divergência de
MOQ/unidade é avisada; não se reconstrói implicitamente MOQ histórico.

Risco para SKU ativo com cobertura e lead time suficientes:
- critical: cobertura <= média do lead time.
- attention: média < cobertura <= média + leadTimeBufferStd x desvio amostral.
- low: cobertura superior a esse horizonte.
Sem variabilidade observável quando o buffer a exige, o risco é insuficiente.
O buffer padrão é 1 desvio; é uma heurística configurável, não um estoque de
segurança calibrado para a meta de serviço operacional.
Descontinuados têm classificação própria, sem reposição rotineira.
Saldo negativo é anomalia. Falta de dados/demanda zero não recebe risco baixo.
Saldo zero combinado com histórico censurado pode resultar em risco insuficiente,
apesar do estado zero e do aviso de censura visíveis; isso não comprova ruptura.

## Excesso e baixa movimentação

excessDays=90: cobertura estritamente acima do limiar identifica excesso potencial.
Unidades excedentes = max(0, saldo utilizável - ceil(proxy x excessDays)).
Capital excedente usa custo em centavos. Sem proxy não se infere excesso.
Demanda observada zero tem estado específico, sem cobertura infinita.

Última venda = última linha válida com unidades positivas até a base.
Dias desde a venda = base - essa data; sem venda, ambos são null.
lowMovementDays=60 por padrão: identifica baixa movimentação se não há venda
positiva nos últimos 60 dias, com TODOS os dias desse período explicitamente
observados e evidência de disponibilidade. Sem essa evidência, insufficient.
Capital de baixa movimentação é o valor válido dos SKUs identificados.
Ausência de venda NÃO classifica automaticamente obsolescência.

## Contratos e uso

analyzeDataset retorna config, skus (somente métricas) e dashboard.
getSkuMetrics(resultado, sku) retorna métricas ou null para SKU inexistente.
aggregateDashboard permite consolidar métricas já calculadas.
Valores são number|null conforme tipos exportados em types.ts.
Agregados representam apenas entidades normalizadas e incluem denominadores,
quantidade de issues e aviso exploratory. Não são uma visão completa dos
registros em quarentena. Somatórios de venda são totais OBSERVADOS válidos,
com contagem de SKUs com calendário completo/parcial, nunca demanda estimada
consolidada. Estatísticas não são arredondadas para apresentação neste motor.

## Execução local e segurança

O único leitor novo de CSVs é private/analytics-local.mts, fora de src/ e
IGNORADO pelo Git. Ele contém import "server-only", recusa importação como módulo,
parâmetros de linha de comando e NODE_ENV=production. Usa caminhos fixos e não
lê chaves de ativação, parâmetros de URL nem configuração de rede.

Execute apenas no workspace local:
~~~sh
node --conditions=react-server private/analytics-local.mts
~~~
A condição habilita o marcador server-only no CLI Node; não adiciona nenhuma
rota ou integração Next. O resultado e os hashes ficam exclusivamente em
private/analytics-result.json. Não há saída de registros no terminal.
O carregador privado não acompanha clone/deploy; não o mova para src/ ou public/.
A proteção principal é a ausência do leitor no código versionado da aplicação,
não uma variável de ambiente. O bloqueio de produção é uma defesa adicional.

ESLint bloqueia imports de private/, data/, scripts/, tools/, CSVs e fs em src/,
inclusive imports dinâmicos não literais e require. O motor puro pode ser
versionado, mas análises de dados originais e seus resultados permanecem locais.
A integração visual posterior está documentada em dashboard-integration.md; somente cenários sintéticos independentes entram nas páginas. A dependência
server-only existe apenas como marcador de proteção, não como provedor externo.

## Verificações

~~~sh
npm run test:run
npm run lint
npm run build
~~~

Os testes usam apenas fixtures sintéticas em memória. Não chamam o carregador,
não leem CSVs privados e não exigem a presença de data/ ou private/.
Os seis testes anteriores da auditoria continuam válidos após a extração dos
primitivos compartilhados. Não há necessidade de executar a auditoria para testar.
