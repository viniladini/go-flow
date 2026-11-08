
# go.flow — Design System v4

> **Status:** especificação visual e de experiência do go.flow.
>
> **Objetivo:** preservar a base técnica existente e incorporar a identidade visual expressiva definida para a apresentação final.
>
> **Document hierarchy:**
> - AGENTS.md: arquitetura, segurança e desenvolvimento.
> - DESIGN_SYSTEM.md: identidade, componentes, layout, animações e acessibilidade.
> - docs/PRODUCT_SPEC.md: funcionalidades e contratos do produto.
>
> Funcionalidades descritas como objetivos visuais não devem ser consideradas implementadas até serem verificadas no código.

## Product identity

Product name: **go.flow**

Tagline: **From insight to action.**

AI agent: **go.agent**

Never rename go.agent to flow.agent.

go.flow é um protótipo independente de inteligência operacional, gestão de estoques, planejamento de compras e decisões assistidas por inteligência artificial, desenvolvido para o desafio da Gogroup.

Não apresentar o produto como uma solução corporativa oficial, licenciada ou endossada.

O produto possui dois ambientes distintos:

- Ambiente demonstrativo: dados sintéticos independentes.
- Importação local: processamento privado no navegador.

Ambos compartilham a experiência visual, mas seus dados nunca devem ser misturados.

### Brand personality

- Expressive.
- Intelligent.
- Contemporary.
- Precise.
- Premium.
- Approachable.
- Data-driven.
- Action-oriented.
- Fluid.
- Trustworthy.

### Creative principles

**expressive by nature. precise by design.**

**bold in expression. precise in execution.**

O visual deve transmitir criatividade e movimento sem comprometer a precisão das informações financeiras.

A linguagem visual combina:

- Expressividade editorial.
- Tipografia ousada.
- Minimalismo contemporâneo.
- Espaços generosos.
- Linhas curvas conectadas.
- Hierarquia financeira precisa.
- Interações suaves inspiradas na qualidade de aplicações macOS.
- Experiência coesa entre apresentação e produto.

Evitar interfaces genéricas, excesso de efeitos visuais e elementos puramente decorativos.

## Brand direction

### Core visual concept

O conceito central é **dados → inteligência → ação**.

Linhas curvas conectadas representam o movimento das informações dentro do produto.

Essas linhas podem aparecer em:

- Splash.
- Onboarding.
- Elementos de marca.
- Hero principal.
- Transições de contexto.
- Apresentação do go.agent.
- Indicadores de etapas.

As linhas não devem atravessar textos, ocultar controles ou dificultar a leitura.

### Visual composition principles

1. Uma manifestação visual marcante por tela.
2. Conteúdo operacional acima da decoração.
3. Contrastes editoriais deliberados.
4. Continuidade espacial entre elementos.
5. Movimento como resposta à interação.
6. Funcionalidade acessível sem animações.
7. Consistência em claro, escuro e sistema.

### Avoid

- Glassmorphism excessivo.
- Gradientes em todos os componentes.
- Sombras muito intensas.
- Efeitos neon.
- Animações permanentes.
- Loading artificial.
- Cards com aparência genérica de template.
- Cores decorativas em indicadores financeiros.
- Transições que escondam erros.
- Animações que atrasem a navegação.

## Design tokens

### Existing v3 brand tokens

Preservar a compatibilidade inicial com os tokens existentes.

| Token | Valor v3 |
| --- | --- |
| --navy | #19234A |
| --blue | #315EB5 |
| --coral | #FF806D |
| --lime | #E5F294 |
| Canvas | #F7F7F3 |
| White | #FFFFFF |
| Primary text | #242634 |
| Secondary text | #667085 |
| Border | #E5E7EB |
| Success | #16815D |
| Warning | #B96813 |
| Danger | #C83D4A |

Esses valores compõem a base anterior e não devem ser substituídos globalmente sem verificar os componentes afetados.

### v4 expressive brand targets

| Cor | Valor | Aplicação |
| --- | --- | --- |
| Deep Navy | #101629 | Splash, campos escuros e superfícies de marca |
| Expressive Blue | #1761B1 | Hero, superfícies expressivas e destaques |
| Established Blue | #315EB5 | Controles existentes e migração segura |
| Chartreuse Lime | #DCEB16 | Ponto da marca, curvas e destaques |
| White | #FFFFFF | Contraste e espaços editoriais |
| Warm Canvas | #F7F7F3 | Fundo claro |
| Optional Pink | Uso pontual | Pequenos detalhes gráficos |

