# ROTEIRO — Capítulo 1 "Setor 17" — M2 Rastro do Lote · M3 A Vigília · M4 Partida
Versão 0.1 — 29/10/2026. Documento de produção do agente Enredo & Narrativa. Subordinado a `UNIVERSO_CANONICO.md` (fatos, crenças e segredos) e a `GDD_CAPITULO_1.md` (§4). Nada aqui resolve ou insinua a solução dos itens **NÃO DECIDIDOS** do cânone: o conteúdo do documento de 2056, quem reteve a alternativa, a intenção de EVA, o paradeiro de Isadora e o significado da Sétima Previsão permanecem em aberto.

## 0. Como usar este documento

- **Dados executáveis**: as falas abaixo são as mesmas de `src/data/dialogues.ts` (nós `m2_*`, `m3_*`, `m4_*`), literalmente. O teste `tests/unit/cap1Narrativa.test.ts` falha se uma fala do código não estiver neste arquivo — ao mudar uma fala, mude nos dois lugares (ou regenere a listagem, ver abaixo).
- **Ids de dublagem**: `[M2-012]` identifica uma fala para a frente de Áudio (um arquivo por fala; sugestão de nome: `voice/pt-BR/cap1/M2-012.ogg`). Depois do falante vem a chave `grafo:nó` que liga o id à linha do código (`voice` da `DialogueLine`). As **escolhas** do jogador são falas de Matias e também têm id (`[escolha A → nó]`); se não forem dubladas, o id fica reservado.
- **Tags entre colchetes**: `[se M1 = registro]` é a condição da linha (ela só aparece quando a flag tem esse valor; senão o grafo pula para o `elseNext`); o resto é direção de tom para atores/TTS (também em `CAP1_DIRECAO`, em `dialogues.ts`).
- **→ _efeitos_**: flags gravadas e objetivos concluídos pela fala (contrato em `src/data/cap1Contracts.ts`; flags auxiliares em `CAP1_AUX_FLAGS`).
- **Limites**: toda fala tem no máximo 140 caracteres (teste); falas longas foram quebradas em nós consecutivos.
- **Regenerar a listagem**: um script de uma tela (`rolldown` empacota `dialogues.ts`, percorre um manifesto de cenas e imprime as falas numeradas) foi usado para gerar as seções "Falas" — vive fora do repositório por ora; vale movê-lo para `tools/roteiro-falas.mjs` quando o coordenador integrar.

## 1. Elenco do capítulo

| Chave (`speaker`) | Personagem | Quem é neste capítulo | Voz provisória (GDD §6) |
| --- | --- | --- | --- |
| `matias` | Matias, 58 | protagonista; ex-engenheiro de segurança da EVA; irônico, culpado, competente | Antonio de Jesus |
| `ana` | Ana, 15 | filha; fiel à Igreja em parte; discorda do pai e **decide por ela mesma** em M4 | Alexa |
| `raquel` | Raquel Dias, 40 | médica do posto; pragmática; não julga, mas não mente | Bruna da Costa |
| `miriam` | Miriam Monteiro, 36 | arquivista religiosa; fé sincera; percebe inconsistências e age dentro das regras | Athena |
| `custodio` | Custódio da praça | segurança da Igreja, ferido em M1; mentiu ou não ao conselho conforme M1; decente, não herói | Leo Antonio |
| `comerciante` | Comerciante da banca | revende "sobras" para quem não tem fila; testemunha; empresta o Atlas | (a definir — voz masculina, rápida) |
| `brandao` | Samuel Brandão | **novo** — oficial de saída do depósito; desvia metade dos lotes; humano, cansado, convencido do que faz; mãe Vinculada | (a definir — masculina madura, distinta do Custódio) |
| `elias` | Elias Nobre, 24 | **novo** — mensageiro dos Silenciosos; carrega, não guarda; jovem, rápido, leve provocação | Yuri |
| `radio` | Rádio do Setor | boletins da Central (já existe) | Alex (narrador) |

**NPCs novos** exigem variantes de personagem (`CharacterVariant`: `brandao`, `elias`) e modelos — fora do escopo deste agente (ver §9).

## 2. Linha do tempo

| Quando | Missão | O que acontece |
| --- | --- | --- |
| Dia 1, 15h | Cap. 0 — A Apuração | Ana fica em prioridade três; Miriam cita um lote fora das cotas |
| Dia 1, noite | M1 — O Carregamento | defesa do lote, fuga de van, decisão no rádio: **registrar** ou **silenciar** |
| Dia 2, 6h–12h | **M2 — Rastro do Lote** | a van tem metade do lote; três pistas montam o nome Samuel Brandão; entrega contra o tempo; **denunciar** ou **acordo** |
| Dia 2, anoitecer e noite | **M3 — A Vigília** | recado de Elias; toque de recolher antecipado; furtividade; documento de 2056; fuga de Rastro; **guardar** ou **Miriam** |
| Dia 3, amanhecer | **M4 — Partida** | o bairro reflete tudo; Ana **decide**; a Módulo V-7 cruza o limite do setor rumo à Estação Nove |
| Sexta (fora do capítulo) | — | a Apuração seguinte; Miriam lê a lista inteira, com ou sem Matias na praça |

Por que partir já no dia 3: o resto do documento está com quem guarda, na Estação Nove (Elias); o tratamento de Ana só existe em Nova Aurora, e a estrada passa pela Nove (Raquel: "Nova Aurora ou nada"); e a Rastro pousada na porta da oficina não vai passar despercebida por muito tempo (Miriam registrou "manutenção", mas isso não segura).

## 3. M2 — Rastro do Lote (investigação, ~10 min)

### Sinopse
Amanhece. Raquel chega à oficina para contar o lote antes que a rua acorde: o Custódio falou em seis caixas; há três. O manifesto da van diz seis volumes e traz um carimbo do depósito da zona em vez do carimbo do conselho; os lacres das caixas foram cortados e refeitos com alicate de depósito. Ninguém abriu a van no tiroteio — o lote saiu da Central já pela metade. Matias tem até o meio-dia, quando a Central passa recolhendo o que sobrou nos postos.

A manhã leva Matias ao **depósito** (com a ajuda aberta ou relutante do Custódio, conforme M1), onde encontra três caixas vazias da mesma série e o **caderno de saída** com o nome do oficial de turno: Brandão. Na **banca**, o comerciante reconhece o "Samuel" de farda cinza que deixa sobras de remédio em troca de Selos e revende para quem não aparece em lista nenhuma. Samuel. Brandão. S.B. — a rubrica do manifesto. O comerciante empresta o **Atlas T-3**: as caixas da van precisam chegar ao posto antes do meio-dia (entrega contra o tempo).

No posto, Samuel Brandão aparece "para conferir o inventário". Não é vilão de cartolina: vende a metade que desvia para Sem Registro e Vinculados sem cota, fica com a parte dele e sustenta a mãe Vinculada. Ele oferece um acordo: na Apuração de sexta carimba Ana como prioridade dois; em troca, o caderno some e Matias esquece o nome. Ana, presente, é contra ("Se eu subo assim, alguém desce"). Raquel não julga. Matias decide: **denunciar** (público, perigoso — o destino de Brandão depende de o lote ter sido registrado em M1) ou **aceitar o acordo** (privado, culpa; Ana sai de cena).

### Lugares
- **Oficina / van Módulo V-7** (existe): manifesto preso ao painel, caixas no compartimento de carga.
- **Portão da Central e depósito da zona de distribuição** (interior **novo** — Mapas): balcão de saída com o caderno, prateleiras, sacos de farinha nos fundos escondendo as caixas vazias, grade de ventilação rente ao chão nos fundos (entrada agachado — tutorial da "área inacessível" que faltava no prólogo).
- **Banca do mercado** (existe): o Atlas T-3 estacionado ao lado, caixote traseiro vazio.
- **Posto médico de Raquel** (existe): maca onde Ana dormiu; a fila da manhã.

### Personagens
Raquel, Ana, Custódio (braço na tipoia), Comerciante, Miriam (de passagem; não há Apuração hoje), **Samuel Brandão** (farda cinza de oficial de distribuição, sem armadura; chega a pé pela praça).

### Beats e gameplay

