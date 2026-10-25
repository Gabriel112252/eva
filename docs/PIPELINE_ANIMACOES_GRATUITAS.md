# Pipeline gratuito — animações, artes e vozes (M1)
**Decisão de produção — 25/10/2026.**
Orçamento autorizado nesta etapa: **R$ 0**. **Não** gastar créditos Kairogen nem contratar serviços; nenhum consentimento para cobrança foi dado.

## Situação
O projeto já tem seis GLBs MakeHuman CC0 com rig Mixamo de **52 ossos**, gerados em `tools/blender/make_character.py`, com os nomes de clips `Idle`, `Walk`, `Run`, `CrouchIdle`, `CrouchWalk`, `Talk`, `Interact`. Movimentos atuais ainda são procedurais/placeholder. O objetivo é substituir animação, preservando controlador e compatibilidade do jogo.

## Fonte gratuita prioritária: Quaternius Universal Animation Library
- Fonte original: https://quaternius.itch.io/universal-animation-library
- Site do artista: https://quaternius.com/packs/universalanimationlibrary.html
- 120+ movimentos, rig universal, retargetável inclusive para rigs Mixamo, **CC0**; uso comercial permitido.
- Versão **Standard gratuita** disponível no itch.io (sem pagar). Download pode exigir navegação interativa no site.
- Pacote atualizado em 2026; autor informa correção de exportação **30 FPS** em fev/2026 e root motion em jun/2026. Verificar FPS e duração dos clips efetivamente baixados.
- Usar versão **in-place / sem Root Motion** para locomoção controlada pela física de Havok; senão compensar root translation e evitar deslizar/teleportar.

### Como obter sem depender de credenciais do usuário
1. Agente tenta baixar o pacote Standard do **site original** com acesso permitido. Não acessar mirrors não autorizados, nem ferramentas para contornar login, pagamento ou proteção.
2. Se o download estiver bloqueado por rede/interação, não declarar sucesso. Deixar instruções curtas ao usuário para enviar apenas **um ZIP** Standard.
3. Como segunda fonte, Mixamo oficial https://www.mixamo.com/ (Adobe ID exigido, gratuito para jogos comerciais segundo https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html); caso usado, exportar FBX Without Skin, 30 FPS.
4. Opcional e com verificação de licença de cada recurso: https://app.cinevva.com/tools/animations oferece interface web de retargeting com biblioteca CC0, porém a política de exportação pode variar por plano.

## Mapeamento necessário
| Clip alvo no jogo | Ação procurada na biblioteca |
| --- | --- |
| Idle | Standing idle (loop) |
| Walk | Walk forward in place (loop) |
| Run | Run forward in place (loop) |
| CrouchIdle | Crouch idle ou pose de agachado (loop) |
| CrouchWalk | Crouch walk in place (loop) |
| Talk | Gesture/Talking (loop suave; movimento corporal, não lip-sync) |
| Interact | Pick up / interact (one-shot) |

O pedido original continha oito nomes Mixamo, mas “Idle” e “Standing Idle” são equivalentes; **sete clipes finais** bastam para as transições existentes, desde que `Interact` contemple pegar objetos. Não duplicar assets para inflar contagem.

## Retarget Blender → GLB
- Preservar escala (1 unidade = 1 m), origem no chão, personagem voltado no eixo esperado pelo jogo, sem deslocamento horizontal espúrio em clips in-place.
- Rig atual: verificar nomes exatos dos ossos em `public/assets/characters/characters.json` e em `tools/blender/make_character.py`; **não assumir** apenas 17 ossos, agora são 52.
- Ao importar FBX ou GLB do fornecedor, construir mapa de ossos por hierarquia/t-pose, converter rotações de repouso e retargetear para cada personagem, aplicando/"baking" as animações ao rig destino.
- Exportar GLB 2.0 com os mesmos nomes de animação usados pelo runtime; manter meshes e materiais atuais até aprovar o novo movimento.
- Validar exportação Khronos, carregamento por Babylon.js, intervalos de clipes, ausência de jitter, transições, contato dos pés, agachamento sem flutuar, cabeça e braços alinhados, performance desktop/mobile.
- Renderizar **antes/depois** em dois ângulos e capturar animação em movimento (gravação WebM/MP4 de 5–10 s, se possível); screenshots paradas não comprovam fluidez.
- Criar ou estender teste automatizado para todos os clips e bones essenciais, mas também conferir visualmente; sucesso em testes unitários não garante movimento natural.
- Manter arquivos-fonte em `assets-src/animations/` e GLBs finais em `public/assets/characters/`, se compatível com o pipeline atual.
- Registrar arquivos, procedência, autor e licenças em `public/assets/licenses/ASSETS.md`.

