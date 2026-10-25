# EVA — DIREÇÃO ARTÍSTICA / PACOTE VEÍCULOS E JANUS

## Entregáveis
Quatro GLBs de veículos **originais** (`javali_vb4.glb`, `atlas_t3.glb`, `modulo_v7.glb`, `rastro_av4.glb`) e uma miniatura orbital (`janus_station.glb`). Todos são **geometria real, não cards ou imagens planas**. Primeira iteração de modelagem modular, NÃO assets foto-realistas finais.

**Prioridade:** melhorar formas e silhuetas que estão quadradas na screenshot. Não mascarar geometrias pobres com filtro de cor, bloom, fumaça ou imagem de fundo.

### Paleta e linguagem
- Javali: verde escuro #38433d, preto de pneu, metal semibrilhante, cobre fosco #a88646, âmbar nos faróis.
- Atlas: tinta azul desbotada, ferrugem controlada, madeira escurecida, borracha usada, lona em tom areia.
- Módulo: esmalte bege-acinzentado e painéis verde-oliva reaproveitados, borrachas, lataria envelhecida; grandes superfícies com divisões reais.
- Rastro AV-4: metal escovado escuro, proteção de turbinas, cobre/âmbar somente em acentos; hélices reais em dutos, sem voo milagroso.
- Janus: módulos cinza-claro com detalhes térmicos dourados, painéis azul-solar, antenas, anéis, radiadores; estilo de engenharia, não nave de fantasia.

### Tamanho/orientação/otimização
- Metros reais; glTF 2.0 Y-up, **frente do veículo = +Z**, chão Y=0, origem no centro do veículo no plano do chão. Nenhuma física dentro do GLB.
- Submalhas nomeadas por peça (chassi, carroceria, portas, rodas, rotor, painel etc.). Separar rodas para animação opcional; criar limites de colisão em Havok **fora** do GLB.
- PBR glTF com fatores baseColor, roughness, metallic; fase seguinte texturas PBR fotográficas sob licença, sem mapas 2D falsos.
- Metas iniciais: cada veículo ≤ 200k triângulos; miniatura Janus ≤ 250k, idealmente muito menos. Alvo de download baixo (arquivo GLB compactado, meshes reutilizáveis/instâncias).
- Matias/roupa NÃO recebem logotipos AlwaysFit ou de marcas reais. Sinais da Igreja devem ser originais.

### Posições de partida em São Paulo Velha
- VB-4 Javali: rua lateral externa ao portão da Central de Suprimentos; evitar obstruir postos, NPCs, acionadores ou a fila.
- T-3 Atlas: junto à banca/rua comercial e oficina; manter rota de circulação do jogador.
- V-7 Módulo: área de descarga afastada da praça pública, perto de armazém.
- AV-4 Rastro: fora do trecho acessível (doca de manutenção fechada) ou **somente visão distante/rádio** na M1.1. Nada de veículo pairando continuamente em meio às pessoas.
- Miniatura Janus: arquivo para futuro painel, observatório ou menu; não renderizar objeto orbital em escala real sobre a praça.

### Entrega de integração para Fable
1. Ler `docs/VEICULOS_E_JANUS.md` e este documento antes de tocar na cena. Respeitar `docs/UNIVERSO_CANONICO.md`.
2. **Importar só Javali/Atlas/Módulo** nesta etapa visual, primeiro em sandbox de teste. Guardar Rastro/Janus como assets disponíveis, não instanciar no gameplay inicial por padrão.
3. Usar `SceneLoader.ImportMeshAsync` com `@babylonjs/loaders/glTF`; importar uma vez e criar instâncias/clones de acordo com capacidade do renderer.
4. Escalas em metros (não aumentar modelo arbitrariamente): Javali ~4,65m; Módulo ~5,2m; Atlas ~2,5m.
5. Colisores simplificados separados do mesh renderizado, por exemplo caixas compostas e cilindros; NÃO aplicar Havok TriMesh dinâmico em cada componente decorativo.
6. Criar flags `visible`, `collision`, `audio` em metadata de colocação para testes. Não trocar comportamento de câmera/NPCs.
7. Testes: glTF validator; Babylon NullEngine carrega GLB; capturas screenshot A/B do mesmo ângulo; medir FPS desktop/mobile; confirmar que jogo permanece jogável.
8. Registrar assets de fonte própria em `public/assets/licenses/ASSETS.md` ao integrar, não inventar licenças de terceiros.
9. Se as formas parecem simples demais, dizer **“protótipo modular”**, não “Warframe AAA”. Substituir por modelagem Blender refinada e texturas PBR na revisão.

### História visual do colapso
Veículos de 2072 mostram **quinze anos de manutenção e cadeia de suprimentos degradada**, não décadas de destroços após bombardeios. Viatura de Igreja limpa nas zonas privilegiadas, Atlas com reparos artesanais, Módulo com peças de pintura mista; diferença de recursos visível.

### Aceite
Uma captura da praça deve mostrar os veículos integrados com escala, iluminação, sombras e colisões corretas. Gameplay original mantém 30+ testes e mesmos comandos. Nenhum recurso paid, serviço externo ou crédito Kairogen é permitido nesta etapa sem nova autorização explícita.