| # | Beat | Jogabilidade | Gatilhos (Gameplay) |
| --- | --- | --- | --- |
| 1 | Oficina, amanhecer | diálogo com Raquel (cena 1) inicia a missão; depois **examinar** o manifesto e os lacres na van | `dialogo raquel:m2_m7` inicia `rastro_do_lote`; `examinar manifesto_van` → pistas `manifesto_rasurado` e `selo_nao_bate`; `examinar lacres_van` → `lacres_refeitos`; objetivo `manifesto` ao ter as três |
| 2 | Portão da Central | Custódio: caminho **registro** abre a porta do depósito; caminho **silencio** indica a grade dos fundos (agachar) | flags `cap1.m2.deposito_liberado` / `cap1.m2.deposito_fundos`; `zona deposito` → objetivo `deposito` |
| 3 | Depósito (interior) | **examinar** caixas vazias atrás dos sacos e o caderno de saída no balcão; turno da manhã chega às 10h (pressão de tempo narrativa, sem timer) | `examinar caixas_vazias` → `pista.caixas_vazias`; `examinar caderno_saida` → `pista.caderno_de_saida`; objetivo `pistas` ao ter as duas |
| 4 | Banca do mercado | sem o caderno, o comerciante não fala nomes (gate); com ele, testemunha e **monta o nome** (flag `brandao_identificado`); empresta o Atlas | `dialogo comerciante:m2_nome` → `pista.testemunha_samuel` + objetivo `testemunha`; `dialogo comerciante:m2_ac2` → liga o Atlas e **inicia o timer** `entrega_posto` ao carregar as caixas da van |
| 5 | Entrega contra o tempo | levar as caixas no Atlas T-3 da oficina ao posto antes do meio-dia (sugestão: 180 s, a calibrar por Mapas); carga visível no caixote | `timer entrega_posto` → `cap1.m2.entrega_no_prazo = true/false`; objetivo `entrega`; ao chegar: diálogo Raquel (cena 5) |
| 6 | Brandão no posto | Brandão caminha pela praça até o posto após a cena 5; diálogo com Ana e Raquel presentes; **escolha** | `dialogo raquel:m2_entrega_fim` → spawn `brandao` junto ao posto; `dialogo brandao:m2_r12` → `cap1.m2.decisao` (`denuncia` \| `silencio`) e, com denúncia, `cap1.m2.brandao_preso` (M1 = registro) ou `cap1.m2.brandao_solto` (M1 = silencio) |

### Falha branda
Perder a corrida do Atlas não falha a missão: Raquel atende menos gente (`entrega_no_prazo = false` → em M4, estoque −2, aviso de fila dobrada, falas próprias).

### Decisão e consequências imediatas
- **Denúncia**: Miriam promete ler a lista inteira na sexta; Ana agradece e diz que vai junto "na frente de todo mundo". Em M3 a ronda fica tensa (toque antecipado pedido pelo depósito). Em M4, a banca perde o fornecedor (preço ×1,5) e Brandão aparece **preso** (se M1 = registro: o conselho tinha o lote registrado e veio buscar de Javali; duas caixas voltam ao posto) ou **solto** (se M1 = silencio: a denúncia bate na mentira do Custódio, que é transferido; Brandão continua no depósito).
- **Acordo**: Ana sai de cena ("Eu não pedi isso"); Brandão devolve uma caixa; a lista de sexta sai com Ana em prioridade dois e ninguém pergunta por quê. Em M4, Brandão está ausente, o Custódio comenta a lista seco, o comerciante recebe uma caixa "pra doutora" paga por alguém.

### Falas
<!-- FALAS M2 -->


#### Cena 1 — Oficina, amanhecer: a van pela metade (raquel)

- [M2-001] RAQUEL [baixo, antes de a rua acordar] `raquel:m2_inicio`: Matias. Abre a van. Eu quero contar antes que a rua acorde.
- [M2-002] MATIAS `raquel:m2_m1`: O Custódio disse seis caixas.
- [M2-003] RAQUEL [contando com o dedo; sem drama] `raquel:m2_r2`: Eu conto três. Soro inteiro, antibiótico pela metade.
- [M2-004] RAQUEL `raquel:m2_r3`: O manifesto diz seis volumes. E olha os lacres: cortados e refeitos com alicate de depósito.
  - [M2-005] MATIAS [escolha A → m2_r4a]: Os desviadores levaram metade no tiroteio.
  - [M2-006] MATIAS [escolha B → m2_r4b]: Essa van saiu da Central já pela metade.
- [M2-007] RAQUEL `raquel:m2_r4a`: Ninguém abriu a van no tiroteio, eu vi dali. Isso foi feito com calma. Por dentro.
- [M2-008] RAQUEL `raquel:m2_r4b`: Então alguém lá dentro abriu, tirou e lacrou de novo. Antes do tiroteio. Antes do Custódio.
- [M2-009] RAQUEL [se M1 = registro] `raquel:m2_r5_registro`: Você assinou de onde veio. Hoje o conselho sabe que o lote existe — e que está pela metade.
- [M2-010] RAQUEL [aviso, não censura] `raquel:m2_r5_silencio`: O Custódio disse ao conselho que o lote sumiu no tiroteio. Se você fuçar o depósito, ele cai junto.
- [M2-011] RAQUEL `raquel:m2_r6`: Ao meio-dia a Central passa recolhendo o que sobrou. O que não estiver no posto até lá, some.
- [M2-012] MATIAS `raquel:m2_m7`: Então eu tenho uma manhã. Me mostra esse manifesto.  
  → _cap1.m2.van_conferida = true; inicia rastro_do_lote_
- [M2-013] RAQUEL [meio sorriso cansado] `raquel:m2_r8`: A Ana dormiu no posto. Melhor assim. Vai — e não grita com ninguém.
- [M2-014] RAQUEL `raquel:m2_repete`: Meio-dia, Matias. Depois disso não existe mais lote.

#### Cena 1b — Posto, manhã: Ana antes da entrega (ana)

- [M2-015] ANA [convicta; defende a Igreja sem gritar] `ana:m2_manha`: A Raquel disse que faltou metade. Gente da Igreja não faria isso, pai.
- [M2-016] ANA `ana:m2_manha_b`: A Raquel disse que faltou metade. O senhor vai dizer que foi a Igreja. Não foi a Igreja. Foi alguém.
- [M2-017] MATIAS `ana:m2_mm1`: Gente é gente, Ana. Com ou sem farda.
- [M2-018] ANA `ana:m2_ma2`: Então acha quem foi. Mas não grita na praça.

#### Cena 2 — Portão da Central: o Custódio (custodio)

- [M2-019] CUSTÓDIO [braço na tipoia; formal] `custodio:m2_registro`: Senhor Matias. O braço aguenta. O conselho recebeu o seu registro: lote existente, pela metade, origem assinada.
- [M2-020] MATIAS `custodio:m2_m1`: E agora?
- [M2-021] CUSTÓDIO `custodio:m2_c2`: Agora querem saber onde está a outra metade. Eu também. O depósito está aberto pro senhor conferir. Ordem minha.
- [M2-022] MATIAS `custodio:m2_m3`: Por que me ajudar?
- [M2-023] CUSTÓDIO [sem heroísmo; orgulho ferido] `custodio:m2_c4`: Porque eu levei um tiro por aquele lote e alguém abriu as caixas antes de mim. Não gosto de ser feito de bobo.  
  → _cap1.m2.deposito_liberado = true_
- [M2-024] CUSTÓDIO `custodio:m2_silencio`: Senhor Matias. Não chega perto do depósito hoje.
- [M2-025] MATIAS `custodio:m2_m5`: Faltam três caixas. Alguém abriu o lote antes do tiroteio.
- [M2-026] CUSTÓDIO [tenso, quase sussurrando] `custodio:m2_c6`: Eu disse ao conselho que o lote sumiu inteiro. Se o senhor entra ali conferindo manifesto, quem some sou eu.
  - [M2-027] MATIAS [escolha A → m2_c7a]: Então me diz por onde eu entro sem passar por você.
  - [M2-028] MATIAS [escolha B → m2_c7b]: Você levou um tiro por esse lote. Quer saber quem abriu ou não quer?  
    → _custodioQuestionado +1_
- [M2-029] CUSTÓDIO `custodio:m2_c7a`: Nos fundos tem uma grade de ventilação solta, rente ao chão. Agachado passa. Eu não vi nada.  
  → _cap1.m2.deposito_fundos = true_
- [M2-030] CUSTÓDIO [pausa longa antes do 'quero'] `custodio:m2_c7b`: ...Quero. Grade dos fundos, rente ao chão, agachado passa. Se perguntarem, o senhor pulou o muro sozinho.  
  → _cap1.m2.deposito_fundos = true_
- [M2-031] CUSTÓDIO [se cap1.m2.deposito_liberado definida] `custodio:m2_repete`: O depósito está aberto. Não demore, que o turno da manhã chega às dez.
- [M2-032] CUSTÓDIO `custodio:m2_repete_fundos`: Eu não vi nada, senhor Matias. Continuo não vendo.

#### Cena 2b — Miriam, de passagem (miriam)

- [M2-033] MIRIAM `miriam:m2_dia`: Hoje não tem Apuração, Matias. Sexta. O que tiver a dizer, diz lá, na frente de todos: é o único lugar que fica registrado.

#### Cena 4 — Banca do mercado: a testemunha e o Atlas (comerciante)

- [M2-034] COMERCIANTE `comerciante:m2_cedo`: Matias? Com essa cara, veio comprar ou perguntar?
- [M2-035] MATIAS `comerciante:m2_cm1`: Perguntar. Quem vende antibiótico por fora, no mercado?
- [M2-036] COMERCIANTE [baixo, olhando a fila] `comerciante:m2_cc2`: Baixa a voz. Eu não digo nome de ninguém de farda sem ter o que me segure. Traz alguma coisa escrita.
- [M2-037] COMERCIANTE `comerciante:m2_testemunha`: Matias. Essa cara é de quem não dormiu.
- [M2-038] MATIAS `comerciante:m2_tm1`: Quem vende antibiótico por fora, nesta banca?
- [M2-039] COMERCIANTE `comerciante:m2_tc2`: Baixa a voz.
- [M2-040] MATIAS `comerciante:m2_tm3`: Caderno de saída do depósito. Oficial de turno: Brandão. Saíram seis volumes. Chegaram três.
- [M2-041] COMERCIANTE `comerciante:m2_tc4`: Brandão... Eu só conheço o Samuel. Farda cinza, sem armadura. Vem no fim da tarde num Atlas com faixa de cobre.
- [M2-042] COMERCIANTE [defensivo, mas não envergonhado] `comerciante:m2_tc5`: Deixa o que 'sobrou', leva Selo. Eu revendo pra quem não tem fila: Sem Registro, Vinculado sem cota. Gente que a Apuração não vê.
  - [M2-043] MATIAS [escolha A → m2_tc6a]: Você revende remédio desviado e me fala de gente que a Apuração não vê?  
    → _matiasDefendeSistema +1_
  - [M2-044] MATIAS [escolha B → m2_tc6b]: Samuel. Brandão. S.B. — a rubrica do manifesto.
