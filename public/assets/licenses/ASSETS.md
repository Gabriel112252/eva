# Manifesto de assets — O Último Veto / EVA

Regra do projeto: **nenhum asset sem origem e licença registradas aqui.** Nada neste repositório foi baixado de outros jogos ou de bibliotecas sem licença de redistribuição. Até esta etapa, todos os assets são gerados pelo próprio projeto (procedurais) e, portanto, PROVISÓRIOS.

| Caminho | Tipo | Origem | Autoria | Licença | Uso comercial | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| `public/assets/characters/matias.glb` | Modelo 3D rigado (17 ossos, skinning, 7 clipes) | Gerado por `tools/gen-character.mjs` | Projeto EVA (procedural) | CC0-1.0 (asset próprio) | Sim | **Placeholder**: manequim estilizado com proporções, óculos, mochila e cinto de ferramentas; sem marcas. Substituir por modelo esculpido/escaneado em Blender. |
| `public/assets/characters/miriam.glb` | Modelo 3D rigado | idem | Projeto EVA | CC0-1.0 | Sim | Placeholder (lenço, faixa dourada da Igreja). |
| `public/assets/characters/custodio.glb` | Modelo 3D rigado | idem | Projeto EVA | CC0-1.0 | Sim | Placeholder (colete, boné). |
| `public/assets/characters/comerciante.glb` | Modelo 3D rigado | idem | Projeto EVA | CC0-1.0 | Sim | Placeholder (avental). |
| `public/assets/characters/raquel.glb` | Modelo 3D rigado | idem | Projeto EVA | CC0-1.0 | Sim | Placeholder (jaleco). |
| `public/assets/characters/ana.glb` | Modelo 3D rigado | idem | Projeto EVA | CC0-1.0 | Sim | Placeholder (15 anos, 1,60 m). |
| `public/assets/characters/characters.json` | Manifesto | idem | Projeto EVA | CC0-1.0 | Sim | Lista ossos, clipes, alturas e contagens. |
| Texturas do cenário (asfalto, calçada, reboco com tijolo, ferrugem, lonas, folhagem, placas) | Texturas 2D geradas em canvas na inicialização (`src/world/textures.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Não existem arquivos de imagem no repositório; são sintetizadas em tempo de execução. Substituir por texturas PBR fotografadas (ex.: Poly Haven, CC0) quando o pipeline de assets começar. |
| Geometria do cenário (prédios, oficina, praça, props, vegetação) | Malhas geradas por código (`src/world/*.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Blocos modulares procedurais; serão substituídos/complementados por kits GLB modelados em Blender. |
| Sons (passos, vento, gerador, multidão, estática de rádio, cliques, sinos) | Áudio sintetizado em tempo de execução (`src/audio/synth.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | **Nenhum arquivo de áudio gravado existe ainda.** Substituir por gravações licenciadas (Freesound CC0, bibliotecas comerciais) registradas aqui. |
| Vozes dos diálogos | Síntese de fala do navegador (Web Speech API, pt-BR) | Navegador do usuário | — | Conforme o navegador | — | **Provisório**: não é dublagem. Quando houver gravações (`public/assets/audio/voice/pt-BR/*.ogg`), registrar ator/atriz, contrato e licença aqui e preencher o campo `voice` em `src/data/dialogues.ts`. |
| Céu e ambiente (IBL) | `SkyMaterial` (@babylonjs/materials) + equirect procedural em canvas | Babylon.js (Apache-2.0) / código do projeto | Babylon.js / Projeto EVA | Apache-2.0 / CC0-1.0 | Sim | — |
| Fontes da interface | Fontes do sistema (Georgia/serif, Inter/Segoe UI/sans-serif) | Sistema operacional do usuário | — | Sistema | — | Nenhuma fonte embutida. Fonte própria licenciada (ex.: SIL OFL) pode ser adicionada depois. |

## Bibliotecas de runtime

| Pacote | Licença |
| --- | --- |
| `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/materials` | Apache-2.0 |
| `@babylonjs/havok` (motor de física Havok para web) | MIT (binário distribuído pela Babylon.js/Microsoft) |

## Referências privadas (NÃO commitadas)

A fotografia do criador usada como referência visual de Matias é privada e **não** está no repositório, conforme `docs/ARQUITETURA.md`. O manequim atual apenas segue as características descritas no cânone (pele morena, cabelo escuro curto, óculos, roupa de trabalho sem marcas).
