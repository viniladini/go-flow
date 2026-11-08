# Signature Motion — revisão local

Implementação visual do protótipo independente go.flow. Não constitui um manual oficial da GoGroup.

## Cenas e contraste

Razão WCAG calculada com luminância relativa sRGB. Texto secundário usa a mesma tinta, sem redução de opacidade. Foco e bordas funcionais usam a tinta da cena. Os pares independem do tema do aplicativo.

| Cena | Fundo | Título | Contraste título | Texto / foco | Contraste texto | Destaque | Contraste destaque |
| --- | --- | --- | --- | --- | --- | --- | --- |
| olá. | #DCEB16 | #9D2458 | 5,64:1 | #101629 | 13,64:1 | #101629 | 13,64:1 |
| ousados. inquietos. criativos. | #101629 | #FFFFFF | 17,97:1 | #FFFFFF | 17,97:1 | #DCEB16 | 13,64:1 |
| o próximo movimento começa aqui. | #1761B1 | #FFFFFF | 6,21:1 | #FFFFFF | 6,21:1 | #DCEB16 | 4,71:1 |
| conheça o go.agent. | #F7F7F3 | #101629 | 16,73:1 | #101629 | 16,73:1 | #1761B1 | 5,78:1 |
| como deseja começar? | #101629 | #FFFFFF | 17,97:1 | #FFFFFF | 17,97:1 | #DCEB16 | 13,64:1 |

A matriz automatizada também cobre CTA principal, hover, CTA secundário com cores invertidas, limites dos botões e indicadores. No destino navy, o CTA principal é chartreuse/navy, com hover branco/navy; o CTA local é navy/branco, com borda branca. A sidebar mantém texto claro durante o deslocamento do indicador: não troca para tinta escura antes de sua superfície chegar.

## Coreografia e arquitetura

- Wordmark: go 520 ms; flow começa em 140 ms e termina em 740 ms. Geometria congelada durante a expansão. Os movimentos se sobrepõem sem pausa adicional.
- Logo → olá: círculo chartreuse de 820 ms, medido pelo ponto e pelos cantos do viewport; texto começa nos últimos 220 ms e entra em 580 ms, mantendo o mesmo elemento ao concluir a expansão.
- 01 → 02: máscara vertical do fundo junto com o texto, seguida de revelação tipográfica escalonada (55 ms entre palavras).
- 02 → 03: revelação horizontal guiada pelo caminho conectado; conteúdo desloca 24 px.
- 03 → 04: revelação elíptica e composição do Flow Orb existente. A curva compartilhada muda de posição e escala.
- 04 → 05: máscara radial com origem medida no Flow Orb e entrada discreta das escolhas.
- Voltar: máscara horizontal reversa. Cliques substituem a intenção atual; no máximo uma cena de saída permanece montada.
- Cada cena carrega fundo opaco e tinta próprios. As máscaras revelam o par junto; não há interpolação de fundo sob texto de outra cena. Controles persistentes têm superfície opaca local.
- A passagem final conserva a cortina na cor do tema até o destino estar montado. Pular usa a passagem curta.

## Aplicativo

