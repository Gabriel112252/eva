# O Último Veto — EVA

Jogo **3D narrativo para navegador**, com exploração em terceira pessoa, mistério tecnológico e drama político/religioso no Brasil de 2072.

> **Estado:** protótipo **M0 jogável** do prólogo *A Apuração* (São Paulo Velha, Setor 17). Detalhes, pendências e assets provisórios em [`docs/STATUS.md`](docs/STATUS.md).

![Praça do Setor 17](docs/screenshots/06-praca.jpg)

## Identidade

- **Protagonista:** Matias (apenas Matias), engenheiro de segurança e ex-colaborador do projeto EVA.
- **Tema:** uma inteligência artificial fisicamente isolada se torna objeto de adoração por comunidades humanas após um colapso de infraestrutura.
- **Tom:** realista, dramático, investigativo e moralmente ambíguo. **Não** copiar personagens ou história de *The Last of Us*.
- **Mundo:** não é um deserto de ruínas. Existem cidades ativas, comércio, agricultura, eletricidade em parte dos territórios, religião, castas e disputas políticas.
- **Primeira missão:** **A Apuração**, em São Paulo Velha.

## Stack

- **Babylon.js 9** + **TypeScript** (estrito) + **Vite 8** — WebGL 2.
- **Havok** (`@babylonjs/havok`, WASM) — física, colisão e `PhysicsCharacterController`.
- **glTF/GLB** — personagens rigados (rig Mixamo, 52 ossos) gerados em Blender headless a partir de dados CC0 do MakeHuman (`tools/blender/make_character.py`), com animações reais da **Quaternius Universal Animation Library** (CC0) retargeteadas por `tools/blender/retarget.py`.
- **Web Audio** — áudio espacial (HRTF), passos, ambiente, interface; **Web Speech API** como voz provisória.
- **IndexedDB** — salvamento local com esquema versionado.
- **Vitest** (lógica, GLB, física headless) + **Playwright/Chromium** (teste visual com screenshots).
- **Docker** (Node build → Nginx) — pronto para Easypanel.

## Executando

```bash
npm install          # Node 20+ (testado com Node 22)
npm run dev          # http://localhost:5173
```

Build de produção e pré-visualização:

```bash
npm run build        # gera dist/
npm run preview      # http://localhost:4173
```

Parâmetros opcionais na URL: `?quality=baixa|media|alta` força a qualidade gráfica (ex.: `http://localhost:5173/?quality=baixa` em máquinas fracas); `?pointerlock=0` nunca trava o cursor (câmera por arrasto do mouse); `?touch=1|0` força/desliga os controles de toque.

### Controles

| Tecla | Ação |
| --- | --- |
| Mouse | Câmera (clique na cena para travar o cursor; se o navegador recusar — p. ex. dentro de um iframe — arraste com o botão esquerdo) · roda = distância |
| W A S D / setas | Andar |
| Shift | Correr |
| C (alterna) · Ctrl (segurar) | Agachar |
| E | Interagir (rádio, cartão, NPCs) |
| Espaço / Enter | Avançar fala |
| 1–4 · setas + Enter · clique | Escolher resposta |
| Tab | Mostrar descrição da missão |
| Esc | Pausa (salvar, opções, voltar ao menu) |

**Celular/tablet** (detectado automaticamente; `?touch=1` força, `?touch=0` desliga): joystick virtual flutuante na metade esquerda da tela (empurrar até a borda = correr), arrastar na metade direita gira a câmera, botões **E** (interagir — acende quando há algo à frente), **Agachar** (alterna), **Correr** (trava) e **Pausa**; toque curto na tela avança as falas; tocar no objetivo mostra a descrição da missão. Sem configuração salva, o celular começa em qualidade **baixa** (mude em Opções). Jogue na horizontal; o navegador tenta entrar em tela cheia ao iniciar.

### Validação

```bash
npm run typecheck         # tsc --noEmit
npm test                  # 30 testes (Vitest): GLB, Havok headless, diálogo, missões, save, áudio, joystick
npm run build
npm run check             # os três acima
npm run test:visual   # abre dist/ em Chromium headless (teclado + mouse), joga o fluxo e salva docs/screenshots/*.jpg
npm run test:touch    # emula um celular na horizontal (só toques) e salva docs/screenshots/1x-celular-*.jpg
```

