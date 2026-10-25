# STATUS — O Último Veto / EVA

Atualizado em 25/10/2026 (personagens realistas + controles de toque).

## Marco atual: **M0 — primeiro protótipo jogável** ✅

O jogo roda no navegador (Chrome/Edge/Firefox recentes no desktop; Chrome/Safari no celular, de preferência na horizontal) em Babylon.js 9 + Havok, com Matias em terceira pessoa num quarteirão de São Paulo Velha.

### Operacional (verificado por testes automatizados e teste visual em Chromium)

| Área | Estado | Observações |
| --- | --- | --- |
| Engine, build, Docker | ✅ | Vite 8 + TypeScript estrito; `npm run check` (tsc + vitest + build) passa; `Dockerfile` multi-stage (Node → Nginx) escrito e revisado — **a imagem ainda não foi construída neste ambiente** (sem daemon Docker disponível); validar com `docker build` antes do deploy no Easypanel. |
| Física Havok | ✅ | `PhysicsCharacterController` (cápsula), colisores estáticos para chão, calçadas (degrau 12 cm), prédios, props; caixas/barris dinâmicos empurráveis. |
| Matias (3ª pessoa) | ✅ | Modelo GLB **rigado** (rig Mixamo, 52 ossos, skinning) com anatomia/rosto do MakeHuman (CC0), pele bakeada, cabelo, óculos, roupa de trabalho; clipes Idle/Walk/Run/CrouchIdle/CrouchWalk/Talk/Interact com cross-fade por peso. WASD, Shift (correr), C/Ctrl (agachar, com verificação de teto por raio físico), E (interagir), Esc (pausa). |
| Controles de toque | ✅ | Celular/tablet detectado automaticamente (ponteiro grosso; notebook com tela sensível ativa no 1º toque; `?touch=1/0` força): joystick virtual flutuante (zona morta, anel externo = correr), arrastar à direita gira a câmera sem pointer lock, botões E/Agachar/Correr/Pausa, toque curto avança falas (nunca escolhe resposta por acidente), tela cheia + orientação horizontal quando o navegador permite, qualidade baixa por padrão sem configuração salva. Verificado por `npm run test:touch` (Chromium emulando celular, só toques). |
| Câmera | ✅ | Terceira pessoa sobre o ombro, mouse com pointer lock — e, quando o navegador recusa o lock (iframe sem permissão, `?pointerlock=0`), arrastar com o botão esquerdo gira a câmera (aviso único na tela) —, arrastar no toque, roda para distância, oclusão por raio físico (não atravessa paredes), enquadramentos de diálogo (over-the-shoulder/two-shot) com letterbox e DOF. Mouse/roda acumulados fora do modo seguir são descartados (sem salto ao sair do diálogo). |
| Cenário | ✅ (procedural) | Rua de 62 m com 10 fachadas (janelas vedadas/acesas, sacadas, toldos, pichações, varais, caixas d'água, painéis solares), oficina de Matias (interior jogável), praça com posto de distribuição, fila, quadro de avisos, estandarte da Igreja, fonte seca, árvores, mato, carro queimado, entulho, barraca de mercado, gerador, portão da Central de Suprimentos. Placas e cartazes em PT-BR. Vegetação e sinais de ocupação humana (roupas, luzes acesas, energia parcial). |
| Iluminação | ✅ | Sol direcional + hemisférica + sombras em cascata (CSM, 3 cascatas) ou simples (qualidade baixa), céu procedural (`SkyMaterial`), névoa seca, IBL procedural, postes (um aceso, um piscando com zumbido), lâmpada da oficina; pós-processamento ACES, vinheta, grão, bloom, aberração cromática leve. |
| NPCs 3D | ✅ (provisórios) | Miriam, Custódio, Comerciante, Raquel e Ana: humanos MakeHuman rigados (Mixamo), malha reduzida (decimate 0,6), colisão (cápsula), viram-se para o jogador, gesto ocasional, animação Talk em diálogo. |
| Diálogo PT-BR | ✅ | 5 grafos (`src/data/dialogues.ts`) com falas canônicas do prólogo, condições, efeitos, escolhas (teclas 1–4/setas/clique), legendas com nome do falante, avanço com Espaço/E. |
| Voz | ⚠️ provisória | Síntese de fala do navegador (Web Speech API, voz pt-BR quando disponível). **Não há dublagem gravada.** O sistema já aceita arquivos (`voice` por linha) quando existirem. |
| Estado narrativo | ✅ | Flags (`matiasTrustsSystem`, `apuracao.postura`, `pista.carregamento`, …) e missão "A Apuração" com 5 objetivos; HUD de objetivo e avisos. |
| Salvamento | ✅ | IndexedDB (fallback em memória), esquema versionado com migração, autosave em eventos e a cada 45 s, botão Salvar/Continuar, configurações persistidas. Verificado: a escolha persiste após recarregar a página. |
| Áudio | ⚠️ sintetizado | Web Audio: vento, gerador, multidão, estática do rádio, lâmpada falhando (emissores espaciais HRTF), passos (andar/correr/agachado), cliques e sinos de interface, ducking em diálogos, mute/volumes. **Nenhuma gravação real ainda.** |
| Interface | ✅ | Menu principal, pausa, opções (sensibilidade, inverter Y, volumes, legendas, voz, qualidade), sobre; HUD discreto (objetivo, prompt contextual, legendas, escolhas, letterbox, fade). |
| Testes | ✅ | 30 testes Vitest: validador glTF da Khronos nos 6 GLB, carregamento no Babylon (NullEngine) com caixa envolvente que acompanha o personagem (regressão: personagens sumiam longe da origem), física Havok real headless (andar/correr/colidir/degrau/agachar/NPC/câmera), diálogos, missões, save IndexedDB, áudio sintetizado, joystick virtual e detecção de toque. `tools/visual-test.mjs` abre o build em Chromium, joga o fluxo (andar, correr, agachar, cartão, praça, diálogo, escolha, refresh, pausa) e salva screenshots JPEG em `docs/screenshots/`; `tools/touch-test.mjs` repete o fluxo num celular emulado usando só toques. |

### Beats do prólogo cobertos

1. **Acordar — oficina**: ✅ interior, rádio com boletim (fala sintetizada + legenda, pode ser desligado), cartão de registro (objetivo 1).
2. **Percorrer o bairro**: ✅ rua densa com comerciante (diálogo sobre cotas de Registrados × Vinculados), placas, varais, carro queimado; tutorial de agachar ainda só por prompt de controles (sem área de rastejar obrigatória).
3. **Raquel e Ana**: ✅ diálogo com a escolha que define `matiasTrustsSystem`.
4. **A Apuração — praça**: ⚠️ parcial — Miriam anuncia a cota com as falas canônicas, Ana e Raquel intervêm, há duas posturas e o Custódio reage à postura de confronto. **Falta** a multidão reagindo (NPCs extras na fila), o mensageiro trazendo o relatório e a cena coreografada.
5. **A escolha — depósito**: ❌ apenas a pista (`pista.carregamento`) é plantada no fim do diálogo com Miriam; a decisão entre contestação oficial × procurar Raquel em particular fica para M1.

## Assets provisórios (todos marcados em `public/assets/licenses/ASSETS.md`)

- **Personagens**: gerados por `tools/blender/make_character.py` (Blender headless via `pip install bpy`) a partir de **dados CC0 do MakeHuman** vendorizados em `tools/blender/data/makehuman` — malha base hm08, targets (raça/sexo/idade/peso + detalhes faciais), rig Mixamo com pesos, máscaras de pele e olhos. Anatomia e rosto são reais; pele é procedural bakeada (2048 px Matias / 1024 px NPCs); cabelo é uma calota esculpida (sem fios); roupas são cascas conformadas ao corpo (sem rugas/tecido); acessórios (óculos, mochila, cinto, boné, lenço, jaleco, avental) são primitivas ou camadas do corpo. Sem marcas; sem a fotografia do criador (o rosto de Matias não tem semelhança com ele). Pré-visualizações em `docs/screenshots/characters/`.
- **MPFB/asset packs**: o plugin MPFB foi clonado mas **não é executado** (o gerador é código próprio que lê só os dados CC0). Os pacotes de assets do MakeHuman (peles fotográficas, cabelos, roupas) **não estão instalados** — o site makehumancommunity.org é inacessível deste ambiente. Rodar o MPFB com `makehuman_system_assets` na máquina do criador é o próximo salto de qualidade.
- **Cenário**: geometria em blocos e texturas procedurais (sem fotos/scans).
- **Som**: sintetizado em tempo de execução.
- **Voz**: TTS do navegador.

## Ferramentas externas necessárias para a próxima etapa (identificadas, não executadas aqui)

| Necessidade | Ferramenta | Licença/observação |
| --- | --- | --- |
| Pele fotográfica, cabelo com fios e roupas modeladas | **Blender 4.x + MPFB 2** com o pacote `makehuman_system_assets` (CC0) instalado localmente; escultura de semelhança a partir da foto (privada) ou **KeenTools FaceBuilder** | Exportar GLB com o mesmo rig Mixamo/nomes de clipes; o gerador atual serve de base (mesmos ossos). |
| Animações de locomoção realistas | **Mixamo** (gratuito para uso em projetos, inclusive comerciais, conforme termos da Adobe) ou captura própria (**Rokoko/Move.ai**) | Retarget em Blender para o rig do projeto; manter os nomes de clipes `Idle/Walk/Run/CrouchIdle/CrouchWalk/Talk/Interact`. |
| Kit urbano brasileiro (fachadas, mobiliário, entulho) | **Blender** + texturas **Poly Haven (CC0)** / **ambientCG (CC0)**; **Kenney (CC0)** para props rápidos | Registrar cada arquivo em `ASSETS.md`. Compressão KTX2/Basis e Draco via `gltf-transform`. |
| Dublagem PT-BR | Atores + gravação (ex.: estúdio local) ou, para animatic, TTS neural com licença comercial (ex.: ElevenLabs, Azure TTS pt-BR) | Arquivos `.ogg` em `public/assets/audio/voice/pt-BR/`, campo `voice` nas linhas de diálogo; registrar contrato/licença. |
| Efeitos sonoros e ambiente | **Freesound (CC0/CC-BY)**, **Sonniss GDC packs** (royalty-free) | Substituir geradores em `src/audio/synth.ts` por arquivos; manter o sintetizador como fallback. |
| Lip-sync | **Rhubarb Lip Sync** (MIT) gerando visemas a partir das falas | Requer blend shapes faciais no modelo final. |

## Limitações conhecidas

- Sem gamepad (teclado + mouse no desktop; toque no celular/tablet). No celular, o toque foi verificado em Chromium emulado — não em aparelhos reais; iOS Safari não permite tela cheia em páginas (o jogo segue na aba normal).
- Sem LOD/streaming: a cena inteira é carregada de uma vez (~140 meshes, 22–35 K triângulos por personagem); roda bem em GPU integrada moderna; em celular começa em qualidade baixa, sem medição em aparelhos fracos.
- WebGL 2 apenas (WebGPU não habilitado ainda).
- Renderização por software (sem GPU) fica em ~2–5 FPS — só para testes automatizados; no Chromium headless o pointer lock ativo deixa os frames 5–10× mais lentos, por isso o teste visual roda com `?pointerlock=0` (`--lock` para o caminho com cursor travado).
- A voz sintetizada depende das vozes instaladas no sistema do jogador (Chrome tem vozes pt-BR online; Firefox depende do SO; no celular costuma haver uma voz pt-BR).
- O caminho até a praça não tem ainda a "área inacessível" para o tutorial de agachar.

## Próxima etapa (M1)

1. Elevar os personagens: pele fotográfica/cabelo/roupas via MPFB + asset packs na máquina do criador; animações Mixamo com retarget (rig já compatível).
2. Fechar os beats 4 e 5: mensageiro, multidão na fila com reações, Custódio pedindo calma, depósito com a pista física e a decisão final em tensão.
3. Gravar/licenciar dublagem e SFX; lip-sync básico.
4. Texturas PBR reais (Poly Haven/ambientCG), kit modular de fachadas, decals de sujeira; otimização (instâncias, KTX2, Draco).
5. Gamepad, acessibilidade (tamanho de legenda, daltonismo), WebGPU opcional; validar o toque em aparelhos reais (Android/iOS) e medir desempenho.
6. Pipeline de CI (GitHub Actions: `npm run check` + teste visual com screenshots).
