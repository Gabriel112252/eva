# GDD — O ÚLTIMO VETO / EVA — Temporada 1 e Capítulo 1 "Setor 17"
Versão 0.1 — 29/10/2026. Documento de produção: define o que o jogo é, o que o jogador faz e o que cada frente (agente) entrega. Subordinado a `UNIVERSO_CANONICO.md` (fatos e segredos) e a `DIRECAO_ARTE.md` (visual). Nada aqui decide os itens **NÃO DECIDIDOS** do cânone.

## 1. Visão

**Fantasia:** ser Matias — o engenheiro que ajudou a construir o sistema e precisa descobrir o que assinou em 2056, enquanto mantém a filha viva num bairro racionado.

**Em uma frase:** aventura narrativa em terceira pessoa, com investigação, combate pontual e veículos, num Brasil de 2072 habitado e remendado.

**Pilares (tudo que entra serve a um deles):**
1. **Investigação com consequência** — a verdade vem de documentos, testemunhas e escolhas; cada decisão muda o bairro (quem recebe água, quem confia em Matias, quem vive).
2. **Sobrevivência fundamentada** — recursos racionados (selos, água, munição, remédio da Ana). Tiro é raro, caro e tem consequência. Não é shooter de horda.
3. **Brasil 2072 habitado** — mercado, rádio, Apuração, fé sincera e injustiça humana lado a lado; veículos para cruzar distâncias entre lugares canônicos; céu aberto (a Rastro sobe até a curvatura da Terra).

**Não é:** mundo aberto gigante, shooter, zumbis/robôs, "hackear a EVA", sermão anti-religioso.

## 2. Verbos do jogador