Essas cores são propostas originais para o projeto, não códigos oficiais da marca institucional.

### Token migration strategy

Não alterar todos os tokens existentes de uma vez.

Criar aliases de marca quando necessário:

- --brand-deep
- --brand-blue
- --brand-chartreuse

Preservar os tokens semânticos utilizados pelos componentes.

Migrar um grupo de componentes por vez e verificar contraste, hover, foco e ambos os temas.

O lima intenso é uma cor de identidade, não uma cor de sucesso financeiro.

O rosa não substitui estados de erro, alerta ou risco.

### Spacing

Utilizar escala coerente baseada em 4px:

- 4px
- 8px
- 12px
- 16px
- 20px
- 24px
- 32px
- 40px
- 48px
- 64px

Respeitar a configuração Tailwind existente.

### Radius and elevation

- Card principal: aproximadamente 18px.
- Botões e controles: família consistente de raios.
- Sombras discretas em cards.
- Elevação maior apenas em popovers, modais e painel do agente.
- Bordas suaves para separar regiões.
- Evitar efeitos decorativos que prejudiquem dados densos.

## Typography

### Font families

Headings: **Plus Jakarta Sans**

Body: **Inter**

Usar next/font/google ou configuração existente.

Manter fallbacks adequados.

### Typography hierarchy

| Contexto | Tratamento |
| --- | --- |
| Splash | Tipografia muito grande, minúscula e expressiva |
| Onboarding | Títulos editoriais com espaço negativo |
| Dashboard hero | Título destacado e subtítulo breve |
| Page heading | Título funcional e contexto |
| Financial KPI | Número grande, legível e tabular |
| Card heading | Rótulo conciso e útil |
| Table | Alta legibilidade e densidade equilibrada |
| Metadata | Menor destaque, mas contraste suficiente |

### Text capitalization

No splash e onboarding, os títulos aprovados permanecem em minúsculas.

Os textos explicativos da aplicação usam capitalização convencional em português brasileiro.

Os nomes go.flow e go.agent permanecem sempre em minúsculas.

### Financial typography

- Utilizar locale pt-BR.
- Formatar BRL com separadores corretos.
- Aplicar tabular-nums quando possível.
- Identificar unidades, períodos e datas relevantes.
- Não truncar valores financeiros críticos.
- Distinguir valores reais, estimados e simulados.

## Desktop layout

### Application shell

Aplicação desktop-first e responsiva.

Sidebar persistente em desktop com aproximadamente 240–260px.

Fundo principal claro ou escuro conforme tema escolhido.

Header com:

- Contexto da página.
- Fonte ativa.
- Informações de período, quando aplicável.
- Controle de aparência.
- Ações relevantes.

O dashboard deve funcionar adequadamente em resoluções de 1366px e 1440px.

Utilizar grid de 12 colunas quando realmente melhorar o layout.

### Cards

- Superfícies semânticas.
- Bordas discretas.
- Sombras moderadas.
- Espaçamento consistente.
- Títulos claros.
- Indicadores contextualizados.
- Estados vazios e de erro.
- Origem dos dados identificável.

### Visual hierarchy

Os indicadores devem responder:

1. O que está acontecendo?
2. Qual é o impacto?
3. Por que importa?
4. O que o usuário pode fazer?

Não adicionar cards para preencher espaços vazios.

## Logo

Criar um wordmark original **go.flow**.

A identidade pode utilizar:

- Tipografia expressiva.
- Ponto lima.
- Símbolo abstrato de movimento.
- Linhas curvas conectadas.

Preferir SVG reutilizável.

### Logo variants

- Horizontal.
- Compacta.
- Monocromática.
- Claro.
- Escuro.

Não copiar logotipos, símbolos ou mascotes proprietários de outras empresas.

## Navigation

### Main routes

1. Visão Geral — /
2. Saúde do Estoque — /estoque
3. Compras Inteligentes — /compras
4. Oportunidades — /oportunidades
5. go.agent — /agente
6. Central de Ações — /acoes
7. Flow Import — /importar

Verificar as rotas reais antes de alterar a navegação.

### Sidebar