- [M2-045] COMERCIANTE [firme; ele acredita no que faz] `comerciante:m2_tc6a`: Eu falo de gente. Devolver pra Central é deixar morrer quem não está em lista nenhuma. Me julga depois.
- [M2-046] COMERCIANTE `comerciante:m2_tc6b`: Se é ele, não foi a primeira vez. Foi a primeira que a metade era de uma menina que eu conheço.
- [M2-047] MATIAS `comerciante:m2_nome`: Samuel Brandão. Oficial de saída do depósito.  
  → _cap1.m2.brandao_identificado = true; objetivo rastro_do_lote/testemunha_
- [M2-048] COMERCIANTE `comerciante:m2_atlas`: Agora me escuta. Meio-dia a Central recolhe o que sobrou. Leva o Atlas: as caixas da van cabem no caixote.
- [M2-049] MATIAS `comerciante:m2_am1`: Você empresta o triciclo pra quem acabou de te acusar?
- [M2-050] COMERCIANTE [curto, virando as costas] `comerciante:m2_ac2`: Eu empresto pra Ana. Pedala.  
  → _cap1.m2.atlas_emprestado = true_
- [M2-051] COMERCIANTE `comerciante:m2_repete`: O Atlas, Matias. Meio-dia.

#### Cena 5 — Posto: chegada do Atlas (raquel, ana)

- [M2-052] RAQUEL [se entrega no prazo = true] `raquel:m2_entrega`: Chegou. Caixote no chão, devagar: soro não gosta de solavanco.
- [M2-053] RAQUEL [seca; não culpa, constata] `raquel:m2_entrega_tarde`: A Central já passou. Levou duas que eu tinha separado. O que você trouxe eu guardo — e amanhã a fila dobra.
- [M2-054] ANA `raquel:m2_ana1`: Pai! O senhor veio de triciclo?
- [M2-055] ANA [se confia no sistema = true] `raquel:m2_ana2`: Então sexta a gente registra essas caixas na Apuração. Do jeito certo.
- [M2-056] ANA `raquel:m2_ana2b`: O senhor está com cara de quem vai brigar com alguém. De novo.
- [M2-057] RAQUEL [voz baixa, olhando por cima do ombro de Matias] `raquel:m2_entrega_fim`: Farda cinza vindo pela praça, sem armadura. Não é Custódio. É do depósito.  
  → _cap1.m2.entrega_conversada = true_
- [M2-058] RAQUEL `raquel:m2_espera_brandao`: Deixa ele falar primeiro.

#### Cena 5b — Ana enquanto Brandão se aproxima (ana)

- [M2-059] ANA `ana:m2_posto_repete`: Pai. Ele está olhando pra gente.

#### Cena 6 — Posto: Samuel Brandão e a escolha (brandao)

- [M2-060] SAMUEL BRANDÃO [educado, cansado; não é vilão] `brandao:m2_inicio`: Doutora. Vim conferir o inventário do posto. Rotina.
- [M2-061] RAQUEL `brandao:m2_r1`: Rotina é a Central recolher ao meio-dia. O senhor nunca pisou aqui.
- [M2-062] SAMUEL BRANDÃO `brandao:m2_b2`: Nunca tinha faltado metade de um lote. O senhor é o Matias? O engenheiro.
- [M2-063] MATIAS `brandao:m2_m3`: Samuel Brandão. Oficial de turno na noite em que seis volumes viraram três.
- [M2-064] SAMUEL BRANDÃO [baixo, olhando a fila] `brandao:m2_b4`: Fala baixo. Tem gente nessa fila que depende mais de mim do que da Apuração.
- [M2-065] MATIAS `brandao:m2_m5`: Depende de você vender o que é deles?
- [M2-066] SAMUEL BRANDÃO `brandao:m2_b6`: Deles? A lista diz quem recebe. Quem não está na lista não existe. Eu vendo pra quem não existe.
- [M2-067] SAMUEL BRANDÃO [a única fala em que ele se exalta um pouco] `brandao:m2_b7`: E fico com a minha parte, sim. Minha mãe é Vinculada. 'Conforme disponibilidade.' O senhor sabe o que isso quer dizer.
- [M2-068] ANA [indignada, voz jovem] `brandao:m2_a8`: Isso não dá direito de tirar da Raquel.
- [M2-069] SAMUEL BRANDÃO `brandao:m2_b9`: Não dá, menina. Mas eu não vim discutir direito. Vim fazer uma proposta ao seu pai.
- [M2-070] SAMUEL BRANDÃO [tom de quem já fez essa proposta antes] `brandao:m2_b10`: Sexta, na Apuração, eu carimbo a Ana como prioridade dois. Uma linha. Em troca, o caderno some e o senhor esquece meu nome.
- [M2-071] ANA [firme; não é birra] `brandao:m2_a11`: Pai. Não. Se eu subo assim, alguém desce.
- [M2-072] RAQUEL [baixo, quase um pedido de desculpas] `brandao:m2_r12`: Matias... é a Ana. Eu não vou te julgar.
  - [M2-073] MATIAS [escolha A → m2_denuncia_b]: Sexta eu digo o seu nome na frente de todo mundo. Leve suas testemunhas.  
    → _cap1.m2.decisao = denuncia; matiasDefendeSistema +1; objetivo rastro_do_lote/brandao_
  - [M2-074] MATIAS [escolha B → m2_acordo_b]: Prioridade dois. E a metade que falta volta pro posto hoje.  
    → _cap1.m2.decisao = silencio; matiasContestaSistema +1; objetivo rastro_do_lote/brandao_
- [M2-075] SAMUEL BRANDÃO [se M1 = registro] `brandao:m2_denuncia_b`: Então sexta. Eu levo as minhas. O senhor leva um lote que assinou como seu — com metade sumida.  
  → _cap1.m2.brandao_preso = true_
- [M2-076] SAMUEL BRANDÃO [quase pena] `brandao:m2_denuncia_b2`: Então sexta. Eu levo as minhas. O senhor leva um lote que, pro conselho, sumiu num tiroteio. Boa sorte.  
  → _cap1.m2.brandao_solto = true_
- [M2-077] ANA `brandao:m2_denuncia_a`: Obrigada, pai.
- [M2-078] RAQUEL `brandao:m2_denuncia_fim`: Ele vai se mexer antes de sexta. Dorme com a porta trancada.  
  → _objetivo rastro_do_lote/decisao_
- [M2-079] SAMUEL BRANDÃO `brandao:m2_acordo_b`: A metade virou Selo ontem mesmo. Eu devolvo uma caixa. É o que tenho.
- [M2-080] ANA [saindo de cena] `brandao:m2_acordo_a`: Eu não pedi isso.
- [M2-081] RAQUEL `brandao:m2_acordo_r`: Ana— ...Deixa. Ela volta.
- [M2-082] SAMUEL BRANDÃO [sem triunfo] `brandao:m2_acordo_b2`: Sexta a lista sai com o nome dela. Ninguém pergunta por quê. Ninguém nunca pergunta.  
  → _objetivo rastro_do_lote/decisao_
- [M2-083] SAMUEL BRANDÃO [se M2 = denuncia] `brandao:m2_repete`: Sexta, engenheiro.
- [M2-084] SAMUEL BRANDÃO `brandao:m2_repete_acordo`: Fica tranquilo. A lista sai.

#### Cena 6b — Depois da decisão (ana, miriam)

- [M2-085] ANA [se M2 = denuncia] `ana:m2_depois`: Sexta eu vou junto. Na frente de todo mundo, igual o senhor.
- [M2-086] ANA [sem olhar para o pai] `ana:m2_depois_acordo`: Eu não quero falar agora, pai.

#### Cena 6c — Miriam depois da decisão (miriam)

- [M2-087] MIRIAM `miriam:m2_sexta`: Sexta, então. Eu vou ler a lista inteira. Inteira. E quem assinou cada linha.
- [M2-088] MIRIAM [evitando o olhar de Matias] `miriam:m2_lista`: A lista de sexta já chegou pra mim. O nome da Ana subiu. Eu não perguntei por quê, e você não vai me dizer.


## 4. M3 — A Vigília (noite, furtividade, ~12 min)

### Sinopse
Fim de tarde. O rádio da oficina recebe um recado que não espera resposta: a voz jovem de Elias Nobre. "Quem distribuiu o lote em silêncio manda lembranças" (ou "quem leu o seu registro na Central"). Encontro na quadra da escola, depois do toque, sozinho e agachado — os Custódios dobraram a ronda. "Eu tenho uma coisa com o seu nome. De antes da Ruptura."

