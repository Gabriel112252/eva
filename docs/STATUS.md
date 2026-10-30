# STATUS — O Último Veto / EVA

Atualizado em 25/10/2026 (personagens realistas, controles de toque, animações CC0 retargeteadas).

## Marco atual: **Vertical slice jogável — "A Apuração" + "O Carregamento"** ✅

Jogável de ponta a ponta (10–15 min): exploração e diálogos → confronto com desviadores (pistola, mira, recarga, IA que patrulha/persegue/ataca, vida/dano/morte/reinício) → fuga com a van Módulo V-7 → entrega na oficina → decisão final pelo rádio → tela de conclusão. Quatro veículos jogáveis (Javali, Módulo, Atlas dirigíveis; Rastro AV-4 voando). Detalhes e créditos de código reaproveitado em `docs/VERTICAL_SLICE.md`.

### Marco anterior: M0 — primeiro protótipo jogável ✅

O jogo roda no navegador (Chrome/Edge/Firefox recentes no desktop; Chrome/Safari no celular, de preferência na horizontal) em Babylon.js 9 + Havok, com Matias em terceira pessoa num quarteirão de São Paulo Velha.

### Operacional (verificado por testes automatizados e teste visual em Chromium)

| Área | Estado | Observações |
| --- | --- | --- |
| Engine, build, Docker | ✅ | Vite 8 + TypeScript estrito; `npm run check` (tsc + vitest + build) passa; `Dockerfile` multi-stage (Node → Nginx) escrito e revisado — **a imagem ainda não foi construída neste ambiente** (sem daemon Docker disponível); validar com `docker build` antes do deploy no Easypanel. |
| Física Havok | ✅ | `PhysicsCharacterController` (cápsula), colisores estáticos para chão, calçadas (degrau 12 cm), prédios, props; caixas/barris dinâmicos empurráveis. |
| Matias (3ª pessoa) | ✅ | Modelo GLB **rigado** (rig Mixamo, 52 ossos, skinning) com anatomia/rosto do MakeHuman (CC0), pele bakeada, cabelo, óculos, roupa de trabalho. WASD, Shift (correr), C/Ctrl (agachar, com verificação de teto por raio físico), E (interagir), Esc (pausa). |
| Animações | ✅ (reais, CC0) | 8 clipes da **Quaternius Universal Animation Library v3 Standard** (CC0; `assets-src/animations/`) retargeteados em Blender headless para o rig Mixamo de 52 ossos (`tools/blender/retarget.py`: alinhamento de quadros canônicos por osso, transferência de rotação no espaço do mundo, quadril escalado): Idle, Walk, Run (`Jog_Fwd_Loop`), CrouchIdle, CrouchWalk, Talk, Interact e PickUp (cartão). Cross-fade por peso e fase compartilhada entre marchas. A reprodução dos clipes de locomoção é sincronizada com a velocidade real (`animationSpeedRatio`) → pé apoiado parado no chão (medido em `tools/capture-video.mjs`). Velocidades: andar 1,3 m/s, correr 4,6 m/s, agachado 0,8 m/s. Os clipes procedurais antigos ficam só como fallback explícito (`--procedural-anims`) e um teste impede que cheguem ao build. |
| Controles de toque | ✅ | Celular/tablet detectado automaticamente (ponteiro grosso; notebook com tela sensível ativa no 1º toque; `?touch=1/0` força): joystick virtual flutuante (zona morta, anel externo = correr), arrastar à direita gira a câmera sem pointer lock, botões E/Agachar/Correr/Pausa, toque curto avança falas (nunca escolhe resposta por acidente), tela cheia + orientação horizontal quando o navegador permite, qualidade baixa por padrão sem configuração salva. Verificado por `npm run test:touch` (Chromium emulando celular, só toques). |
| Câmera | ✅ | Terceira pessoa sobre o ombro, mouse com pointer lock — e, quando o navegador recusa o lock (iframe sem permissão, `?pointerlock=0`), arrastar com o botão esquerdo gira a câmera (aviso único na tela) —, arrastar no toque, roda para distância, oclusão por raio físico (não atravessa paredes), enquadramentos de diálogo (over-the-shoulder/two-shot) com letterbox e DOF. Mouse/roda acumulados fora do modo seguir são descartados (sem salto ao sair do diálogo). |
| Cenário | ✅ (procedural) | Rua de 62 m com 10 fachadas (janelas vedadas/acesas, sacadas, toldos, pichações, varais, caixas d'água, painéis solares), oficina de Matias (interior jogável), praça com posto de distribuição, fila, quadro de avisos, estandarte da Igreja, fonte seca, árvores, mato, carro queimado, entulho, barraca de mercado, gerador, portão da Central de Suprimentos. Placas e cartazes em PT-BR. Vegetação e sinais de ocupação humana (roupas, luzes acesas, energia parcial). |
| Iluminação | ✅ | Sol direcional + hemisférica + sombras em cascata (CSM, 3 cascatas) ou simples (qualidade baixa), céu procedural (`SkyMaterial`), névoa seca, IBL procedural, postes (um aceso, um piscando com zumbido), lâmpada da oficina; pós-processamento ACES, vinheta, grão, bloom, aberração cromática leve. |
| NPCs 3D | ✅ (provisórios) | Miriam, Custódio, Comerciante, Raquel e Ana: humanos MakeHuman rigados (Mixamo), malha reduzida (decimate 0,6), colisão (cápsula), viram-se para o jogador, gesto ocasional, animação Talk em diálogo. |
| Diálogo PT-BR | ✅ | 5 grafos (`src/data/dialogues.ts`) com falas canônicas do prólogo, condições, efeitos, escolhas (teclas 1–4/setas/clique), legendas com nome do falante, avanço com Espaço/E. |
| Voz | ⚠️ provisória | Síntese de fala do navegador (Web Speech API, voz pt-BR quando disponível). **Não há dublagem gravada.** O sistema já aceita arquivos (`voice` por linha) quando existirem. |
| Estado narrativo | ✅ | Flags (`matiasTrustsSystem`, `apuracao.postura`, `pista.carregamento`, …) e missão "A Apuração" com 5 objetivos; HUD de objetivo e avisos. |
| Salvamento | ✅ | IndexedDB (fallback em memória), esquema versionado com migração, autosave em eventos e a cada 45 s, botão Salvar/Continuar, configurações persistidas. Verificado: a escolha persiste após recarregar a página. |
| Áudio | ⚠️ parcial | Web Audio: **passos gravados (Kenney Impact Sounds, CC0)** por superfície — concreto (rua, calçadas, praça, oficina), terra/mato, madeira (caixotes) — com 5 variações sorteadas sem repetir, tom ±6 % e volume por marcha; interruptor do rádio e pegar o cartão também com impactos gravados. Vento, gerador, multidão, estática do rádio, lâmpada, cliques e sinos continuam sintetizados (emissores espaciais HRTF, ducking em diálogos, mute/volumes); a síntese é fallback automático se um arquivo não carregar. |
| Interface | ✅ | Menu principal, pausa, opções (sensibilidade, inverter Y, volumes, legendas, voz, qualidade), sobre; HUD discreto (objetivo, prompt contextual, legendas, escolhas, letterbox, fade). |
| Testes | ✅ | 30 testes Vitest: validador glTF da Khronos nos 6 GLB, carregamento no Babylon (NullEngine) com caixa envolvente que acompanha o personagem (regressão: personagens sumiam longe da origem), física Havok real headless (andar/correr/colidir/degrau/agachar/NPC/câmera), diálogos, missões, save IndexedDB, áudio sintetizado, joystick virtual e detecção de toque. `tools/visual-test.mjs` abre o build em Chromium, joga o fluxo (andar, correr, agachar, cartão, praça, diálogo, escolha, refresh, pausa) e salva screenshots JPEG em `docs/screenshots/`; `tools/touch-test.mjs` repete o fluxo num celular emulado usando só toques. |

### Beats do prólogo cobertos

1. **Acordar — oficina**: ✅ interior, rádio com boletim (fala sintetizada + legenda, pode ser desligado), cartão de registro (objetivo 1).
2. **Percorrer o bairro**: ✅ rua densa com comerciante (diálogo sobre cotas de Registrados × Vinculados), placas, varais, carro queimado; tutorial de agachar ainda só por prompt de controles (sem área de rastejar obrigatória).
3. **Raquel e Ana**: ✅ diálogo com a escolha que define `matiasTrustsSystem`.
4. **A Apuração — praça**: ⚠️ parcial — Miriam anuncia a cota com as falas canônicas, Ana e Raquel intervêm, há duas posturas e o Custódio reage à postura de confronto. **Falta** a multidão reagindo (NPCs extras na fila), o mensageiro trazendo o relatório e a cena coreografada.
5. **A escolha — depósito**: ❌ apenas a pista (`pista.carregamento`) é plantada no fim do diálogo com Miriam; a decisão entre contestação oficial × procurar Raquel em particular fica para M1.

## Assets provisórios (todos marcados em `public/assets/licenses/ASSETS.md`)

- **Personagens**: gerados por `tools/blender/make_character.py` (Blender headless via `pip install bpy`) a partir de **dados CC0 do MakeHuman** vendorizados em `tools/blender/data/makehuman` — malha base hm08, targets (raça/sexo/idade/peso + detalhes faciais), rig Mixamo com pesos, máscaras de pele e olhos. Anatomia e rosto são reais; pele é procedural bakeada (2048 px Matias / 1024 px NPCs); cabelo é uma calota esculpida (sem fios); roupas são cascas conformadas ao corpo (sem rugas/tecido); acessórios (óculos, mochila, cinto, boné, lenço, jaleco, avental) são primitivas ou camadas do corpo. Sem marcas; sem a fotografia do criador (o rosto de Matias não tem semelhança com ele). Pré-visualizações em `docs/screenshots/characters/`. **Animações não são provisórias**: biblioteca CC0 da Quaternius (ver acima); vídeo de avaliação em `docs/videos/locomocao.mp4`.
- **MPFB/asset packs**: o plugin MPFB foi clonado mas **não é executado** (o gerador é código próprio que lê só os dados CC0). Os pacotes de assets do MakeHuman (peles fotográficas, cabelos, roupas) **não estão instalados** — o site makehumancommunity.org é inacessível deste ambiente. Rodar o MPFB com `makehuman_system_assets` na máquina do criador é o próximo salto de qualidade.
- **Cenário**: a praça da Apuração ("hero corner" M1.1) usa o kit GLB `public/assets/environments/praca_hero.glb` (fachada da Central com vãos reais, sobrados com varandas/grades/varais, posto, banca, gerador, tambores, caixotes, poste, árvores com folhagem alpha-test) e materiais PBR fotográficos CC0 da ambientCG (reboco, pedra portuguesa, concreto, telha, ferrugem). O resto da rua ainda é geometria em blocos com texturas procedurais. Comparações A/B com câmera idêntica em `docs/screenshots/m1/` (`antes_*` vs `depois_*`); passeio pelo canto em `docs/videos/praca_hero.mp4`.
- **Veículos (PR #1)**: Javali VB-4, Atlas T-3, Módulo V-7 **dirigíveis** e Rastro AV-4 **pilotável** (física em `src/vehicles/`), modelos refinados no Blender a partir do gerador da PR (`public/assets/vehicles/`); Janus só no visualizador `preview-veiculos.html`. Modelos ainda são **protótipos modulares** (silhuetas simples), não arte final. `npm run test:gameplay`.
- **Combate/IA/itens**: pistola, caixa de munição e kit médico modelados no pipeline (`public/assets/props/`); sons de tiro/motor/rotores **sintetizados** (provisórios); inimigos usam os personagens `saqueador_a/b` (MakeHuman CC0 + animações UAL).
- **Som**: passos e impactos gravados (Kenney, CC0); ambiente e interface sintetizados.
- **Voz**: TTS do navegador.

## Ferramentas externas necessárias para a próxima etapa (identificadas, não executadas aqui)

| Necessidade | Ferramenta | Licença/observação |
| --- | --- | --- |
| Pele fotográfica, cabelo com fios e roupas modeladas | **Blender 4.x + MPFB 2** com o pacote `makehuman_system_assets` (CC0) instalado localmente; escultura de semelhança a partir da foto (privada) ou **KeenTools FaceBuilder** | Exportar GLB com o mesmo rig Mixamo/nomes de clipes; o gerador atual serve de base (mesmos ossos). |
| Mais animações (reações da multidão, sentar, empurrar, cair) | A própria **UAL** tem 43 clipes (sentar, empurrar, nadar, morte…) e a **UAL 2** (CC0, gratuita) tem 130+; **Mixamo** como alternativa | Mesmo pipeline: adicionar a entrada em `GAME_CLIPS` (`tools/blender/retarget.py`) e em `ANIMATION_CLIPS`. |
| Kit urbano brasileiro (fachadas, mobiliário, entulho) | **Blender** + texturas **Poly Haven (CC0)** / **ambientCG (CC0)**; **Kenney (CC0)** para props rápidos | Registrar cada arquivo em `ASSETS.md`. Compressão KTX2/Basis e Draco via `gltf-transform`. |
| Dublagem PT-BR | Atores + gravação (ex.: estúdio local) ou, para animatic, TTS neural com licença comercial (ex.: ElevenLabs, Azure TTS pt-BR) | Arquivos `.ogg` em `public/assets/audio/voice/pt-BR/`, campo `voice` nas linhas de diálogo; registrar contrato/licença. |
| Ambiente e interface gravados | **Freesound (CC0)** — exige conta para baixar; **Kenney Interface Sounds** (CC0, sem login) | Mesmo mecanismo dos passos: entrada em `src/data/sounds.ts` + arquivo em `public/assets/audio/sfx/`; o sintetizador fica como fallback. |
| Lip-sync | **Rhubarb Lip Sync** (MIT) gerando visemas a partir das falas | Requer blend shapes faciais no modelo final. |

## Limitações conhecidas

- Sem gamepad (teclado + mouse no desktop; toque no celular/tablet). No celular, o toque foi verificado em Chromium emulado — não em aparelhos reais; iOS Safari não permite tela cheia em páginas (o jogo segue na aba normal).
- Vista aérea: a cidade real (600 m) aparece como um quadrado de chão marrom sobre a ortofoto gerada; o anel entre 6 km e 300 km usa uma só imagem (borrada abaixo de ~10 km de altitude). Pendente: calota intermediária e costura do chão real com a ortofoto.
- Sem LOD/streaming: a cena inteira é carregada de uma vez (~140 meshes, 22–35 K triângulos por personagem); roda bem em GPU integrada moderna; em celular começa em qualidade baixa, sem medição em aparelhos fracos.
- WebGL 2 apenas (WebGPU não habilitado ainda).
- Renderização por software (sem GPU) fica em ~2–5 FPS — só para testes automatizados; no Chromium headless o pointer lock ativo deixa os frames 5–10× mais lentos, por isso o teste visual roda com `?pointerlock=0` (`--lock` para o caminho com cursor travado).
- A voz sintetizada depende das vozes instaladas no sistema do jogador (Chrome tem vozes pt-BR online; Firefox depende do SO; no celular costuma haver uma voz pt-BR).
- O caminho até a praça não tem ainda a "área inacessível" para o tutorial de agachar.
- O clarão do cano agora é um sprite aditivo com alfa radial + raios e 2–3 partículas de fumaça (`src/combat/effects.ts`); o vídeo `docs/videos/combate.mp4` ainda mostra o quad antigo e precisa ser regravado.
- Sistemas do Capítulo 1 (`docs/SISTEMAS_CAP1.md`): a voz de prisão do Custódio é TTS provisório; o botão E de toque é "toque curto" (o reparo aceita toque para começar e toque para soltar — segurar de verdade exige o agente de UI mudar o botão para `bindHold`); a lanterna do Custódio só acende no toque de recolher/noite e no máximo 2 ao mesmo tempo; o Custódio não usa navmesh (steering + desvio de obstáculos), então patrulhas por ruas estreitas do mapa novo devem ter pontos próximos; a carga visível usa posições por tabela (`CARGO_PLACEMENTS`) porque os GLB dos veículos não têm nó de carga; a "prisão" (Custódio alcança Matias) só emite `enemies.onCaught` — o roteiro decide a consequência.

## Sistemas do Capítulo 1 (branch `agente/gameplay`) ✅

Entregues e cobertos por testes (`tests/unit/cap1Narrative.test.ts`, `tests/unit/cap1Stealth.test.ts`, `node tools/gameplay-test.mjs --only sistemas`): diário de pistas com aba na mochila e save; examinar com close-up; reparo em 3 passos; furtividade (ruído por estado, cone 70°/22 m com lanterna, calmo → suspeito → alerta → perseguição, Custódio que dá voz de prisão e só atira provocado, toque de recolher); timers com HUD mm:ss e carga visível no Atlas; gatilhos `MissionTrigger` por dados com zonas; clarão/fumaça/poeira novos. Guia de uso por dados em `docs/SISTEMAS_CAP1.md`.

## Capítulo 1 — M2 "Rastro do Lote", M3 "A Vigília", M4 "Partida" (branch `agente/missoes`) ✅

Jogáveis de ponta a ponta e encadeadas ao fim do Capítulo 0: na tela de conclusão de "O Carregamento", **"Continuar explorando"** → fade → amanhece o dia 2 → M2 → fim de tarde → M3 → amanhecer do dia 3 → M4 → tela **"Fim do Capítulo 1"**. Diretor dirigido por dados em `src/narrative/chapter1Director.ts` (mesmo espírito do `missionDirector.ts`): a fase sai das flags/missões salvas, a cena de cada missão é remontada ao carregar, e os sistemas genéricos (`docs/SISTEMAS_CAP1.md`) são usados sem alteração. Roteiro: `docs/ROTEIRO_CAP1.md`.

- **M2 (manhã)**: Raquel na van diante da oficina abre a missão → examinar **manifesto** (pistas S.B. + selo do depósito) e **lacres** → **portão da Central**: com o lote registrado o Custódio manda abrir o depósito; em silêncio o portão fica fechado e ele indica a **grade dos fundos** (passa só agachado) → **depósito**: caixas vazias atrás dos sacos de farinha e **caderno de saída** no escritório → **banca da feira do viaduto**: o comerciante só testemunha com o caderno; monta o nome **Samuel Brandão** e empresta o **Atlas T-3** → prazo do meio-dia (**150 s**, HUD) → encostar o Atlas na van carrega as caixas (carga visível) → chegar ao posto grava `cap1.m2.entrega_no_prazo` (falha branda se estourar) → Raquel puxa a conversa → Brandão atravessa a praça a pé → **denúncia ou acordo** (Ana sai de cena no acordo).
- **M3 (fim de tarde e noite)**: voltar à oficina → fade de fim de tarde → **rádio de Elias** (o "interlocutor" é o rádio) → janela de despedidas (**45 s**, HUD) → **toque de recolher**: noite, lanternas, 2 Custódios de ronda (cordial) ou 3 (tensa) pelas rotas do mapa (praça sul, Largo/beco, rua da Escola; caminhos pela navmesh), voz de prisão do roteiro (`custodio:m3_aviso`) na 1ª detecção, **preso = volta ao último ponto com aviso**, tiro em Custódio = `cap1.m3.custodios_hostis` → **quadra**: Elias na arquibancada, a folha de 2056 na bancada (só assinatura e ano; o resto tarjado) → Elias sai e a ronda entra pelo portão sul → **telhado da escola**: a Rastro AV-4 da Custódia na doca, etiqueta de manutenção → **voo até a rua da oficina** → Ana sai à porta e puxa a conversa → destino do documento.
- **M4 (amanhecer do dia 3)**: a tabela `CONSEQUENCES` é aplicada ao iniciar; Miriam diante da oficina, Custódio/Brandão no portão (Brandão algemado junto ao Javali, solto na porta do depósito ou ausente), Raquel no posto, Ana na praça decide por ela mesma (`cap1.m4.ana_pontos`); entrar na Módulo V-7 (Ana no banco do passageiro ou na porta do posto com Raquel) → posto de controle norte → cena curta (van no automático, câmera fixa da guarita, fade) → **"Fim do Capítulo 1"** com o resumo das escolhas.
- **Consequências** (`resolveConsequences`, uma vez por missão, ao iniciar): água e caixas **cumulativas** em flags (`cap1.bairro.agua` 0–100 a partir de 50; `cap1.posto.estoque` 0–6 a partir de 3), mostradas no **quadro de avisos da praça** (examinável — não há medidor na HUD); preço da banca (`cap1.banca.preco`) na **tabela da banca** (examinável — **não há loja**; preços de referência provisórios: munição 6 Selos, kit 10); postura da patrulha muda o nº de Custódios e o tempo de confirmação em M3 (em M4 fica em flag e nas falas — não há ronda de dia); **falas**: os grafos já começam pelos mesmos nós — o teste confere as 128 combinações; **presença** (Brandão, Miriam) pelo `npcLayout`; **avisos** em fila na HUD.
- **Correção de dados** em `consequences.ts`: a regra `cap1.m3.detectado` passou para antes das regras de Brandão — com "fala = última regra vence", a tabela mandava o Custódio para `m4_detectado` quando Brandão estava preso/solto/no acordo, contrariando o grafo (que fala `m4_preso`… e acrescenta `m4_detectado_extra`).
- **Pontos e objetos de cena definidos no diretor** (sem tocar em `src/world/`): portão de correr fechado e grade dos fundos do depósito (barreiras com colisor), sacos de farinha e caixas vazias extras, caderno no escritório, bancada e folha na quadra, lista afixada no posto (só no acordo); posições de cada ator por fase em `CAP1_SPOTS`; rotas de patrulha em `M3_PATROLS`.
- **Testes**: `tests/unit/chapter1Director.test.ts` (consequências, fala da tabela = grafo, fase/posições a partir do save, o capítulo inteiro sobre um dublê do jogo, falha branda, carregar no meio do toque) e `npm run test:cap1` (`tools/cap1-test.mjs`, no build: joga M2 → M3 → M4 com teleportes, `input.simulate` e diálogos com escolhas — ~10 min no SwiftShader — e, num novo jogo pelo caminho do silêncio, confere que o portão do depósito fica fechado e que a grade dos fundos só deixa passar agachado). `node tools/gameplay-test.mjs --only missao` continua verde (Capítulo 0). Capturas: `docs/screenshots/cap1/`.

### Provisório / pendente (Capítulo 1)
- **Samuel Brandão e Elias Nobre usam GLBs de outras variantes** (`PROVISIONAL_CAST` em `src/data/characters.ts`): Brandão = `saqueador_b`, Elias = `saqueador_a` (nenhum dos dois aparece na mesma cena que os desviadores de M1). Falta a Arte gerar `brandao.glb` (farda cinza de oficial de distribuição, sem armadura) e `elias.glb` (mensageiro de 24 anos) — trocar `model` no mapa basta. Vozes de ambos são TTS com perfis próprios.
- **Ana passageira**: um segundo modelo de Ana com o clipe `Sit`, preso ao chassi no espelho do banco do motorista (o GLB da van não tem nó de passageiro); a pose não foi conferida visualmente em detalhe.
- **Amanhecer**: o `Environment` só interpola tarde → anoitecer; o amanhecer é imitado com o céu em 0,42 → 0,18 (sol ainda no oeste).
- **Cena de partida**: a van segue sozinha ~3 s na direção da cancela e a tela escurece; o portão norte é geometria fechada do mapa (não abre), a câmera não sobe até o limite e não há o boletim do rádio ao fundo.
- **Brandão "andando"**: o `Npc` não tem locomoção; o diretor desliza o modelo com o clipe `Walk` (sem navmesh) em linha reta curta.
- **Prisão no teste**: a perseguição real (Custódio alcança Matias) não fecha em 3 s de jogo no SwiftShader; o teste então dispara o mesmo evento do gerenciador de inimigos (`enemies.onCaught`) — a detecção, essa sim, é a do sistema de furtividade.
- **Capturas no SwiftShader**: logo depois de um teleporte (câmera ainda alcançando o alvo) o cenário pode sair em branco por alguns quadros; com a câmera assentada desenha normal. Não visto em GPU real (não testado aqui).
- Ainda do roteiro (§9): ratificar a exceção canônica da Rastro (Matias "não pilota aeromoto") e a data (dia/mês) do documento de 2056 — o exame mostra só o ano.

## Próxima etapa

1. Gravações CC0 para tiros, motor, rotores e reações (hoje sintetizados); dublagem.
2. IA com cobertura e navmesh (Recast) para ruas estreitas; inimigos em veículos.
3. Capítulo 2 (Estação Nove): a decisão de Ana (`cap1.m4.ana`) e as flags do Capítulo 1 já estão salvas para ele.
4. Arte: fachadas da rua no kit GLB (M1.2), armadura do Custódio, passe de modelagem nos veículos.

## Plano anterior (M1)

1. Elevar os personagens: pele fotográfica/cabelo/roupas via MPFB + asset packs na máquina do criador (animações já resolvidas com a UAL; rig compatível com mais clipes dela e do Mixamo).
2. Fechar os beats 4 e 5: mensageiro, multidão na fila com reações, Custódio pedindo calma, depósito com a pista física e a decisão final em tensão.
3. Gravar/licenciar dublagem e SFX; lip-sync básico.
4. Estender o kit GLB + PBR da praça ao resto da rua (M1.2: fachadas da rua, oficina, carro queimado), decals de sujeira; Custódio com armadura segmentada (pendente do M1.1); otimização (instâncias, KTX2, Draco).
5. Gamepad, acessibilidade (tamanho de legenda, daltonismo), WebGPU opcional; validar o toque em aparelhos reais (Android/iOS) e medir desempenho.
6. Pipeline de CI (GitHub Actions: `npm run check` + teste visual com screenshots).
