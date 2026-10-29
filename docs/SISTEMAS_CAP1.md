# Sistemas genéricos do Capítulo 1 — guia para Missões/Mapas

Tudo aqui é dirigido por dados e já está integrado ao `Game` (`src/core/game.ts`). O roteiro das missões M2–M4
usa estes sistemas **sem editar o código deles**: registra zonas/objetos/máquinas por dados, assina gatilhos
(`MissionTrigger`, `src/data/cap1Contracts.ts`) e reage. Em desenvolvimento, tudo também está em `window.eva`.

| Sistema | Módulo | Acesso no jogo |
| --- | --- | --- |
| Diário de pistas | `src/narrative/clues.ts` (`ClueLog`) + dados em `src/data/clues.ts` | `game.clues` |
| Examinar | `src/interaction/examinable.ts` (`ExamineController`, `ExaminableSpec`) | `game.examine`, `game.addExaminable(spec)` |
| Reparo | `src/interaction/repair.ts` (`RepairController`, `RepairSpec`, `RepairMinigame`) | `game.repair`, `game.addRepairable(spec)` |
| Furtividade | `src/ai/stealth.ts` (regras puras), `src/ai/enemy.ts` (`role: "custodio"`), `src/ai/enemyManager.ts` | `game.enemies`, `game.spawnCustodio(...)`, `game.setCurfew(on)` |
| Timers | `src/narrative/timers.ts` (`MissionTimers`) | `game.timers` |
| Carga visível | `src/narrative/delivery.ts` (`DeliveryCargo`) | `game.cargo`, `game.setCargo(vehicleId \| null)` |
| Gatilhos e zonas | `src/narrative/missionScript.ts` (`MissionScript`, `ZoneSpec`) | `game.script` (= `window.eva.triggers`), `game.addZone(spec)` |

Todos os ids/flags seguem a convenção de `cap1Contracts.ts` (`cap1.<missao>.<evento>`, `pista.<slug>`).

## 1. Gatilhos de missão (`MissionScript`)

O roteiro assina **padrões** e os sistemas disparam gatilhos. Um padrão casa quando `kind` é igual e todos os
campos presentes no padrão são iguais aos do gatilho; `"*"` aceita qualquer valor; `segundos` do timer é ignorado.

```ts
import type { MissionTrigger } from "@/data/cap1Contracts";
const s = game.script;

s.on({ kind: "zona", id: "deposito" }, () => game.quests.completeObjective(QUEST_RASTRO_DO_LOTE, "deposito"));
s.once({ kind: "examinar", objeto: "manifesto" }, () => {/* 1ª vez só */});
s.on({ kind: "pista", id: "*" }, (t) => { if (game.clues.hasAll(PISTAS_BRANDAO)) game.flags.set(CAP1_FLAGS.brandaoIdentificado, true); });
s.on({ kind: "reparo", maquina: "gerador_deposito" }, () => {/* luz acende: Mapas liga a luz */});
s.on({ kind: "timer", id: "entrega_posto" }, () => {/* zerou: falha branda */});
s.on({ kind: "detectado" }, () => game.flags.set(CAP1_FLAGS.detectado, true));
s.on({ kind: "dialogo", npc: "raquel", no: "fim_entrega" }, () => {/* nó alcançado */});
s.on({ kind: "veiculo", id: "atlas_t3", dentro: true }, () => game.setCargo("atlas_t3"));
const off = s.on(...); off(); // cancela
```

Quem dispara o quê (automático): entrar numa zona → `zona`; `ExamineController` → `examinar` (toda vez que abre);
`ClueLog.add` → `pista` (só na 1ª vez); reparo concluído → `reparo`; timer zerado → `timer` (`segundos` = total);
Custódio detecta Matias → `detectado`; cada nó de diálogo (`DialogueRunner.onLine`) → `dialogo` com `npc` = id do
grafo e `no` = id da linha; entrar/sair de veículo → `veiculo`. O roteiro pode disparar manualmente:
`s.fire({ kind: "zona", id: "x" })`. Histórico: `s.history` (últimos 64), `s.fired(padrao)`.

### Zonas por dados (`ZoneSpec`)

