# Texturas PBR (fonte)

## `ambientcg/` — ambientCG, CC0 1.0 (https://ambientcg.com/ · licença: https://docs.ambientcg.com/license/)

Baixadas em 25/10/2026 do site oficial (download gratuito, 1K JPG). Mantidos só Color, NormalGL, Roughness e, quando existem, AmbientOcclusion/Metalness.

| ID | Uso no jogo |
| --- | --- |
| PaintedPlaster017 | reboco pintado (fachadas), tingido por material |
| PavingStones070 | piso de pedra da praça |
| CorrugatedSteel005 | telhas do posto de distribuição |
| Concrete034 | concreto (base, cornija, canteiros, balcão) |
| Rust004 | metal enferrujado (pilares, barris, gerador, portão) |

O gerador `tools/blender/make_environment.py` monta os materiais a partir destas pastas e embute as texturas (JPEG) nos GLB em `public/assets/environments/`.