- Tokens: instant 100 ms, quick 210 ms, standard 330 ms, saída de painéis 280 ms, spatial 480 ms, editorial 780 ms. Indicador posicional de 440 ms com curva amortecida, sem bounce.
- Sidebar: um indicador persistente, medido com offsetTop/offsetHeight e ResizeObserver, hover independente e destino pending imediato. aria-current representa a rota efetivamente montada.
- Relações de rota: estoque lateral; planejamento vertical curto; análises com entrada de até cinco grupos no fallback; agente com origem lateral/escala discreta; revisão com continuidade lateral; retorno com escala mínima.
- View Transitions captura somente workspace-page; `html { view-transition-name: none }` desliga a captura raiz para deixar sidebar/header vivos. Ocultar apenas o pseudo-elemento root não bastaria, pois os elementos capturados deixam de ser pintados no DOM durante a transição. Contrato: [CSS View Transitions, W3C](https://www.w3.org/TR/css-view-transitions-1/). WAAPI anima somente no fallback ou em voltar/avançar, sem competir com snapshots.
- Drawer usa somente WAAPI para entrada/saída, Escape e restauração do foco. Reduced motion cancela animações e conclui fechamentos.
- Estados do agente continuam reais; data-agent-phase e aria-busy descrevem o estado existente, sem novas etapas ou timers de processamento.
- Hover de elevação é reservado a links/cards interativos e dispositivos com hover. Tabelas continuam sem animação por linha. Temas e motores permanecem intactos.

## Roteiro visual obrigatório

1. Em `go-flow-public-ready`, executar `npm.cmd run build` e `npm.cmd run start -- --hostname 127.0.0.1 --port 3012`. Abrir `http://localhost:3012`. Se a apresentação já foi vista, usar **Rever apresentação** na sidebar.
2. Observar go → flow → Conheça → expansão → olá. Conferir os quatro cantos em desktop, tablet e mobile. Esperar em cada cena: nenhuma avança sozinha.
3. Percorrer as cinco cenas, voltar e clicar rapidamente. Conferir títulos, controles, máscaras e foco durante a passagem. Pular no logo, no meio do círculo e na última cena.
4. Escolher demo e importação local. Testar Claro, Escuro e Sistema.
5. Navegar pelas sete rotas, voltar/avançar no navegador e atualizar uma rota interna. Conferir o texto da busca. Testar o drawer com Tab, Shift+Tab e Escape.
6. Ativar reduced motion no navegador/dispositivo e repetir; testar também mudar a preferência durante o fechamento de um painel.
7. Na demo, testar go.agent → proposta válida → Central de Ações e revisão. Uma chamada real depende das variáveis já documentadas e não foi executada como parte da revisão visual.

A inspeção visual automatizada foi bloqueada: host de navegador indisponível; acesso nativo encerrado por não conseguir confirmar a URL atual com segurança. Testes automatizados não constituem aprovação visual. Máscaras editoriais e transições entre snapshots precisam de revisão nos navegadores/dispositivos de destino. Não houve medição de desempenho no navegador nem validação visual de desktop, tablet ou mobile.

## Correção da tinta do “olá.” e calibração

A regra genérica `:is(h1, p, mark, strong, .agent-title-accent, .handoff-wordmark)` tinha especificidade `(1,3,0)`, maior que a regra dedicada do título `(1,2,1)`. Ela aplicava `--scene-ink` ao h1. Durante a expansão, a regra condicionada a splash/frame 2 `(1,3,1)` ainda mantinha o rosa. Ao terminar o timer da expansão, o modo passava para scenes, a exceção deixava de corresponder e o h1 assumia navy. Não havia timer de avanço de cenas nem keyframe de cor causando essa mudança.

O h1 foi removido da regra genérica; as exceções de tinta por fase foram removidas. O título usa somente `--scene-title`, definido na própria cena, com transition desativada. Assim, a cena 1 e sua cópia de saída conservam `#9D2458` sobre `#DCEB16` (5,64:1), sem depender do tema do aplicativo.

| Movimento | Antes | Agora |
| --- | --- | --- |
| Hover compartilhado | 140–200 ms | 210–220 ms |
| Indicador | 420 ms | 440 ms |
| Entrada de menus/painéis | 280 ms | 330 ms |
| Saída de drawer / detalhes | 180 / 160 ms | 280 ms |
| Navegação | 380 ms | 480 ms |
| Cenas / remoção da saída | 650 ms | 780 ms |
| Círculo inicial | 680 ms | 820 ms |
| Entrada do “olá.” | 420 ms | 580 ms |

As curvas editoriais e espaciais agora distribuem o deslocamento por mais tempo, com aceleração inicial gradual. Pressionamento continua em 100 ms; cliques não aguardam a animação anterior. As máscaras radial, tipográfica, direcional, elíptica e a curva compartilhada foram preservadas.

O teste específico verifica tinta e fundo após a expansão, dois minutos ocioso, troca de tema e saída. Inclui uma guarda contra regras de tinta de corpo que selecionem o h1, pois happy-dom não reproduz integralmente a especificidade de :is(). A guarda foi validada reintroduzindo temporariamente o seletor defeituoso: o teste detectou a regressão e voltou a passar após restaurar a correção. Essa verificação em DOM emulado não substitui a comparação de cores computadas num navegador real. Nesta calibração, a tentativa de acesso ao Chrome retornou “The browser access host is unavailable”; não houve comparação em navegador real. A prévia atual está em http://localhost:3012.

## Validação técnica desta etapa

- Testes direcionados desta calibração (apresentação, navegação, contraste, temas e painéis): 212 passaram.
- Suíte completa: `npm.cmd run test:run -- --maxWorkers=2`, 672 testes em 29 arquivos, todos passaram.
- Na implementação anterior, a primeira execução completa, concorrente com o build, teve um timeout no teste existente de cache do calendário; ele passou na repetição com dois workers. Nenhum teste ou cálculo de calendário foi alterado nesta calibração.
- `npm.cmd run lint`: passou.
- `npm.cmd run build`, incluindo postbuild: passou; 350 artefatos inspecionados, sem referências ou traces de artefatos privados.
- Sem dependências adicionais, commit, push ou deploy. Integração Groq, WAF, dados, cálculos e datas não foram modificados nesta etapa.

## Arquivos da implementação Signature Motion

- Apresentação: [presentation.tsx](../src/components/presentation.tsx), [presentation.ts](../src/lib/presentation.ts), [signature-motion.css](../src/app/signature-motion.css).
- Navegação e interação: [app-shell.tsx](../src/components/app-shell.tsx), [motion.ts](../src/lib/motion.ts), [animated-details.tsx](../src/components/animated-details.tsx), [agent-workspace.tsx](../src/components/agent-workspace.tsx).
- Tokens e carregamento de estilos: [globals.css](../src/app/globals.css), [layout.tsx](../src/app/layout.tsx).
- Testes: [presentation.test.tsx](../tests/unit/presentation.test.tsx), [app-shell-motion.test.tsx](../tests/unit/app-shell-motion.test.tsx), [signature-motion.test.ts](../tests/unit/signature-motion.test.ts).
- Documentação: [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) e este arquivo. Alterações anteriores no workspace foram preservadas.