```ts
game.addZone({ id: "deposito", center: { x: 60, y: 0, z: 12 }, radius: 4 });                     // cilindro (qualquer altura)
game.addZone({ id: "telhado_escola", center: { x: 80, y: 9, z: -20 }, radius: 6, height: 4 }); // cilindro limitado em y
game.addZone({ id: "portao_posto", center: { x: 0, y: 1, z: 30 }, size: { x: 6, y: 3, z: 4 }, requires: "veiculo", once: false });
```
`requires`: `"pe"` | `"veiculo"` | `"qualquer"` (padrão). `once` (padrão `true`) dispara só na primeira entrada;
`script.resetZone(id)` libera de novo. A posição verificada é a dos pés de Matias (a pé) ou do veículo.

## 2. Diário de pistas (`ClueLog`)

Dados em `src/data/clues.ts` (`ClueDef[]` — o Enredo é dono do texto; hoje há 2 placeholders). API:
`add(id)` (false se já tinha), `has(id)`, `hasAll(ids)`, `list(quest?)`, `get(id)`, `count`, `toJSON()/load()`.
`onAdded` mostra "Nova pista: <título>" na HUD, atualiza a aba **Pistas** da mochila (I, depois 2) e dispara
`{kind:"pista"}`. Persistência: `SaveData.clues` (ids em ordem de descoberta). Pistas de outro capítulo:
`game.clues.register(defs)`.

```ts
game.clues.add("pista.manifesto_selo");
if (game.clues.hasAll(["pista.manifesto_selo", "pista.caixa_vazia", "pista.testemunha_banca"])) { /* nome montado */ }
```

## 3. Examinar (`ExaminableSpec`)

```ts
game.addExaminable({
  id: "manifesto",                       // gatilho {kind:"examinar", objeto:"manifesto"}; flag examinado.manifesto
  position: { x: 61.2, y: 0.9, z: 10.4 },
  radius: 2.2,                           // prompt a partir desta distância
  title: "Manifesto da van",
  text: "O selo de cota do lote 17 não existe na lista do setor.",
  clue: "pista.manifesto_selo",          // opcional: vai ao diário ao abrir
  flag: "cap1.m2.leu_manifesto",         // opcional: posta em true
  prompt: "Ler o manifesto",             // opcional (padrão "Examinar: <title>")
  once: false,                           // true = some do prompt depois de examinado
  focusHeight: 0.1, cameraDistance: 1.0, // enquadramento
});
```
Fluxo: prompt "Examinar: …" → E → close-up (`ThirdPersonCamera` modo `inspect`, FOV 0,62, do lado de Matias) +
painel com título/texto → fecha com E, Espaço, Esc ou toque. Enquanto aberto o jogo fica no estado `dialogue`
(movimento travado). Já examinado: flag `examinado.<id>` (salva com o jogo). `game.examine.active` é o objeto aberto.

## 4. Reparo (`RepairSpec`)

```ts
game.addRepairable({
  id: "gerador_deposito",                 // gatilho {kind:"reparo", maquina}; flag reparado.gerador_deposito
  position: { x: 58, y: 0.6, z: 14 },
  title: "Gerador do depósito",
  steps: 3, fillTime: 1.6, zoneWidth: 0.2, penalty: 0.9,   // padrões
  flag: "cap1.m2.luz_deposito",           // opcional
  once: true,                              // consertada some do prompt
});
```
Minigame: segurar **E** enche a barra; soltar dentro da faixa dourada conclui o passo; soltar fora ou estourar a
barra repete o passo depois de `penalty` s (custa tempo, não vida). Som `switch` ao apertar/soltar, `objective`
ao concluir. Controles de toque: um toque curto começa a encher e o próximo toque vale como soltar.
`game.repair.onStep` / `onComplete` ({spec, failures, elapsed}). A barra fica em `#repair` na HUD.

## 5. Furtividade (Custódio de patrulha)

```ts
// spawn por dados (posição em metros; patrulha em loop; parâmetros opcionais)
await game.spawnCustodio(40, -6, Math.PI / 2, [[40, -6], [52, -6], [52, 8]], {
  vision: { angleDeg: 70, range: 22 },        // padrão do custódio
  awareness: { confirmTime: 2, graceTime: 1.5, searchTime: 8, loseTime: 6 },
  detectionsToHostile: 2,                     // 2ª detecção → hostil (atira)
  flashlight: true,                           // SpotLight presa ao olhar (padrão para custódios)
});
game.setCurfew(true);   // toque de recolher: visão ×0,7 (15,4 m), audição ×1,5, lanternas acesas
```
Ou direto: `game.enemies.spawn({ position, yaw, patrol, role: "custodio", variant: "custodio", ... })`.

