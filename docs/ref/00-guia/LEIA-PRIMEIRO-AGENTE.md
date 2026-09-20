# Guia para reconstruir o Creative Canvas

Este pacote registra o wireframe existente em 20/09/2026. As capturas mostram a interface atual, incluindo estados intermediários, modais e continuações de áreas roláveis. Não são novas propostas de layout nem uma especificação de backend.

## Ordem de leitura

1. Abra `../INDEX.html` no navegador para filtrar por perfil, seção e ação.
2. Leia `MAPA-DE-FLUXOS.md` e `PERFIS-E-PERMISSOES.md`.
3. Consulte `../TELAS.md` para localizar cada PNG e seu caminho de navegação.
4. Use `../manifest.json` para obter rota, perfil, sequência de cliques, controles e opções dos selects de cada captura.
5. Consulte `CATALOGO-DE-SERVICOS.json` para os 20 tipos e todos os formatos/perguntas.
6. Leia `ESTRUTURA-PARA-RECONSTRUCAO.md` antes de começar a implementação.
7. Use `PROMPT-NOVO-REPOSITORIO.md` para iniciar o trabalho em outro repositório.

## O que preservar

- Interface monocromática e fluxo visual antes de lógica de produção.
- Agência, Cliente e Designer como experiências separadas.
- Cliente nunca conhece a identidade, o avatar ou a atribuição do designer.
- Cliente fala com a agência. Designer fala com a agência. Não existe conversa direta entre cliente e designer.
- A agência publica uma cópia da versão para o cliente. Novas alterações internas não modificam silenciosamente a versão compartilhada.
- Campanhas agrupam projetos. O briefing solicita um projeto com um tipo principal e múltiplos entregáveis.
- Novo briefing começa em Type e não herda a última campanha. A campanha é escolhida ou criada explicitamente em Details.
- Details organiza Campaign, Deliverables, Briefing e Timing & files.
- Formatos são badges; entregas têm nome personalizado, dimensões, quantidade e escopo Original/Adaptation.
- Dados de marca vêm do Brand Hub e podem ser personalizados para o projeto.
- Créditos discretos: estimativa por serviço, confirmação de um total pela agência, um débito por projeto no aceite. Relatório detalhado em Credits.
- Canvas do projeto organiza colunas por formato e versões abaixo. Uma versão admite várias peças.
- Clicar em uma versão/peça abre o design no canvas. Comentários ficam à direita; pins pertencem àquela peça e canal. Carrossel percorre designs da mesma versão.
- Briefing sem o cabeçalho “FOR SABRE / Draft a brief...” e sem título, busca e filtro introdutórios de Type.

## Como interpretar as imagens

- PNG sem `--scroll-` é o estado inicial capturado.
- `--scroll-01`, `--scroll-02` etc. continuam um painel rolável da mesma tela. Consulte `scroll.container` e `scroll.y` no manifesto.
- Ações que só mostram toast têm capturas de confirmação; não representam páginas novas.
- Os selects nativos têm suas opções registradas no manifesto. O menu nativo do sistema operacional não é uma tela própria da aplicação.
- SABRE é o cliente de referência para a cobertura completa. Outros clientes fictícios reutilizam as mesmas telas; seus boards estão em `01-agencia/10-outros-clientes`.
- O botão Home do cliente leva ao seu board. O Designer tem My work. A Agência tem uma visão geral do estúdio.
- As imagens usam dados fictícios e dimensões desktop de 1600 × 1000. Este pacote não pretende catalogar todos os tamanhos responsivos ou combinações possíveis de dados.
- Capturas de criação, aceite, upload, cobrança, convite e envio representam simulações em memória. Nenhum arquivo foi enviado a serviços externos e nenhum pagamento foi realizado.

## Para iniciar outra conversa

> Leia `00-guia/LEIA-PRIMEIRO-AGENTE.md`, `MAPA-DE-FLUXOS.md` e `PERFIS-E-PERMISSOES.md` deste pacote. Use o índice de screenshots como referência visual. Primeiro proponha a estrutura de páginas, componentes e estados para Agência, Cliente e Designer. Preserve a separação absoluta entre cliente e designer. Continue como wireframe com dados fictícios e interações locais até validarmos o layout completo. Não implemente backend, autenticação, pagamentos ou integrações sem pedido explícito.
