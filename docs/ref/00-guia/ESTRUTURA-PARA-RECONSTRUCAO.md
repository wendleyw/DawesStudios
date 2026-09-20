# Estrutura sugerida para o reinício

Esta é uma proposta de organização, separada do registro visual. Ainda não foi implementada.

## Unidades de domínio

1. Workspace e perfis: shell, navegação, busca, notificações e escopo visível.
2. Clientes e campanhas: contexto de marca e agrupamento de projetos.
3. Briefings: catálogo de serviços, rascunhos, wizard, revisão e aceite.
4. Projetos: entregáveis, versões, designs, atribuição interna e publicação.
5. Comentários: threads de projeto e de design; canal explícito; pins normalizados.
6. Revisões e entregas: envio do designer, revisão da agência, publicação ao cliente, feedback e entrega.
7. Brand Hub: bibliotecas, direção, produtos, templates e contexto de marca.
8. Créditos: estimativas, orçamento aprovado, lançamentos e relatórios.
9. Administração: workspace, equipe, clientes e presets.

## Separação de componentes

- Um shell compartilhado com navegação derivada do perfil.
- Páginas pequenas por domínio; evitar concentrar rotas, formulários, modais e regras em um componente central.
- Board e Canvas separados: o primeiro agrupa projetos; o segundo mostra formatos, versões e peças.
- Reviewer do design compartilhado entre perfis, recebendo somente dados do canal autorizado.
- Briefing com estado único do rascunho e seções de formulário independentes.
- Catálogos de serviço e formato declarativos, sem multiplicar automaticamente preço por badge.
- Brand Hub em módulos independentes. Template draft não deve virar um projeto implicitamente.
- Modais nomeados pela ação: AddDesign, NewVersion, SendForReview, ReviewFeedback, Delivery, Share, TopUp etc.

## Entidades de referência

Client → Campaign → Project → Deliverable → Design.

- `Briefing`: solicitação de projeto, serviço principal, campanha explicitamente definida, entregáveis e direção.
- `Deliverable`: nome, formato, largura/altura ou regra de dimensionamento, quantidade, original/adaptação.
- `Design`: identidade estável, versão, entregável e nome da peça.
- `PublishedVersion`: cópia explícita autorizada pela agência para o cliente.
- `Comment`: autor do canal, texto, projeto/design e posição opcional normalizada x/y.
- `BrandProfile`: direção, bibliotecas e recursos reutilizáveis.
- `TemplateDraft`: rascunho pessoal derivado de template, separado de cobrança e produção.
- `CreditEntry`: alocação, recarga simulada ou débito único do aceite.

## Ordem recomendada de validação visual

1. Shell e menus por perfil.
2. Board e navegação até o projeto.
3. Canvas, versões, múltiplas peças e comentários.
4. Briefing completo e revisão pela agência.
5. Brand Hub e reaproveitamento no briefing.
6. Revisões, publicação e entrega.
7. Créditos e administração.
8. Estados vazios, longos, sem resultados e responsivos.

## Referência de origem

| Área | Arquivo atual |
|---|---|
| Shell, rotas e ações globais | `app/prototype.tsx` |
| Board e versões | `app/canvas.tsx` |
| Timeline / Kanban | `app/planning-frame.tsx` |
| Inspector | `app/inspector.tsx` |
| Design com pins | `app/design-viewer.tsx` |
| Conversas | `app/project-comments.tsx` |
| Briefing | `app/briefing-flow.tsx`, `app/briefing-fields.tsx`, `app/briefing-detail.tsx` |
| Catálogo | `app/briefing-catalog.ts` |
| Brand Hub | `app/brand-hub.tsx`, `app/brand-context.ts` |
| Home, listas e settings | `app/screens.tsx` |
| Créditos | `app/credit-model.ts`, `app/credits-screen.tsx` |
| Dados fictícios | `app/demo-data.ts` |
| Estilos e UI | `app/globals.css`, `app/ui.tsx` |

Os caminhos são relativos ao projeto original. Os screenshots são a referência visual transportável. Não interpretar placeholder como funcionalidade real já implementada.
