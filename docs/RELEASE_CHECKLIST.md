go.flow — Checklist de publicação pública
Checklist operacional para a edição temporária de avaliação. Não substitui a auditoria de segurança nem autoriza push/deploy automaticamente.

Antes de publicar
- [ ] Confirmar que a pasta original de dados privados, enunciado, dicionário, parâmetros e registros derivados não está no Git, no histórico público, em public/, nos testes ou em artefatos de build.
- [ ] Conferir .env.local, variantes secretas de .env, chaves, logs e source maps. Não imprimir valores secretos no relatório.
- [ ] Verificar que o gerador demo é independente dos arquivos confidenciais.
- [ ] Conferir as rotas públicas e o modo sem login.
- [ ] Confirmar que os endpoints Groq aceitam somente demo sintética e rejeitam entrada/importação privada também no servidor.
- [ ] Confirmar rate limits, validação de argumentos, limites de custo/saída e comportamento de erro/429.
- [ ] Testar isolamento de rascunhos entre duas sessões independentes, inclusive acesso direto por ID e tentativa de revisão cruzada.
- [ ] Testar estado de propostas num ambiente compatível com serverless; não presumir que memória em processo mantém consistência entre invocações.
- [ ] Executar suíte completa, lint, build e testes manuais de navegador.
- [ ] Testar Claro/Escuro/Sistema, importação local, navegação, estoques, compras, oportunidades, agente e ações.
- [ ] Obter autorização explícita para criar o primeiro commit/push/deploy público.
Publicação e teste real
- [ ] Repositório público contém apenas arquivos revisados, sem históricos sensíveis.
- [ ] Vercel configurada com GROQ_API_KEY e GROQ_MODEL em variáveis server-side protegidas; nenhuma chave client-side.
- [ ] Link público abre em navegador anônimo sem login nem configurações manuais.
- [ ] Visitante percorre demo → go.agent → ferramenta real → Central de Ações → revisão demonstrativa.
- [ ] Erros de chave/API não são mascarados por respostas inventadas.
- [ ] Verificar logs de produção sem vazamento de dados privados ou credenciais.
- [ ] Links GitHub e aplicação abrem corretamente e exibem a versão final desejada.
Após o processo
- [ ] Retirar a publicação temporária do ar conforme a orientação recebida.
- [ ] Avaliar tornar privado ou remover o repositório de avaliação, conforme regras e necessidade.
- [ ] Para eventual portfólio futuro, avaliar termos de reutilização e criar edição independente, com marca, dados e histórico Git revisados.


## Saneamento e publicacao em repositorio novo

O historico original contem referencias confidenciais e NAO deve ser publicado.
Nao usar fork, clone, bundle, mirror, archive de um commit antigo ou push deste
repositorio. Nenhuma reescrita ou exclusao do historico esta autorizada.

1. Concluir testes, lint, build do zero e comparacao local de confidencialidade.
2. Executar `node scripts/prepare-public-release.mts ../go-flow-public-ready`
   somente depois da revisao. O destino deve ser novo: nunca e sobrescrito.
3. A copia contem somente a arvore de trabalho revisada e RELEASE_MANIFEST.json
   com hashes. Exclui .git, .next, dados, relatorios privados, node_modules,
   credenciais, arquivos de ambiente privados e artefatos locais.
4. Conferir a copia e repetir `npm ci`, testes, lint e build nela. Copiar nenhuma
   configuracao privada. Usar variaveis protegidas do ambiente de destino.
5. Somente nessa pasta, apos autorizacao, inicializar um Git novo e criar o
   primeiro commit. Criar repositorio remoto vazio, sem historico importado.
   Commit, push e deploy nao foram executados nesta etapa.

O comparador local e seu relatorio ficam em private/release-audit.py e
private/release-audit.json, fora do Git e da copia de distribuicao. A comparacao
usa valores apenas localmente; o relatorio publica somente caminhos e categorias.
O build comum confere arquivos e traces, mas nao certifica a ausencia de todos
os literais operacionais. A verificacao adicional e obrigatoria.

### Firewall obrigatorio antes da IA publica

No projeto Vercel, abrir Firewall > Configure e editar a regra existente
`goflow-agent-global`. O plano Hobby permite uma regra WAF de rate limiting por
projeto. Usar condicao `@vercel/firewall`, sem filtros adicionais que excluam a rota:

| Rate Limit ID exato | Bucket do codigo | Configuracao sugerida |
| --- | --- | --- |
| goflow-agent-global | IP do visitante fornecido pela Vercel (`x-real-ip` como `rateLimitKey`) | 30 solicitacoes por 60 segundos; Fixed Window; Keys: API controlled; bloquear/429 |

Manter a regra existente de 30/60 no painel: o SDK nao define o limite.
O nome historico do ID foi preservado, mas o bucket nao e mais global. Nao criar
`goflow-agent-ip`; o endpoint consulta apenas `goflow-agent-global` uma vez.
Salvar, Review Changes e Publish para ativar a regra do firewall.
Nao usar apenas Log ou regras desativadas. Essa publicacao de regras e uma acao
manual posterior; nao foi realizada pelo agente. O codigo verifica a unica regra
via SDK oficial @vercel/firewall antes de chamar Groq. Ausencia, erro ou timeout
retornam 503 sem chamada ao modelo; IP ausente ou resposta inconclusiva tambem
bloqueiam. Limite efetivo retorna 429. Nao ha toggle de
bypass. Confirmar 429 e ausencia de consumo Groq no teste da implantacao autorizada.

Os contadores sao regionais. vercel.json fixa iad1 e o servidor rejeita outra
regiao. Manter limites de consumo tambem na conta Groq; WAF nao e um teto mundial
de gastos. IPs compartilhados dividem o bucket; troca de IP permite outro bucket.
Nao ha limite agregado entre visitantes nem identificacao autenticada por pessoa.
Cookies, x-forwarded-for e chaves arbitrarias do cliente nao substituem x-real-ip.
Nao foi adicionado rate limiting em memoria como substituto da protecao externa.
Configurar GROQ_API_KEY e GROQ_MODEL apenas no servidor, sem NEXT_PUBLIC.
Referencia: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk

### Pendencias de aceite

- Historico original permanece contaminado: nunca publica-lo.
- Regras WAF efetivas e variaveis Vercel precisam de configuracao e smoke test.
- Validar navegador real, duas sessoes, fluxo Groq e revisao na implantacao autorizada.
- Revisao e demonstrativa, em memoria na aba, sem persistencia duravel ou garantia
  global de uso unico. Nenhuma aprovacao emite pedido real.
- Oito avisos moderados na cadeia de desenvolvimento ESLint/minimatch; auditoria
  anterior sem avisos nas dependencias de producao. Nenhum force-fix aplicado.


### Verificacao local do saneamento

- Perfil legado substituido por SYNTHETIC_RULES, inteiramente ficticio; datas,
  campanhas, orcamento, taxas, meta e calibracao nao representam a operacao privada.
- Formulas e politica explicita das importacoes preservadas. Fixtures e expectativas
  atualizadas para o novo exemplo; nenhum arquivo original foi modificado.
- 521 testes aprovados com `npm test -- --run --maxWorkers=1`; lint aprovado.
  A execucao sequencial evitou timeouts de concorrencia desta maquina.
- Build novo aprovado. Comparador local: zero achados nos arquivos publicaveis
  e nos 344 artefatos inspecionados; identificadores privados tambem sem achados.
  Historico contaminado continua bloqueado mesmo depois de sanear a arvore atual.
