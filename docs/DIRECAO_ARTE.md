# DIREÇÃO DE ARTE V1 — EVA (REFERÊNCIA DE ACABAMENTO: WARFRAME 1999)
Data: 2026-10-25. Estado: **proposta de direção artística**, ainda não é asset integrado. A referência ao jogo *Warframe: 1999* é de qualidade de produção, cidade densa, materiais, silhueta e leitura cinematográfica — **não copiar** modelos, armaduras, arquitetura identificável, personagens, facções, símbolos ou gameplay protegido de outra franquia.

## Objetivo
Eliminar aparência blocada/Minecraft no prólogo `A Apuração`, sem desrespeitar o universo canônico: São Paulo Velha é uma cidade parcialmente habitada **15 anos após colapso logístico e energético**, não um cenário devastado por guerra nuclear, alienígenas, biomassa, vírus ou robôs.

## Diagnóstico confirmado no repositório
- **Base técnica existe**: Babylon.js 9, Havok, seis humanos GLB com rig de 52 ossos, 8 animações Quaternius CC0 retargeteadas; vídeo de locomoção em `docs/videos/locomocao.mp4`.
- **Cenário em blocos** gerados por código em `src/world/*.ts` e texturas sintéticas em `src/world/textures.ts`.
- **Personagens humanos, porém provisórios**: cabelo em calota, roupas como cascas de corpo, acessórios primitivos, pele processual, expressões faciais limitadas.
- **Som**: efeitos de passo Kenney já reais; vozes continuam via Web Speech API.
- Ações do Fable já integraram animações; **não** recomeçar câmera, rigging e física.

## Regra das três camadas (decisão do criador, 29/10/2026)
São Paulo Velha não é 2026 decadente: é **2072**. Toda rua mostra três camadas de tempo, nesta ordem de leitura:
1. **Base antiga (até 2040)** — os prédios brasileiros existentes: massa de apartamentos, grades, platibandas, reboco.
2. **Camada tecnológica da Década dos Milagres (2043–2056)** — aparafusada por cima da base: peles fotovoltaicas, anexos modulares pré-fabricados, recicladores de água nos telhados, postes-sensor com câmeras mortas, letreiros de LED (alguns ainda acesos), totens de recarga reaproveitados como postes de feira, vans elétricas com baterias externas, triciclos elétricos. Em cada quarteirão, **um marco monumental visível de longe**: viaduto de maglev morto virando sombra de feira, torre de vidro com fazenda vertical meio ocupada, canopy solar, antena da Central.
3. **Remendos (2057–2072)** — fiação improvisada, lonas, varais, peças recuperadas, sujeira e vegetação nas frestas. Digno e habitado, nunca ruína genérica.

A **Igreja/Central** é sempre o contraste: branca, limpa, dourada/índigo e iluminada, no meio do remendado. Sem neon cyberpunk; o futurismo está nas camadas 2 e nos marcos, não em letreiros holográficos.

Referências obrigatórias (geradas pelo criador via Kairogen a partir do cânone): `docs/concept/sp_velha_praca_02_camada_tech.jpg` (dose A — fachadas), `docs/concept/sp_velha_praca_03_monumental.jpg` (dose B — marcos), `docs/concept/sp_velha_praca_01.jpg` (o que NÃO basta: só remendo, parece 2026).

## Céu sem teto
A aeromoto Rastro AV-4 sobe sem limite até o ar acabar (~100 km): a névoa da rua se dissipa, o céu escurece até o espaço, estrelas aparecem e a **curvatura da Terra** fica visível (camada distante em `src/world/planet.ts`, texturas de satélite geradas em `public/assets/textures/aereo/`). Capturas em `docs/screenshots/altitude/`.

