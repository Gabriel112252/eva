# MAPA — SETOR 17, São Paulo Velha (blockout)
Versão 0.1 — 29/10/2026. Fonte de verdade: os dados em `src/world/sector17.ts` (`SECTOR17`) e as zonas em `src/world/sector17Zones.ts`. Este documento só resume. Coordenadas em metros: **X = leste, Z = norte**; y = 0 no nível da rua.

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

## Troca blockout → kit
Cada lote e marco declara o nó do kit que o substitui (`kit` em `LOTS`/`LANDMARKS`/`POIS`). O kit entregue pela Arte (`public/assets/environments/kit_tech.glb`, catálogo em `docs/KIT_TECH.md`) usa outros nomes (`FACHADA_<tipo>_<cor>`, módulos de 6 m × 3 m); a próxima etapa monta cada lote com módulos do kit (largura do lote ÷ 6 m, pavimentos, esquinas, topo) e mapeia os nomes reservados para os nós reais: viaduto → `MARCO_viaduto_maglev`, Torre Verde → `MARCO_torre_fazenda`, camada tecnológica e remendos por sorteio com semente do lote.

## Testes
`npm run test:setor17` (no build): navmesh, caminhos oficina→depósito→escola→quadra→telhados, Matias entrando no depósito e subindo ao telhado da escola andando, van percorrendo a rota e entrando no depósito, Rastro pousando no telhado da escola, draw calls ≤ limite e ≤ 6 luzes acesas. `npm run capture:setor17` gera `docs/screenshots/setor17/`. Dados validados em `tests/unit/sector17.test.ts` (lotes sem sobreposição, zonas dentro do setor, ruas conectadas, grade A*).
