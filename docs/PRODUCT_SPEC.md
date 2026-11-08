# go.flow — decisões estáveis

- Produto independente de inteligência operacional para o desafio GoGroup.
- Identidade: go.flow; agente go.agent. Interface e documentação em português brasileiro.
- Demonstração utiliza dados sintéticos independentes, identificados como tal.
- Flow Import em `/importar`: cinco CSVs do contrato `goflow-operational-csv/v1`,
  reconhecidos por conteúdo, com classificação revisável e validação integral.
- CSVs originais não acompanham código, public, fixtures, documentação ou build.
- Importação ocorre exclusivamente no navegador, em Web Worker, sem transmissão,
  persistência ou acesso de provedores de IA. Dataset somente em memória da aba.
- Parâmetros operacionais são explícitos e obrigatórios, sem defaults da demonstração.
- Erros impeditivos bloqueiam a ativação. Alertas exigem reconhecimento; não constituem
  aprovação operacional de regras exploratórias. Nunca preencher ausência com zero.
- Sessões e parâmetros são substituídos integralmente; limpar ou recarregar elimina a origem importada.
- Navegação interna preserva a sessão. Origem ativa e origem dos painéis devem ser claras.
- O layout raiz mantém também o wizard e seu Worker durante navegação interna;
  uma etapa fica visível por vez. Erros bloqueiam, alertas exigem reconhecimento,
  e limpar/substituir requer confirmação explícita. Refresh pode apagar a sessão.
- Motores determinísticos separados da interface, custos inteiros em centavos,
  rastreabilidade, integridade temporal e MOQ na unidade comercial.
- Compras são apenas rascunhos sujeitos a revisão humana; nunca enviar pedidos reais.
- Visão geral, estoque, compras e oportunidades usam uma fonte ativa única: demo de
  500 SKUs sintéticos independentes ou operação importada. Cálculos importados rodam
  em Worker local, sem fallback demonstrativo durante carregamento ou erro.
- Compras operacionais exigem orçamento, horizonte e taxas explícitos, sem herdar
  parâmetros do case. Sem campanhas inferidas ou buffer calibrado; meta não é garantia.
- go.agent usa Groq somente na demo sintética, com tool calling server-side para
  gerar rascunhos pelo Smart Buying. Números e recomendações não vêm do texto do LLM.
- Central de Ações registra execuções verificadas e revisão humana demonstrativa;
  nenhuma aprovação envia pedidos. Histórico e status ficam na memória da aba;
  comprovantes assinados e vinculados à sessão permitem revisão entre instâncias
  sem registro global de propostas. Revisão é demonstrativa, sem garantia de uso único. Na fonte importada, solicitação e revisão externas são bloqueadas.
- Fora do escopo atual: ERP, execução comercial, persistência durável e publicação.

Detalhes: [Flow Import](flow-import.md), [analytics](analytics-engine.md),
[Smart Buying Engine](smart-buying-engine.md) e [design system](../DESIGN_SYSTEM.md).
Integração das quatro abas: [operação](operational-integration.md).
Agente e revisão: [go.agent](go-agent.md).