- Fundo azul profundo.
- Ícones Lucide consistentes.
- Estado ativo visível.
- Indicador ativo com movimento discreto, se implementado.
- Contraste acessível.
- Navegação por teclado.
- Acesso direto ao go.agent.
- Link para rever a apresentação, quando implementada.

### Source selection

A seleção entre demo e importação deve ser explícita.

Navegar entre páginas não pode apagar a sessão importada.

Não misturar métricas dos dois ambientes.

### Mobile navigation

Utilizar drawer acessível ou navegação compacta equivalente.

Manter botões com áreas de toque apropriadas.

Evitar overflow horizontal da página.

## Dashboard composition

### Header

Eyebrow: **INTELIGÊNCIA OPERACIONAL**

Headline: **Sua operação, em movimento.**

Subtitle: **Dados que orientam. Inteligência que executa.**

### Main sections

1. KPI overview.
2. Inventory health distribution.
3. Financial impact overview.
4. go.agent executive analysis.
5. Priority actions / go.pulse.
6. Stock and demand trend.

### KPI cards

Mostrar somente métricas sustentadas pelos dados ativos e motores existentes.

A informação deve distinguir:

- Valor observado.
- Estimativa.
- Projeção.
- Simulação.
- Informação indisponível.

Não usar zero no lugar de informação desconhecida.

### go.pulse

Conjunto compacto de sinais operacionais calculados.

Exemplos possíveis:

- Produtos com risco de ruptura.
- Capital imobilizado.
- Incerteza de demanda.
- Restrições de compras.
- Pendências importantes.

Cada sinal deve apontar para uma ação ou tela funcional.

Não gerar alertas fictícios para preencher a interface.

## Content rules

Idioma principal: português brasileiro.

### Product voice

- Inteligente.
- Claro.
- Objetivo.
- Contemporâneo.
- Profissional.
- Próximo, sem excesso de informalidade.

Agent greeting:

**O que vamos resolver hoje?**

Evitar mensagens genéricas de chatbot.

### Data honesty

- Nunca inventar indicadores observados.
- Identificar a fonte ativa.
- Informar período de referência.
- Diferenciar histórico de projeção.
- Identificar premissas relevantes.
- Não prometer economias não comprovadas.
- Não apresentar estimativas condicionais como garantias.

### Demo and imported source labels

Ambiente demonstrativo:

**Ambiente demonstrativo · dados sintéticos**

Importação:

**Importação local · processamento no navegador**

Os rótulos podem ser abreviados em layouts compactos, mas a distinção precisa permanecer clara.

### Purchase review wording

Utilizar:

- Proposta demonstrativa.
- Aguardando revisão.
- Aprovação demonstrativa.
- Proposta rejeitada.
- Nenhuma compra executada.

Evitar:

- Compra concluída.
- Pedido enviado.
- Fornecedor notificado.

Essas afirmações somente seriam válidas se existisse uma execução real, que não faz parte do produto atual.

## Interaction

### Functional integrity

- Toda navegação aponta para rota funcional.
- Todo botão realiza uma ação verdadeira.
- Funções indisponíveis ficam desabilitadas ou identificadas.
- Não apresentar toast de sucesso sem confirmação real.
- Não simular execução da IA.
- Não adicionar loading artificial.
- Exibir estados de erro e recuperação.
- Confirmar exclusão ou limpeza de dados.
- Preservar contexto de navegação quando possível.

### Feedback timing

- Hover e pressão: 100–200ms.
- Menus: 180–240ms.
- Drawers: 260–360ms.
- Tema: 350–450ms.
- Cenas editoriais: 500–900ms.
- Flow Handoff: 600–850ms.

Esses valores são referências, não atrasos obrigatórios.

### Invisible Craft

- Indicador de navegação suave.
- Feedback claro após cálculos.
- Estados de confirmação.
- Contexto de filtros preservado.
- Transições discretas.
- Tooltips explicativos.
- Estados vazios bem escritos.
- Microinterações consistentes.
- Foco restaurado após modais.
- Animações numéricas apenas quando valores reais mudarem.

Não implementar Focus Mode separado.

## Responsive behavior

### Desktop

Sidebar persistente, tabelas completas e múltiplas colunas.

### Tablet

Sidebar compacta ou drawer; grids reduzidos.

### Mobile

- Navegação acessível.
- Cards empilhados.
- Tabelas com rolagem interna quando necessário.
- Botões visíveis.
- Painel do agente adaptado.
- Nenhum overflow global desnecessário.