O toque de recolher foi antecipado a pedido do depósito (Miriam viu o pedido; isso não é normal). Matias atravessa dois quarteirões no escuro, entre lanternas e cones de visão de Custódios que não são inimigos: detectado, recebe uma ordem ("Casa. Agora."); insistir vira perseguição; atirar tem preço em M4. Na quadra, sob a arquibancada, Elias: ele carrega, não guarda. Entrega uma cópia da **última folha** de um documento de 2056. Matias reconhece a própria assinatura e a data. As outras linhas estão tarjadas — por ordem de quem guarda. Nada do conteúdo é mostrado. A folha veio do acervo de uma auditora, Íris Serra. "Então o senhor sabe por que ela sumiu." "Não. Ninguém sabe."

Lanternas no portão: os Custódios nunca entram na quadra; hoje entraram — porque na doca do telhado da escola há uma **Rastro AV-4** da Custódia em manutenção. Elias sai pelos fundos; Matias sobe. Voo baixo sobre os telhados até a oficina, lanternas no chão, a cidade apagando embaixo (sem teto: o jogador pode subir). Na oficina, Ana acordou com o barulho — a rua inteira acordou. Dois Custódios passaram; Miriam também, antes do toque. Ana pergunta o que deram a ele. Matias conta (Ana: "Então descobre") ou esconde (Ana: "Eu tenho quinze anos, pai. Não cinco"). E decide o destino do documento: **mostrar à Miriam** amanhã ou **guardar**.

### O documento de 2056 (o que a câmera mostra no "examinar")
Uma folha copiada, dobrada em quatro: cabeçalho técnico do Complexo Central (parcialmente legível: "…cadeia de revisão…", numeração "fl. 14/14"), um bloco de assinaturas em que **só a de Matias e a data estão legíveis**; as demais linhas estão cobertas por tarja preta feita à mão (Elias tarjou, por ordem). Ano: **2056** (canônico). Dia e mês: **a definir pelo criador** — os diálogos dizem apenas "cinquenta e seis" e "antes da Ruptura". Nenhum parágrafo do conteúdo aparece, nem borrado-legível. A pista do diário (`pista.assinatura_2056`) registra apenas o que Matias sabe: que assinou e que não sabe o que isso fez.

### A Rastro no telhado (coerência com `VEICULOS_E_JANUS.md`)
A aeromoto é da Custódia, estacionada em **manutenção** na doca do telhado da escola (etiqueta: rotor B, vibração, aguardando peça do Vale dos Sinos; bateria pela metade). É por isso que a escola é patrulhada. Matias não tem licença nem prática ("Eu nunca pilotei uma dessas"); o voo é curto, baixo e torto por desenho — e em M4 Miriam registra o "voo não autorizado" como manutenção. Nada disso faz de Matias um piloto: é um engenheiro que entende a máquina.

### Lugares
- **Oficina** (existe): rádio; Ana dormindo no quartinho.
- **Rua e dois quarteirões ao sul** (Mapas): postes apagados pelo toque, lanternas dos Custódios, beco com entulho para rastejar.
- **Quadra escolar** (nova): arquibancada baixa, alpendre com bancada (o documento), portão com lanterna, escada de serviço nos fundos.
- **Telhado da escola** (novo): doca de manutenção com a Rastro AV-4, caixa de ferramentas, lona.
- **Telhados do Setor 17** (Mapas): rota de voo até a oficina.

### Personagens
Elias Nobre, Ana, Custódios em patrulha (2–3, cones de visão e lanterna), Miriam / Raquel / Comerciante no fim de tarde antes do toque (falas curtas de encerramento do dia).

### Beats e gameplay

| # | Beat | Jogabilidade | Gatilhos (Gameplay) |
| --- | --- | --- | --- |
| 1 | Anoitecer | diálogo de rádio (`radio_elias`, tocado como o `radio_final` de M1) inicia a missão; NPCs encerram o dia com falas de aviso | `dialogo radio_elias:m3_m5` → `cap1.m3.recado_ouvido`, inicia `a_vigilia`, objetivo `recado` |
| 2 | Toque de recolher | fase de **furtividade**: ruído por estado (correr = ouvido a 15 m; agachado = 4 m), cone de visão + lanterna; calmo → suspeito → alerta → perseguição; detectado uma vez = fala `custodio:m3_aviso` + flag `detectado`; atirar = flag `custodios_hostis` | `detectado` → `cap1.m3.detectado = true`; tiro em Custódio → `cap1.m3.custodios_hostis = true`; `zona quadra` → objetivos `toque` e `quadra` |
| 3 | Quadra: Elias | diálogo em duas partes: antes de examinar (entrega a folha, vigia o portão) e depois (reconhecimento, Íris Serra, lanternas, Rastro) | `dialogo elias:m3_e5` → objetivo `elias`; `examinar documento_2056` → `pista.assinatura_2056` + objetivo `documento`; `dialogo elias:m3_e18` → `cap1.m3.elias_partiu`, Elias sai pelos fundos, patrulha entra na quadra |
| 4 | Telhado e voo | subir pela escada de serviço; examinar a etiqueta; decolar; voo baixo até a oficina (pouso na rua da oficina) | `zona telhado_escola` → objetivo `telhado`; `examinar rastro_etiqueta` → `pista.rastro_na_escola`; `veiculo rastro_av4 dentro` + `zona oficina` → objetivo `voo` |
| 5 | Oficina: Ana | diálogo com duas escolhas (contar ou não; Miriam ou guardar) | `dialogo ana:m3_a5` → `pista.toque_pedido_pelo_deposito`; `dialogo ana:m3_inicio` → objetivo `ana`; `cap1.m3.documento` (`miriam` \| `guardou`) + objetivo `decisao` |

### Regras de direção da noite
- Custódios são gente fazendo turno, não inimigos: a primeira detecção é uma ordem seca, sem insulto. A perseguição só acontece se Matias insiste.
- Nenhum tiroteio obrigatório; atirar é possível e caro (M4: patrulha hostil, preço da banca ×1,25, o Custódio da praça manda Matias sumir "hoje, não amanhã").
- A Rastro é barulhenta: o pouso acorda a rua. Isso é narrativa, não falha do jogador.

### Decisão e consequências imediatas
- **Miriam**: Ana vai junto de manhã. Em M4 Miriam lê a folha, reconhece o cabeçalho (já viu documentos técnicos do Complexo no arquivo da Central, nenhum com a última folha), não denuncia e não guarda; cita o quarto dogma sem ironia. Ana soma um ponto de confiança.
- **Guardar**: "Ninguém. Nem eu." / "Por enquanto." Em M4 Miriam fala do voo registrado como manutenção e do pedido de toque assinado por Brandão; Matias diz "eu sei"; ela: "então sabe mais do que me conta. Tudo bem. Eu também."

### Falas
<!-- FALAS M3 -->


#### Cena 1 — Oficina, anoitecer: o recado (radio_elias)

- [M3-001] ELIAS NOBRE [pelo rádio, com estática; voz jovem e firme] `radio_elias:m3_e1`: Oficina do engenheiro. Está ouvindo? Não responde. Só escuta.
- [M3-002] ELIAS NOBRE [se M1 = silencio] `radio_elias:m3_e2`: Quem distribuiu o lote em silêncio manda lembranças.
- [M3-003] ELIAS NOBRE `radio_elias:m3_e2b`: Quem leu o seu registro na Central manda lembranças.
- [M3-004] ELIAS NOBRE `radio_elias:m3_e3`: Quadra da escola. Depois do toque. Sozinho e agachado: os Custódios dobraram a ronda hoje.
- [M3-005] ELIAS NOBRE [pausa antes de 'De antes da Ruptura'] `radio_elias:m3_e4`: Eu tenho uma coisa com o seu nome. De antes da Ruptura.
- [M3-006] MATIAS [para si, depois do clique do rádio] `radio_elias:m3_m5`: De antes da Ruptura.  
  → _cap1.m3.recado_ouvido = true; inicia a_vigilia; objetivo a_vigilia/recado_

#### Cena 1b — Fim de tarde na rua, antes do toque (raquel, comerciante, miriam, custodio, ana)

- [M3-007] RAQUEL `raquel:m3_noite`: Vai pra casa antes do toque, Matias. Eu tranco o posto por dentro.

#### Cena 1c — Comerciante fechando (comerciante)

- [M3-008] COMERCIANTE `comerciante:m3_fechando`: Fechando a banca. Toque hoje é mais cedo. Vai pra casa, Matias.

#### Cena 1d — Miriam avisa (miriam)

- [M3-009] MIRIAM `miriam:m3_tarde`: O toque de hoje foi pedido pelo depósito. Eu vi o pedido. Isso não é normal, Matias. Tranca a porta.

#### Cena 1e — Custódio no fim de tarde e durante o toque (custodio)

- [M3-010] CUSTÓDIO `custodio:m3_tarde`: Toque de recolher mais cedo hoje. Ordem de cima. Tranca a porta e apaga a luz, senhor Matias.
- [M3-011] CUSTÓDIO [alto, ordem de patrulha; sem raiva] `custodio:m3_aviso`: Toque de recolher, senhor Matias. Casa. Agora. Eu não vou pedir duas vezes.

