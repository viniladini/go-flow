# Smart Buying Engine

## Escopo e arquitetura

Atualização operacional: `createOperationalBuyingPlan` exige política completa,
sem referência, teto financeiro, taxas ou horizonte herdados do case. Reutiliza os
mesmos estágios auditados. Cenário constante, sem campanhas inferidas e sem buffer
calibrado para a meta informada; meta não é garantia. A API legada descrita abaixo
mantém comportamento. Consulte [integração operacional](operational-integration.md).

O baseline determinístico em src/lib/smart-buying/ transforma um Dataset normalizado
em rascunhos de propostas de compra. Não envia pedidos, não integra go.agent/Groq,
não cria endpoints. A camada operacional o consome por um serviço separado da interface.

- types.ts: entrada, cenário, necessidades, alternativas, propostas, projeções e resultado.
- policy.ts: perfil fictício independente, validação de entrada e aritmética de unidades.
- projection.ts: projeção condicional diária interna e custos de carregamento.
- needs.ts: elegibilidade e necessidades com as funções existentes de analytics.
- alternatives.ts: alternativas discretas por MOQ, campanhas, horizonte e orçamento.
- selection.ts: heurística de melhorias marginais, com desempates estáveis.
- validation.ts: revalidação de propostas, quantidades, custos, datas, benefício e orçamento.
- index.ts: orquestração; somente após validação retorna propostas com status draft.
- demo.ts: createDemoSmartBuyingPlan reutiliza exclusivamente o dataset sintético
  independente já existente no dashboard. Não altera nem conecta a interface.

Função principal:
~~~ts
createSmartBuyingPlan({
  dataset, // produzido por normalizeTables; não é um caminho ou leitor de arquivos
  origin: "independent_synthetic", // ou provided_dataset, sem inferir proveniência
  budgetCents: 86400000,
  orderDate: "2037-04-20",
  demandWindowDays: 30,
  scenario: {
    name: "Proxy constante sem crescimento de campanha",
    blackFridayMultiplierBps: 10000,
    christmasMultiplierBps: 10000,
    safetyStock: "normal_independent",
  },
});
~~~

São reutilizados analyzeDataset, métricas de cobertura/risco/lead time, unitFactor,
datas UTC e aritmética inteira do motor existente. Não há segunda implementação
das médias, desvios, cobertura ou classificação de risco do analytics.
Não há instalação de dependências ou solver.

## Perfil sintético independente

`SYNTHETIC_RULES` é um exemplo fictício para a API legada e os testes, não a
configuração de uma empresa. Usa referência em 18/04/2037, teto de R$ 864.000,
meta ilustrativa de 96,5%, capital de 13,5% ao ano, armazenagem de 0,85% ao mês e
limite ilustrativo de desconto de 27,5%. Campanhas são intervalos hipotéticos,
sem compromisso com calendário comercial real. O teto não é meta de gasto.

Operações importadas exigem `policy` explícita e nunca herdam esse perfil.
MOQ, múltiplos e conversão de caixas seguem o contrato do SKU; custos são por
unidade física. Sem preços, taxas ou campanhas inferidos de materiais privados.

## Entrada, qualidade e integridade temporal

A entrada deve vir de normalizeTables. Mantém-se a política auditada
exploratory_exact_dedup_conflict_quarantine, ainda sujeita à confirmação operacional.
Chaves repetidas remanescentes são recusadas em vez de somadas silenciosamente.
Unidades desconhecidas, datas inválidas, vendas fracionárias/negativas e inconsistência
na conversão física de compras são rejeitadas. Saldos negativos continuam negativos
no dataset e bloqueiam a reposição daquele SKU até reconciliação.

A fronteira do planejamento também confere chaves obrigatórias, referências de SKU
e fornecedor em todas as entidades, MOQ inteiro positivo e custos/preços em centavos
inteiros seguros não negativos. Isso impede que um objeto apenas tipado como Dataset,
mas alterado ou incompleto, contorne a normalização e contamine o lead time ou gere
capital negativo de descontinuados. Referências históricas a um fornecedor diferente
do atual são permitidas se esse fornecedor existir; não se reescreve o histórico.
Custo zero continua sendo cadastro válido, mas impede uma recomendação até haver
cotação positiva. Entradas inválidas são rejeitadas explicitamente, sem correção
silenciosa. Dados normalizados vazios retornam plano vazio com orçamento preservado.

A base é fixada em 18/04/2037; dados usados nas métricas são filtrados pelo analytics.
Observações e pedidos emitidos depois da base não participam dos cálculos.
Recebimento posterior à base nunca é disponibilidade atual. O catálogo é um
snapshot, sem datas históricas de custo, fornecedor ou descontinuação.