## Conceito visual — duas linguagens contrastantes
### São Paulo Velha — civilização remendada
- Prédios urbanos brasileiros existentes reformados e remendados: massa de apartamentos, grades, portões, fiação aérea, postes, varandas, ladrilho, reboco com trincas, marquises, coberturas improvisadas, pintura desbotada, estabelecimentos reaproveitados.
- Ruas com **função**: mercado, oficina, fila de distribuição, água racionada, escola, luz em certas casas, torres de rádio, rotas de pedestres.
- Pessoas trabalhando/negociando, não somente humanos imóveis numa ruína vazia.
- Silhuetas quebradas por geometria de nível médio: platibandas, frisos, recuos, portas embutidas, janelas profundas, tubos, toldos em tecido, ar-condicionado, escadas, grades, caçambas; não simples prismas com textura.
- Materiais PBR variados com normal + roughness + AO onde viável: concreto pintado, metal oxidado, azulejo, piso de pedra, asfalto molhado/manchado, lona, madeira, vidro fosco.
- Paleta: areia, cinza quente, ferrugem, verde sujo; ouro institucional somente em sinais da Igreja. Chuva leve/poças opcionais; não exagerar neon cyberpunk.

### Igreja / Nova Aurora — ordem construída
- Tecnologia humana e engenharia civil de 2040–70, com projetos monumentais, linhas verticais, iluminação controlada, superfícies novas e manutenção constante.
- Custódios possuem **equipamento de proteção humano**, fabricável: cerâmica balística segmentada, polímeros moldados, tecido reforçado, viseiras; silhueta articulada, peças em camadas, articulações reais. Jamais copiar Warframes; sem habilidades sobrenaturais.
- Hierarquia social visível na roupa, nos materiais e no acesso a recursos; dourado/cobre/índigo em detalhes ritualísticos, tecido envelhecido da população, limpo/preciso dos oficiais.
- Ícones e sinais da EVA criados do zero; consistência própria, inclusive no projeto do templo.

### Matias — protagonista
- 58 anos, homem brasileiro inspirado *genericamente* na foto do criador, óculos, cabelo escuro com grisalho, anatomia realista, corpo robusto mas não super-herói; expressão séria sem sorriso transplantado.
- Roupa de engenheiro civil/segurança reaproveitada: jaqueta surrada com bolsos de ferramentas funcionais, costuras, zíper, barras, tecido sujo, mochila e luvas práticas.
- **Sem marca AlwaysFit**, sem logomarcas reais e sem copiar armaduras de Warframe; nunca commitar foto privada.
- Modelar cabelo em mechas/cartões, não uma calota uniforme; roupas separadas com volume real, rugas normais, desgaste assimétrico.

## Receita contra o aspecto “quadrado”
**Não basta SSAO/bloom. O problema principal é geometria e materiais.**
1. Trocar 3 fachadas da rua por módulos GLB com **profundidade real** (paredes/recortes/frisos/portas, 20–50 cm de relevo), beirais arredondados onde convier e colunas/tubos com segmentos suficientes; preservar demais casas provisórias no primeiro passe.
2. Acrescentar 12–20 props não-primitivos e brasileiros: banca dobrável, botijão, gerador, caixa de distribuição, bancada de oficina, bicicleta, placa de rua, grades, toldos, fios, varais com tecido, canaleta, banco, carrinho, barril metálico e contêiner.
3. Trocar pelo menos 6 superfícies importantes por materiais PBR **de fonte CC0**, com cor, normal, roughness, licenças auditáveis. Preferir Poly Haven / ambientCG via fonte oficial; adaptar resolução à web.
4. Reduzir uniformidade dos módulos: desgaste diferente, lascas, cartazes, infiltrações, manchas e decals de uso. Plantas **localizadas onde faz sentido** (fissuras, calhas, jardins abandonados).
5. **Atualizar pelo menos um personagem:** Matias, com cabelo em mechas/cartões, roupa separada, silhueta humana sem primitivas aparentes e melhor rosto. Manter rig Mixamo e 8 clipes; não danificar locomotion.
6. Iluminação de época do dia em camadas: céu/horizonte, luz direcional, rebote aproximado, emissivos reais, sombras testadas. Pós-processamento moderado; nada de esconder malha ruim com neblina e desfoque.
7. Validar a estética **pela câmera de gameplay**, e não apenas por render de portfolio. NPCs precisam ficar legíveis e ter expressão/pose plausíveis.

## Ordem de trabalho — “hero corner”, não cidade inteira
**M1.1 Prova de arte no navegador:** restaurar um canto de 15 x 15 metros ao redor da praça da Apuração com 1 fachada rica, 1 banca, 1 posto de distribuição, 5 props secundários, 3 materiais PBR, 1 Custódio visualmente melhorado. Manter controles/colisão.

