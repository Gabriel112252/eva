# Fontes de animação

## `ual-standard/standard/` — Quaternius Universal Animation Library v3, versão Standard (gratuita)

- Origem: https://quaternius.itch.io/universal-animation-library (download gratuito "Universal Animation Library[Standard].zip", 15 MB, 16/06/2026) · site do autor: https://quaternius.com
- Autor: Quaternius (com animações de Gonzalo Furnier) · **Licença: CC0 1.0** (`standard/License.txt`) — uso comercial permitido, sem atribuição obrigatória.
- Mantido no repositório apenas `Unreal-Godot/UAL1_Standard.glb` (rig universal estilo Unreal, 65 juntas, 43 animações **in-place**, 30 fps). As variantes com root motion (`_RM`) e os FBX para Unity foram descartadas (idênticas em conteúdo; baixe de novo no link acima se precisar).
- Clipes usados pelo jogo (mapeamento em `tools/blender/retarget.py`, `GAME_CLIPS`):

| Clipe do jogo | Animação da biblioteca | Loop | Velocidade natural medida (pé apoiado) |
| --- | --- | --- | --- |
| Idle | `Idle_Loop` | sim | — |
| Walk | `Walk_Loop` | sim | 0,98 m/s |
| Run | `Jog_Fwd_Loop` | sim | ≈6,1 m/s (root motion 5,4; ajustado pelo pé apoiado no jogo) |
| CrouchIdle | `Crouch_Idle_Loop` | sim | — |
| CrouchWalk | `Crouch_Fwd_Loop` | sim | 0,70 m/s |
| Talk | `Idle_Talking_Loop` | sim | — |
| Interact | `Interact` | não | — |
| PickUp | `PickUp_Table` | não | — |

O retarget para o rig Mixamo de 52 ossos dos personagens é feito em Blender headless por `tools/blender/retarget.py`
(chamado por `make_character.py`; `npm run assets:characters`). O jogo sincroniza a velocidade de reprodução dos clipes
de locomoção com a velocidade real do personagem (`animationSpeedRatio` em `src/player/playerController.ts`) para o pé
apoiado não deslizar.