Não depender de hover para interações essenciais.

## Accessibility

### Requirements

- HTML semântico.
- Navegação por teclado.
- Foco visível.
- Rótulos acessíveis.
- Contraste adequado.
- Estados não comunicados apenas por cores.
- Mensagens de erro compreensíveis.
- Modais com foco controlado.
- Suporte a prefers-reduced-motion.

### Contrast targets

- Texto normal: pelo menos 4.5:1.
- Indicadores de foco e contornos relevantes: pelo menos 3:1, conforme aplicabilidade.
- Valores financeiros sempre legíveis.

### Reduced motion

Com prefers-reduced-motion:

- Desabilitar grandes deslocamentos.
- Desabilitar Color Flow expansivo.
- Reduzir ou remover animações de entrada.
- Apresentar imediatamente os estados finais.
- Preservar integralmente todas as funcionalidades.

## Footer

Texto permitido:

**Protótipo independente para avaliação. Não representa um produto oficial ou endossado.**

Não reproduzir material confidencial no rodapé.

## Aparência: Claro, Escuro e Sistema

### Appearance options

Três opções no cabeçalho:

- Claro.
- Escuro.
- Sistema.

Ícones:

- Sol.
- Lua.
- Monitor.

Sistema é o padrão quando não existe preferência válida.

### Persistence

Chave de armazenamento:

`go.flow.appearance`

Valores permitidos:

- light
- dark
- system

Se localStorage estiver bloqueado, a aplicação continua funcionando.

Preferências podem ser mantidas apenas durante a sessão.

Sincronizar mudanças de aparência entre abas quando possível.

Nunca salvar dados operacionais junto da preferência.

### Inicialização e hidratação

Preservar o comportamento técnico estabelecido na v3.

Um script inline estático no head resolve a aparência antes da primeira pintura.

Aplica no elemento html:

- data-theme=light|dark
- data-appearance
- color-scheme

Não lê dados privados nem realiza requisições.

A regra CSS prefers-color-scheme serve como fallback.

O seletor utiliza useSyncExternalStore com snapshot estável para SSR e hidratação inicial.

Restringir suppressHydrationWarning ao elemento html quando seus atributos forem alterados pelo bootstrap.

Não usar suppressHydrationWarning para esconder inconsistências de conteúdo.

A escolha do tema não pode modificar dados, KPIs ou estruturas operacionais.

Referência técnica:
https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering

### Semantic tokens — v3 compatibility contract

Não inverter cores automaticamente.

Todos os componentes devem utilizar tokens semânticos.

A tabela a seguir representa a base técnica anterior; qualquer migração visual precisa preservar comportamento e contraste.

| Token | Claro | Escuro |
| --- | --- | --- |
| `--background` | `#F7F7F3` | `#101629` |
| `--surface` | `#FFFFFF` | `#1B2640` |
| `--foreground` | `#242634` | `#F7F8FC` |
| `--text-strong` | `#19234A` | `#F7F8FC` |
| `--muted` | `#667085` | `#B7C1D9` |
| `--border` | `#E5E7EB` | `#303B54` |
| `--border-subtle` | `#EFF0F3` | `#303B54` |
| `--accent` | `#315EB5` | `#9ABAFF` |
| `--focus-ring` | `#315EB5` | `#AAC7FF` |
| `--control-border` | `#8994A8` | `#71809E` |
| `--hover-background` | `#EDF0F6` | `#25334F` |
| `--surface-subtle` | `#F0F3F8` | `#142037` |
| `--header-background` | `#FFFFFF` | `#1B2640` |
| `--table-header-background` | `#F5F6F9` | `#24324C` |
| `--table-hover` | `#FAFBF7` | `#23314B` |
| `--muted-icon` | `#667085` | `#B7C1D9` |
| `--action-background` | `#19234A` | `#315EB5` |
| `--action-hover` | `#24458A` | `#416FCB` |
| `--on-action` | `#FFFFFF` | `#FFFFFF` |
| `--neutral-background` | `#EDF0F5` | `#29354D` |
| `--neutral-text` | `#536079` | `#D0DAEE` |
| `--success-background` | `#E9F5EE` | `#173C30` |
| `--success-text` | `#166344` | `#8DE2B4` |
| `--warning-background` | `#FFF4E5` | `#44351F` |
| `--warning-text` | `#865009` | `#FFD28A` |
| `--danger-background` | `#FFF0ED` | `#492733` |
| `--danger-text` | `#9C3039` | `#FFABB5` |
| `--discontinued-background` | `#F0EDF6` | `#342947` |
| `--discontinued-text` | `#685184` | `#D5B8FF` |
| `--success` | `#16815D` | `#8DE2B4` |
| `--warning` | `#B96813` | `#FFD28A` |
| `--danger` | `#C83D4A` | `#FFABB5` |
| `--info-background` | `#EDF0F6` | `#24324C` |
| `--info-border` | `#DFE5F0` | `#3C4D6C` |
| `--info-text` | `#52607A` | `#C3CEE6` |
| `--info-strong` | `#38476A` | `#DFE7FA` |
| `--phase-background` | `#EEF0E5` | `#303A29` |
| `--phase-border` | `#DEDFD8` | `#59694A` |
| `--phase-text` | `#59624D` | `#E5F294` |
| `--phase-dot` | `#687346` | `#C6D588` |
| `--demo-background` | `#EEF1E6` | `#293421` |
| `--demo-border` | `#DDE4C9` | `#556342` |
| `--demo-text` | `#515C40` | `#D5DFB9` |
| `--demo-strong` | `#3C4B22` | `#E5F294` |
| `--demo-icon` | `#596B2B` | `#E5F294` |
| `--demo-tag-background` | `#EEF1E6` | `#293421` |
| `--demo-tag-border` | `#A1AD68` | `#59694A` |

