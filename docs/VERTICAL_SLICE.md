# Vertical slice — "A Apuração" + "O Carregamento" (São Paulo Velha, Setor 17)

Primeira experiência jogável completa (10–15 min): exploração, diálogo, confronto, combate, veículo e um objetivo final com decisão. Implementada diretamente no repositório sobre o protótipo M0/M1 (Babylon.js + Havok), sem trocar de engine.

## Por que não migramos de engine
Avaliamos bases open source completas (Three.js: Sketchbook, swift502, MIT; cannon-es; Babylon.js: Space Pirates, Summer Festival). Nenhuma traz um jogo de terceira pessoa com combate, IA e veículos pronto para o nosso universo; todas exigiriam reconstruir o que já funciona aqui (controlador de personagem Havok, personagens MakeHuman rigados com animações UAL, mundo modular PBR, toque, salvamento). A decisão foi **manter Babylon.js** e **portar/usar código comprovado com licença compatível**:

| Sistema | Origem | Licença | Onde |
| --- | --- | --- | --- |
| Veículo por raios (suspensão mola-amortecedor, atrito com círculo de atrito, freio/motor) | `RaycastVehicle` do cannon-es (pmndrs), derivado do `btRaycastVehicle` do Bullet | MIT / zlib | `src/vehicles/raycastVehicle.ts` |
| Controle de voo da aeromoto (velocidade angular definida pelos comandos, PD de altitude) | Helicóptero do Sketchbook (swift502) | MIT | `src/vehicles/hoverBike.ts` |
| Steering da IA (Arrive, Separation, ObstacleAvoidance) | yuka (npm) | MIT | `src/ai/enemy.ts` |
| Animações (pistola, reação, morte, dirigir, sentar, locomoção) | Quaternius Universal Animation Library Standard | CC0 | `assets-src/animations/`, retarget em `tools/blender/retarget.py` |
| Texturas PBR do cenário | ambientCG | CC0 | `public/assets/textures/` |
| Passos e impactos | Kenney Impact Sounds | CC0 | `public/assets/audio/sfx/` |

Kenney Starter Kit FPS (MIT) foi avaliado para armas e drones, mas o estilo cartunesco destoa do universo; a pistola, a caixa de munição e o kit médico foram modelados no nosso pipeline Blender (`tools/blender/make_props.py`).

## Roteiro jogável
1. **Oficina** — rádio, cartão de registro (mochila), tutorial de movimento.
2. **Rua** — comerciante, triciclo Atlas T-3 estacionado (dirigível), moradores.
3. **Raquel e Ana** — posto médico; escolha que muda `matiasTrustsSystem`.
4. **Apuração** — Miriam no balcão; a pista do lote fora das cotas.
5. **Custódio** — revela que o lote sai na van ao anoitecer; o sol baixa (transição tarde → anoitecer).
6. **Confronto** — ao anoitecer, o Custódio entrega a pistola de serviço (12 + 36). Duas levas de desviadores (3 + 4): patrulham pela rua, detectam Matias (cone de visão + linha de visada, ouvem tiros), perseguem, mantêm distância e atiram; reagem a dano e morrem deixando munição. Vida regenera lentamente fora de combate; kit médico (H). Morte → "Matias caiu" → recomeça a leva junto à van.
7. **Fuga** — Custódio ferido; Matias entra na van Módulo V-7 (E), dirige pela praça e pela rua até a oficina (zona de chegada em frente à porta).
8. **Entrega e decisão** — tranca o carregamento na porta da oficina; Raquel chama pelo rádio: entregar ao posto com registro **ou** distribuir em silêncio pelos Silenciosos (flag `carregamento.decisao`, postura de Matias). Tela final com estatísticas.

Veículos extras: Javali VB-4 (praça leste) e Rastro AV-4 (aeromoto, praça leste) podem ser usados livremente; a aeromoto tem cerca invisível a ~170 m do quarteirão e uma silhueta de cidade ao redor.

## Sistemas
- **Veículos** (`src/vehicles/`): chassi rígido do Havok (caixa, centro de massa baixo, inércia explícita por unidade de massa — convenção do Havok), 4/3 rodas por raio com rodas visuais girando e esterçando, motor/freio/ré/freio de mão, câmera de perseguição com realinhamento automático, faróis (F), som de motor sintetizado, entrar/sair com Matias no banco (clipes `Driving`/`Sit`). Aeromoto: sustentação PD, empuxo, guinada, inclinação, teto e cerca.
- **Combate** (`src/combat/`): pistola presa ao osso da mão direita, mira no ombro (FOV 0,72) com o tronco acompanhando o pitch da câmera, tiro por raio do centro da tela (cápsulas dos inimigos testadas analiticamente — os controladores de personagem do Havok não são corpos rígidos), dispersão, coice, clarão/traçante/faíscas/poeira, recarga (R/automática), marcador de acerto, vinheta de dano, morte com pose segurada.
- **IA** (`src/ai/`): FSM patrulha → alerta → perseguição → ataque → ferido → morto; visão em cone de 110°/28 m com raio de linha de visada; audição de tiros (34 m); steering yuka (Arrive + Separation + ObstacleAvoidance com esferas dos props da praça e dos veículos) integrado pelo `PhysicsCharacterController`; tiros com acerto probabilístico por distância; animação de pistola em camada superior sobre a locomoção.
- **Itens** (`src/items/`): mochila (I), itens no chão (munição, kit), uso de kit (H), persistência no save.
- **Missão** (`src/narrative/missionDirector.ts`): fases por flags, ondas, checkpoints (autosave), reinício da onda ao cair, zonas de entrega, decisão.

## Testes
- `npm run check` — tipos, 48 testes (lógica de arma/vida/cápsula/mochila/veículo, GLB, física headless) e build.
- `npm run test:gameplay` — no build, com quadros determinísticos: Javali (entrar, acelerar, virar, frear, sair), Rastro (subir, voar, descer), combate (pistola, mira, acertos, abate, recarga, dano sofrido), missão (ondas, Custódio, van, entrega, tranca, rádio, tela final).
- `npm run test:visual`, `npm run test:touch` — regressão do fluxo original e do toque.

## Limitações conhecidas (honestas)
- Sons de tiro, motor e rotores são **sintetizados** (provisórios): substituir por gravações CC0 registradas em `ASSETS.md`.
- Vozes continuam TTS do navegador.
- Inimigos não usam cobertura nem navmesh (steering + desvio de obstáculos); funcionam bem na praça aberta.
- Modelos dos veículos e props são protótipos modulares (ver `docs/FABLE_INTEGRACAO_VEICULOS.md`).
- A Estação Janus segue apenas no visualizador (`/preview-veiculos.html`).
