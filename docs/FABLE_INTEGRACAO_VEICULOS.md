# MANUAL FABLE — INTEGRAÇÃO DO PACOTE SEM CONFLITOS

> **Estado em 25/10/2026 — integrado.** PR #1 mesclada em `main` após o commit do M1.1 (só adicionava arquivos; nenhum `src/world/**` sobrescrito).
> - Refino dos 5 GLBs no Blender (`tools/blender/refine_vehicles.py` → `public/assets/vehicles/`): materiais PBR com textura (pintura gasta com riscos/sujeira, ferrugem, madeira, lona, banda de pneu), UVs em caixa, chanfros e suavização por ângulo, peças juntadas por material (≤ 11 malhas por veículo), detalhes extras (sinalizador/antena/para-lamas/estribos/placas no Javali, lona ondulada e carga no Atlas, espelhos/escapamento/lona no Módulo). `assets-src/vehicles/` continua como fonte do gerador.
> - Só **Javali, Atlas e Módulo** entram na São Paulo Velha (`src/world/vehiclesPack.ts`, chamado por `src/core/game.ts` depois dos módulos da praça): props estáticos com colisor Havok em caixa, oclusão de câmera, sombras. Posições revistas contra o layout atual (viatura junto à fachada da Central a leste do portão; van em frente ao posto médico; triciclo no meio-fio diante da barraca do mercado). **Rastro e Janus não aparecem** no cenário; só no visualizador.
> - Visualizador `preview-veiculos.html` incluído no build (`vite.config.ts`), carregando de `public/assets/vehicles/`.
> - Testes: `node tools/validate-eva-vehicles.mjs` (5/5), `tests/assets/vehicles.test.ts` (validador Khronos, só 3 terrestres no mundo), `npm run test:vehicles` (carregamento, escala, apoio no chão, colisão andando contra cada veículo, sombras, draw calls, FPS; visualizador com captura por modelo). A/B em `docs/screenshots/veiculos/`.
> - Os modelos continuam **primeira versão/protótipo modular**: silhuetas simples (lofts de 8 lados), sem interiores, sem decalques. Próximo passe: modelagem mais rica em Blender (vincos, vidros com moldura, interiores, suspensão), texturas PBR fotográficas CC0.

**Branch de origem:** `feat/veiculos-janus`. **NÃO integrar cegamente enquanto houver trabalho não commitado em `main`**.

## Sequência recomendada
1. Fable concluir/commitar a tarefa visual em andamento na branch atual.
2. Ler `docs/VEICULOS_E_JANUS.md` e `docs/ARTE_VEICULOS_E_JANUS.md`.
3. Comparar `feat/veiculos-janus` com `main` e escolher cherry-pick/merge conforme mudanças; o pacote só adiciona arquivos, não deve sobrescrever `src/world/**`.
4. **Checar** os GLBs no visualizador Babylon/Blender antes de adicionar ao mundo (escala e orientação). Referência: arquivo `assets-src/vehicles/`; copiar para `public/assets/vehicles/` quando aprovar o resultado visual.
5. Inserir Javali, Atlas e Módulo como props via um novo helper `src/world/vehicles.ts` importado por `worldBuilder.ts`; colisores Havok estáticos simples, rodas imóveis, oclusão da câmera; manter a praça atravessável.
6. Rastro e Janus continuam **sem spawn** na praça inicial. Janus apenas texto/rádio opcional; não revelar nenhum segredo antes da missão correspondente.
7. Medir tempo de carregamento, triângulos, draw calls, FPS e captures. Testar desktop e modo toque (se disponível).
8. Documentar estado real em `docs/STATUS.md`; não dizer que missões com veículos existem quando apenas props foram integrados.

## APIs Babylon
```ts
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
const imported = await SceneLoader.ImportMeshAsync(
  "", "/assets/vehicles/", "javali_vb4.glb", scene
);
// Colocação: usar o nó raiz correto, posicionar no chão sem escala arbitrária;
// registrar colisores Havok simplificados no sistema existente.
```

## Dados de autoria
Os assets GLB dessa branch são malhas originais geradas proceduralmente como **primeira passagem de produção**; qualquer versão gerada posteriormente em Blender deve possuir manifesto de licença e arquivo-fonte. São permitidas comercialmente ao projeto EVA.

## Consequência narrativa e riscos
Ninguém pilota o Javali autonomamente por EVA. Aeromoto não voa sobre multidão. Janus não se conecta ao núcleo EVA. O relatório orbital é evidência histórica potencial, **não** resposta definitiva para o mistério da Ruptura.