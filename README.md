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
- **glTF/GLB** — personagens rigados com animações esqueléticas (placeholders gerados por `tools/gen-character.mjs`).
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

Parâmetro opcional: `?quality=baixa|media|alta` força a qualidade gráfica (ex.: `http://localhost:5173/?quality=baixa` em máquinas fracas).

### Controles

| Tecla | Ação |
| --- | --- |
| Mouse | Câmera (clique na cena para travar o cursor) · roda = distância |
| W A S D / setas | Andar |
| Shift | Correr |
| C (alterna) · Ctrl (segurar) | Agachar |
| E | Interagir (rádio, cartão, NPCs) |
| Espaço / Enter | Avançar fala |
| 1–4 · setas + Enter · clique | Escolher resposta |
| Tab | Mostrar descrição da missão |
| Esc | Pausa (salvar, opções, voltar ao menu) |

### Validação

```bash
npm run typecheck         # tsc --noEmit
npm test                  # 26 testes (Vitest): GLB, Havok headless, diálogo, missões, save, áudio
npm run build
npm run check             # os três acima
npm run test:visual   # abre dist/ em Chromium headless, joga o fluxo e salva docs/screenshots/*.jpg
```

O teste visual precisa do Playwright com Chromium (`npm i -D playwright && npx playwright install chromium`, ou um Playwright global). Sem GPU ele usa SwiftShader (poucos FPS, mas o fluxo completo é verificado).

### Regenerar os personagens provisórios

```bash
npm run assets:characters      # escreve public/assets/characters/*.glb + characters.json
node tools/validate-characters.mjs   # validador glTF da Khronos
```

## Docker / Easypanel

```bash
docker build -t eva-game .
docker run --rm -p 8080:80 eva-game    # http://localhost:8080
```

No Easypanel: serviço do tipo *App* apontando para este repositório com build por **Dockerfile**; porta interna **80**. O servidor é estático (Nginx), sem backend, sem variáveis de ambiente obrigatórias.

## Estrutura

```text
public/assets/characters/   GLB rigados (placeholders) + manifesto
public/assets/licenses/     ASSETS.md — origem e licença de cada asset
src/core/                   boot, loop, input, configurações, orquestração (game.ts)
src/world/                  materiais e texturas procedurais, rua, prédios, oficina, praça, props, luz/céu
src/physics/                carregamento do Havok
src/player/                 controlador de personagem (Havok) e câmera em terceira pessoa
src/characters/             carregamento de GLB, animador (cross-fade), NPC
src/narrative/              flags, diálogos, missões
src/data/                   diálogos PT-BR, missões, metadados de personagens
src/audio/                  motor Web Audio, sintetizador de sons, voz
src/ui/                     HUD e menus
src/persistence/            IndexedDB e sistema de save
tests/                      unit, assets, integration (física headless)
tools/                      gerador/validador de personagens, teste visual
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

Todos os assets atuais são gerados pelo próprio projeto (CC0) e são **provisórios**: manequins rigados, texturas e sons procedurais, voz por síntese do navegador. Nenhuma marca comercial nas roupas; a foto de referência do criador não está no repositório. Veja [`public/assets/licenses/ASSETS.md`](public/assets/licenses/ASSETS.md) para a tabela completa e [`docs/STATUS.md`](docs/STATUS.md) para as ferramentas externas previstas para substituí-los (Blender, Mixamo, Poly Haven, dublagem).