## Arte — orçamento zero
- Não usar kits pagos nem créditos de serviços sem aprovação expressa.
- Priorizar MPFB/MakeHuman CC0, Blender, Quaternius CC0, texturas Poly Haven CC0 e ambientCG CC0 e modelos próprios.
- Não confundir “realismo” com densidade geométrica: melhorar primeiro silhueta, cabelo, roupa, materiais de pele, iluminação, normal maps e animações.
- Se assets gratuitos não alcançarem a qualidade desejada, apontar a diferença com render e necessidades concretas antes de propor compras.
- Foto de referência do criador é privada; não enviar para provedores externos nem commitar.

## Vozes PT-BR
- O usuário ainda **não autorizou** gasto de créditos Kairogen; não consumir API, créditos, nem recursos pagos. Manter Web Speech API como fallback.
- Preparar manifesto de 45 falas com `id`, `speaker`, texto canônico, emoção/intenção, nome de arquivo, duração prevista e `voice` referenciando arquivo se ele existir.
- Pré-definir uma voz consistente por personagem. Respeitar variação emocional e evitar regravar sem aprovação do roteiro.
- Permitir adicionar `.ogg` ou `.mp3` licenciados em `public/assets/audio/voice/pt-BR/`; testar legendas sincronizadas e autoplay de navegador.
- Se um serviço exigir créditos, **pedir autorização explícita antes de usar** e estimar quantos créditos e quanto custa.

## Critérios de conclusão
Não declarar “animação realista integrada” até ter arquivos reais (origem auditável), retarget executado, personagens reexportados, build validado e vídeo de movimento inspecionado. Se houver bloqueio de acesso, documentar exatamente o que falta sem culpar o jogador por baixar manualmente.

## Resultado (25/10/2026)

- **Obtenção**: o ambiente de build não alcança itch.io; o download gratuito foi feito pelo navegador do computador do criador (site oficial, sem login/pagamento) e o ZIP enviado ao projeto. Arquivo: `Universal Animation Library[Standard].zip` (15 MB, v3 de 16/06/2026), licença CC0 confirmada em `License.txt`. Mantido só `assets-src/animations/ual-standard/standard/Unreal-Godot/UAL1_Standard.glb` (in-place) + licença/README.
- **Rig da biblioteca**: 65 juntas com nomes estilo Unreal (`pelvis`, `spine_01..03`, `neck_01`, `Head`, `clavicle_l`, `upperarm_l`, `lowerarm_l`, `hand_l`, dedos `index/middle/ring/pinky/thumb_01..03` + folhas, `thigh/calf/foot/ball`), T-pose, 30 fps, 43 animações; todas com canais de posição/rotação/escala amostrados.
- **Retarget** (`tools/blender/retarget.py`, chamado por `make_character.py`): mapa de 52 ossos; para cada osso, quadro canônico (direção anatômica até a junta filha + referência mundial frente/cima) nos dois rigs → alinhamento `S_can·T_can⁻¹`; a rotação relativa de cada osso é transferida no espaço do mundo (`S_pose·S_rest⁻¹·align·T_rest`), independente de roll e proporções; translação do quadril escalada pela altura do quadril; último quadro duplicado dos loops removido. 8 clipes: Idle, Walk, Run (`Jog_Fwd_Loop`), CrouchIdle, CrouchWalk, Talk, Interact e PickUp (`PickUp_Table`, cartão).
- **Pés**: velocidades naturais medidas pelo pé apoiado (Walk 0,98 m/s, Jog ≈5,6 m/s, Crouch 0,70 m/s); o jogo reproduz os clipes a `velocidade real / (natural × altura/1,80)` e as velocidades passaram a andar 1,3 / correr 4,6 / agachado 0,8 m/s. Métrica de deslizamento no vídeo (`npm run capture:video`): pé apoiado parado no chão.
- **Validação**: Khronos (0 erros), Babylon headless (31 testes; um deles falha se os clipes procedurais voltarem ao build), teste visual e de toque, folhas antes/depois (`docs/screenshots/characters/`) e vídeo `docs/videos/locomocao.mp4`.
- **Vozes**: nada gerado; Web Speech API continua como fallback (sem créditos consumidos).
