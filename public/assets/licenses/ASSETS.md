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
| `assets-src/textures/ambientcg/{PaintedPlaster017,PavingStones070,Concrete034,CorrugatedSteel005,Rust004}/*.jpg` e `public/assets/textures/<id>/*.jpg` (recomprimidas: cor 1024 px, rugosidade/AO/metal 512 px) | Texturas PBR fotografadas (Color, NormalGL, Roughness, AO, Metalness) | https://ambientcg.com (downloads oficiais 1K JPG, gratuitos) | ambientCG / Lennart Demes | CC0 1.0 (`assets-src/textures/README.md`) | Sim | Reboco pintado (fachadas), pedra portuguesa (piso da praça), concreto (embasamentos, cornijas), telha metálica (cobertura do posto), ferrugem (tambores, gerador, calhas). Usadas pelos módulos GLB e por `src/world/materials.ts` (`photoPbr`). |
| `public/assets/environments/praca_hero.glb` | Kit modular da praça (24 assets, 48 K triângulos, texturas embutidas): fachada da Central, 2 sobrados residenciais (varandas, grades, varais, ar-condicionado, caixa d'água), posto de distribuição, banca de feira, gerador, botijões, tambores metálico/plástico, caixote, banco, caixa elétrica, poste de luz, 2 árvores | Modelado por `tools/blender/make_environment.py` (Blender headless: bmesh, booleanos, chanfros, UVs em caixa) | Projeto EVA (geometria); texturas ambientCG (CC0) + texturas procedurais PIL (madeira, listras, manchas, casca, folhagem) | CC0-1.0 | Sim | Cada asset tem a origem no chão, frente para +Z e colisores `COL_*`; colocação em `src/world/heroAssets.ts`. Sem marcas nem referências a outros jogos. |
| `assets-src/vehicles/*.glb` (fonte) e `public/assets/vehicles/{javali_vb4,atlas_t3,modulo_v7,rastro_av4,janus_station}.glb` (refinados) | Veículos 3D originais (viatura blindada, triciclo de carga, van, aeromoto, miniatura da estação Janus) | Gerados por `tools/generate-eva-vehicles.mjs` (PR #1, geometria procedural própria) e refinados por `tools/blender/refine_vehicles.py` (UVs, chanfros, PBR com texturas procedurais PIL: pintura gasta, ferrugem, lona, banda de pneu; madeira do kit da praça) | Projeto EVA | CC0-1.0 | Sim | **Primeira versão (protótipo modular)**, não arte final. Só os três terrestres entram no cenário (`src/world/vehiclesPack.ts`); Rastro e Janus apenas no visualizador `preview-veiculos.html`. Sem marcas reais; emblemas originais. |
| `public/assets/props/{pistola,caixa_municao,kit_medico}.glb` | Props de gameplay (pistola de serviço, caixa de munição, kit médico) | Modelados por `tools/blender/make_props.py` (Blender headless) | Projeto EVA | CC0-1.0 | Sim | Sem marcas; pistola genérica compacta. |
| Sons de tiro, ricochete, carregador, motor de veículo, rotores da aeromoto, impacto de lataria, grunhidos | Sintetizados em tempo de execução (`src/audio/synth.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | **Provisórios**: substituir por gravações CC0 (Freesound/Kenney) registradas aqui. |
| Texturas procedurais restantes do cenário (asfalto, calçada, reboco com tijolo das ruas, lonas, placas) | Texturas 2D geradas em canvas na inicialização (`src/world/textures.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Ainda usadas fora do "hero corner" da praça; serão trocadas por PBR fotográfico por setor. |
| Geometria procedural restante (prédios da rua, oficina, parte da praça, props, vegetação da rua) | Malhas geradas por código (`src/world/*.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Blocos procedurais; a praça da Apuração já usa o kit GLB acima e os demais setores seguem o mesmo caminho. |
| `public/assets/audio/sfx/step_{concrete,grass,wood}_0..4.ogg`, `switch_0..2.ogg`, `pickup_0..2.ogg`, `wood_bump_0..2.ogg` | Efeitos gravados: passos em concreto/terra/madeira (5 variações cada), impacto metálico leve (interruptor do rádio), impacto surdo (pegar objeto), batida em madeira | **Kenney — Impact Sounds** v1.0 (2019), https://kenney.nl/assets/impact-sounds (download gratuito do site oficial) | Kenney (www.kenney.nl) | CC0 1.0 (`LICENSE-kenney.txt` na pasta) | Sim | Originais `footstep_concrete/grass/wood_000-004`, `impactMetal_light_000-002`, `impactSoft_medium_000-002`, `impactWood_light_000-002`, renomeados. Crédito a Kenney é opcional e dado aqui. |
| Sons sintetizados (vento, gerador, multidão, estática de rádio, cliques, sinos, papel; passos como fallback) | Áudio sintetizado em tempo de execução (`src/audio/synth.ts`) | Código do projeto | Projeto EVA | CC0-1.0 | Sim | Substituir ambiente/interface por gravações licenciadas (Freesound CC0, Kenney Interface Sounds) registradas aqui. |
| Vozes dos diálogos | Síntese de fala do navegador (Web Speech API, pt-BR) | Navegador do usuário | — | Conforme o navegador | — | **Provisório**: não é dublagem. Quando houver gravações (`public/assets/audio/voice/pt-BR/*.ogg`), registrar ator/atriz, contrato e licença aqui e preencher o campo `voice` em `src/data/dialogues.ts`. |
| Céu e ambiente (IBL) | `SkyMaterial` (@babylonjs/materials) + equirect procedural em canvas | Babylon.js (Apache-2.0) / código do projeto | Babylon.js / Projeto EVA | Apache-2.0 / CC0-1.0 | Sim | — |
| Fontes da interface | Fontes do sistema (Georgia/serif, Inter/Segoe UI/sans-serif) | Sistema operacional do usuário | — | Sistema | — | Nenhuma fonte embutida. Fonte própria licenciada (ex.: SIL OFL) pode ser adicionada depois. |

## Código de terceiros portado/usado (ver também `docs/VERTICAL_SLICE.md`)

| Onde | Origem | Licença | Uso |
| --- | --- | --- | --- |
| `src/vehicles/raycastVehicle.ts` | `RaycastVehicle` do cannon-es (https://github.com/pmndrs/cannon-es), derivado do `btRaycastVehicle` do Bullet Physics | MIT (cannon-es) / zlib (Bullet) | Adaptado para Babylon.js/Havok: suspensão, atrito, freio e motor por impulsos |
| `src/vehicles/hoverBike.ts` | Controle do helicóptero do Sketchbook (https://github.com/swift502/Sketchbook) | MIT | Inspiração do modelo de controle (velocidade angular pelos comandos, sustentação) |
| `node_modules/yuka` | yuka (https://mugen87.github.io/yuka/) | MIT | Steering da IA dos inimigos (`src/ai/enemy.ts`) |

## Bibliotecas de runtime

| Pacote | Licença |
| --- | --- |
| `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/materials` | Apache-2.0 |
| `@babylonjs/havok` (motor de física Havok para web) | MIT (binário distribuído pela Babylon.js/Microsoft) |

## Referências privadas (NÃO commitadas)

A fotografia do criador usada como referência visual de Matias é privada e **não** está no repositório, conforme `docs/ARQUITETURA.md`. O manequim atual apenas segue as características descritas no cânone (pele morena, cabelo escuro curto, óculos, roupa de trabalho sem marcas).

## Referências de arte geradas (Kairogen)

Imagens de **referência artística** (não são assets do jogo) geradas pelo criador na conta Kairogen dele, a partir de descrições do cânone. Servem de guia visual para o kit modular e as texturas; nenhuma é carregada pelo jogo.

| Arquivo | Modelo | Custo |
| --- | --- | --- |
| `docs/concept/sp_velha_praca_01.jpg` — praça do Setor 17 ao entardecer (prédios recuperados, painéis solares, feira, chafariz seco) | Z-Image Turbo (via Kairogen), 29/10/2026 | 1 crédito |

Teste de voz (PT-BR, ElevenLabs Multilingual v2 via Kairogen, voz "Antonio de Jesus", 1 crédito) realizado na mesma data; o arquivo não foi incorporado porque o domínio `cdn.kairogen.ai` ainda não é acessível deste ambiente.
