# ARQUITETURA DO JOGO WEB 3D — EVA

## Objetivo verificável
Um jogo 3D **nativo de navegador**, jogável em desktop, com movimento real, NPCs 3D animados, áudio, câmera em terceira pessoa e diálogos PT-BR. Não é slideshow, cutscene pré-renderizada contínua, vídeo com hotspots ou uso de imagens planas como personagens.

## Stack
- **TypeScript** estrito + **Vite**
- **Babylon.js** modular: `@babylonjs/core`, `@babylonjs/loaders`, e componentes auxiliares somente se necessários.
- **Havok/WASM** `@babylonjs/havok` para física, colisão e personagem. Verificar compatibilidade e fallback sem física avançada para browsers sem SIMD.
- **glTF 2 / GLB** para cenário, humanoides rigados, props e animações. Texturas PBR, atlas, compressão KTX2/Basis quando aplicável; não assumir suporte universal a WebGPU.
- **Web Audio** ou **Howler.js** para diálogos dublados, som ambiental e SFX. Respeitar desbloqueio de áudio por interação e controle de volume.
- **IndexedDB** para saves locais (estado de missão, flags, inventário, configurações). Versão de schema e migração.
- **Vitest** para componentes puros; **Playwright** ou equivalente para testes reais no navegador; `tsc --noEmit`, `npm run build`.
- **Deploy**: Vite gera `dist`; Docker multi-stage Node build + Nginx servindo `dist`, pronto para Easypanel. Sem backend na demo.

## Estrutura sugerida
```text
public/assets/
  characters/       # humanoides .glb, animações
  environments/     # módulos urbanos, ruínas, props e terreno
  audio/            # music, ambience, sfx, voice/pt-BR
  ui/               # ícones, fontes, retratos licenciados
  licenses/         # origem/licença de cada asset
src/
  core/             # boot, game loop, estados de jogo, carregamento
  scenes/           # bootstrap, prologue, menu
  player/           # controller, câmera, locomotion, interactions
  world/            # colisões, streaming, iluminação, triggers
  characters/       # NPC, animation graph, lip sync (progressivo)
  narrative/        # diálogos, escolhas, flags, quest state
  audio/            # spatial audio, music state, voice
  ui/               # HUD, legenda, acessibilidade
  persistence/      # saves IndexedDB
  data/             # diálogos, missões e localizações PT-BR
tests/
docs/
```

## Controlador e sensação de jogo
- Third-person sobre o ombro com mouse para girar câmera; WASD para direção; Shift correr; Ctrl/C agachar; E interagir; Esc menu; joystick/touch futuramente.
- Posição do personagem determinada por controlador físico; colisão com chão, paredes e props. Câmera com suavização e obstrução, sem atravessar paredes.
- Modelo humanoide GLB com rig e animações reais de idle / walk / run / crouch / turn / interact (quando disponíveis), transições sem teleportes.
- Interações por raycast/trigger de proximidade + indicação contextual; UI não pode falsificar um mundo que não existe.
- NPCs com idle e reação por AnimationGroup; primeiro diálogo com voz em PT-BR e legendas.
- Áudio com espacialização/oclusão simplificada, mixagem e opção de desativar/ajustar.

## Pipeline artístico (HONESTIDADE OBRIGATÓRIA)
1. **Concept art**: referências visuais 2D (inclusive geradas por IA) para Matias, roupas, cenário e iluminação.
2. **Modelo 3D real**: criar/importar modelos `.glb` em Blender, Asset Store ou bibliotecas livres licenciadas; não presumir que imagem 2D produz malha 3D.
3. **Rigging e clips**: Blender, Mixamo ou outro com licença comercial apropriada; padronizar skeleton, escala, orientação e nomes.
4. **Materiais/iluminação**: PBR com mapa de normal e roughness, tonemapping, iluminação coerente com recursos.
5. **Som/vozes**: compor/gravar/adquirir os arquivos reais, registrar licença; som sintetizado simples de navegador pode servir TEMPORARIAMENTE para comprovar fluxo, mas não é “dublagem profissional”.
6. **Optimização**: targets de triângulos, LOD, instâncias, frustum culling, texturas comprimidas, lazy loading e análise de performance.
7. **Manifesto**: `public/assets/licenses/ASSETS.md` com caminho, autoria, fonte, licença, atribuição e observação de uso comercial.

**Não baixar cópias piratas**, conteúdo de outros jogos, assets com autoria incerta ou bibliotecas sem licença para redistribuição. Não inventar arquivos inexistentes. A fotografia pessoal do criador é referência **privada**: não commitar foto original no repositório nem serviços públicos sem sua autorização.

## Regras de interface e performance
- UI mínima, legível, contextual: HUD discreto, legendas PT-BR, escolhas dialogais, pause, configuração de sensibilidade de mouse e volumes.
- Progressive enhancement: WebGL 2 como alvo inicial; WebGPU quando disponível e estável. Detectar capacidade GPU; qualidade baixo/médio/alto.
- Loading real com progresso, mensagens de erro específicas quando faltar asset, fallback de cena de testes REAL 3D (não foto).
- Marco inicial: desktop Chrome/Edge moderno, resolução 1080p, alvo 30–60 FPS conforme hardware, validar com métricas e não prometer FPS universal.
- Áudio e vídeo em arquivos reais, reduzidos/streaming; primeira missão planejada para download inicial moderado.

## Sem infraestrutura desnecessária
Primeira entrega funciona offline após carregamento dos arquivos e salva localmente. Não implementar cadastro, autenticação, pagamentos, multiplayer, IA generativa em runtime, serviços externos obrigatórios nem armazenamento de dados pessoais.

## Check de aceite técnico
- `npm install`, `npm run dev`, `npm run build` executam sem erro em ambiente compatível;
- um humanoide 3D visível movimenta-se de fato em cenário 3D com colisão, câmera e animações;
- pelo menos um NPC realmente existe na cena e pode ser abordado;
- conversa PT-BR com legendas e áudio reproduzível e botão de mute;
- flag da escolha aparece em save e persiste após recarregar;
- documentação registra assets reais e pendências, sem declarar concluído o que não foi implementado.