#### Cena 1f — Ana antes do toque (ana)

- [M3-012] ANA `ana:m3_antes`: Eu vou dormir. Se o senhor sair depois do toque, eu não vi nada.

#### Cena 3 — Quadra escolar: Elias Nobre (elias)

- [M3-013] ELIAS NOBRE [jovem, rápido, sussurrando] `elias:m3_inicio`: Agachado mesmo. Bom. Senta. A arquibancada tapa a lanterna do portão.
- [M3-014] MATIAS `elias:m3_m1`: Você é dos Silenciosos.
- [M3-015] ELIAS NOBRE `elias:m3_e2`: Eu sou o que carrega. Quem guarda é outro. Elias.
- [M3-016] MATIAS `elias:m3_m3`: Matias. Você disse que tem algo com o meu nome.
- [M3-017] ELIAS NOBRE `elias:m3_e4`: Uma folha. Só a última. Copiada de um documento de cinquenta e seis.
- [M3-018] ELIAS NOBRE [um pouco envergonhado da tarja] `elias:m3_e5`: Eu não li o resto. Não me deixam. O que está tarjado fui eu que tarjei, por ordem.  
  → _cap1.m3.elias_encontrado = true; objetivo a_vigilia/elias_
- [M3-019] ELIAS NOBRE `elias:m3_e6`: Está na bancada. Olha com calma. Eu vigio o portão.
- [M3-020] ELIAS NOBRE `elias:m3_espera`: A bancada, engenheiro. Eu vigio.
- [M3-021] ELIAS NOBRE `elias:m3_depois`: E então? É a sua letra?
- [M3-022] MATIAS `elias:m3_m7`: É a minha assinatura. E a data é de cinquenta e seis.
- [M3-023] MATIAS [lento; é uma confissão] `elias:m3_m8`: Eu sei que assinei. Eu não sei o que isso fez.
  - [M3-024] MATIAS [escolha A → m3_e9a]: Onde está o resto do documento?
  - [M3-025] MATIAS [escolha B → m3_e9b]: Por que me mostrar isso agora?
- [M3-026] ELIAS NOBRE [neutro; ele é só o mensageiro] `elias:m3_e9a`: Com quem guarda. Estação Nove. Eles decidem quando mostrar, e pra quem. Eu só trouxe a pergunta.
- [M3-027] ELIAS NOBRE [se M1 = registro] `elias:m3_e9b`: Porque o senhor apareceu. Quinze anos sem nome e, numa semana, um lote registrado com a sua assinatura.
- [M3-028] ELIAS NOBRE `elias:m3_e9b2`: Porque o senhor apareceu. Quinze anos sem nome e a doutora distribui um lote pela nossa rede em seu nome.
- [M3-029] ELIAS NOBRE `elias:m3_e10`: A folha veio do acervo de uma auditora. Íris Serra. Antes de eu nascer, quase.
- [M3-030] MATIAS `elias:m3_m11`: Todo mundo no Complexo conhecia a Íris.
- [M3-031] ELIAS NOBRE `elias:m3_e12`: Então o senhor sabe por que ela sumiu.
- [M3-032] MATIAS [seco; não quer continuar o assunto] `elias:m3_m13`: Não. Ninguém sabe.
- [M3-033] ELIAS NOBRE `elias:m3_e14`: Lanterna no portão. Eles nunca entram na quadra. Hoje entraram.
- [M3-034] ELIAS NOBRE `elias:m3_e15`: Eu saio pelos fundos; eu sei o caminho, o senhor não. Telhado: tem uma Rastro dos Custódios na doca, em manutenção.
- [M3-035] ELIAS NOBRE `elias:m3_e16`: É por isso que rondam a escola. Voa baixo.
- [M3-036] MATIAS `elias:m3_m17`: Eu nunca pilotei uma dessas.
- [M3-037] ELIAS NOBRE [provocação leve, sem crueldade; já saindo] `elias:m3_e18`: O senhor ajudou a construir coisa pior. Estação Nove, engenheiro. Quando puder.  
  → _cap1.m3.elias_partiu = true_
- [M3-038] ELIAS NOBRE `elias:m3_partiu`: Vai, engenheiro. Pelo telhado.

#### Cena 5 — Oficina, madrugada: Ana e a decisão do documento (ana)

- [M3-039] ANA [sussurro alto, assustada e furiosa] `ana:m3_inicio`: Pai?! A rua inteira ouviu isso. Eu ouvi isso.  
  → _objetivo a_vigilia/ana_
- [M3-040] MATIAS `ana:m3_m1`: Fala baixo.
- [M3-041] ANA [meio riso nervoso] `ana:m3_a2`: Eu falo baixo. O senhor pousou uma Rastro dos Custódios na nossa porta.
- [M3-042] ANA `ana:m3_a3`: Dois Custódios passaram aqui. E a Miriam, antes do toque. Ela te procurou.
- [M3-043] MATIAS `ana:m3_m4`: A Miriam? O que ela queria?
- [M3-044] ANA `ana:m3_a5`: Disse que o toque de hoje foi pedido por alguém do depósito. Que isso não é normal. Volta de manhã, antes da fila.
- [M3-045] ANA `ana:m3_a6`: O que te deram lá?
  - [M3-046] MATIAS [escolha A → m3_a7a]: Uma folha. Com a minha assinatura. De antes de você nascer.
  - [M3-047] MATIAS [escolha B → m3_a7b]: Nada que você precise carregar.
- [M3-048] ANA [quase para si] `ana:m3_a7a`: De antes da Ruptura.
- [M3-049] ANA `ana:m3_a7a2`: O senhor assinou o quê?
- [M3-050] MATIAS `ana:m3_m8a`: Eu não sei o que aquilo fez, Ana. Eu sei que assinei.
- [M3-051] ANA [simples, decidida] `ana:m3_a9a`: Então descobre.  
  → _cap1.m3.ana_sabe = true_
- [M3-052] ANA [magoada, seca] `ana:m3_a7b`: Eu tenho quinze anos, pai. Não cinco.  
  → _cap1.m3.ana_sabe = false_
- [M3-053] ANA `ana:m3_a10`: A Miriam lê o papel inteiro. Se alguém vai saber o que é isso, é ela.
  - [M3-054] MATIAS [escolha A → m3_a11a]: Amanhã eu mostro à Miriam.  
    → _cap1.m3.documento = miriam_
  - [M3-055] MATIAS [escolha B → m3_a11b]: Isso fica comigo. Ninguém vê.  
    → _cap1.m3.documento = guardou_
- [M3-056] ANA [se Ana soube da folha = true] `ana:m3_a11a`: Tá. Eu vou junto.  
  → _objetivo a_vigilia/decisao_
- [M3-057] ANA `ana:m3_a11a2`: Pra Miriam pode. Pra mim, não. ...Eu vou junto mesmo assim.  
  → _objetivo a_vigilia/decisao_
- [M3-058] ANA `ana:m3_a11b`: Ninguém. Nem eu.
- [M3-059] MATIAS `ana:m3_m12b`: Por enquanto.
- [M3-060] ANA [imitando o tom do pai] `ana:m3_a13b`: 'Por enquanto' é a palavra preferida do senhor.  
  → _objetivo a_vigilia/decisao_


## 5. M4 — Partida (consequências, ~8 min)

### Sinopse
Amanhece pela terceira vez. Ao sair da oficina, Matias vê o bairro que as escolhas dele produziram: a fila da água maior ou menor, o posto com mais ou menos caixas, a banca com preço dobrado ou uma caixa doada "pra doutora", Custódios cordiais, tensos ou hostis, Brandão algemado no portão, solto no depósito ou simplesmente ausente. Miriam espera diante da oficina, antes da fila: lê o documento ou fala do voo que registrou como manutenção; nos dois casos, assume a leitura da lista de sexta "com ou sem vocês na praça".

No posto, Raquel resume o estoque e manda Matias não decidir por Ana. Na praça, a conversa final: Ana constata que não foi perguntada; Matias argumenta (pede, manda ou sugere que ela fique); Ana recapitula o que viu nos dois dias — cada gesto de confiança do pai conta — e **decide por ela mesma**: vai ("não porque o senhor pediu; porque eu quero ver o que o senhor assinou") ou fica ("não é castigo, pai; é escolha, minha"). A Módulo V-7 cruza o limite do setor rumo à Estação Nove; letreiro do capítulo.

### Lugares
Rua da oficina (Miriam), banca, portão da Central (Custódio; Brandão algemado junto ao Javali quando preso), depósito (Brandão solto), posto (Raquel), praça (Ana), van diante da oficina; **limite do setor** (nova zona para a cutscene).

### Beats e gameplay

