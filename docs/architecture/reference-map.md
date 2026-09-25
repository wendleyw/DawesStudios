# Reference map and workflow interpretation

Status: reference inspection and route proposal. This map does not claim that every route or action is implemented. The user explicitly treats `docs/ref` as inspiration, not a screen-by-screen reproduction contract. Build a minimalist, lightweight, modern product with real workflows, using the [design system](design-system.md) for decisions and audit criteria.

## Source inventory

The package contains 711 PNGs and 711 [manifest](../ref/manifest.json) records: 306 agency, 247 client, and 158 designer. All manifest viewports are 1600 × 1000. It describes 499 base states plus 212 scroll continuations. Counts are reference inventory, not an acceptance quota. The original Portuguese file names and reference documents remain untouched so evidence links stay valid; new product content and architecture documentation use English.

| Source | Purpose |
|---|---|
| [Visual index](../ref/INDEX.html) | Browse all screenshots locally |
| [Manifest](../ref/manifest.json) | Exact image path, role, source hash route, navigation steps, controls, native select options, viewport, scroll position, and checksum |
| [Screen catalog](../ref/TELAS.md) | Original screenshot descriptions and navigation |
| [Reference interpretation guide](../ref/00-guia/LEIA-PRIMEIRO-AGENTE.md) | Prototype context and important interaction intent |
| [Flow map](../ref/00-guia/MAPA-DE-FLUXOS.md) | Briefing, production, review, publication, and delivery sequence |
| [Role boundaries](../ref/00-guia/PERFIS-E-PERMISSOES.md) | Agency/client/designer information separation |
| [Service catalog](../ref/00-guia/CATALOGO-DE-SERVICOS.json) | Twenty services with suggested formats and request questions |
| [Actual studio logo](../../brand/brianna-dawes-studios.webp) | RGBA 2409 × 619 original brand artwork |

Source routes are hash routes from an in-memory prototype. They are provenance, not production authorization, stable entity identifiers, or required URL shapes. A `--scroll-XX` file continues its parent; use the manifest's `scroll.container`, `scroll.x`, and `scroll.y` to understand the captured region. Toasts, expanded sections, native-select option changes, and modal states usually remain on their parent route.

## Product routes and representative inspiration

Production routes below are the orchestrator-approved route proposal. Server authentication determines role and access; do not implement prototype role switching by trusting `/client-view` or `/designer-view` URL prefixes. The route families allow pages to be consolidated; related actions may be contextual panels instead of separate destinations.

