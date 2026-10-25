# MANUAL FABLE — INTEGRAÇÃO DO PACOTE SEM CONFLITOS

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