- Recebimentos confirmados até a base servem à amostra de lead time.
- Seu estoque já está no saldo: não se soma novamente a quantidade comprada.
- Pedidos pendentes, inclusive recebimentos futuros indisponíveis na base,
  são reportados em pendingOrdersNotCredited/pendingUnitsNotCredited.
- Não são creditados em nenhuma data presumida nem considerados entrega confirmada.
- Existe alerta de possível compra duplicada; confirmar os pedidos abertos antes
  de aprovar o plano.
- Mudança de fornecedor, MOQ ou unidade no histórico pode exigir revisão. O lead
  time é por SKU, como em analytics, não uma garantia do fornecedor atual.

## Demanda: observado, proxy e projeção

As janelas 30/60/90 incluem a base e vêm de analytics. A demanda de planejamento
é a proxy estimatedDailyDemand, somente com calendário explícito completo de
vendas e evidência diária de disponibilidade. Dias sem linha NÃO viram zero.
Censura potencial ou amostra insuficiente resultam em insufficient_data,
não em previsão supostamente confiável.

Demanda projetada do dia = proxy diária x multiplicador de cenário.
10000 pontos-base = 1x; 20000 = 2x; 15000 = 1,5x.
O padrão é 1x em todas as datas. Multiplicadores não negativos inteiros de Black
Friday e Natal são explicitamente hipotéticos, aplicados apenas às campanhas
definidas, e geram alerta quando diferem de 1x. Não alteram vendas observadas.
Um cenário modificado sem nome recebe identificação de cenário hipotético.

A projeção trabalha com milionésimos de unidade (MICRO_UNITS=1.000.000):
a proxy é arredondada à precisão de seis casas e o produto por pontos-base usa
BigInt com arredondamento de metade para cima. As unidades esperadas podem ser
fracionárias; as quantidades de compra são sempre inteiras. Estimativas nesta
precisão não significam precisão estatística real.

Não há ajuste automático de censura, previsão validada ou receita futura.
Proxy zero tem estado próprio, sem compra sem benefício estimável.

## Estoque, datas e necessidades

Somente estoque utilizável atual de analytics é creditado. Saldo negativo, ausente
ou defasado não é tratado como disponibilidade positiva ou compensação de dívida.

O saldo de 29/09 é de fechamento. O modelo consome a proxy em 30/09 como ponte
até o início do horizonte; esse dia não compõe o objetivo de atendimento dos
90 dias. Nenhuma compra é emitida antes de 01/10. A emissão padrão é 01/10,
configurável somente dentro do horizonte.

Lead time considerado = teto do horizonte de reposição calculado por analytics
(média + um desvio amostral na configuração atual).
Chegada estimada = emissão + lead time considerado, em dias corridos.
A amostra exige os três recebimentos e variabilidade calculável definidos no
analytics; lead time zero com amostra suficiente é válido e distinto de ausência.
A chegada é estimativa, não promessa de entrega.

O modelo simula consumo do estoque e da quantidade proposta desde a chegada:
atendimento do dia = min(estoque disponível, demanda de cenário).
Déficit = demanda de cenário - atendimento.
Déficits anteriores à chegada não são recuperados; não se presume backorder.
As projeções públicas do resultado são consolidadas, sem séries/linhas de CSV.

Necessidade nominal remediável = déficit de cenário a partir da chegada.
Compras que chegariam após o horizonte são bloqueadas. Se chegarem após uma
campanha, há alerta; contribuição para essa campanha não é atribuída à compra.
Chegada durante campanha pode ajudar apenas a parte restante, conforme projeção.

## Estoque de segurança

Com método normal_independent:
~~~text
SS = ceil(z_sintetico * sqrt(Lmedio * sigma_d^2 + media_d^2 * sigma_L^2))
z_sintetico = 2,053748910631823
~~~

sigma_d e media_d são escalados pelo maior multiplicador futuro aplicável após
a chegada. Os dados de média e variabilidade vêm do analytics.
Esse buffer depende das hipóteses aproximadas de independência, estacionariedade
e normalidade. O quantil unilateral de 96,5% é referência de proteção contra
incerteza, não comprovação de fill rate ou serviço realizado de 96,5%.
A definição exata de serviço esperada pela diretoria precisa ser validada.

Necessidade total = ceil(déficit remediável + max(0, SS - estoque final sem compra)).
O cenário também aceita safetyStock=none, explicitando ausência desse buffer.
Nenhuma amostra ou desvio ausente é substituído silenciosamente por zero.
Desvio realmente igual a zero com dados suficientes pode produzir SS zero.

## Conversão de MOQ e custo

