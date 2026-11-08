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
6. Somente depois das duas chamadas e dos cálculos válidos o servidor emite
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
comprovante expandido de até um MiB, argumentos de dois KiB, uma ferramenta e duas
chamadas de IA. Leitura limitada a cinco segundos, SDK sem retries, quinze segundos
por chamada, trinta segundos de execução e rota Node com maxDuration de quarenta.
A deduplicação de UUIDs, dez solicitações/minuto e uma execução simultânea por
processo são apenas proteções locais suplementares, sem garantia entre instâncias.

### Proteção obrigatória na Vercel

Em produção o servidor exige Vercel, região iad1 (fixada em vercel.json), hostname
da plataforma e regras publicadas do SDK oficial @vercel/firewall:
- `goflow-agent-global`: chave fixa para todas as execuções; configurar, por exemplo,
  trinta solicitações por minuto com bloqueio, sem condições adicionais de bypass.
- `goflow-agent-ip`: por IP fornecido pela plataforma; configurar dez por minuto.

Esses valores são limites públicos de proteção, não parâmetros operacionais.
Cada verificação tem timeout de 1,5 segundo. Regra ausente, erro, timeout, plataforma
ou região inesperada bloqueiam a IA com 503 antes do SDK Groq; limite retorna 429.
Nenhum booleano de ambiente habilita bypass de produção. Desenvolvimento local
continua funcional com proteção local; `next start` fora da Vercel bloqueia a IA.

Os contadores WAF são regionais, não um limite mundial de gastos. Manter a região
única e validar as duas regras no ambiente de avaliação antes de publicar. Configurar
também limites de consumo na conta Groq. Regras apenas em log/não ativas não provam
proteção: teste efetivo de 429 é requisito de release. A configuração externa não
foi realizada automaticamente nesta auditoria.

Referência: [Vercel Firewall SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk).

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
