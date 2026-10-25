# Manifesto de assets — O Último Veto / EVA

Regra do projeto: **nenhum asset sem origem e licença registradas aqui.** Nada neste repositório foi baixado de outros jogos ou de bibliotecas sem licença de redistribuição. Até esta etapa, os assets são gerados pelo próprio projeto a partir de dados CC0 (MakeHuman) e animados com a Quaternius Universal Animation Library (CC0); são PROVISÓRIOS exceto as animações.

| Caminho | Tipo | Origem | Autoria | Licença | Uso comercial | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| `public/assets/characters/matias.glb` | Modelo 3D rigado (rig Mixamo, 52 ossos, skinning, 8 clipes) | Gerado por `tools/blender/make_character.py` (Blender headless) a partir de dados CC0 do MakeHuman; animações retargeteadas da Quaternius Universal Animation Library por `tools/blender/retarget.py` | Malha/targets/rig/pesos/olhos: MakeHuman Team (CC0 1.0); pele, cabelo, roupa e acessórios: Projeto EVA (procedurais, CC0); animações: Quaternius / Gonzalo Furnier (CC0 1.0) | CC0-1.0 | Sim | Anatomia e rosto reais (MakeHuman hm08 morfado: 58 anos, moreno); pele bakeada 2048 px; cabelo em calota; roupa de trabalho como casca conformada; óculos, mochila, cinto. Clipes Idle/Walk/Run/CrouchIdle/CrouchWalk/Talk/Interact/PickUp = `Idle_Loop`/`Walk_Loop`/`Jog_Fwd_Loop`/`Crouch_Idle_Loop`/`Crouch_Fwd_Loop`/`Idle_Talking_Loop`/`Interact`/`PickUp_Table` da biblioteca. **Provisório**: sem fios de cabelo, sem rugas de tecido, sem cílios, sem semelhança com o criador. |
| `assets-src/animations/ual-standard/standard/Unreal-Godot/UAL1_Standard.glb` | Biblioteca de animações (rig universal, 65 juntas, 43 clipes in-place, 30 fps) | https://quaternius.itch.io/universal-animation-library — versão **Standard gratuita** v3 (16/06/2026), download oficial sem pagamento | Quaternius (animações com Gonzalo Furnier) | CC0 1.0 (`License.txt` ao lado) | Sim | Fonte das animações de todos os personagens; só o GLB in-place é mantido (ver `assets-src/animations/README.md`). |
| `public/assets/characters/miriam.glb` | Modelo 3D rigado (Mixamo, 8 clipes da biblioteca) | idem | idem | CC0-1.0 | Sim | 36 anos; lenço na cabeça, faixa da Igreja. Pele 1024 px, malha reduzida (decimate 0,6). |
| `public/assets/characters/custodio.glb` | Modelo 3D rigado (Mixamo) | idem | idem | CC0-1.0 | Sim | Boné com aba, colete. |
| `public/assets/characters/comerciante.glb` | Modelo 3D rigado (Mixamo) | idem | idem | CC0-1.0 | Sim | Avental, grisalho. |
| `public/assets/characters/raquel.glb` | Modelo 3D rigado (Mixamo) | idem | idem | CC0-1.0 | Sim | Jaleco, coque. |
| `public/assets/characters/ana.glb` | Modelo 3D rigado (Mixamo) | idem | idem | CC0-1.0 | Sim | 15 anos, rabo de cavalo. |
| `public/assets/characters/characters.json` | Manifesto | idem | Projeto EVA | CC0-1.0 | Sim | Ossos, clipes (com a animação-fonte e nº de quadros), alturas e contagens. |
| `tools/blender/data/makehuman/**` | Dados-fonte: `base.obj` (hm08), targets `.target.gz`, `rig.mixamo.json`, `weights.mixamo.json`, máscaras `mpfb_*.jpg`, olhos `high-poly.*` + `brown_eye.png` | github.com/makehumancommunity/mpfb2 (`src/mpfb/data`) e github.com/makehumancommunity/makehuman (`makehuman/data/eyes`) | MakeHuman Team (Data Collection AB, Joel Palmius, Jonas Hauquier) | CC0 1.0 (ver `tools/blender/data/makehuman/LICENSE.md`) | Sim | Apenas dados; nenhum código GPL do MakeHuman/MPFB é executado ou distribuído. |
| Texturas do cenário (asfalto, calçada, reboco com tijolo, ferrugem, lonas, folhagem, placas) | Texturas 2D geradas em canvas na inicialização (`src/world/textures.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Não existem arquivos de imagem no repositório; são sintetizadas em tempo de execução. Substituir por texturas PBR fotografadas (ex.: Poly Haven, CC0) quando o pipeline de assets começar. |
| Geometria do cenário (prédios, oficina, praça, props, vegetação) | Malhas geradas por código (`src/world/*.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Blocos modulares procedurais; serão substituídos/complementados por kits GLB modelados em Blender. |
| `public/assets/audio/sfx/step_{concrete,grass,wood}_0..4.ogg`, `switch_0..2.ogg`, `pickup_0..2.ogg`, `wood_bump_0..2.ogg` | Efeitos gravados: passos em concreto/terra/madeira (5 variações cada), impacto metálico leve (interruptor do rádio), impacto surdo (pegar objeto), batida em madeira | **Kenney — Impact Sounds** v1.0 (2019), https://kenney.nl/assets/impact-sounds (download gratuito do site oficial) | Kenney (www.kenney.nl) | CC0 1.0 (`LICENSE-kenney.txt` na pasta) | Sim | Originais `footstep_concrete/grass/wood_000-004`, `impactMetal_light_000-002`, `impactSoft_medium_000-002`, `impactWood_light_000-002`, renomeados. Crédito a Kenney é opcional e dado aqui. |
| Sons sintetizados (vento, gerador, multidão, estática de rádio, cliques, sinos, papel; passos como fallback) | Áudio sintetizado em tempo de execução (`src/audio/synth.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Substituir ambiente/interface por gravações licenciadas (Freesound CC0, Kenney Interface Sounds) registradas aqui. |
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
