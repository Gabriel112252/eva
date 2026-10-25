# Fontes de áudio

## `kenney-impact-sounds/` — Kenney Impact Sounds v1.0 (CC0)

- Origem: https://kenney.nl/assets/impact-sounds (download gratuito do site oficial, 25/10/2026) · Licença CC0 1.0 (`License.txt`).
- O pacote tem 130 arquivos; só os usados foram copiados (renomeados) para `public/assets/audio/sfx/`:
  `footstep_concrete/grass/wood_000-004` → `step_<superfície>_0-4`, `impactMetal_light_000-002` → `switch_0-2`,
  `impactSoft_medium_000-002` → `pickup_0-2`, `impactWood_light_000-002` → `wood_bump_0-2`.
- Mapeamento no código: `src/data/sounds.ts`; superfície sob os pés: `src/world/surfaces.ts`.
