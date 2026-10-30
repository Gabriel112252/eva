# MAPA — SETOR 17, São Paulo Velha (blockout)
Versão 0.2 — 30/10/2026 (aparência pelo kit 2072). Fonte de verdade: os dados em `src/world/sector17.ts` (`SECTOR17`) e as zonas em `src/world/sector17Zones.ts`. Este documento só resume. Coordenadas em metros: **X = leste, Z = norte**; y = 0 no nível da rua.

## Visão geral
O setor cresce em volta do quarteirão original do Capítulo 0 (rua da Apuração x −48…14, praça x 14…46, oficina), **que não foi tocado**. Limite murado do setor: x −78…104, z −76…82 (≈ 182 × 158 m), com postos de controle da Custódia nas duas pontas da Avenida do Maglev. A aeromoto continua livre no céu; perto do chão a cerca acompanha `GROUND_FENCE_RADIUS` (`src/world/bounds.ts`).

```
 z=82 ┌──────────────── muro do setor ─────────────────┬──[cancela N]──┬────────┐
      │ Q4 │ Q1 · Distribuição                          │               │  Q2    │
      │ q4g│ q1a q1b q1c [TORRE VERDE] q1d q1e q1f │ZONA DE DISTRIB.│  A     │  q2h   │
      │ q4f│                                        │ [DEPÓSITO]     │  V.    │  q2g   │
 z=50 │ q4e│──────────── Rua dos Recicladores (z=43) ─────────────────── M ─┤ (muro)│
      │ q4d│ Q0 · Vila dos Recicladores  vn1…vn6 │ fundos da Central │  A ═  │  q2f   │
 z=18 │    │ quarteirão norte original (n1…n6)  │ CENTRAL  ┊antena  │  G ═  │  q2e   │
  z=0 │[CIS-│═══════ Rua da Apuração ═══════ PRAÇA ══════ (p_leste)│  L ═  │  q2d MERCADO
      │TERNA]│ quarteirão sul original (oficina)│ posto médico     │  E ═  │  q2c   │
z=-18 │ q4c│ quadra │ ESCOLA (salas+telhado) │pátio│ beco atrás da praça · Largo│ V   │ (muro) │
z=-41 │ q4b│──────────────── Rua da Escola (z=−41) ──────────────────────── │ ═  │  q2b   │
      │    │ Q3 · Terminal  q3a q3b q3c q3d [CANOPY SOLAR] q3e q3f q3g      │viaduto│ q2a   │
z=-76 └────┴─ Rua da Cisterna (x=−56) ───────────────────────┴──[cancela S]──┴────────┘
     x=-78  x=-63                                         x=58.5     x=72.5     x=86.5  x=104
```

## Ruas
| id | nome | eixo | posição | faixa |
| --- | --- | --- | --- | --- |
| `rua_apuracao` | Rua da Apuração (existente) | x | z = 0 | asfalto 8 m |
| `rua_recicladores` | Rua dos Recicladores | x | z = 43, x −63…86,5 | asfalto 8 m + calçadas 3 m |
| `rua_escola` | Rua da Escola | x | z = −41, x −63…86,5 | asfalto 8 m + calçadas 3 m |
| `av_maglev` | Avenida do Maglev | z | x = 72,5, z −76…82 | 2 pistas (22 m) + canteiro 4 m sob o viaduto |
| `rua_cisterna` | Rua da Cisterna | z | x = −56, z −45…47 | asfalto 8 m |

## Quarteirões e marcos
- **Q0** — quarteirão original + Vila dos Recicladores (vn1–vn6, frente para a rua dos Recicladores) + **Escola do Setor** (bloco de 2 pavimentos com telhado acessível, pátio, quadra cercada) + consultório dos fundos do posto da Raquel + Largo do Mercado.
- **Q1 · Distribuição** — 6 lotes, **Torre Verde** (fazenda vertical meio ocupada, 34 m) e a **zona de distribuição**: pátio murado com portão de correr de 8 m e o **depósito** (interior 20 × 14 m, porta de 5 m — a van cabe —, prateleiras, escritório, escada externa para o telhado).
- **Q2 · Mercado** — 8 lotes do outro lado da avenida, incluindo o **Mercado Coberto do 17** (galpão).
- **Q3 · Terminal** — 7 lotes e o **canopy solar** do terminal de recarga (telhado pousável).
- **Q4 · Cisterna** — 7 lotes e a **cisterna e estação de bombeamento** (marco de 18 m, portão fechado "ÁGUA 3ª E 6ª").
- **Viaduto do maglev morto** — pilares a cada 24 m em x = 72,5; tabuleiro a 10 m de altura; o trecho sul (z −72…−48) caiu. Feira embaixo (banca do mercado em 72,5 / −14).
- **Antena da Central** — 22 m, sobre o telhado da Central de Suprimentos.