| Product route / experience | Exact representative source screenshot | Source route | Keep / simplify |
|---|---|---|---|
| `/home` — agency overview | [Agency Home](../ref/01-agencia/01-home-e-globais/01-home.png) | `#/home` | One clear attention queue and scoped summary; avoid ornamental metric duplication |
| `/home` — client entry | [Client Home](../ref/02-cliente/01-home-e-globais/01-home.png) | `#/client-view/client/sabre/board` | Open the client's Overview (welcome dashboard), one click from the board |
| `/home` — designer work | [Designer My work](../ref/03-designer/01-home-e-globais/01-home.png) | `#/designer-view/home` | Show assigned production work, not studio-wide private data |
| `/clients/:clientId/overview` | [Client Home](../ref/02-cliente/01-home-e-globais/01-home.png) | `#/client-view/client/sabre/board` | Client welcome dashboard: numbers, what's moving, your turn, recently shipped |
| `/clients/:clientId/board` | [Canvas board](../ref/01-agencia/02-board/01-canvas.png) | `#/client/sabre/board` | Campaign groups and project cards on the XYFlow work surface |
| Same board, optional list view | [Project list](../ref/01-agencia/02-board/06-lista.png) | `#/client/sabre/board` | Scannable accessible alternative using the same records |
| Same board, Planning frame | [Kanban](../ref/01-agencia/02-board/03-kanban.png), [Timeline navigation](../ref/01-agencia/02-board/02-timeline-proxima-semana.png), [Planning collapsed](../ref/01-agencia/02-board/05-planning-recolhido.png) | `#/client/sabre/board` | Reference planning semantics informed the standalone Timeline and Kanban views; the current board also provides Canvas, List and monthly Calendar through one icon selector |
| Same board, empty and creation states | [No matches](../ref/01-agencia/02-board/08-sem-resultados.png), [New campaign](../ref/01-agencia/02-board/09-nova-campanha.png) | `#/client/sabre/board` | Clear recovery and contextual creation |
| `/projects/:projectId` | [Formats and versions](../ref/01-agencia/03-projeto/01-formatos-versoes.png) | `#/project/summer-0` | Deliverable format → version → multiple designs |
| Same project, contextual inspector | [Project details](../ref/01-agencia/03-projeto/03-detalhes.png) | `#/project/summer-0` | Properties and workflow actions on demand |
| Same project, design viewer | [Pinned feedback](../ref/01-agencia/03-projeto/10-pin-comentario.png), [Zoomed design](../ref/01-agencia/03-projeto/11-design-zoom.png) | `#/project/summer-0` | Artwork, stable pins, clear thread association, contextual controls |
| Same project, messages | [Agency/client channel](../ref/01-agencia/03-projeto/05-mensagens-cliente.png) | `#/project/summer-0` | Separate internal and client channels; never direct client/designer chat |
| Same project, new design/version | [Add design](../ref/01-agencia/03-projeto/12-adicionar-design.png), [New version](../ref/01-agencia/03-projeto/13-nova-versao.png) | `#/project/summer-0` | Persistent authorized uploads and version history |
| Same project, publication/delivery | [Share version](../ref/01-agencia/03-projeto/14-envio-ou-revisao.png), [Delivery](../ref/01-agencia/03-projeto/15-entrega.png) | `#/project/summer-0` | Explicit publication snapshot and actual deliverable files |
| Same project, client perspective | [Client project](../ref/02-cliente/03-projeto/01-formatos-versoes.png), [Not yet shared](../ref/02-cliente/03-projeto/20-ainda-nao-compartilhado.png) | `#/client-view/project/summer-0`, `#/client-view/project/everyday-0` | Shared versions only; helpful state before publication |
| Same project, designer perspective | [Designer project](../ref/03-designer/03-projeto/01-formatos-versoes.png) | `#/designer-view/project/summer-0` | Assigned production and submission to agency |
| `/clients/:clientId/briefings` | [Briefing list](../ref/01-agencia/04-briefings/01-lista/01-all-briefings.png) | `#/client/sabre/briefings` | Draft, submitted, and in-progress visibility without redundant screens |
| `/clients/:clientId/briefings/new` | [Service choice](../ref/01-agencia/04-briefings/03-type/01-servicos.png) | `#/client/sabre/briefings/new` | Explicit service choice; simplify the source's paginated chooser |
| Same new/edit briefing | [Deliverables](../ref/01-agencia/04-briefings/04-details/07-entregaveis-selecionados.png), [Brand direction](../ref/01-agencia/04-briefings/04-details/11-briefing-completo.png), [Timing/files](../ref/01-agencia/04-briefings/04-details/13-prazo-anexos.png) | `#/client/sabre/briefings/new` | Campaign, named scope, brand direction, timing/files; consolidate step chrome |
| Same new/edit briefing, review | [Request summary](../ref/01-agencia/04-briefings/05-review/01-resumo.png) | `#/client/sabre/briefings/new` | One meaningful verification step before submission |
| `/clients/:clientId/briefings/:briefingId` | [Agency acceptance](../ref/01-agencia/04-briefings/06-aceite/01-aguardando-revisao.png), [Insufficient balance](../ref/01-agencia/04-briefings/06-aceite/02-saldo-insuficiente.png) | `#/client/sabre/briefings/briefing-1` | Confirm quote, explain adjustment, atomically create/debit once |
| `/clients/:clientId/briefings/:briefingId/edit` | [Resume draft](../ref/01-agencia/04-briefings/02-rascunho/02-continuar.png) | `#/client/sabre/briefings/briefing-2/edit` | Recover persistent draft state and validate owner permissions |
| `/clients/:clientId/assets` | [Project files](../ref/01-agencia/05-assets/01-biblioteca.png) | `#/client/sabre/assets` | Authorized real files; may share a resource shell with brand assets |
| `/clients/:clientId/reviews` | [Review queue](../ref/01-agencia/06-reviews/01-pendentes.png), [Review action](../ref/02-cliente/06-reviews/02-revisar.png) | `#/client/sabre/reviews`, `#/client-view/client/sabre/reviews` | Clear action queue leading to shared design feedback |
| `/clients/:clientId/credits` | [Balance and activity](../ref/01-agencia/08-creditos/01-saldo-atividade.png), [Usage report](../ref/01-agencia/08-creditos/06-relatorio.png) | `#/client/sabre/credits` | Balance and ledger first; contextual filters/report/export |
| `/clients/:clientId/brand/:section` | [Brand overview](../ref/01-agencia/07-brand-hub/01-overview/01-pagina.png) | `#/client/sabre/brand/overview` | Compact brand resources; consolidate ten source sections as useful |
| `/settings` | [Workspace](../ref/01-agencia/09-configuracoes/workspace.png), [Clients](../ref/01-agencia/09-configuracoes/clients.png), [Team](../ref/01-agencia/09-configuracoes/team.png) | `#/settings` | Agency administration with contextual creation and permissions |
| Global search | [Search](../ref/01-agencia/01-home-e-globais/02-search.png), [No results](../ref/01-agencia/01-home-e-globais/04-search-sem-resultados.png) | `#/home` | Retired on 2026-09-24; each page keeps its own permission-scoped search |
| Global notifications | [Notifications](../ref/01-agencia/01-home-e-globais/05-notificacoes.png) | `#/home` | Meaningful persisted events, safe targets, read state |
| Missing/inaccessible resource | [Unavailable link](../ref/01-agencia/01-home-e-globais/09-link-indisponivel.png) | `#/project/session-expired` | Safe failure and useful navigation; no sensitive existence disclosure |

