# go.agent, Groq e Central de Ações

## Escopo

Rotas `/agente` e `/acoes`, com provider persistente do aplicativo. O agente faz
tool calling real pela Groq apenas para a demonstração sintética independente.
Não há acesso aos CSVs do desafio, importações, Groq no navegador ou envio de pedidos.

Configure `GROQ_API_KEY` e `GROQ_MODEL` em `.env.local` (ignorado pelo Git) ou no
ambiente do servidor. Ambos são obrigatórios, sem fallback de chave ou modelo.
`.env.example` contém somente os nomes vazios. Reinicie o servidor ao mudar o ambiente.
O modelo escolhido precisa suportar tool calling. O SDK oficial `groq-sdk` é importado
somente por módulos com `import "server-only"`. Nunca use NEXT_PUBLIC para a chave.

## Fluxo verificável

### Resposta analítica orientada à decisão

As análises diferenciam risco, prioridades, causas, cobertura, lead time e
oportunidades. O backend compõe resumo executivo, indicadores do escopo, até cinco
materiais e próximos passos qualitativos vinculados às evidências. A Groq continua
selecionando IDs verificados; não escreve números nem recomenda quantidades.
Prioridades obrigatórias não podem ser removidas pela seleção do modelo.

A ordenação é explícita: risco e déficit válido dentro da classe; cobertura por
maior déficit e menor cobertura; prazo por maior média com amostra suficiente;
oportunidades por maior capital elegível ao custo, sem somar categorias sobrepostas.
Empates usam SKU. O déficit é `max(0, lead time médio - cobertura)` em dias, somente
com evidências válidas e atuais. Não altera classificação de risco, buffer,
demanda ou planejamento, nem comprova ruptura física. Dados desconhecidos continuam
indisponíveis. Os agregados do escopo reutilizam o motor analítico existente.

O acompanhamento fica na memória da aba: somente tema, IDs demonstrativos,
data-base e fingerprint da análise podem voltar ao endpoint. Não são enviados
resultados anteriores, histórico livre ou parâmetros operacionais. Esses metadados
não autorizam ferramentas ou propostas e são validados antes do processamento.
Toda pergunta recalcula a base sintética atual; mudanças de fingerprint/data geram
aviso explícito. Trocar fonte apaga o contexto e cancela requisições pendentes.
Não há memória analítica global entre visitantes. O contexto é seleção de dados
públicos da demo, não credencial de autorização. Refresh pode apagá-lo.

O servidor separa intenções antes de oferecer ferramentas. Pedidos explícitos de
planejamento de compras seguem o fluxo abaixo. Análises de estoque, ruptura,
cobertura e capital parado usam apenas o motor analítico demonstrativo existente,
sem chamar Smart Buying. A Groq recebe evidências sintéticas calculadas e seleciona
IDs relevantes, sem ferramentas; a aplicação valida esses IDs e exibe somente o
texto determinístico das evidências, nunca métricas ou texto livre inventados.
Uma análise não emite comprovante, não entra na Central e não admite aprovação.

Pedidos de execução, envio de pedidos, contato com fornecedores ou dispensa de
aprovação são recusados antes da chamada à Groq. A autorização é uma regra
conservadora da aplicação, não uma classificação livre do modelo. Solicitações
ambíguas ou misturando análise e criação de propostas pedem esclarecimento. Frases
negadas ou citando execução também podem exigir reformulação; não autorizam uma
proposta silenciosamente. Pedidos que mencionam dados importados/privados são
bloqueados; a barreira de fonte importada no cliente e servidor permanece ativa.

O retry existente é compartilhado por execução: somente HTTP 400 com
`tool_use_failed`, no máximo uma repetição, temperaturas 0,2 e 0 e o mesmo timeout
total de trinta segundos. Isso também vale para a análise. Não há fallback para
planejamento após análise inválida. O diagnóstico por tentativa inclui a fase
`analysis`, além de `planning` e `confirmation`, sem registrar conteúdo do usuário.

1. Na fonte demo, o usuário solicita um planejamento. Somente prompt, origem demo e
   UUID de execução são enviados ao endpoint de mesma origem `/api/agente`.
2. O servidor oferece uma única ferramenta autorizada: `plan_demo_purchases`.
   O modelo interpreta orçamento em centavos e eventual seleção de até vinte SKUs.
3. A aplicação exige exatamente uma chamada válida e valida nome, JSON, campos,
   orçamento e pertencimento dos SKUs ao catálogo sintético. Não aceita quantidades,
   preços, recomendações, código ou outras ferramentas vindos do modelo.