| # | Beat | Jogabilidade | Gatilhos (Gameplay) |
| --- | --- | --- | --- |
| 0 | Carregar a missão | aplicar `CONSEQUENCES` de `partida`: água, estoque, preço, patrulha, presenças, nós iniciais, avisos na HUD (ordem da tabela) | `startQuest partida` automático após `cap1.m3.documento`; `zona rua_amanhecer` → objetivo `amanhecer` |
| 1 | Miriam | diálogo por `cap1.m3.documento`; fecha com a água da cota e a promessa da lista | `dialogo miriam:m4_fim` → objetivo `miriam` |
| 2 | Banca | preço refletido na loja (×1,5 denúncia; ×1,25 hostis; ×1 acordo); falas por decisão | — (objetivo opcional; não bloqueia) |
| 3 | Portão | Custódio: hostil / preso / transferido / lista / detectado / cordial (prioridade nessa ordem; a linha do "detectado" é acrescentada aos outros casos) | `dialogo custodio:m4_fim` ou `m4_hc3` → objetivo `custodio` |
| 3b | Brandão | só presente por regra (`brandao_preso` → portão, algemado; `brandao_solto` → porta do depósito); ausente no acordo | — (opcional) |
| 4 | Posto | Raquel: estoque por `entrega_no_prazo`; caixas devolvidas por Brandão (preso) ou caixa anônima (acordo) | `dialogo raquel:m4_r5` → `cap1.m4.raquel_conversou`, objetivo `raquel`; `examinar lista_apuracao` (só no acordo) → `pista.lista_prioridade_dois` |
| 5 | Ana | diálogo final (exige ter falado com Raquel); resultado em `cap1.m4.ana` | `dialogo ana:m4_vai3` / `ana:m4_fica3` → objetivo `ana` |
| 6 | Partida | entrar na Módulo V-7 (Ana no banco do passageiro se `vai`; Raquel e Ana na porta do posto se `fica`); cutscene in-engine: a van cruza o limite do setor; letreiro "Capítulo 2 — Estação Nove" | `veiculo modulo_v7 dentro` + `zona limite_setor` → objetivo `partida`, missão concluída |

### Como Ana decide (dados, não sistema novo)
O diálogo soma pontos em `cap1.m4.ana_pontos` conforme as falas aparecem:

| Fonte | +1 se | 0 (ou −1) se |
| --- | --- | --- |
| Argumento de Matias (escolha) | "Estou perguntando agora. Eu preciso de você comigo." | "Você vai. Não é pergunta." (−1) · "fica mais segura com a Raquel" (0) |
| M1 | lote registrado com nome | lote silenciado ("como se fosse contrabando") |
| M2 | denúncia ("não vendeu o meu nome") | acordo ("comprou o meu lugar na lista") |
| M3, cena da oficina | Matias contou da folha | escondeu ("não preciso carregar") |
| M3, documento | mostrou a Miriam | guardou no bolso |
| Prólogo | `matiasTrustsSystem = true` ("disse pra confiar na Apuração") | `false` ("nunca confiou em nada que não fosse o senhor mesmo") |

**3 pontos ou mais → Ana vai**; menos → fica. Máximo 6, mínimo −1. Ela diz as lembranças em voz alta: o jogador ouve a conta sendo feita. Depois da decisão, Raquel e Ana têm falas de fechamento (`m4_depois`).

### Cutscene de partida (briefing para Animação & Cutscenes)
Plano fixo da rua ao amanhecer; a Módulo V-7 sai de diante da oficina. Se Ana vai: ela no banco do passageiro, mochila no colo, olhando a praça. Se fica: ela e Raquel na porta do posto; Ana levanta a mão sem acenar. A van passa pelo portão (Brandão algemado junto ao Javali, se preso) e pelo viaduto; a câmera sobe até o limite do setor; letreiro. Sem narração; rádio do Setor ao fundo com o boletim da água (consequência de M1 audível).

### Falas
<!-- FALAS M4 -->


#### Cena 1 — Diante da oficina: Miriam (miriam)

- [M4-001] MIRIAM `miriam:m4_doc`: Matias. Antes da fila, como eu disse.
- [M4-002] MATIAS `miriam:m4_dm1`: Você disse que lê o papel inteiro. Lê este.
- [M4-003] MIRIAM [lendo em voz baixa; pausa antes de 'assinatura'] `miriam:m4_dmi2`: Cinquenta e seis. Cadeia de revisão. E a sua assinatura.
- [M4-004] MIRIAM `miriam:m4_dmi3`: As outras linhas estão tarjadas. Por quem?
- [M4-005] MATIAS `miriam:m4_dm4`: Por quem guardou.
- [M4-006] MIRIAM [escolhendo as palavras] `miriam:m4_dmi5`: Eu já vi esse cabeçalho. Documentos técnicos do Complexo, no arquivo da Central. Nenhum com a última folha.
- [M4-007] MIRIAM `miriam:m4_dmi6`: Eu não vou denunciar você. E não vou guardar isto por você. Leva. Quando achar o resto, me procura.
  - [M4-008] MATIAS [escolha A → m4_dmi7a]: Você acredita que a Mãe salvou vocês. E ainda assim quer ver o resto.
  - [M4-009] MATIAS [escolha B → m4_dmi7b]: Se o conselho souber que você viu isto...
- [M4-010] MIRIAM [fé serena; cita o quarto dogma sem ironia] `miriam:m4_dmi7a`: Acredito. E é por isso. 'A dúvida deve servir à verdade.' Está no dogma; a gente é que esquece.
- [M4-011] MIRIAM `miriam:m4_dmi7b`: O conselho sabe o que eu registro. Isto eu não registrei.
- [M4-012] MIRIAM `miriam:m4_semdoc`: Matias. Os Custódios registraram um voo não autorizado sobre a rua ontem. Eu registrei 'manutenção'.
- [M4-013] MATIAS `miriam:m4_sm1`: Por quê?
- [M4-014] MIRIAM [sincera] `miriam:m4_smi2`: Porque eu não sei o que foi. E o que eu não sei, eu não condeno.
- [M4-015] MIRIAM `miriam:m4_smi3`: O toque de ontem foi pedido pelo depósito. Eu vi o pedido: assinado por Brandão.
- [M4-016] MATIAS `miriam:m4_sm4`: Eu sei.
- [M4-017] MIRIAM `miriam:m4_smi5`: Então sabe mais do que me conta. Tudo bem. Eu também.
- [M4-018] MIRIAM [se M2 = denuncia] `miriam:m4_sexta`: Sexta eu leio a lista inteira, com ou sem vocês na praça. O nome dele incluído.
- [M4-019] MIRIAM `miriam:m4_fim`: Vão pra Estação Nove; a Raquel me contou. Levem água da cota do posto. Eu assino.  
  → _cap1.m4.miriam_conversou = true; objetivo partida/miriam_
- [M4-020] MIRIAM `miriam:m4_repete`: Vai, Matias. A fila não espera, e eu também não devia.

#### Cena 2 — Banca: o preço da decisão (comerciante)

- [M4-021] COMERCIANTE `comerciante:m4_hostis`: Baixa a cabeça. Os Custódios procuram quem atirou neles ontem. E olham pra sua oficina.
- [M4-022] COMERCIANTE [se M2 = denuncia] `comerciante:m4_hostis2`: E o meu fornecedor da tarde não vem mais. Munição e kit custam o dobro hoje.
- [M4-023] COMERCIANTE `comerciante:m4_denuncia`: Matias. Meu fornecedor da tarde não vem mais. Munição e kit custam o dobro hoje.
- [M4-024] MATIAS `comerciante:m4_dm1`: Você ganhava com ele.
- [M4-025] COMERCIANTE [irritado, sem gritar] `comerciante:m4_dc2`: Eu ganhava. E a fila dos sem-lista ganhava. Agora ninguém ganha. Me diz que isso é justiça.
  - [M4-026] MATIAS [escolha A → m4_dc3a]: É justiça.  
    → _matiasDefendeSistema +1_
  - [M4-027] MATIAS [escolha B → m4_dc3b]: Não é. Mas é o começo.  
    → _matiasContestaSistema +1_
- [M4-028] COMERCIANTE [resignado] `comerciante:m4_dc3a`: Então justiça é cara.
- [M4-029] COMERCIANTE `comerciante:m4_dc3b`: Começo é o que a gente mais tem por aqui.
- [M4-030] COMERCIANTE `comerciante:m4_acordo`: Matias. O Samuel passou cedo. Deixou uma caixa 'pra doutora', de graça. Ele nunca dá nada.
- [M4-031] MATIAS `comerciante:m4_am1`: Hoje deu.
- [M4-032] COMERCIANTE `comerciante:m4_ac2`: Hoje alguém pagou por ele. Eu não pergunto quem.
- [M4-033] COMERCIANTE `comerciante:m4_fim`: Leva farinha pra estrada. Dessa vez eu anoto.  
  → _cap1.m4.comerciante_conversou = true_
- [M4-034] COMERCIANTE `comerciante:m4_repete`: Estrada boa, Matias.

#### Cena 3 — Portão da Central: o Custódio (custodio)

- [M4-035] CUSTÓDIO [frio; mão perto do coldre] `custodio:m4_hostil`: Parado aí, senhor Matias. Alguém atirou em dois dos meus ontem à noite.
- [M4-036] MATIAS `custodio:m4_hm1`: Eles estão vivos?
- [M4-037] CUSTÓDIO `custodio:m4_hc2`: Estão. Por pouco. Eu disse ao conselho que não sei quem foi. Eu sei.
- [M4-038] CUSTÓDIO [contido; é um favor, não uma ameaça] `custodio:m4_hc3`: Some da minha praça hoje. E não volte por um tempo.  
  → _cap1.m4.custodio_conversou = true; objetivo partida/custodio_
