# Perfis e fronteiras de informação

| Área/ação | Agência | Cliente | Designer |
|---|---|---|---|
| Home | Visão do estúdio | Seu board | My work / atribuídos |
| Busca e notificações | Dados do estúdio | Dados do cliente | Trabalho atribuído |
| Campanhas | Criar e acompanhar | Escolher/criar no briefing | Consultar |
| Board | Timeline, kanban, lista | Acompanhamento | Produção |
| Briefing | Criar, editar rascunho, revisar, aceitar | Criar, editar rascunho, enviar e acompanhar | Consultar direção do projeto |
| Atribuição de designer | Visível e editável | Nunca visível | Própria atribuição |
| Novos designs e versões | Adicionar | Só versões compartilhadas | Adicionar ao trabalho atribuído |
| Comentários | Dois canais separados | Cliente ↔ agência | Designer ↔ agência |
| Pins | Canal e design específicos | Canal do cliente | Canal interno |
| Publicar para o cliente | Sim, snapshot da versão | Não | Não |
| Enviar revisão | Para cliente | Retorno à agência | Para agência |
| Aprovação | Acompanha/gerencia | Aprova ou pede ajustes | Sem ação de aprovação do cliente |
| Entrega | Compartilha e marca entregue | Consulta entrega | Consulta arquivos no protótipo |
| Assets de projeto | Consulta e upload simulado | Consulta versões compartilhadas | Consulta e upload simulado |
| Brand Hub | Consulta e edição | Consulta | Consulta |
| Templates da marca | Rascunho pessoal | Rascunho pessoal | Rascunho pessoal |
| Créditos/relatório | Consulta, orçamento e simulação | Consulta e simulação de recarga | Oculto |
| Settings, equipe e novo cliente | Disponíveis | Ocultos | Ocultos |
| Seletor Preview as | Somente na agência | Oculto | Oculto |

## Regra central

O cliente não pode descobrir quem produziu a peça. Não expor nomes, avatares, atribuições, mensagens internas ou metadados de autoria do designer. Mensagens da agência aparecem como Studio na perspectiva do cliente.

## Modelagem recomendada para a próxima estrutura

Separar conceitualmente dados internos de produção, publicação para o cliente e canais de comentários. Cada comentário com pin referencia projeto, versão, design e canal. Recursos de marca e rascunhos de template também devem respeitar o escopo do cliente e o proprietário do rascunho.

O protótipo atual alterna perspectivas por rotas hash e filtros locais; isso não constitui autorização de produção. Na fase atual, preservar o wireframe e documentar as fronteiras. Caso uma fase de backend seja autorizada posteriormente, validar essas mesmas fronteiras no servidor.