Os testes em navegador precisam do Playwright com Chromium (`npm i -D playwright && npx playwright install chromium`, ou um Playwright global). Sem GPU eles usam SwiftShader (poucos FPS, mas o fluxo completo é verificado). O teste visual abre o jogo com `?pointerlock=0` porque, no Chromium headless com SwiftShader, o pointer lock ativo deixa cada frame 5–10× mais lento (artefato do ambiente); `--lock` testa o caminho com cursor travado.

### Regenerar os personagens

```bash
/usr/bin/python3.11 -m pip install bpy==4.5.1   # Blender como módulo Python (Python 3.11)
npm run assets:characters      # Blender headless: morfa, veste, retargeteia as animações e escreve public/assets/characters/*.glb + characters.json; valida (Khronos)
npm run assets:preview         # renderiza docs/screenshots/characters/matias_*.jpg (Cycles)
npm run capture:video          # grava docs/videos/locomocao.mp4 (andar/correr/agachar/pegar) com quadros determinísticos a 30 fps e mede o deslizamento dos pés
```

Os dados-fonte (malha hm08, targets, rig Mixamo, máscaras, olhos) são CC0 do MakeHuman, vendorizados em `tools/blender/data/makehuman/`. As animações vêm da Quaternius Universal Animation Library v3 Standard (CC0, `assets-src/animations/`); o retarget (`tools/blender/retarget.py`) alinha quadros canônicos por osso e transfere as rotações no espaço do mundo, então funciona apesar das poses de descanso e proporções diferentes. Para usar outra animação da biblioteca, acrescente-a a `GAME_CLIPS` e a `ANIMATION_CLIPS`.

## Docker / Easypanel

```bash
docker build -t eva-game .
docker run --rm -p 8080:80 eva-game    # http://localhost:8080
```

No Easypanel: serviço do tipo *App* apontando para este repositório com build por **Dockerfile**; porta interna **80**. O servidor é estático (Nginx), sem backend, sem variáveis de ambiente obrigatórias.

## Estrutura

```text
public/assets/characters/   GLB rigados (humanos MakeHuman CC0 + animações UAL CC0) + manifesto
assets-src/animations/      fonte das animações (Quaternius UAL Standard, CC0) e mapeamento
public/assets/licenses/     ASSETS.md — origem e licença de cada asset
src/core/                   boot, loop, input, configurações, orquestração (game.ts)
src/world/                  materiais e texturas procedurais, rua, prédios, oficina, praça, props, luz/céu
src/physics/                carregamento do Havok
src/player/                 controlador de personagem (Havok) e câmera em terceira pessoa
src/characters/             carregamento de GLB, animador (cross-fade), NPC
src/narrative/              flags, diálogos, missões
src/data/                   diálogos PT-BR, missões, metadados de personagens
src/audio/                  motor Web Audio, sintetizador de sons, voz
src/ui/                     HUD, menus e controles de toque
src/persistence/            IndexedDB e sistema de save
tests/                      unit, assets, integration (física headless)
tools/                      gerador de personagens + retarget, validador, testes em navegador (visual e toque), captura de vídeo
docs/                       bíblia canônica, prólogo, arquitetura, STATUS, screenshots
```

## Documentos de produção

- [Bíblia canônica](docs/UNIVERSO_CANONICO.md)
- [Prólogo A Apuração](docs/PROLOGO_A_APURACAO.md)
- [Arquitetura e pipeline de assets](docs/ARQUITETURA.md)
- [Status e pendências](docs/STATUS.md)
- [Manifesto de assets e licenças](public/assets/licenses/ASSETS.md)
- [Regras para agentes de código](CLAUDE.md)

## Assets e licenças

Os personagens são gerados pelo próprio projeto a partir de dados CC0 (MakeHuman) e animados com a Quaternius Universal Animation Library (CC0). Continuam **provisórios**: pele/cabelo/roupa procedurais, texturas e sons procedurais, voz por síntese do navegador. Nenhuma marca comercial nas roupas; a foto de referência do criador não está no repositório. Veja [`public/assets/licenses/ASSETS.md`](public/assets/licenses/ASSETS.md) para a tabela completa e [`docs/STATUS.md`](docs/STATUS.md) para as ferramentas externas previstas para substituí-los (Blender, Mixamo, Poly Haven, dublagem).