### Constant tokens

| Token | Valor |
| --- | --- |
| `--navy` | `#19234A` |
| `--blue` | `#315EB5` |
| `--coral` | `#FF806D` |
| `--lime` | `#E5F294` |
| `--sidebar-background` | `var(--navy)` |
| `--sidebar-text` | `#CBD2E5` |
| `--sidebar-muted` | `#C3C9DC` |
| `--sidebar-caption` | `#AEB9D7` |
| `--sidebar-hover` | `#263256` |
| `--sidebar-active` | `#2A3547` |
| `--sidebar-border` | `#485572` |
| `--sidebar-chip` | `#293459` |
| `--on-brand` | `#FFFFFF` |
| `--on-lime` | `#19234A` |
| `--lime-hover` | `#F0FABD` |
| `--hero-background` | `var(--navy)` |
| `--hero-text` | `#C8D0E5` |
| `--hero-muted` | `#BFC9E1` |
| `--hero-art` | `#3B486F` |
| `--focus-on-brand` | `var(--lime)` |
| `--overlay` | `#080D1CCC` |

### Structural tokens

- `--radius-card: 18px`
- Light shadow: `0 3px 14px #19234A03`
- Dark shadow: `0 4px 16px #00000020`

Anéis de foco com 3px.

Manter mappings de Tailwind 4 em @theme inline e variante escura baseada em data-theme=dark.

### Theme verification

Verificar:

1. Claro.
2. Escuro.
3. Sistema.
4. Persistência após refresh.
5. Sincronização entre abas.
6. Storage bloqueado.
7. Ausência de flash.
8. Ausência de hydration mismatch.
9. Contraste de controles.
10. Legibilidade de tabelas e métricas.

## Operational components

### Shared shell

Sidebar e header consistentes.

Indicador de página ativa claro.

Fonte ativa visível.

Controle de aparência acessível.

### KPI cards

Números verdadeiros, derivados dos motores.

Unidade e período identificados.

Nenhuma animação de contador fictícia.

### Stock tables

- Riscos semânticos.
- Quantidades e custos claros.
- Filtros funcionais.
- Status de descontinuados.
- Estoque físico separado de recebimentos pendentes.
- Estados vazios e de erro.

### Compras Inteligentes

- Orçamento.
- Custo da proposta.
- Saldo.
- Quantidades.
- MOQ.
- Múltiplos.
- Lead time.
- Pendências.
- Prioridades justificadas.

Utilização de orçamento não equivale a qualidade da decisão.

### Oportunidades

Relacionar problema calculado e ação possível.

Identificar estimativas.

Nunca afirmar economia confirmada sem evidência.

### Flow Import

Preservar o wizard em etapas individuais.

Requisitos:

- Reconhecimento de arquivos pelo conteúdo.
- Validação.
- Alertas.
- Parâmetros explícitos.
- Confirmação para limpar/substituir.
- Sessão preservada durante navegação.
- Processamento local.
- Ausência de envio ao Groq.

### go.agent

O agente precisa demonstrar execução real.

Fluxo:

1. Solicitação.
2. Interpretação.
3. Tool calling.
4. Smart Buying.
5. Proposta registrada.
6. Revisão humana.

### Central de Ações

Mostrar:

- Identificador da proposta.
- Data.
- Fonte.
- Ferramenta.
- Modelo.
- Valor.
- Quantidade de itens.
- Status.
- Critérios.
- Detalhamento.
- Ações de revisão.

Aprovar ou rejeitar altera apenas a revisão demonstrativa.

Nunca emitir compras reais.

## Motion and interaction grammar

### Motion philosophy

Movimento deve indicar continuidade, contexto e causalidade.

Não deve esconder dados ou simular processamento.

### Motion tokens

| Interação | Duração |
| --- | --- |
| Hover / press | 100–200ms |
| Menu / popover | 180–240ms |
| Drawer / agent panel | 260–360ms |
| Theme interpolation | 350–450ms |
| Editorial transitions | 500–900ms |
| Flow Handoff | 600–850ms |

Preferir transform e opacity.

Evitar animações custosas de layout.

### Flow Reveal

Uma linha curva conduz visualmente a apresentação de novos elementos.

Utilizar principalmente em cenas editoriais e hero.

Não cobrir texto ou controles.

### Morph & Focus

Uma forma conectada se transforma suavemente para direcionar atenção.

Aplicações:

- Apresentação do go.agent.
- Escolha da fonte.
- Mudança de cena.

### Color Flow

O ponto lima ou palavra destacada se expande para uma superfície de cor.

Utilizar somente em momentos significativos.

Evitar flashes repetidos e excesso de contraste animado.

### Flow Handoff

Transição entre onboarding e aplicação:

1. CTA se contrai.
2. Linha curva conduz o olhar.
3. Título principal sai.
4. Fundo se transforma na superfície da aplicação.
5. Sidebar entra.
6. Wordmark se estabiliza.
7. go.agent aparece por último.

Executar somente quando a tela de destino estiver pronta.

Não apagar sessões ou modificar dados durante o handoff.

## Splash — Made of Motion

### Core sequence

Sequência aprovada:

**go. → go.flow → olá.**

### First visit

1. Fundo azul profundo.
2. go. aparece em tipografia expressiva.
3. flow desliza lateralmente.
4. As palavras se unem em go.flow.
5. O ponto lima cresce e produz Color Flow.
6. O campo visual retorna a uma composição contrastante.
7. olá. entra suavemente de cima.
8. A primeira cena do onboarding começa.

O efeito deve parecer contínuo.

### Returning visit

Não forçar onboarding completo.

Exibir diretamente a aplicação quando pronta.

Uma animação curta pode existir apenas durante carregamento real.

Disponibilizar opção Rever apresentação.

### Reduced motion

Apresentar identidade estática e acesso imediato.

### Splash constraints

- Não bloquear o usuário.
- Não introduzir atrasos artificiais.
- Não criar loops infinitos.
- Não esconder mensagens de erro.
- Não executar operações financeiras durante a abertura.

## Onboarding — Five scenes

### Scene overview

| Cena | Título | Objetivo |
| --- | --- | --- |
| 01 | olá. | Apresentação |
| 02 | ousados. inquietos. criativos. | Personalidade |
| 03 | o próximo movimento começa aqui. | Dados, inteligência e ação |
| 04 | conheça o go.agent. | Apresentação do agente |
| 05 | como deseja começar? | Escolha de ambiente |

### Scene 01 — olá.

Continuação visual do splash.

Apresentar o go.flow de maneira breve, clara e confiante.

Usar bastante espaço negativo.

Transição suave.

### Scene 02 — ousados. inquietos. criativos.

Tipografia editorial forte.

Palavras podem entrar em momentos diferentes.

Composição expressiva.

Cores de marca equilibradas.

Não afirmar vínculo institucional oficial.

### Scene 03 — o próximo movimento começa aqui.

Mostrar a cadeia:

**dados → inteligência → ação**

Usar Flow Reveal.

Explicar como os dados se transformam em recomendações e propostas verificáveis.

### Scene 04 — conheça o go.agent.