## Pontos de interesse (missões do Capítulo 1)
| id | uso | posição (x, y, z) |
| --- | --- | --- |
| `deposito` / `deposito_porta` | M2 — caderno de saída, caixas vazias, grade dos fundos | 34,5 / 0,12 / 65,5 · porta 33,5 / 58 |
| `distribuicao_portao` | M2 — entrada do pátio | 40 / 0,12 / 50 |
| `banca` | M2 — testemunha, Atlas T-3 | 72,5 / 0,15 / −14 |
| `posto_raquel` / `posto_raquel_fundos` | M2 entrega · M3 | 24,4 / −18 · 24,5 / −32 |
| `escola_entrada` / `escola_salas` | M3 — encontro com Elias | 8 / −34 · −6 / −24 |
| `quadra_portao_sul` / `quadra_portao_leste` | M3 | −28,5 / −33,5 · −15 / −25 |
| `rastro_telhado_escola` | M3 — fuga de aeromoto | −6 / 7,0 / −29 |
| `limite_norte` | M4 — saída para a Estação Nove | 72,5 / 0,12 / 80 |
| `torre`, `canopy`, `cisterna`, `largo`, `limite_sul` | referências de navegação | ver `POIS` |

**Telhados pousáveis**: escola (y 7,0, escada externa leste), depósito (y 6,8, escada oeste), canopy (y 6,4, escada no pilar sudoeste).

**Becos de furtividade (M3)** — duas rotas até a quadra: (1) beco atrás da praça (Largo → estreitamento de 2 m junto ao consultório → pátio da escola); (2) rua da Escola → portão sul da quadra. Beco sem saída na Vila dos Recicladores.

**Rota da van**: portão da Central → praça → oficina → volta pela praça → Largo → Avenida (pista oeste) → rua dos Recicladores → portão da zona → pátio → depósito (13 pontos com folga lateral verificada em `VAN_ROUTE`).

## Zonas (gatilhos)
Dados puros `{ id, center, radius }` em `src/world/sector17Zones.ts`; `zoneAt(x, z, y)` devolve a zona atual (exposta em `eva.snapshot().zone`). Ids incluem `zona.deposito`, `zona.escola_salas`, `zona.quadra`, `zona.telhado_escola`, `zona.telhado_deposito`, `zona.telhado_canopy`, `zona.posto_raquel`, `zona.banca`, `zona.feira_viaduto`, `zona.limite_setor`.

## Navegação
`src/world/navmesh.ts`: Recast/Detour (`recast-detour` 1.6.4, licença Zlib, WASM carregado sob demanda) gerado na carga a partir dos colisores estáticos andáveis (chão, calçadas, interiores, escadas e telhados); alternativa em grade (A*, células de 0,5 m) se o WASM falhar. `world.navmesh.findPath(a, b)`, `getRandomPointAround(p, r)`; depuração com `?navmesh=1`.

## Luzes
`SectorLights` liga só as luzes locais mais próximas de Matias/veículo (≤ 6 acesas por vez) — o WebGL tem limite de luzes por material.

## Troca blockout → kit (`src/world/sector17Kit.ts`)
A aparência do setor vem do kit `public/assets/environments/kit_tech.glb` (catálogo em `docs/KIT_TECH.md`); **a física e o layout continuam os do blockout** — colisores, navmesh, rota da van e testes não mudam. `?kit=0` na URL volta ao blockout puro (comparação). O campo `kit` de `LOTS`/`LANDMARKS` segue como nome da tipologia; a composição real de cada lote sai de `planSector17Kit()` (puro, determinístico pela `seed`, coberto por `tests/unit/sector17Kit.test.ts`).