~~~text
fator = 1 para un; 12 para cx 12 un
unidades físicas por lote = MOQ * fator
lotes necessários = ceil(necessidade em unidades físicas / unidades físicas por lote)
quantidade na unidade de compra = lotes * MOQ
quantidade física = quantidade de compra * fator
custo em centavos = quantidade física * custo_unitario_centavos
~~~

Exemplo de entrada sintética: MOQ 2 caixas, cada caixa com 12 unidades, custo
R$ 2,50 por unidade física. Um lote contém 24 unidades e custa R$ 60,00.
Quatro caixas = dois lotes = 48 unidades = R$ 120,00.
A unidade original e o equivalente físico são preservados no resultado.

Falta de orçamento arredonda a quantidade PARA BAIXO em lotes inteiros; nunca
arredonda o custo ou o orçamento para viabilizar uma proposta. MOQ pode exigir
sobra ao fim do horizonte; ela aparece na projeção e no custo de carregamento.
Custo zero/sem cotação positiva é invalid_constraints neste baseline: precisa de
validação de negócio antes de admitir fornecimento gratuito.

## Definição do orçamento e custos de carregamento

Orçamento considera EXCLUSIVAMENTE aquisição das novas propostas emitidas dentro
do horizonte. É possível testar um limite menor; o limite sintético não pode ser
elevado. Zero é permitido e não equivale a dados insuficientes.
Somente orçamento omitido (undefined) usa o teto padrão. null explícito é recusado,
assim como valores negativos, fracionários, não finitos, inseguros ou acima do teto;
não se interpreta ausência explícita de orçamento como autorização para gastar.
Não se subtraem automaticamente pedidos já emitidos: o perfil demonstrativo não
definem esse débito e não há preço histórico contratado no arquivo de compras.
existingOrdersDeductedCents permanece explicitamente zero.

~~~text
utilizado = soma do custo de aquisição das propostas selecionadas
restante = orçamento total configurado - utilizado
0 <= utilizado <= total configurado <= 86400000 centavos
~~~

Capital e armazenagem são estimativas adicionais usadas na comparação de
alternativas; NÃO debitam o orçamento de compras:
~~~text
capital = estoque incremental em unidade-dias * custo unitário * taxa_anual_bps / (10000 * 365)
armazenagem = estoque incremental em unidade-dias * custo unitário * taxa_mensal_bps / (10000 * 30)
~~~

O incremental é calculado contra o cenário sem nova compra, com saldo ao fim
de cada dia no horizonte. Cada componente é arredondado para cima ao centavo,
separadamente, como convenção conservadora. Rateio simples, sem capitalização,
sem interpretar 30 dias como calendário exato de cada mês.
Aquisição, comparações de razão e custos monetários usam inteiros/BigInt.
Overflow ou valores não finitos são recusados, não truncados ou serializados como
dinheiro aproximado. A saída contém apenas números finitos, strings e arrays,
sem BigInt não serializável.

## Alternativas e método de seleção

Alternativas cumulativas por SKU, deduplicadas pela quantidade de lotes:
menor lote, cobertura nominal do horizonte, alvo com segurança, limiares até o fim
das campanhas e limite financeiramente comportável. Durante a seleção pode ser
gerada uma quantidade parcial que caiba no saldo do orçamento.

Alternativas cujo custo de aquisição excederia Number.MAX_SAFE_INTEGER não são
materializadas. O menor lote válido permanece disponível para diagnosticar
inviabilidade financeira; todas as quantidades comportáveis pelo orçamento continuam
representáveis. Um produto extremamente caro não interrompe o planejamento dos
demais por overflow de uma alternativa integral impagável. Outras operações fora
do intervalo suportado (como valor do estoque ou projeções em milionésimos) falham
explicitamente, sem retornar dinheiro aproximado ou um plano parcial silencioso.

A heurística permite melhorias da quantidade já escolhida, mas mantém UMA única
proposta final por SKU. A aquisição de uma alternativa NÃO é somada às alternativas
do mesmo SKU. O custo debitado em cada melhoria é apenas a diferença de aquisição.

Ranking lexicográfico:
1. Atendimento nominal adicional antes de melhorias só de buffer.
2. Primeira data de déficit remediável ainda existente.
3. Risco calculado na data-base.
4. Maior benefício marginal / (aquisição marginal + carregamento marginal).
5. Maior benefício marginal, menor custo, código de SKU e quantidade de lotes.

A razão é comparada por produto cruzado em BigInt, sem ponto flutuante no dinheiro.
Atendimento e buffer são considerados em etapas distintas, sem inventar preço
monetário para ruptura ou fator de lucro. O benefício é atendimento adicional
CONDICIONAL ou proteção do buffer, não vendas perdidas observadas.