Regras (em `src/ai/stealth.ts`, puras e testadas):
- **Ruído de Matias**: parado 0 m · agachado 4 m · andando 9 m · correndo 15 m · tiro 34 m · veículo em
  movimento 20 m (amostrado 5×/s pelo `Game`). Saqueadores em patrulha que ouvem vão investigar; custódios
  alimentam a percepção.
- **Visão**: cone de 70° × 22 m (saqueador: 110° × 28 m) com linha de visada por raio físico; a menos de 2,5 m
  percebe em qualquer direção.
- **Estados de percepção** (`enemy.awareness.state`): `calmo` → `suspeito` (viu algo; para e encara; a suspeita
  enche em ~2 s, mais rápido de perto) → `perseguicao` (**detectou**: voz de prisão + `{kind:"detectado"}`).
  Perder de vista em `suspeito` → `alerta` (vai ao último ponto visto/ouvido e varre a lanterna; volta a `calmo`
  após `searchTime`). Em `perseguicao` sem ver por `loseTime` → `alerta`.
- **Custódio não atira por padrão**: na 1ª detecção dá voz de prisão e persegue (ao alcançar Matias por 0,8 s a
  menos de 1,6 m emite `enemies.onCaught` — a missão decide o que acontece); vira **hostil** (FSM de combate
  normal, atira) se levar tiro ou na `detectionsToHostile`-ésima detecção. `enemy.hostile`, `enemy.detections`.
- **HUD**: olho que enche (`#awareness`) com o pior estado entre os custódios vivos (`enemies.awarenessSummary()`).
- **Lanternas**: no máximo 2 acesas (as mais próximas de Matias, até 45 m) para não estourar o limite de luzes
  por material; `game.enemies.setFlashlights(on)` (o `Game` liga em `setCurfew(true)` ou à noite).
- Eventos: `enemies.onDetected({enemy, count, hostile})`, `enemies.onCaught(enemy)`, `enemies.onAwareness`.
- A fala de aviso é **TTS provisório** (mesmo esquema dos diálogos); o agente de Áudio troca por arquivo.

## 6. Entrega contra o tempo (`MissionTimers` + `DeliveryCargo`)

```ts
game.timers.start("entrega_posto", 150, "Entrega ao posto");  // com rótulo aparece na HUD (mm:ss; <15 s pulsa)
game.timers.start("toque_recolher", 600);                      // sem rótulo: roda escondido
game.timers.add("entrega_posto", 20);                          // bônus/penalidade
const sobrou = game.timers.cancel("entrega_posto");            // chegou a tempo: não dispara
// zerou → {kind:"timer", id:"entrega_posto", segundos:150}
game.setCargo("atlas_t3");   // caixote "LOTE 17" na caçamba do Atlas enquanto a entrega durar
game.setCargo(null);         // ou game.cargo.detach(posicaoNoChao) para deixar a caixa no posto
```
Timers só correm no estado `playing` (pausa, menus, diálogos e exame congelam) e vão ao save (`SaveData.timers`).
A posição da carga por veículo está em `CARGO_PLACEMENTS` (`src/narrative/delivery.ts`); veículo fora da tabela usa
o banco + deslocamento.

## 7. Depuração e testes

`window.eva`: `triggers.fire({...})`, `triggers.history`, `addZone`, `addExaminable`, `addRepairable`,
`spawnCustodio`, `setCurfew`, `setCargo`, `timers`, `clues`, `lastTrigger()`. `snapshot()` traz `awareness`,
`clues`, `timers`, `examining`, `repair`, `cargo`, `curfew`, `triggers` (últimos 8) e `zonesInside`.
Testes: `npm run test` (unit: `tests/unit/cap1Narrative.test.ts`, `tests/unit/cap1Stealth.test.ts`) e
`node tools/gameplay-test.mjs --only sistemas` (no build; spawn de custódio, detecção, exame, pistas, timer, zona,
reparo e carga). Atenção ao Playwright: não devolva objetos da cena de `page.evaluate` (serializar o grafo derruba
a aba) — use `await page.evaluate(async () => { await window.eva.spawnCustodio(...); })`.
