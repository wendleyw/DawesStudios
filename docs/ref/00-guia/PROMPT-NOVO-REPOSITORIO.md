# Iniciar em um novo repositório

## Preparação

1. Crie um repositório vazio para o novo projeto.
2. Copie este pacote para `docs/reference/`.
3. Abra o novo repositório com seu agente.
4. Cole o prompt abaixo.

## Prompt pronto

```text
Vamos reconstruir o Creative Canvas em um novo repositório.

A referência está em docs/reference/. Comece lendo:
- 00-guia/LEIA-PRIMEIRO-AGENTE.md
- 00-guia/MAPA-DE-FLUXOS.md
- 00-guia/PERFIS-E-PERMISSOES.md
- 00-guia/ESTRUTURA-PARA-RECONSTRUCAO.md
- TELAS.md e manifest.json

Consulte os screenshots da seção correspondente antes de implementar cada tela. Preserve a direção visual monocromática e use as imagens como referência da experiência atual. A organização do código deve ser modular e apropriada para evoluir depois.

OBJETIVO DESTA FASE
Construir um wireframe navegável, com dados fictícios e interações locais. Precisamos validar o layout e o fluxo completo antes de implementar backend, autenticação real, uploads, pagamentos ou integrações.

REGRAS ESSENCIAIS
1. Agência, Cliente e Designer têm navegação e ações próprias.
2. O cliente nunca vê identidade, avatar, atribuição, mensagens internas ou metadados do designer.
3. Cliente conversa com a agência; designer conversa com a agência. Os canais são separados.
4. Só a agência publica versões para o cliente. Alterações internas não modificam uma versão já compartilhada.
5. O briefing segue Type → Details → Review. A campanha é explicitamente escolhida ou criada em Details; nunca selecionar automaticamente a última campanha.
6. Um projeto pode ter vários entregáveis. Cada entregável tem nome, formato/dimensões, quantidade e escopo original ou adaptação.
7. O projeto organiza formatos em colunas, com versões abaixo. Uma versão admite vários designs.
8. O design abre dentro do canvas, com pins e comentários à direita. O carrossel pertence à mesma versão; comentários e rascunhos pertencem ao design e ao canal.
9. O Brand Hub fornece os padrões da marca para o briefing. Rascunhos de template ficam separados dos projetos.
10. Créditos são discretos. Enviar briefing não cobra; a agência confirma um orçamento e o aceite registra um único débito. O relatório explica o consumo.

PRIMEIRA ENTREGA
Antes de construir telas, registre em docs/architecture/:
- sitemap.md: rotas e páginas por perfil;
- permissions.md: visibilidade e ações permitidas;
- domain.md: entidades, relações e estados;
- components.md: componentes compartilhados e módulos;
- implementation-plan.md: ordem de implementação e correspondência com os screenshots.
Proponha uma stack enxuta e justifique as escolhas. Liste apenas dúvidas que alterem de fato a estrutura. Registre as decisões em AGENTS.md para orientar o trabalho futuro.

ESTRUTURA E IMPLEMENTAÇÃO
Separe shell, páginas, componentes, dados fictícios, estado e regras de visibilidade. Organize por domínio: workspace, clientes/campanhas, briefings, projetos, comentários, revisões/entregas, Brand Hub, créditos e administração.

Implemente um fluxo completo por vez, começando por:
1. Shell e navegação dos três perfis.
2. Board → projeto → versão/design → comentário.
3. Briefing → revisão da agência → criação do projeto.
4. Envio à agência → publicação ao cliente → ajustes/aprovação → entrega.
5. Brand Hub, templates, créditos e administração.

Preserve os estados vazios, preenchidos, longos, de erro e confirmação documentados nas referências. Valide os tamanhos desktop das capturas e a adaptação responsiva. Faça verificações proporcionais: compilação/lint e testes dos fluxos e fronteiras de visibilidade, sem criar testes para cada placeholder visual.

Ao concluir cada módulo, informe o que funciona, quais referências foram atendidas e quais diferenças de layout ainda precisam de decisão. Use português na comunicação e mantenha o idioma da interface conforme a referência.
```

## Como avaliar a primeira entrega

Você deve conseguir identificar onde fica cada página, qual perfil pode acessá-la e quais dados ela recebe. O domínio precisa distinguir campanha, briefing, projeto, entregável, versão, design, publicação e comentário. A permissão de publicar para o cliente pertence à agência.

Depois, valide o fluxo com uma história concreta: o cliente pede Reels e Story para uma campanha; a agência confirma o escopo; o designer cria duas alternativas em V1; a agência compartilha uma versão; o cliente marca um ajuste em uma peça; a agência recebe esse feedback e coordena a próxima versão.