| Já existe | Capítulo 1 (novo) | Depois (Temporada 1+) |
| --- | --- | --- |
| andar, correr, agachar, interagir | **examinar** objetos e **ler** documentos (pistas → diário) | Ana companheira com opinião própria |
| conversar com escolhas persistentes | **reparar** máquinas (gerador, bomba d'água, rádio) — minigame leve | reputação com facções |
| atirar, mirar, recarregar, kit médico | **furtividade** básica: ruído, cone de visão, toque de recolher | viagem entre cidades de veículo |
| dirigir Javali/Módulo/Atlas, voar de Rastro (sem teto) | **gerir** selos, água, munição, remédio | reparo/melhoria de veículos |
| missão com objetivos e tela final | **decidir** com consequência visível no dia seguinte | Estação Janus |

**Loop central (5–10 min):** receber um fio (rádio, NPC, documento) → ir ao lugar (a pé ou de veículo) → investigar/conversar/reparar → tensão (furtividade ou tiroteio curto) → decidir → ver a consequência no bairro → salvar.

## 3. Estrutura da campanha

Um capítulo por lugar canônico. **Temporada 1 = Caps. 0–2** (o que se constrói agora); o resto fica planejado.

| Cap. | Lugar | Gancho | Estado |
| --- | --- | --- | --- |
| 0 — A Apuração | São Paulo Velha, Setor 17 | Ana sem prioridade; o Carregamento | **pronto** (fatia vertical) |
| 1 — Setor 17 | São Paulo Velha | o lote desviado leva a Samuel Brandão; os Silenciosos (Elias Nobre) trazem um documento de 2056 com a assinatura de Matias; partida da cidade | este GDD |
| 2 — Estação Nove | entroncamento ferroviário | contrabandistas de informação; a trilha da auditora Íris Serra | roteiro a escrever |
| 3 — Nova Aurora | capital da Igreja | tratamento da Ana; Irmã Caetana, Cira Torres, Arconte Abel; infiltração social | plano |
| 4 — Vale dos Sinos | indústria | Dante Ferraz e os Senhores do Recurso; a "alternativa menos letal" em partes | plano |
| 5 — Serra do Silêncio | Complexo Central | o Último Veto; finais pelas três versões conforme as provas e a quem foram entregues | **reservado ao criador** |

## 4. Capítulo 1 — "Setor 17" (30–45 min, 4 missões)

Regras: Ana tem agência; ninguém é fanático de cartolina; sem infodump; cada missão termina com uma escolha cujo efeito aparece na missão seguinte.

### M1 — O Carregamento (existe)
Defender o lote em duas levas, fugir de van, trancar na oficina, decidir pelo rádio: **registrar** (a Central fica sabendo) ou **silenciar**.
Consequência: `carregamento.decisao` → em M2, o Custódio da praça está mais ou menos disposto a ajudar; a fila da água muda.

### M2 — Rastro do Lote (investigação, ~10 min)
- Fio: Raquel recebeu só metade do remédio; o manifesto da van tem um selo que não bate.
- Lugares: depósito da zona de distribuição (novo interior), banca do mercado (testemunha), posto da Raquel.
- Verbos novos: **examinar** (manifesto, lacre, caixa vazia), **diário de pistas** (3 pistas montam o nome: Samuel Brandão), **entrega contra o tempo** com o Atlas T-3 (levar caixa ao posto antes da fila fechar).
- Escolha: **denunciar Brandão na próxima Apuração** (público, perigoso) ou **trocar silêncio pela prioridade da Ana** (privado, culpa).
- Falha branda: perder a corrida do Atlas → Raquel atende menos gente (fila maior em M4).

### M3 — A Vigília (noite, furtividade, ~12 min)
- Fio: Elias Nobre (Silenciosos) manda um recado pelo rádio da oficina: encontro na quadra escolar, depois do toque de recolher.
- Sistema novo: **furtividade** — Custódios patrulham com cone de visão e lanterna; ruído de passos (correr = ouvido a 15 m, agachado = 4 m); detectado → aviso, depois perseguição; opcional atirar (consequência: Custódios hostis em M4).
- Encontro: Elias entrega cópia de um documento de 2056 com a assinatura de Matias (o conteúdo completo **não** é mostrado — só o suficiente para Matias reconhecer a própria assinatura e a data).
- Fuga: a Rastro no telhado da escola; voo baixo por cima dos telhados até a oficina (lanternas dos Custódios no chão). Sem teto: o jogador pode subir — a cidade apaga embaixo.
- Escolha: **guardar o documento** ou **entregá-lo a Miriam** (arquivista religiosa, que percebe inconsistências).

### M4 — Partida (consequências, ~8 min)
- Amanhecer: o bairro reflete M1–M3 (fila da água, estoque da Raquel, falas dos NPCs, Custódios cordiais/hostis, Brandão preso/solto/ausente).
- Ana discorda do pai e **decide por ela mesma** se vai junto ou fica com Raquel. A decisão é dela (diálogo em que o jogador argumenta; o resultado depende da confiança acumulada `matiasTrustsSystem` + escolhas).
- Saída rumo à Estação Nove na Módulo V-7 (cutscene in-engine: a van cruza o limite do setor; letreiro do capítulo).

### Economia do capítulo
- Munição: 36 inicial + 3 caixas (12) no mapa; recarga por inimigo morto (6). Nunca mais de 60 na reserva.
- Vida: regenera devagar; 1 kit médico por missão.
- Selos de Permanência: moeda local para comprar munição/kit na banca (preço sobe se Brandão foi denunciado).
- Água: medidor do bairro (0–100) exibido na HUD do posto; muda com as escolhas, não com o tempo.

## 5. Sistemas a implementar (dono entre parênteses)

| Sistema | Descrição | Dono |
| --- | --- | --- |
| Diário de pistas | `src/narrative/clues.ts`: pistas com id, texto, fonte; UI no inventário (aba); persistência no save | Gameplay |
| Examinar | Interactable "Examinar" com close-up de câmera + texto; objetos de depósito/mercado | Gameplay + Arte (props) |
| Reparo | minigame de 3 passos (girar/encaixar/segurar) com tempo; falha custa tempo, não vida | Gameplay |
| Furtividade | ruído por estado (andar/correr/agachar), cone de visão + lanterna dos Custódios, estados calmo→suspeito→alerta→perseguição; toque de recolher como fase da missão | Gameplay |
| Consequências | `src/narrative/consequences.ts`: tabela flag → efeitos (fila, estoque, falas, preços, patrulhas) aplicada ao carregar a missão | Enredo + Gameplay |
| Entrega contra o tempo | objetivo com timer na HUD, carga visível no Atlas | Gameplay |
| Cutscenes | câmera em trilhos (spline), encenação por timeline, legendas, pular; 4–6 cenas | Animação & Cutscenes |
| Vozes | falas PT-BR geradas (Kairogen/ElevenLabs), 1 arquivo por fala, `voices.json` (id → arquivo, duração), legendas sincronizadas | Áudio |
| Mapa/Level | Setor 17 inteiro: 4–6 quarteirões, depósito, escola/quadra, telhados navegáveis para a Rastro, navmesh (Recast) | Mapas & Level Design |
| Kit com relevo | fachadas com profundidade, camada tecnológica 2040–56, marcos monumentais, clutter, decalques; veículos finais | Arte 3D & Tech Art |
| HUD/UI | diário, medidor de água, timer, mapa do setor, tutorial jogado | UI/UX |

## 6. Direção de arte, áudio e desempenho

- Visual: regra das **três camadas** e marcos monumentais (`DIRECAO_ARTE.md`). Referências obrigatórias em `docs/concept/`.
- Áudio: elenco provisório PT-BR (catálogo Kairogen): Matias → Antonio de Jesus · Custódio → Leo Antonio · Raquel → Bruna da Costa · Ana → Alexa · Miriam → Athena · Central/rádio → Alex (narrador) · saqueadores → Talis / Andre Ambrosio · Elias → Yuri. Orçamento: ~600 créditos para ~500 falas.
- Desempenho: 60 fps em GPU integrada moderna (qualidade média), 30 fps em celular médio (baixa); download inicial ≤ 150 MB; carga < 15 s.
- Compatibilidade: navegador (WebGL 2), build estático (Docker/Easypanel), save em IndexedDB.

## 7. Critérios de aceite da Temporada 1 (Cap. 1)

1. As 4 missões jogáveis do início ao fim sem comandos de depuração; `npm run test:gameplay` cobre M1–M4.
2. Toda fala do Cap. 1 com áudio PT-BR e legenda; nenhum TTS do navegador.
3. Nenhuma fachada "caixa com textura" na rota principal; três camadas visíveis; 1 marco por quarteirão.
4. Furtividade, diário, reparo e consequências funcionando e cobertos por teste unitário.
5. Cutscenes in-engine com pular; nenhum vídeo pré-renderizado fora de telas do mundo.
6. 60 fps (média) no desktop de referência; build e Docker passando; `npm run check` verde.

## 8. Plano de produção — agentes

Regras de integração (valem para todos):
- Cada agente trabalha em **branch/worktree própria** (`agente/<area>`), é dono das pastas listadas e **não edita** pastas de outro sem combinar via o coordenador.
- Antes de entregar: `npm run check` (tsc + vitest + build) e os testes da área; nada de asset sem licença em `public/assets/licenses/ASSETS.md`.
- Commits pequenos e descritivos; o coordenador faz merge em `main`, roda os testes de gameplay e publica.
- Cânone intocável; segredos reservados não se resolvem por acidente.

| Onda | Agente | Pastas | Entrega |
| --- | --- | --- | --- |
| 1 | Enredo & Narrativa | `docs/ROTEIRO_CAP1.md`, `src/data/dialogues.ts`, `src/data/quests.ts`, `src/narrative/consequences.ts` | roteiro M2–M4 com falas numeradas, árvores, tabela de consequências |
| 1 | Arte 3D & Tech Art | `tools/blender/*`, `public/assets/environments`, `public/assets/vehicles`, `public/assets/props` | kit com relevo + camada tecnológica + 2 marcos + 20 props; veículos finais |
| 1 | Gameplay & Física | `src/combat`, `src/ai`, `src/items`, `src/vehicles`, `src/narrative/clues.ts` | furtividade, diário, examinar, reparo, entrega com timer, VFX do clarão |
| 2 | Mapas & Level Design | `src/world/*` (exceto planet/environment), `docs/MAPA_SETOR17.md` | Setor 17 completo, depósito, escola, telhados, navmesh, encontros |
| 2 | Áudio | `public/assets/audio`, `src/audio`, `tools/voices/*` | falas geradas e integradas, SFX reais, música, mixagem |
| 2 | Animação & Cutscenes | `src/cinematics`, `src/characters` | 4–6 cutscenes, IK de pés, reações, lip-sync simples |
| 2 | UI/UX | `src/ui`, `index.html`, `src/style.css` | diário, água, timer, mapa, tutorial, celular |

Coordenador (Fable principal): GDD, integração, testes, publicação, QA automatizada. Playtest humano: o criador, a cada build.