- [M4-039] CUSTÓDIO `custodio:m4_hostil_repete`: Eu disse hoje, senhor Matias. Não amanhã.
- [M4-040] CUSTÓDIO `custodio:m4_preso`: O Brandão está no portão, algemado. O conselho veio buscar de Javali. O seu registro valeu alguma coisa.
- [M4-041] MATIAS `custodio:m4_pm1`: E a metade que faltava?
- [M4-042] CUSTÓDIO `custodio:m4_pc2`: Duas caixas no quartinho da casa dele. Vão pro posto hoje. A terceira já virou Selo.
- [M4-043] CUSTÓDIO [amargo, sem levantar a voz] `custodio:m4_transferido`: O senhor disse o nome dele pra meia praça. Eu disse ao conselho que o lote sumiu inteiro. Um de nós mentiu.
- [M4-044] MATIAS `custodio:m4_tm1`: Eu não menti.
- [M4-045] CUSTÓDIO `custodio:m4_tc2`: Eu sei. Por isso saio do Setor 17 no fim do mês. Transferido. E o Brandão continua no depósito.
- [M4-046] CUSTÓDIO [seco, irônico] `custodio:m4_lista`: A lista nova saiu cedo. Sua filha em prioridade dois. Parabéns.
- [M4-047] MATIAS `custodio:m4_lm1`: Você não acredita em parabéns.
- [M4-048] CUSTÓDIO `custodio:m4_lc2`: Acredito em lista. Só não sei quem escreveu essa.
- [M4-049] CUSTÓDIO [se detectado = true] `custodio:m4_detectado_extra`: E alguém andou pela rua depois do toque. Agachado, mas andou. Eu não vi o rosto. Prefiro assim.
- [M4-050] CUSTÓDIO `custodio:m4_detectado`: Alguém andou pela rua depois do toque ontem, senhor Matias. Agachado, mas andou.
- [M4-051] MATIAS `custodio:m4_dm1`: Alguém.
- [M4-052] CUSTÓDIO `custodio:m4_dc2`: Alguém. Eu não vi o rosto. Prefiro assim.
- [M4-053] CUSTÓDIO `custodio:m4_cordial`: Bom dia, senhor Matias. A Raquel disse que vocês saem hoje.
- [M4-054] CUSTÓDIO [cordial, sincero] `custodio:m4_fim`: Estrada até a Nove está calma até o viaduto. Depois, não garanto. Boa viagem.  
  → _cap1.m4.custodio_conversou = true; objetivo partida/custodio_
- [M4-055] CUSTÓDIO `custodio:m4_repete`: Boa viagem, senhor Matias.

#### Cena 3b — Brandão: preso no portão ou solto no depósito (brandao)

- [M4-056] SAMUEL BRANDÃO `brandao:m4_preso`: Senhor Matias. Veio ver?
- [M4-057] MATIAS `brandao:m4_pm1`: Vim ver as caixas voltarem.
- [M4-058] SAMUEL BRANDÃO [algemado; sem arrependimento fácil, sem bravata] `brandao:m4_pb2`: Duas. A terceira alimentou gente que não existe. Lembre disso quando a lista de sexta sair.  
  → _cap1.m4.brandao_conversou = true_
- [M4-059] SAMUEL BRANDÃO [calmo, convencido do que diz] `brandao:m4_solto`: O senhor fez barulho e eu continuo aqui. Sabe por quê? Porque a lista precisa de alguém que a cumpra.
- [M4-060] MATIAS `brandao:m4_sm1`: A lista precisa de alguém que a abra.
- [M4-061] SAMUEL BRANDÃO `brandao:m4_sb2`: Então vá abrir. Em Nova Aurora. Aqui ela fecha ao meio-dia.  
  → _cap1.m4.brandao_conversou = true_
- [M4-062] SAMUEL BRANDÃO `brandao:m4_repete`: Já dissemos tudo, engenheiro.

#### Cena 4 — Posto: Raquel (raquel)

- [M4-063] RAQUEL [se entrega no prazo = true] `raquel:m4_inicio`: Soro pra dez dias. Antibiótico pra seis; oito, se ninguém piorar.
- [M4-064] RAQUEL `raquel:m4_inicio_tarde`: A fila dobrou a esquina. Eu atendo metade. A outra metade volta amanhã, se der.
- [M4-065] RAQUEL [se Brandão preso definida] `raquel:m4_r2`: Duas caixas do Brandão voltaram hoje cedo. Sem bilhete. Com Custódio.
- [M4-066] RAQUEL [se M2 = silencio] `raquel:m4_r2b`: Chegou uma caixa 'pra doutora'. Sem remetente. Eu sei de quem é. Eu usei.
- [M4-067] RAQUEL [firme] `raquel:m4_r3`: Ela está lá fora, esperando você. Não decide por ela, Matias.
- [M4-068] MATIAS `raquel:m4_m4`: Ela tem quinze anos.
- [M4-069] RAQUEL `raquel:m4_r5`: E conhece essa fila melhor que você. Vai falar com ela.  
  → _cap1.m4.raquel_conversou = true; objetivo partida/raquel_
- [M4-070] RAQUEL `raquel:m4_repete`: Vai falar com a Ana. Ela está esperando.
- [M4-071] RAQUEL [se Ana = vai · prática, já separando as doses] `raquel:m4_depois`: Separei as doses dela pra duas semanas. Depois disso, Nova Aurora ou nada.
- [M4-072] RAQUEL `raquel:m4_depois_fica`: Ela fica comigo. Eu cuido. Você volta.

#### Cena 5 — Praça: a decisão de Ana (ana)

- [M4-073] ANA `ana:m4_antes`: Fala com a Raquel primeiro. Ela guardou um sermão pro senhor.
- [M4-074] ANA `ana:m4_inicio`: A Raquel disse que o senhor vai pra Estação Nove.
- [M4-075] MATIAS `ana:m4_m1`: Hoje. Na Módulo.
- [M4-076] ANA [calma; é uma constatação] `ana:m4_a2`: O senhor não me perguntou.
  - [M4-077] MATIAS [escolha A → m4_a3a]: Estou perguntando agora. Eu preciso de você comigo.  
    → _cap1.m4.ana_pontos +1_
  - [M4-078] MATIAS [escolha B → m4_a3b]: Você vai. Não é pergunta.  
    → _cap1.m4.ana_pontos -1_
  - [M4-079] MATIAS [escolha C → m4_a3c]: Acho que você fica mais segura com a Raquel.
- [M4-080] ANA `ana:m4_a3a`: Precisa. Isso é novo.
- [M4-081] ANA [fria] `ana:m4_a3b`: Não é pergunta. Então não precisa de resposta.
- [M4-082] ANA `ana:m4_a3c`: O senhor acha. Eu decido.
- [M4-083] ANA [se M1 = registro] `ana:m4_lembra_m1`: O senhor assinou o lote na frente da Raquel. Com nome. Eu vi.  
  → _cap1.m4.ana_pontos +1_
- [M4-084] ANA [sem acusação; só lembrando] `ana:m4_lembra_m1b`: O senhor sumiu com o lote como se fosse contrabando. Mesmo sendo pra mim.
- [M4-085] ANA [se M2 = denuncia] `ana:m4_lembra_m2`: E não vendeu o meu nome pro Brandão.  
  → _cap1.m4.ana_pontos +1_
- [M4-086] ANA [baixo] `ana:m4_lembra_m2b`: E comprou o meu lugar na lista. Eu sei que foi por mim. Eu não pedi.
- [M4-087] ANA [se Ana soube da folha = true] `ana:m4_lembra_m3`: E me contou da folha. Podia não ter contado.  
  → _cap1.m4.ana_pontos +1_
- [M4-088] ANA `ana:m4_lembra_m3b`: E voltou de madrugada com um segredo que eu 'não preciso carregar'.
- [M4-089] ANA [se documento = miriam] `ana:m4_lembra_doc`: E mostrou pra Miriam. Confiou em alguém, pra variar.  
  → _cap1.m4.ana_pontos +1_
- [M4-090] ANA `ana:m4_lembra_docb`: E guardou o papel no bolso, como guarda tudo.
- [M4-091] ANA [se confia no sistema = true] `ana:m4_lembra_confia`: No posto, o senhor disse pra confiar na Apuração. Eu guardei isso.  
  → _cap1.m4.ana_pontos +1_
- [M4-092] ANA `ana:m4_lembra_confiab`: O senhor nunca confiou em nada que não fosse o senhor mesmo.
- [M4-093] MATIAS `ana:m4_pergunta`: O que você quer, Ana?
- [M4-094] ANA [se pontos de Ana = 3 ou pontos de Ana = 4 ou pontos de Ana = 5 ou pontos de Ana = 6 · pausa longa antes; decidida] `ana:m4_decide`: Eu vou.
- [M4-095] ANA `ana:m4_vai2`: Não porque o senhor pediu. Porque eu quero ver o que o senhor assinou.
- [M4-096] ANA [meio sorriso] `ana:m4_vai3`: E porque alguém precisa lembrar o senhor de comer.  
  → _cap1.m4.ana = vai; objetivo partida/ana_
