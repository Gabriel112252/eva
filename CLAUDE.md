# CLAUDE.md — Orientações para Claude Code/Fable

Você é o engenheiro líder de um jogo **3D de navegador**. Não substitua jogo por slideshow, vídeos, imagens estáticas ou páginas HTML com botões falsos. A interface HTML serve apenas aos menus/HUD; o mundo e os personagens devem estar em Babylon.js.

## Leia primeiro
1. `docs/UNIVERSO_CANONICO.md` — única fonte de verdade para história e regras.
2. `docs/PROLOGO_A_APURACAO.md` — cena inicial e personagens.
3. `docs/ARQUITETURA.md` — stack, assets, performance e critérios.

## Missão imediata
Criar, no repositório existente, um protótipo real de jogo 3D com **Babylon.js + TypeScript + Vite + Havok**, controlando **Matias** em terceira pessoa dentro de um setor habitado de **São Paulo Velha**. O repositório ainda não possui engine, logo comece pela inicialização e build. Crie código modular, testável e rode os comandos de validação.

### Primeiro marco M0
- Cena urbana 3D com geometria, colisão e iluminação.
- Personagem humanoide 3D rigado com idle/walk/run, câmera em terceira pessoa, WASD/mouse, Shift, Ctrl/C e E.
- Pelo menos um NPC 3D com interação, diálogo PT-BR com voz real/arquivo ou substituto provisório claramente identificado, legendas e escolha que persiste em IndexedDB.
- Ambiente plausível e habitado com áudio de rua e efeitos simples.
- README com comandos, origem/licenças dos assets, limitações e prova de build/testes.
- Dockerfile multi-stage para servir estáticos no Easypanel após build.

## Não faça
- Não usar Unreal Engine, Unity, Phaser, Three.js, React Three Fiber nem Pixel Streaming como engine deste projeto; manter Babylon.js.
- Não fazer “projeto AAA inteiro” antes de validar personagem caminhando e falando.
- Não substituir modelo rigado por foto plana/billboard/sprite; não declarar como finalizado se não existir GLB real.
- Não inventar sons, atores, arquivos, diálogos com áudio que não existam; reportar faltas com clareza.
- Não alterar fatos canônicos nem revelar segredos ainda não decididos.
- Não espalhar assets protegidos por copyright de outros games; licenças explícitas.
- Não colocar marcas comerciais na roupa do personagem ou fotos pessoais brutas no repositório.
- Não adicionar serviços pagos ou pedir chaves sem necessidade; MVP sem backend.

## Qualidade
Começar por **jogabilidade comprovável**. Executar `npm install`, `npm run build`, validação TypeScript e testes. Testar com navegador e screenshots quando houver capacidade; não afirmar que testou visualmente sem ter executado. Corrigir erros antes de commitar. Anotar trabalho pendente em `docs/STATUS.md`.

## GitHub
Trabalhar no repositório `Gabriel112252/eva`. Preservar arquivos canônicos. Realizar commits pequenos e descritivos; push para `main` se permissões e ambiente permitirem. Não fazer alterações em repositórios externos.