## Brand Hub source coverage

The following paths locate source content, not a requirement for ten separate product pages. A compact Brand Hub can group identity, resources, and guidance while retaining useful content and permissions.

| Source section | Exact base screenshot | Useful interaction intent |
|---|---|---|
| Overview | [Overview](../ref/01-agencia/07-brand-hub/01-overview/01-pagina.png) | Identity, audience, tone, principles; agency edits |
| Logos | [Logos](../ref/01-agencia/07-brand-hub/02-logos/01-pagina.png) | Approved logo variants, actual files and usage guidance |
| Colors | [Colors](../ref/01-agencia/07-brand-hub/03-colors/01-pagina.png) | Named values with copy actions; client palette is content, not app chrome |
| Typography | [Typography](../ref/01-agencia/07-brand-hub/04-typography/01-pagina.png) | Hierarchy, available fonts, and a text preview |
| Visual style | [Visual style](../ref/01-agencia/07-brand-hub/05-visual-style/01-pagina.png) | Reference imagery and useful constraints |
| Product library | [Products](../ref/01-agencia/07-brand-hub/06-products/01-pagina.png) | Product files, specifications, and rules |
| Brand assets | [Assets](../ref/01-agencia/07-brand-hub/07-assets/01-pagina.png) | Search/filter resources; copy a safe reference; authorized upload |
| Templates | [Templates](../ref/01-agencia/07-brand-hub/08-templates/01-pagina.png), [Example draft](../ref/01-agencia/07-brand-hub/08-templates/editor-template-1.png) | Optional personal drafts; never implicitly create billable projects |
| Copy and messaging | [Messaging](../ref/01-agencia/07-brand-hub/09-messaging/01-pagina.png) | Reusable approved copy and language guidance |
| AI Brand Instructions | [Brand context](../ref/01-agencia/07-brand-hub/10-ai/01-pagina.png), [Manual-copy fallback](../ref/01-agencia/07-brand-hub/10-ai/04-copia-manual.png) | Reusable context; no unsupported implication of an AI service |

