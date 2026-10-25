# Assets 3D do EVA — veículos e Estação Janus

**Status**: modelos GLB 2.0 **reais**, com peças separadas (roda, chassi, corpo, cabine, rotor, painel solar, antenas etc.). São a **primeira passagem geométrica**; não se apresentar como arte fotorrealista final.

## Modelos entregues
| Arquivo | Tipo | Estado para jogo |
|---|---|---|
| `javali_vb4.glb` | Viatura Custódios | prop estático em teste na cidade |
| `atlas_t3.glb` | Triciclo de carga | prop estático no mercado |
| `modulo_v7.glb` | Van de suprimentos | prop estático em descarga |
| `rastro_av4.glb` | Aeromoto rara (duas hélices canalizadas) | **não spawnar** no prólogo |
| `janus_station.glb` | Estação orbital automatizada | apenas miniatura/interface futura |

- Fonte reproduzível: `tools/generate-eva-vehicles.mjs` (Node 20+, sem dependências extras), gerador procedural de **malhas tridimensionais**.
- Metadados: `manifest.json` (nós/triângulos/dimensões) e `spawn_plan.json` (sugestões de posição apenas).
- Materiais: glTF PBR baseColor/metallic/roughness, sem texturas fotográficas e sem logotipos comerciais.
- **Licença**: assets originais produzidos para EVA; podem ser usados no projeto. Não usam modelos, armaduras, texturas ou marcas de Warframe/Star Wars.
- Escala: metros; Y para cima, frente +Z. Nenhum arquivo é pilotável ou animado por padrão.
- **Para regenerar:** `node tools/generate-eva-vehicles.mjs`.
- **Para validar estrutura:** `node tools/validate-eva-vehicles.mjs`.
- **Para ver em 3D:** `npm run dev` e abrir `http://localhost:5173/preview-veiculos.html` no navegador.

### Integração
No Fable, primeiro ler `docs/VEICULOS_E_JANUS.md` e `docs/FABLE_INTEGRACAO_VEICULOS.md`. Depois da inspeção, copiar apenas os três veículos terrestres aprovados para `public/assets/vehicles/` e carregá-los no Babylon. **Não alterar mundo ativo antes de conferir a passagem dos NPCs, colisão e desempenho.**

### Arte final
O próximo passe precisa de modelagem mais rica no Blender, UVs, materiais PBR com mapas, sujeira e decalques apropriados. O gerador é uma base 3D e de proporção, **não** substitui trabalho artístico definitivo. Rastro e Janus requerem aprovação das fichas narrativas antes de aparecer na campanha.