Introduzir o Flow Orb.

Explicar que o agente utiliza ferramentas reais.

Diferenciar coordenação por IA de cálculo financeiro determinístico.

Não simular uma ação já concluída.

### Scene 05 — como deseja começar?

Duas opções:

**Explorar ambiente demonstrativo**

- Sem login.
- Dados sintéticos independentes.
- Acesso aos dashboards.
- go.agent com Groq.

**Analisar operação local**

- Seleção explícita de arquivos.
- Processamento no navegador.
- Sem envio de dados privados à IA externa.
- Acesso às análises locais.

A última cena deve ser mais calma e funcional.

### Onboarding controls

- Voltar.
- Avançar.
- Pular.
- Indicador de progresso.
- Escolha final.
- Rever apresentação.

Rever onboarding não pode limpar dados importados.

A navegação deve funcionar por teclado e respeitar reduced-motion.

## go.agent visual identity — Flow Orb

### Character direction

Criar mascote original, compacto e expressivo.

Características:

- Orb azul profundo.
- Silhueta arredondada.
- Olhos pequenos e expressivos.
- Fita curva verde-lima.
- Pequeno acento rosa opcional.
- Acabamento 2D ou semi-flat premium.
- Sombra ou glow muito discreto.

Não utilizar mascotes copiados.

Evitar 3D pesado ou animação constante.

### Floating entry point

Posicionamento preferencial: canto inferior direito.

Nome acessível:

**Abrir go.agent**

Ao clicar:

- Painel contextual abre.
- Estado mantém conexão visual com o mascote.
- Usuário pode fechar.
- Foco retorna ao controle.
- Rota /agente continua disponível.

No mobile, não encobrir botões importantes.

### Visual states

| Estado | Condição | Comportamento |
| --- | --- | --- |
| Idle | Sem tarefa | Presença discreta |
| Analyzing | Execução real | Progresso moderado |
| Attention | Alerta calculado | Informação contextual |
| Ready | Ferramenta e registro concluídos | Confirmação discreta |
| Error | Falha | Erro verdadeiro e tentativa de recuperação |

Nenhuma animação deve fingir que houve sucesso.

## Charts and analytical visualization

### Principles

Gráficos existem para apoiar decisões.

Usar cores relacionadas e estados semânticos.

Exibir unidades e períodos.

Não distorcer eixos.

Não apresentar projeções como histórico.

### Chart types

| Gráfico | Uso |
| --- | --- |
| Line / Area | Séries temporais de venda, estoque e demanda |
| Horizontal bar | Capital, categorias e riscos |
| Donut | Distribuição de um total conhecido |
| Bar + Line | Estoque versus vendas por SKU |
| Scatter | Capital imobilizado versus giro |
| Waterfall | Orçamento, alocação e saldo |
| Heatmap | Concentração temporal ou operacional de riscos |

Todo gráfico deve possuir:

- Título.
- Métrica definida.
- Unidade.
- Fonte.
- Período.
- Tooltip.
- Escala honesta.
- Alternativa textual acessível.

Não implementar todos os gráficos apenas para cumprir uma lista.

### SKU X-Ray

Drawer contextual opcional com:

- Identificação do SKU.
- Histórico observado.
- Estoque disponível.
- Entradas pendentes.
- Cobertura.
- Demanda projetada.
- Critérios de cálculo.
- Gráfico contextual.

Não é bloqueador da entrega.

### go.moves

Representação da sequência de análises e ações propostas.

Não é um sistema de execução de compras.

### Flow Replay

Exibir apenas eventos verificados:

**fonte → regra/ferramenta → resultado → proposta → revisão**

Não inventar raciocínio oculto do modelo.

### Flow Lab

Funcionalidade opcional de simulações determinísticas.

Cenários possíveis:

- Preserve cash.
- Balanced.
- Protect service.

Usar apenas quando os motores suportarem comparações reais.

Não apresentar controles falsamente funcionais.

## Privacy cues

Identificar fonte ativa.

Nunca misturar demo e importação.

Nenhum dado privado deve ser enviado ao Groq.

Não mostrar parâmetros confidenciais no conteúdo estático do produto.

Não expor chaves de API.

Não afirmar segurança ou isolamento sem implementação e testes.

## Implementation priorities

### Phase 1 — Core visual refinement