Equivalent client and designer brand references use the same section suffix beneath `docs/ref/02-cliente/07-brand-hub/` and `docs/ref/03-designer/07-brand-hub/`. Resolve a particular state through the manifest rather than assuming all roles have all editing actions.

## Visual inspection evidence

The following images were opened with the image-viewing tool during this reference task. Dimensions are image/manifest evidence; layout observations and approximate font sizes are recorded in [design-system.md](design-system.md). Remaining linked screenshots were located through the manifest and section READMEs, not all visually reviewed. This distinction prevents a reference inventory from being misreported as a complete visual audit.

| Opened image | Dimensions | Observation |
|---|---|---|
| [Studio logo](../../brand/brianna-dawes-studios.webp) | 2409 × 619 | Transparent light artwork; preserve complete supplied identity |
| [Agency Home](../ref/01-agencia/01-home-e-globais/01-home.png) | 1600 × 1000 | Dark sidebar, quiet summary, white attention rows |
| [Agency board](../ref/01-agencia/02-board/01-canvas.png) | 1600 × 1000 | Dotted work surface, planning and campaign groups |
| [Kanban](../ref/01-agencia/02-board/03-kanban.png) | 1600 × 1000 | Status semantics and permitted transition controls |
| [List](../ref/01-agencia/02-board/06-lista.png) | 1600 × 1000 | Compact row structure as alternative representation |
| [Project versions](../ref/01-agencia/03-projeto/01-formatos-versoes.png) | 1600 × 1000 | Formats across columns, versions/designs beneath |
| [Project inspector](../ref/01-agencia/03-projeto/03-detalhes.png) | 1600 × 1000 | Contextual property and workflow panel |
| [Design feedback](../ref/01-agencia/03-projeto/10-pin-comentario.png) | 1600 × 1000 | Design-linked pin, selected thread, channel boundary, carousel |
| [Service choice](../ref/01-agencia/04-briefings/03-type/01-servicos.png) | 1600 × 1000 | Explicit service selection; avoid excess wizard chrome |
| [Briefing detail](../ref/01-agencia/04-briefings/04-details/11-briefing-completo.png) | 1600 × 1000 | Brand defaults/customization and scope summary |
| [Insufficient credits](../ref/01-agencia/04-briefings/06-aceite/02-saldo-insuficiente.png) | 1600 × 1000 | Quote context and blocked acceptance without losing request |
| [Credits](../ref/01-agencia/08-creditos/01-saldo-atividade.png) | 1600 × 1000 | Balance hierarchy and auditable ledger |
| [Brand overview](../ref/01-agencia/07-brand-hub/01-overview/01-pagina.png) | 1600 × 1000 | Content groups and editorial restraint |
| [Client Home](../ref/02-cliente/01-home-e-globais/01-home.png) | 1600 × 1000 | Direct client-board entry with reduced permissions |
| [Designer Home](../ref/03-designer/01-home-e-globais/01-home.png) | 1600 × 1000 | Assigned work and distinct production context |

Flat-color sampling confirmed `#202020` sidebar, `#353535` active navigation, `#ededed` reference workspace, `#ffffff` surfaces, and `#e0e0e0` home rules. The fresh product intentionally may use a lighter workspace, more spacious typography, consolidated actions, and simplified navigation. Compare usability and consistency against the documented decisions, not raw screenshot differences.

## Durable invariants and prototype accidents

