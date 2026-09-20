# Creative Canvas — referência para reconstrução

**711 screenshots**, organizados por perfil, tela e ação. Capturados do wireframe atual em 20/09/2026, em 1600 × 1000.

Para reiniciar, use o [prompt do novo repositório](00-guia/PROMPT-NOVO-REPOSITORIO.md).

Comece pelo [índice visual](INDEX.html) ou pelo [guia para o agente](00-guia/LEIA-PRIMEIRO-AGENTE.md).

| Perfil | Estados/telas base | PNGs com continuações |
|---|---:|---:|
| Agência | 215 | 306 |
| Cliente | 174 | 247 |
| Designer | 110 | 158 |

## Organização

- `00-guia/`: instruções para o agente, fluxos, perfis, catálogo de serviços e estrutura sugerida.
- `01-agencia/`: Home, globais, board, projeto, briefing, assets, reviews, Brand Hub, créditos e configurações.
- `02-cliente/`: experiência do cliente, sem identidade ou conversa do designer.
- `03-designer/`: trabalho de produção e comunicação apenas com a agência.
- `INDEX.html`: galeria local com filtros por perfil/seção e busca. Não precisa de servidor.
- `TELAS.md` e `TELAS.csv`: catálogo completo com navegação e descrição.
- `manifest.json`: metadados por PNG, rotas, cliques, controles, opções, posição de rolagem e checksum.

Dentro de cada pasta há um README com o contexto das capturas. Os arquivos `--scroll-XX` são continuações da mesma tela.

O pacote cobre os tipos de páginas e estados disponíveis, incluindo os 20 serviços, as dez seções do Brand Hub, suas ações e os sete editores de templates. Os outros clientes fictícios reutilizam essas estruturas; há exemplos de seus boards na agência. Telas responsivas e cada combinação possível de dados não estão duplicadas.

Para transportar tudo, use o ZIP ao lado desta pasta. Para reiniciar com outro agente, indique primeiro `00-guia/LEIA-PRIMEIRO-AGENTE.md`.