- **Lotes** — largura da fachada ÷ 6 m arredondada; cada módulo comprime até 18 % ou estica até 15 % (`facadeLayout`); a sobra das fachadas de 8–9 m vira pilastra (esquina alargada) nas pontas. Pavimentos do kit (3 m) = `round(floors × floorHeight ÷ 3)` (o mercado, 1 × 5,6 m, ganha 2). Térreo por `ground`: shop → `FACHADA_terreo_loja`, door → `terreo_casa`, wall/gate → `galpao`. Pavimentos de cima em colunas coerentes (sacada/janelas/serviço conforme `balconies`; andares fechados conforme `boarded`), `FACHADA_topo_0/1` no alto (o `_1` tem telhado de telha), `FACHADA_esquina` por pavimento nas pontas (a junta com o vizinho fica com um só), cor 0/1 por semente. A frente +Z do kit gira pela `facing` (`facingYaw`). Módulo tampado ≥ 75 % por construção vizinha (Q4 × Q1/Q3) não recebe kit. Lotes queimados: galpão escurecido por instância.
- **Volume cego** — a caixa do lote recua 1 m atrás da linha da fachada (paredes do kit em z ∈ [−0,5, 0]; o nicho da área de serviço vai a 0,9 m), com faixas laterais e tampa fechando a fenda e laje de concreto por cima (o reboco do blockout não aparece no telhado), 1 cm para dentro das caixas do blockout. Fachadas laterais e fundos continuam caixas. O blockout coberto (fachada, viaduto, volume da torre, painéis e totens do canopy) fica fora da fusão do `finalize` e é descartado quando o kit carrega; se a carga falhar, é fundido e o setor segue em blockout.
- **Camada tecnológica** (sorteio por lote) — 42 % dos lotes com pele fotovoltaica (1–2 pavimentos de uma coluna) ou anexo modular na laje; telhados conforme `roof` (caixa d'água → `REMENDO_caixa_dagua`, reciclador → `TECH_reciclador_agua`, solar → `TECH_canopy_solar`) mais recicladores/caixas extras sem bater na antena/varal/mastro do blockout (que continuam); letreiro LED em bandeira nos lotes com `sign`; a placa do lote vai para a testeira da marquise da loja; as pichações, para uma porta de galpão.
- **Remendos** — ar-condicionado de janela, varal de parede, toldo nas casas, tubulação nos galpões, fiação pregada nas fachadas, lona de ocupação amarrada nos fundos de 3 em 4 anexos e fiação dos postes do blockout até a fachada do outro lado da rua (vão de ~12 m, inclinada).
- **Marcos** — viaduto dividido na carga em pilar (nos 7 `VIADUCT.pillars`, inclusive o de −72 do trecho caído, que segue com a laje partida do blockout) e tabuleiro (nos 5 `VIADUCT.decks`); Torre Verde = 3 blocos de `MARCO_torre_fazenda` (4 pavimentos cada) a 34/36 → 34 m, com a casa de máquinas e a antena do blockout em cima; canopy com 8 dosséis solares nas bordas (o meio fica livre para pousar) e totens de recarga do kit; cisterna ganha reciclador, caixas d'água e tubulação.
- **Desempenho** — carga única (`LoadAssetContainerAsync`), cada malha levada ao espaço da peça (com a conversão glTF→Babylon) e desenhada com **instâncias de malha** (`createInstance`, o mesmo de `instantiateHierarchy`): 1 draw call por malha-fonte visível, culling e **LOD por instância** (fachadas 70 m, decalques e miudezas 45 m, peças de laje 90 m; marcos sempre). Longe, **cartões** com textura de janelas atrás das paredes do kit desenham as fachadas (um draw call para o setor inteiro). Na carga, materiais sem textura viram uma **paleta** (cor, rugosidade/metal e emissivo por texel) e as famílias que dividem texturas (reboco, concreto, pintura, madeira, ferrugem) viram **cor por vértice**; malhas idênticas entre as variantes _0/_1 viram uma fonte. Nenhuma geometria é clonada por lote. Kit e placas recebem só sol + hemisférica (as luzes locais trocam com a posição do jogador e recompilavam dezenas de variantes de shader); os shaders são compilados na carga. Sombras só dos marcos e de marquises/sacadas (o volume cego projeta a do prédio). `?kitinst=thin` troca para thin instances (sem LOD) para comparar.
- **Faltas do kit** (documentadas, não inventadas): fachada queimada (usamos galpão escurecido), trecho caído do viaduto (segue a laje partida do blockout), reservatório elevado da cisterna, antena da Central, depósito, escola e consultório (seguem blockout — interiores jogáveis); `TECH_poste_sensor` e os props `PROP_*` não entraram no setor (orçamento de draw calls).

## Testes
`npm run test:setor17` (no build): navmesh, caminhos oficina→depósito→escola→quadra→telhados, Matias entrando no depósito e subindo ao telhado da escola andando, van percorrendo a rota e entrando no depósito, Rastro pousando no telhado da escola, draw calls ≤ limite e ≤ 6 luzes acesas. `npm run capture:setor17` gera `docs/screenshots/setor17/`; `node tools/capture-setor17.mjs --kit 0|1` grava os mesmos 6 enquadramentos em `docs/screenshots/setor17_kit/antes|depois/` (blockout × kit). Dados validados em `tests/unit/sector17.test.ts` (lotes sem sobreposição, zonas dentro do setor, ruas conectadas, grade A*) e a composição do kit em `tests/unit/sector17Kit.test.ts`.