O conjunto de quantidades é limitado e a heurística não prova ótimo global.
Ela não resolve um MILP nem maximiza lucro/serviço garantido. Há limite de
transições proporcionais às alternativas fixas por SKU, sem iterar uma vez para
cada unidade comprada em casos de MOQ=1.

Alternativas não selecionadas são explicadas por inviabilidade financeira,
concorrência pelo orçamento, substituição por outra quantidade do mesmo SKU
ou ausência de benefício estimável. status de necessidade e selectionStatus
separam dados insuficientes, restrições inválidas e falta de dinheiro.

## Validação final e interpretação do resultado

validateProposals verifica novamente SKU ativo/elegível, ausência de SKU duplicado,
unidade, inteireza, múltiplos de MOQ, quantidade física, custo, fornecedor, datas,
lead time, projeção, evidência e benefício positivo. Soma o dinheiro de forma
independente e verifica os dois limites de orçamento. Inconsistência rejeita o plano.

Cada proposta inclui SKU, fornecedor, data de pedido, unidade, quantidade em
unidades de compra e físicas, custo estimado, lead time usado e sua amostra,
chegada estimada, risco/urgência, benefício, projeção, premissas, confiança
conditional e explicação. Status draft e aprovação humana são obrigatórios.

O resultado inclui orçamento total/utilizado/restante, todas as alternativas
consideradas, necessidades/bloqueios, alertas, metodologia e limitações.
SKUs descontinuados são oportunidades separadas de revisão manual de destinação,
sem recomendação de compra rotineira nem execução de desconto.

## Confidencialidade e demonstração

O motor é puro, sem filesystem, APIs externas, endpoint ou envio de pedidos.
Não carrega CSVs nem relatórios. Não está integrado ao dashboard ou ao build
de páginas; o pós-build existente continua verificando os artefatos públicos.
Não há toggle de filesystem para dados privados. Leitura dos originais no servidor
continua restrita ao CLI privado. Arquivos selecionados pelo usuário no Flow Import
podem ser analisados exclusivamente no navegador, em memória e sem transmissão,
conforme a arquitetura operacional. Nenhum resultado privado entra no Git ou no build.

createDemoSmartBuyingPlan usa somente os cenários sintéticos independentes do
dashboard. Os testes usam ainda fixtures em tests/fixtures/buying.ts e bloqueiam
I/O de arquivos. Não dependem de data/, private/ ou de resultados confidenciais.
Os cenários testam aritmética, não simulam um ledger operacional completo.

## Auditoria de confiabilidade

Os testes adicionais em tests/unit/smart-buying-audit.test.ts usam somente fixtures
independentes em memória. Foram reproduzidos antes das correções: orçamento null
liberando o padrão, custo negativo de descontinuado retornando capital negativo,
chaves/referências órfãs aceitas e overflow de alternativa impagável interrompendo
compras viáveis. As regressões agora exigem recusa explícita ou diagnóstico financeiro,
conforme o caso. Não houve alteração das fórmulas de analytics ou do ranking.

Também são verificados dados vazios, limites monetários, duplicatas nas cinco entidades,
MOQ e caixas, pedidos pendentes/recebidos/futuros, falta de histórico, conservação de
demanda e estoque por simulação independente, benefício marginal por custo e diversas
permutações da entrada. Grades de concorrência conferem soma exata, saldo do orçamento,
múltiplos de MOQ, conversão física e ausência de números não finitos no resultado.
A ordenação pública das propostas continua por código de SKU; a seleção aplica o
ranking descrito acima e cada proposta mantém risco, data de prioridade e benefício.

O teste de exemplo com orçamento R$ 120,00, MOQ 2 caixas de 12 e custo unitário
R$ 2,50 seleciona 4 caixas (48 unidades), aquisição R$ 120,00 e saldo R$ 0,00.
Custos de carregamento aparecem separadamente; não são enviados ao fornecedor.

## Reprodução

~~~sh
npm run test:run -- tests/unit/smart-buying.test.ts
npm run test:run -- tests/unit/smart-buying.test.ts -t "compra exatamente no limite"
npm run test:run
npm run lint
npm run build
~~~

## Decisões que precisam de validação operacional

- Tratamento definitivo de duplicatas e histórico de status/custo/fornecedor.
- Definição de serviço: probabilidade de ciclo, fill rate ou outro indicador.
- Adequação do buffer normal, estacionariedade, sazonalidade e covariâncias.
- Datas confirmadas de pedidos pendentes para reduzir risco de compra duplicada.
- Custos de ruptura, prioridades comerciais, cotação futura e prazos prometidos.
- Política de backorders, dia/hora de chegada e múltiplos pedidos ao longo do horizonte.
- Eventual regra de compromissos já emitidos sobre o orçamento e rateio de custos.
Nenhum desses pontos é apresentado como fato resolvido pelo baseline.