4. O Smart Buying existente calcula e valida as propostas, respeitando MOQ, caixas,
   estoque, lead time, pendências e orçamento. O gerador é o mesmo da operação demo.
5. Um resumo limitado e exclusivamente sintético retorna como mensagem `role: tool`.
   A segunda chamada confirma a conclusão, com novas ferramentas desativadas.
6. Somente depois das duas etapas válidas de IA (até três chamadas com retry) e dos cálculos válidos o servidor emite
   um comprovante assinado da execução, vinculado à sessão do navegador.
   O provider valida a resposta e adiciona a proposta à Central em memória.
   Falhas não geram comprovante nem mensagem de sucesso.

O texto livre do LLM não é exibido como recomendação. Explicação numérica e tabela
usam exclusivamente os resultados determinísticos: quantidade comercial/física,
custo, orçamento, chegada estimada e premissas. Isso impede que uma resposta textual
com números inventados substitua o resultado calculado. O orçamento interpretado
e o escopo ficam visíveis para revisão humana; a interpretação não garante intenção.
Resultado sem propostas é registrado como análise sem proposta viável, sem aprovação.

Referências: [tool calling local da Groq](https://console.groq.com/docs/tool-use/local-tool-calling)
e [SDK oficial](https://github.com/groq/groq-typescript).

## Revisão e memória

POST emite um comprovante sintético comprimido, autenticado por HMAC-SHA256 e
vinculado a um identificador aleatório de sessão em cookie HttpOnly, SameSite=Strict,
Secure e prefixo __Host- em produção. O cookie não contém dados, propostas ou chave
Groq. A assinatura utiliza a chave server-side existente com separação de domínio;
rotacioná-la invalida comprovantes. O comprovante não é enviado ao LLM.

PATCH verifica assinatura antes de descomprimir, tamanho expandido, sessão, ID,
origem demo e expiração de trinta minutos. ID e comprovante de outro visitante não
autorizam revisão sem seu cookie. Não existe GET, listagem global ou registro de
propostas em memória serverless. Instâncias com a mesma chave validam o comprovante.

O provider mantém até vinte execuções e seus status na memória da aba entre rotas.
Refresh pode apagar o histórico. Revisão é um reconhecimento demonstrativo, não
um livro de aprovações: o cliente bloqueia segunda revisão na interface, mas o dono
pode reenviar o comprovante pendente original ao servidor. Não há revogação ou
consumo global de uso único sem armazenamento compartilhado. Nenhuma revisão executa
pedido, pagamento ou contato com fornecedor. Não há persistência durável.

## Privacidade e limites

Na fonte importada, interface e controller bloqueiam solicitação e revisão antes de
construir qualquer payload de rede. Trocar origem/revisão da sessão limpa o rascunho,
aborta requisições e ignora respostas tardias. Histórico demonstrativo permanece
separado, oculto enquanto a fonte importada está ativa. Compras locais continuam
disponíveis no motor determinístico do Prompt 14.

O transporte também valida o contrato antes do fetch; o endpoint rejeita origem
importada e campos extras como dataset, parâmetros ou métricas. Não recebe arquivos,
não busca dados privados no servidor e nunca envia contexto do provider à Groq.
O formulário demo avisa para não incluir informação privada: texto livre não possui
classificador universal capaz de identificar todo conteúdo confidencial colado manualmente.

Limites: mil caracteres, quatro KiB para solicitação, 256 KiB para revisão,
comprovante expandido de até um MiB, argumentos de dois KiB, uma ferramenta e até três
chamadas de IA (no máximo um retry de tool_use_failed por execução). Leitura limitada a cinco segundos, SDK sem retries, quinze segundos
por chamada, trinta segundos de execução e rota Node com maxDuration de quarenta.
A deduplicação de UUIDs, dez solicitações/minuto e uma execução simultânea por
processo são apenas proteções locais suplementares, sem garantia entre instâncias.

### Protecao obrigatoria na Vercel

A producao usa WAF direto na borda, aplicado ao caminho `/api/agente`, com
Fixed Window de 10 requisicoes por 60 segundos e bloqueio/429. O limite e a chave
por visitante sao configurados na regra externa da Vercel (por IP quando assim
configurada); o codigo nao escolhe o bucket nem chama `checkRateLimit()`.
Nao ha dependencia operacional de Rate Limit ID, API controlled ou chamada
`/.well-known/vercel/rate-limit-api/`. Nao alterar a regra ja validada para
reintroduzir a condicao do SDK.

Configurar no servidor, no ambiente Production:

```text
AGENT_RATE_LIMIT_MODE=vercel_edge_waf
```

Ausencia ou qualquer outro valor bloqueia a execucao da IA com
`PROTECTION_UNAVAILABLE`/503 antes de criar o cliente Groq. Permanecem as
pre-condicoes existentes: VERCEL=1, VERCEL_REGION=iad1, VERCEL_URL valido da
plataforma e x-real-ip presente. As variaveis Vercel sao fornecidas pela
plataforma; manter sua exposicao habilitada. GROQ_API_KEY e GROQ_MODEL continuam
obrigatorias somente no servidor, nunca NEXT_PUBLIC. Desenvolvimento local
mantem o comportamento anterior; next start fora da Vercel bloqueia a IA.

**Limitacao:** AGENT_RATE_LIMIT_MODE declara a configuracao, nao comprova que o
WAF existe, esta ativo ou cobre todos os dominios e metodos. Com a variavel
correta e a regra removida, o codigo nao detecta a perda de protecao externa.
A seguranca depende de manter a regra publicada e efetiva para `/api/agente`
em todos os acessos publicos, sem bypass. Testar POST e preservar a cobertura
das revisoes PATCH; nao restringir a regra a requisicoes ja validas. Nenhum
contador em memoria foi adicionado ou usado como substituto do WAF. As protecoes
locais suplementares existentes permanecem sem garantia entre instancias.

IPs compartilhados podem dividir o bucket e trocar IP pode permitir outro
bucket. Contadores WAF sao regionais, nao um teto agregado de gastos; manter
limites de consumo tambem na Groq. O teste externo de 403 seguido de 429 foi
informado pelo responsavel; nao foi repetido neste hotfix, nem houve deploy ou
alteracao da regra pelo agente.

#### Interpretar HTTP 403 e 429

O aplicativo retorna 403/ORIGIN quando Origin esta ausente/incorreto ou a
requisicao e cross-site, e 403/DEMO_ONLY quando a fonte nao e demo. Essas
validacoes ocorrem antes da protecao de producao e antes da Groq. Um POST
invalido pode, portanto, retornar 403 pela propria aplicacao, sem participacao
do antigo SDK. Verificar o codigo JSON sanitizado da resposta para distinguir
casos locais. O WAF tambem pode negar com 403; confirmar a origem desse bloqueio
nos eventos do Firewall, nao apenas pelo status HTTP.

O 429 da borda e emitido pela regra antes do handler. A aplicacao tambem mantem
seus 429 locais suplementares e o tratamento de 429 da Groq; o status sozinho
nao identifica qual camada bloqueou. Nao transformar falha de validacao em
sucesso nem interpretar todo 403 como quota excedida.

Os logs `event: agent_protection` agora registram somente falhas locais com
categorias fixas: rate_limit_mode_unavailable, platform_unavailable,
region_mismatch, host_unavailable ou ip_unavailable. Nao atestam o estado do WAF
e nao incluem IP, host, headers, cookies, prompts, segredos ou erros originais.

Referencia: [Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

JSON, origem e tamanho são conferidos; respostas usam no-store. Timeout, 429,
indisponibilidade, configuração ausente e falha de tool calling têm mensagens
sanitizadas. Não são registrados prompts, chaves, corpos de erro ou traces em logs.
O SDK usa log desativado, endpoint oficial fixo e store=false. A chave só compõe a
autenticação server-side da Groq, nunca mensagens ao modelo ou artefatos client-side.

ESLint impede imports do SDK/módulos de execução em componentes e logs no módulo.
Pós-build procura identificadores de configuração/SDK indevidos em chunks client-side,
além das verificações de dados privados existentes. As proteções não substituem
a validação real das regras WAF nem armazenamento durável para aprovações reais.

## Verificação

`npm run test:run -- tests/unit/agent-server.test.ts tests/unit/agent-session.test.ts tests/unit/agent-pages.test.tsx`

As chamadas HTTP da Groq são mockadas, mantendo SDK, protocolo, cálculo, validação,
registro e revisão reais no teste de servidor. Testes client-side cobrem isolamento,
cancelamento, navegação, falhas e ausência de transmissão na fonte importada.
Verificação completa: `npm test -- --run`, `npm run lint`, `npm run build`.