- Tokens.
- Sidebar.
- Header.
- Cards.
- Tabelas.
- Formulários.
- Fonte ativa.
- go.agent.
- Central de Ações.

### Phase 2 — Signature experience

- Splash.
- Onboarding.
- Flow Handoff.
- Flow Orb.
- Transições expressivas.

### Phase 3 — Optional enhancements

- Gráficos avançados.
- SKU X-Ray.
- Flow Lab.
- Command palette.
- Microinterações adicionais.

A auditoria e a publicação funcional têm prioridade sobre efeitos opcionais.

## Visual acceptance checklist

1. Nome go.flow consistente.
2. Nome go.agent consistente.
3. Demo funcional sem login.
4. Importação local preservada.
5. Smart Buying não alterado pelo redesign.
6. Agente executando ferramenta real.
7. Proposta registrada e revisável.
8. Claro/escuro/sistema funcionando.
9. Hidratação sem erros.
10. Contraste adequado.
11. Responsividade.
12. Splash e onboarding acessíveis, se implementados.
13. Dados e projeções corretamente identificados.
14. Sem informações confidenciais publicadas.
15. Sem animações falsas de carregamento ou execução.
16. Sem mudanças inesperadas de estado.
17. Sem compras reais.
18. Sem dependências visuais desnecessárias.

## Do-not-break list

- Motores analíticos.
- Smart Buying Engine.
- Flow Import.
- Worker local.
- Provider persistente.
- Fonte ativa única.
- plan_demo_purchases.
- Integração Groq exclusivamente no servidor.
- Central de Ações.
- Revisão demonstrativa.
- Privacidade dos dados importados.
- Aparência light/dark/system.
- Rotas existentes.
- Testes anteriores.

## Verification

Testes durante desenvolvimento devem ser direcionados.

Executar a suíte completa nos marcos de integração e publicação.

Comandos:

npm run test:run
npm run lint
npm run build

A interface deve ser verificada também no navegador real.

Não fazer commit, push ou deploy automaticamente durante tarefas visuais.

## Apresentacao, motion e calendario demonstrativo

O workspace preserva fundos, superficies e contraste dos temas originais.
`--workspace-field` aponta para `--background`, inclusive no handoff. A paleta
multicolorida pertence exclusivamente a apresentacao, nunca ao dashboard.

O ponto original usa `--brand-chartreuse` e expande em 820 ms. A cena 01 nasce
no MESMO token. A sequencia manual agora e chartreuse, deep navy, expressive
blue, canvas off-white e deep navy, conforme as cinco cenas v4. Cada canvas
carrega fundo e tinta juntos; mascaras diferentes substituem a interpolacao
que podia reduzir contraste durante a passagem. O rosa escuro e restrito ao
"ola.". Avancar/voltar substitui a transicao sem bloquear o clique.
Reduced motion elimina movimentos e mascaras. Matriz calculada, arquitetura
e roteiro local em [Signature Motion](docs/SIGNATURE_MOTION.md).

Ao terminar, a cortina usa o fundo do tema atual e aguarda o destino montado.
O shell e as sessoes permanecem montados. Navegadores com View Transitions
fazem crossfade entre snapshots do conteudo na navegacao SPA; o fallback usa
Web Animations sem atrasar a navegacao. A sidebar responde ao destino pendente
antes do commit. Drawer e paineis possuem entrada e saida coordenadas; seus
controles continuam nativos e acessiveis por teclado. Nenhuma biblioteca nova.

Novas demos capturam o dia civil da execucao em America/Sao_Paulo. Historico de
120 dias, pedidos, lead times e horizonte (+2 a +90 dias) se deslocam juntos,
sem mudar quantidades ou formulas. Cache publico expira por dia; HTML estatico
antigo e atualizado apos hidratacao, sem mismatch. Uma aba aberta confere a
virada a cada 30 segundos. Importacoes e comprovantes anteriores nao sao
reescritos. Data-base e periodo projetado permanecem separados da execucao real.

As melhorias anteriores de formatacao, alerta por categoria e transparencia
do orcamento permanecem. Nao elevar cards somente informativos nem simular
etapas de processamento que o servidor nao fornece.

A experiencia visual NAO esta aprovada sem inspecao real no navegador, incluindo
mobile, claro/escuro/sistema, passagem do ponto para a primeira cena e retorno
ao workspace. Testes automaticos nao substituem essa inspecao.
