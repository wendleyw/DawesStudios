# Mapa das telas e fluxos

```mermaid
flowchart TD
  A[Home / Workspace] --> B[Board do cliente]
  A --> S[Search / Notificações]
  B --> P[Projeto / formatos e versões]
  B --> N[Novo briefing]
  N --> T[1 Type / serviço]
  T --> C[2 Details / escolher ou criar campanha + título]
  C --> D[Entregáveis / badges + nomes + dimensões + quantidade]
  D --> H[Direção / Overview + Goals + Brand Hub]
  H --> F[Prazo e anexos opcionais]
  F --> R[3 Review]
  R --> AR[Awaiting review / agência]
  AR --> Q[Agência confirma créditos e explica ajustes]
  Q --> AC[Aceitar / cria projeto e registra um débito]
  AC --> P
  P --> V[Versão / um ou vários designs]
  V --> I[Design no canvas]
  I --> CA[Carrossel dentro da versão]
  I --> PI[Pin na peça + comentário à direita]
  P --> IN[Inspector / detalhes e mensagens]
  IN --> SR[Designer envia à agência]
  SR --> AP[Agência revisa]
  AP --> SH[Agência compartilha snapshot com cliente]
  SH --> CR[Cliente revisa]
  CR --> RE[Pedido de ajustes retorna à agência]
  RE --> AP
  CR --> OK[Aprovado]
  OK --> DE[Arquivos e entrega]
  AC --> CO[Credits / saldo, atividade e relatório]
```

## Brand Hub

Overview → Logos → Colors → Typography → Visual Style → Product Library → Brand Assets → Templates → Copy & Messaging → AI Brand Instructions.

- Overview: identidade, público, tom, regras e diretrizes.
- Logos: oito variações, formatos SVG/PNG/PDF e orientações.
- Colors: códigos e cópia HEX/RGB/CSS/Tailwind.
- Typography: hierarquia, texto de teste e fonte de referência.
- Visual Style: referências e regras de fotografia.
- Products: cada produto abre Assets, Specs e Rules.
- Brand Assets: pesquisa, categorias, detalhes, copiar referência e cadastro pela agência.
- Templates: categorias e editor de rascunho pessoal. Não cria projeto nem cobrança.
- Messaging: textos e regras de linguagem reutilizáveis.
- AI: contexto de marca reutilizável. Não existe serviço de IA conectado.

## Ações globais

Search; Notifications; navegação entre clientes; expandir/recolher sidebar. Apenas agência: conta, ajuda, reset, configurações e criação de cliente.

## Estados de navegação

- Board: Timeline / Kanban / List, filtros, busca, planning recolhido e vazio.
- Projeto: formato específico, V1/V2, múltiplas peças, comentários vazios/preenchidos, pin pendente/selecionado, zoom, envio e entrega.
- Briefings: All / Draft / Awaiting review / In progress; rascunho, enviado e aceito.
- Reviews: Waiting for review / Approved; feedback, pedido de alterações e aprovação.
- Créditos: saldo/atividade, relatório, filtros, breakdown, CSV, plano e recarga simulada.
- Indisponibilidade: projeto de sessão anterior e rascunho de template expirado.

Use `TELAS.md` e `manifest.json` para associar cada estado ao PNG correspondente.