| Preserve as behavior | Simplify or replace |
|---|---|
| Agency mediates every client/designer conversation | In-memory “Preview as” role selector |
| Client cannot discover designer identity or internal work | Source demo names, avatars, counts, and repeated status decoration |
| Published client version stays independent of later internal edits | Live mutable references masquerading as publication |
| Pins remain specific to design, version/publication context, and channel | Pins positioned only in browser pixels |
| Campaigns group projects; deliverables belong to a project | Multiple cards/views that duplicate the same task without helping navigation |
| Briefing requests explicit service, campaign, and scope | Every source wizard sub-screen, four-card pagination, and two simultaneous steppers |
| Agency confirms quote; acceptance makes one project and one debit | Simulated top-ups, fake files, and success-only toasts |
| Real authorized uploads/downloads and clear failures | Placeholder artwork when an actual design exists |
| Search, notifications, and links respect scope | Prototype routes that locally filter otherwise exposed data |
| Recoverable drafts and durable settings | Session-reset controls and deliberately disappearing drafts |
| Actual brand identity and restrained monochrome shell | Wireframe badges, Sample today, preview footers, tiny low-contrast labels |
| Meaningful feedback for copy/export actions | A separate screen for every toast or native-select state |

The immutable source guides contain earlier instructions against implementing a backend. The user's explicit Docker/Supabase production request supersedes those restrictions. The reference also contains Portuguese sample comments; new seed content and all product messages must be English.

## Ten-client / twenty-project validation map

The source includes ten fictional clients. Their exact board references are listed below for varied names and workload inspiration. These links do not prove the production seed exists or that it has two projects per client; authoritative validation must query the backend and exercise the actual UI.

| Reference client | Board screenshot |
|---|---|
| Acme | [Board](../ref/01-agencia/10-outros-clientes/01-acme.png) |
| Harbor & Pine | [Board](../ref/01-agencia/10-outros-clientes/02-harbor-pine.png) |
| Kestrel Outdoor | [Board](../ref/01-agencia/10-outros-clientes/03-kestrel-outdoor.png) |
| Northfield Bank | [Board](../ref/01-agencia/10-outros-clientes/04-northfield-bank.png) |
| Otto & Sons | [Board](../ref/01-agencia/10-outros-clientes/05-otto-sons.png) |
| Pelagic | [Board](../ref/01-agencia/10-outros-clientes/06-pelagic.png) |
| Rune Fitness | [Board](../ref/01-agencia/10-outros-clientes/07-rune-fitness.png) |
| SABRE | [Board](../ref/01-agencia/10-outros-clientes/08-sabre.png) |
| Sablefish Provisions | [Board](../ref/01-agencia/10-outros-clientes/09-sablefish-provisions.png) |
| Vela Skincare | [Board](../ref/01-agencia/10-outros-clientes/10-vela-skincare.png) |

Use a deterministic baseline of 10 clients and 25 projects with meaningful campaigns, assignments, stages, deliverables, actual sample files, published/internal versions, comments/pins, and credit-ledger records. Include long names, multiple-line feedback, multiple designs, revision and approved states, a client awaiting publication, and enough credit history to verify reconciliation. Track entities created by action tests separately so the baseline remains auditable. Cross-client and cross-role negative tests are required alongside happy paths.

Functional tests should prove request → agency quote/acceptance → project production → publication → client feedback/revision or approval → delivery, including credit effects and persistence. A full action inventory comes from the actual rendered product, agreed requirements, and implemented routes; screenshots are supporting evidence for intent. Optional reference patterns that were deliberately consolidated or omitted should be recorded as design decisions rather than silently marked implemented.

After functional validation, capture the implemented task surfaces at 1600 × 1000, 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844, and 320 × 800. Review alignment, workflow logic, spacing, minimalism, duplicate content/components, accessibility, overflow, and responsive transitions. The checklist and evidence requirements are in [the final audit gate](design-system.md#final-audit-gate--not-yet-executed). The [implementation design audit](../verification/design-audit.md) records captured surfaces, findings, corrections, and remaining gates. This reference map does not assert a final functional pass.