**M1.2 Matias melhorado:** antes/depois do modelo em plano médio e corpo inteiro, animações Walk/Run/Crouch capturadas em vídeo (não só imagem), testes do GLB e do peso de download.

**M1.3 Expansão:** replicar módulos/LODs pelo quarteirão completo, povoar com NPCs em ações cotidianas; não expandir mapa vazio antes de estabelecer qualidade.

## Pipeline técnico da arte (web)
- Blender -> GLB glTF 2.0 -> `public/assets/environments/` e `public/assets/characters/`.
- Matias/NPCs: rig/animador e nomes de clipes existentes devem permanecer compatíveis; usar retarget quando necessário.
- Materiais PBR sob restrições de WebGL 2; compressão de texturas KTX2 quando suportado. Roteiro de **LOD**: detalhes próximos, versões simplificadas ao fundo e instancing de props repetidos.
- Não assumir FPS; medir desempenho nas cenas e em celulares. A arte pode ter qualidade cinematográfica **na direção** mesmo com otimização e sombras limitadas na web.
- Manter modelos-fonte em `assets-src/`, manifestos de licença atualizados em `public/assets/licenses/ASSETS.md`.
- **Screenshot A/B comparável**: ângulo, resolução, horário e câmera iguais; registrar FPS aproximado e peso incremental de assets. Vídeo de 8–15s jogável andando ao redor dos objetos.

## Critério de pronto
- Quarteirão da Apuração precisa ser reconhecível como *Brasil 2072 habitado*, não cidade genérica arruinada nem cenário de alienígenas.
- Fachadas deixam de parecer cubos/caixas quando vistas lateralmente: volume real, portas e janelas rebaixadas, varandas/grades/fios/irregularidade de superfície.
- Armaduras dos Custódios ganham curvas e articulações plausíveis; não são robôs.
- Matias tem cabelo, roupa e corpo separados com materiais convincentes, sem violar o rig nem expor a foto privada.
- Uma captura do jogo em tempo real comprova ganho sobre `docs/screenshots/06-praca.jpg` de antes.
- Se não houver Blender/assets PBR disponíveis, **declarar bloqueio**, não produzir mais caixas por padrão e declarar realismo atingido.

## Resultado do M1.1 (25/10/2026)
- Kit GLB `public/assets/environments/praca_hero.glb` gerado por `tools/blender/make_environment.py` (3,3 MB, 48 K tri, 24 assets): fachada da Central (16 m, vãos recuados 30 cm, pilastras, cornija, portão segmentado, placa, calhas, ar-condicionado, painéis solares), 2 variantes de sobrado residencial de 8 m (varandas com grade, varal com roupas, janela vedada com tábuas, AC, caixa d'água, escorridos), posto de distribuição, banca de feira, gerador, botijões, tambores, caixotes de ripas, banco, caixa elétrica, poste de luz com braço curvo, 2 árvores (tronco, raízes, galhos, folhagem alpha-test em 8 aglomerados).
- 5 materiais PBR fotográficos CC0 (ambientCG): reboco pintado, pedra portuguesa, concreto, telha metálica, ferrugem; normal + roughness + AO; texturas procedurais só para madeira, listras, manchas, casca e folhas.
- Antes/depois com câmera idêntica: `docs/screenshots/m1/antes_hero.jpg` → `depois_hero.jpg`, `antes_lateral.jpg` → `depois_lateral.jpg`, `antes_praca.jpg` → `depois_praca.jpg`. Vídeo de 11 s andando/correndo pelo canto: `docs/videos/praca_hero.mp4` (`node tools/capture-praca.mjs`).
- Custo: +4,7 MB de download (GLB 3,3 MB + texturas 2,3 MB − procedurais), +60 K vértices na praça, ~146 materiais/120 texturas na cena (antes 112/75). Controles, física, missões e animações intocados (34 testes + teste visual).
- Pendente do M1.1: Custódio com armadura segmentada (cerâmica/polímero, humano) — próximo passo, no `make_character.py`.

## Segurança de propriedade intelectual
Warframe é somente referência de acabamento visual, iluminação, movimento e densidade. Não extrair modelos/texturas/músicas, nomes, ícones, armaduras ou mapas. Projetar linguagem própria coerente com o universo de EVA.
