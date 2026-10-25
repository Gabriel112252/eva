# Experimento A/B — Dark Strands → EVA (25/10/2026)

## Objetivo
Testar melhorias de **atmosfera** antes de transferir código externo para o projeto principal. O EVA já tem iluminação, SkyMaterial, neblina, IBL, sombras e pós-processamento. Não duplicar essas rotinas nem alterar gameplay, salvamento, física ou personagens.

### Origem e licença
- Projeto de referência: **[Dark Strands](https://github.com/VictorZakharov/dark-strands)**, por Victor Zakharov, 2026, licença **MIT**.
- Componentes estudados: `src/systems/weather.js`, `src/systems/rainFX.js`, `src/systems/daynight.js`.
- Contribuição: lógica de chuva próxima ao jogador, gradação atmosférica, efeitos opcionais por qualidade. **Reescrita/adaptação própria em TypeScript** para importar módulos `@babylonjs/core` ao invés de `babylonjs`, sem levar dependências de `CFG.GRID`, `terrain`, domicílios, timeScale nem infraestrutura de Dark Strands.
- Texto de licença original preservado em `docs/licenses/DARK_STRANDS_MIT.txt`. Não redistribuímos assets do Dark Strands; bibliotecas/fontes de terceiros são licenciadas separadamente.

## O que foi aplicado
- `src/world/atmosphereExperiment.ts`: material fotométrico de céu acinzentado, redução de intensidade do sol, aumento moderado de neblina, partículas de chuva com textura de gota procedural, taxa adaptada à qualidade `baixa/media/alta`.
- `src/core/game.ts`: ativação **somente quando o usuário inclui explicitamente** `?atmosfera=chuva` ou `?atmosfera=nublado` (sem parâmetro mantém experiência atual).
- `src/world/materials.ts` original **não foi alterado**. Quando chove, `mats.asphalt` e `mats.sidewalk` são temporariamente descongelados, ajustados para maior reflexividade e recongelados. Puddles já existem no mundo.
- Chuva suspensa na oficina de Matias: posição x -35…-25, z -14…-7, abaixo de 3,2 m; o sistema não detecta automaticamente todas as coberturas da cidade.
- O estado não persiste no save e não inventa meteorologia canônica; é apenas **laboratório visual**.

## Como testar
1. Na branch `exp/dark-strands-atmosfera`, executar `npm ci && npm run check`, depois `npm run dev`.
2. Em guias diferentes:
   - Original: `http://localhost:5173/?pointerlock=0&quality=media`
   - Nublado: `http://localhost:5173/?pointerlock=0&quality=media&atmosfera=nublado`
   - Chuva: `http://localhost:5173/?pointerlock=0&quality=media&atmosfera=chuva`
3. Se houver Playwright + Chromium: após `npm run build`, executar `node tools/compare-atmosfera.mjs` para gerar capturas do **mesmo ponto da praça**, saída `docs/screenshots/atmosfera/`. O script também registra FPS observados; não considerar resultado headless sem GPU equivalente a desempenho em máquina real.
4. Rodar `npm run typecheck && npm test && npm run build` e validar gameplay de oficina, cartão, praça, conversa, save, menus e celular. **Ainda não executados nesta sessão** porque GitHub connector oferece edição mas não execução de CI/Docker/browser remoto.

## Limitações e riscos
- Chuva é efeito de partículas localizado na câmera/jogador, sem superfícies de impacto, respingos reais, wetmaps ou acúmulo de água. Não afirmar realismo cinematográfico.
- Partículas podem atravessar outros telhados; apenas a oficina inicial suprime emissão enquanto o jogador está lá.
- Sombra/saturação cinzenta NÃO alteram geometria dos prédios; para sair do aspecto quadrado, investir em GLBs arquitetônicos, recortes de janelas, fachadas com profundidade e texturas PBR CC0.
- Condições atmosféricas automáticas/aleatórias **não fazem parte do escopo**: uma missão dramática necessita hora e condições previsíveis.
- Alvo: FPS base não reduzir mais de 15% em desktop com qualidade média e celular sem travamentos; se pior, reduzir `capacity`/`emitRate` ou deixar desligado.
- Todo commit para `main` deve vir após a integração dos veículos/arte do Fable para evitar conflito na montagem da cena.

## Aprovação
Aceitar se a cena nublada/chuvosa parecer mais crível, com elementos legíveis, e nenhum erro de console ou regressão de mecânica; rejeitar se esconder o visual quadrado, aumentar artefatos ou reduzir FPS injustificadamente.
