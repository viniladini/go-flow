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

Manter a regra WAF direta ja validada no caminho `/api/agente`, Fixed Window de
10 requisicoes por 60 segundos, com bloqueio/429. A regra deve cobrir todos os
dominios publicos e metodos do endpoint, incluindo POST e PATCH, sem bypass.
Conferir a chave por visitante na propria regra (por IP quando configurada).
Nao reintroduzir `@vercel/firewall`, Keys API controlled ou Rate Limit ID como
requisito do codigo: nao existe mais consulta programatica ao SDK.

Configurar `AGENT_RATE_LIMIT_MODE=vercel_edge_waf` no ambiente Production.
Valor ausente/incorreto retorna 503 antes da Groq. Preservar variaveis de sistema
Vercel expostas (VERCEL=1, VERCEL_REGION=iad1 e VERCEL_URL valido), IP da plataforma,
GROQ_API_KEY e GROQ_MODEL somente no servidor, sem NEXT_PUBLIC.

A variavel declara o modo; NAO comprova existencia, ativacao ou cobertura do WAF.
Se a regra for removida com o modo habilitado, a aplicacao nao detecta isso.
Manter a regra efetiva e validar o 429 na borda sem consumo Groq. Nao ha contador
em memoria adicionado como substituto da protecao externa. Contadores regionais
nao garantem teto global de consumo; manter limites tambem na conta Groq.

403 de POST invalido pode ser ORIGIN (origem ausente/incorreta/cross-site) ou
DEMO_ONLY (fonte importada), ambos gerados pelo aplicativo antes da protecao.
Consultar codigo JSON e eventos do Firewall para distinguir de um bloqueio da
borda; nao atribuir todo 403 ao SDK antigo. O teste externo 403 seguido de 429 foi
informado pelo responsavel; nao foi repetido automaticamente neste hotfix.
Validar tambem uma solicitacao demo valida e revisao isolada apos implantacao
autorizada. Nenhuma regra ou implantacao foi alterada pelo agente.

Referencia: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

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