- [M4-097] ANA [pausa longa antes; firme] `ana:m4_fica`: Eu fico.
- [M4-098] ANA `ana:m4_fica2`: A Raquel precisa de alguém que leia a lista inteira. E o senhor precisa de um motivo pra voltar.
- [M4-099] MATIAS [interrompido] `ana:m4_m_fica`: Ana—
- [M4-100] ANA [carinhosa, sem chorar] `ana:m4_fica3`: Não é castigo, pai. É escolha. Minha.  
  → _cap1.m4.ana = fica; objetivo partida/ana_
- [M4-101] ANA [se Ana = vai] `ana:m4_depois`: Já guardei minhas coisas. E as suas. Vamos.
- [M4-102] ANA `ana:m4_depois_fica`: Vai logo, pai. E volta.

## 6. Pistas do diário (`src/data/clues.ts`)

Convenção: ao adicionar uma pista ao diário, o Gameplay define a flag `pista.<slug> = true` (o prólogo já faz isso com `pista.carregamento`). Diálogos leem duas delas: `pista.caderno_de_saida` (gate do comerciante) e `pista.assinatura_2056` (segunda parte de Elias).

| Id | Título | Fonte / gatilho | Missão |
| --- | --- | --- | --- |
| `pista.carregamento` | Um lote fora das cotas | diálogo de Miriam no prólogo (retroativa, já existe como flag) | O Carregamento |
| `pista.manifesto_rasurado` | Manifesto rasurado (6 → 3; rubrica **S.B.**) | `examinar manifesto_van` | M2 |
| `pista.selo_nao_bate` | Selo do depósito, não do conselho | `examinar manifesto_van` | M2 |
| `pista.lacres_refeitos` | Lacres cortados e refeitos | `examinar lacres_van` | M2 |
| `pista.caixas_vazias` | Três caixas vazias | `examinar caixas_vazias` (depósito) | M2 |
| `pista.caderno_de_saida` | Caderno de saída: **Brandão** | `examinar caderno_saida` (depósito) | M2 |
| `pista.testemunha_samuel` | O **Samuel** da banca | `dialogo comerciante:m2_nome` | M2 |
| `pista.assinatura_2056` | A minha assinatura, 2056 | `examinar documento_2056` (quadra) | M3 |
| `pista.toque_pedido_pelo_deposito` | Toque pedido pelo depósito | `dialogo ana:m3_a5` | M3 |
| `pista.rastro_na_escola` | Uma Rastro na doca da escola | `examinar rastro_etiqueta` (telhado) | M3 |
| `pista.lista_prioridade_dois` | Prioridade dois, sem pergunta | `examinar lista_apuracao` (posto; só no acordo) | M4 |

As três pistas que montam o nome: manifesto (S.B.) + caderno (Brandão) + testemunha (Samuel). A flag `cap1.m2.brandao_identificado` é gravada pela fala `comerciante:m2_nome`, que só é alcançável com o caderno no diário.

## 7. Tabela de consequências (`src/data/consequences.ts`, resumo)

Aplicada ao iniciar cada missão. Resolução: deltas de água e estoque somam (limites 0–100 e 0–6); fatores de preço multiplicam; patrulha = nível mais severo; `fala` = última regra da tabela vence (ordem é prioridade); avisos todos, em ordem.

| Decisão | Valor | M2 | M3 | M4 |
| --- | --- | --- | --- | --- |
| M1 `carregamento.decisao` | `registro` | patrulha cordial; Custódio `m2_registro`; água +5; aviso (fila com gente de outros setores) | — | água +5 |
| | `silencio` | patrulha tensa; Custódio `m2_silencio`; água −10; aviso (conselho cortou um dia de água) | — | água −5 |
| Prólogo `matiasTrustsSystem` | `true` / `false` | Ana `m2_manha` / `m2_manha_b` | — | (lido no diálogo final de Ana) |
| M2 `cap1.m2.decisao` | `denuncia` | — | patrulha tensa; Miriam `m3_tarde`; aviso (toque antecipado) | preço ×1,5; comerciante `m4_denuncia`; aviso |
| | `silencio` | — | patrulha cordial; Miriam `m3_tarde`; aviso (lista circula cedo) | preço ×1; estoque +1; Brandão ausente; comerciante `m4_acordo`; Custódio `m4_lista`; aviso (Ana em prioridade dois) |
| derivada `cap1.m2.brandao_preso` | `true` | — | — | Brandão presente, `m4_preso`; Custódio `m4_preso`; estoque +2; patrulha cordial; aviso |
| derivada `cap1.m2.brandao_solto` | `true` | — | — | Brandão presente, `m4_solto`; Custódio `m4_transferido`; patrulha tensa; aviso |
| M2 `cap1.m2.entrega_no_prazo` | `true` | — | — | estoque +1; Raquel `m4_inicio` |
| | `false` | — | aviso (Central recolheu; posto fechou cedo) | estoque −2; Raquel `m4_inicio_tarde`; aviso (fila dobrou a esquina) |
| M3 `cap1.m3.detectado` | `true` | — | — | patrulha tensa; Custódio `m4_detectado`; aviso |
| M3 `cap1.m3.custodios_hostis` | `true` | — | — | patrulha hostil; Custódio `m4_hostil`; comerciante `m4_hostis`; preço ×1,25; aviso |
| M3 `cap1.m3.documento` | `miriam` | — | — | Miriam presente diante da oficina, `m4_doc`; aviso |
| | `guardou` | — | — | Miriam presente, `m4_semdoc`; aviso |
| M4 `cap1.m4.ana` | `vai` / `fica` | — | — | consumida pela cutscene de partida e pelo Capítulo 2 (não entra na tabela) |

## 8. Gatilhos usados (ids sugeridos para `MissionTrigger`)

| Tipo | Ids |
| --- | --- |
| `zona` | `deposito`, `quadra`, `telhado_escola`, `oficina`, `rua_amanhecer`, `limite_setor` |
| `examinar` | `manifesto_van`, `lacres_van`, `caixas_vazias`, `caderno_saida`, `documento_2056`, `rastro_etiqueta`, `lista_apuracao` |
| `pista` | todos os ids da §6 |
| `timer` | `entrega_posto` (sugestão 180 s; calibrar com o mapa) |
| `detectado` | furtividade de M3 (grava `cap1.m3.detectado`) |
| `dialogo` | `raquel:m2_m7`, `comerciante:m2_nome`, `comerciante:m2_ac2`, `raquel:m2_entrega_fim`, `brandao:m2_r12`, `radio_elias:m3_m5`, `elias:m3_e5`, `elias:m3_e18`, `ana:m3_a5`, `ana:m3_inicio`, `miriam:m4_fim`, `custodio:m4_fim`/`m4_hc3`, `raquel:m4_r5`, `ana:m4_vai3`/`m4_fica3` |
| `veiculo` | `atlas_t3` (entrega), `rastro_av4` (voo), `modulo_v7` (partida) |

Objetivos concluídos **por diálogo** (efeito `questObjective`): M2 `testemunha`, `brandao`, `decisao`; M3 `recado`, `elias`, `ana`, `decisao`; M4 `miriam`, `custodio`, `raquel`, `ana`. Os demais são do Gameplay (zona/examinar/timer/veículo) — o teste `cap1Narrativa.test.ts` confere que nenhum objetivo fica sem dono.

## 9. Integração e pendências (para o coordenador)

1. **Variantes de personagem**: `brandao` e `elias` não existem em `CharacterVariant` (`src/data/characters.ts`) nem como GLB. `game.ts` usa `DIALOGUES[npc.variant]` e cai no perfil de voz de Matias para falantes desconhecidos — Arte 3D + Áudio.
2. **Flags de pista**: o Gameplay precisa gravar `pista.<slug> = true` ao adicionar a pista (`src/narrative/clues.ts`), senão o comerciante nunca testemunha e Elias não passa à segunda parte.
3. **Rádio de Elias**: `DIALOGUE_RADIO_ELIAS` deve tocar como `DIALOGUE_RADIO_FINAL` (sem NPC em cena), no anoitecer do dia 2.
4. **Início de M4**: `startQuest partida` é automático (não há diálogo que o faça); as consequências são aplicadas no carregamento da missão.
5. **Presenças**: Miriam em M4 fica diante da oficina (não no posto); Brandão só existe por regra; o posicionamento é de Mapas.
6. **Contrato**: `CAP1_FLAGS.matiasConfia` documenta `"sim" | "nao"`, mas o prólogo grava `true`/`false` (`DIALOGUE_RAQUEL`). Os dados e a tabela seguem o comportamento real (booleano); vale corrigir o comentário em `cap1Contracts.ts`.
7. **Cânone dos veículos**: `VEICULOS_E_JANUS.md` diz que Matias "não pilota aeromoto"; o GDD §4 M3 pede a fuga de Rastro. O roteiro concilia (unidade da Custódia em manutenção, voo curto e torto, registrado por Miriam como manutenção), mas o criador deve ratificar a exceção.
8. **Data do documento**: dia e mês de 2056 a definir pelo criador (os diálogos só dizem "cinquenta e seis").
9. **Comerciante**: a voz provisória não consta no GDD §6; sugerida acima.
10. **Fora do escopo deste agente**: furtividade, diário, reparo, timer, cutscenes e mapas — apenas referenciados aqui pelos gatilhos.
