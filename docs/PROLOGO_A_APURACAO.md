# CAPÍTULO 0 — A APURAÇÃO
Roteiro funcional do primeiro vertical slice (proposta 10–15 minutos).

## Contexto
**Ano 2072; São Paulo Velha, setor habitado do Arco da Continuidade.** Quarteirão de moradias recuperadas, pequenas oficinas, mercado, posto de distribuição, quadra escolar e acesso bloqueado a uma central de suprimentos. Água/energia são racionadas. Não há “cidade destruída por bomba”: a deterioração decorre de 15 anos de falhas de manutenção, abandono seletivo, incêndios locais e reaproveitamento.

## Personagens presentes na demonstração
- **Matias**, 58, ex-engenheiro do projeto EVA, protagonista controlável. Experiente, olhar crítico, culpa reprimida. Roupas utilitárias usadas, ferramentas e óculos. Referência de aparência privada do usuário, sem marcas.
- **Ana**, 15, filha de Matias; inteligente, independente e fiel à Igreja em parte. Nesta demonstração pode aparecer como NPC 3D na praça; não precisa haver sistema completo de companheira.
- **Raquel**, 40, médica da comunidade, dá contexto à necessidade do tratamento.
- **Miriam**, 36, arquivista religiosa da Apuração, acredita no valor da ordem, mas percebe inconsistências.
- **Custódio da praça**, figura de segurança com diálogo de advertência, sem combate obrigatório nesta etapa.

## Beats e gameplay

### 1. Acordar — Oficina de Matias (1–2 min)
Cena em interior jogável com objetos de trabalho e rádio dando boletim de recursos. Introduzir controle de câmera, andar, correr (quando apropriado), colisão e primeira interação física: desligar um rádio ou pegar cartão de registro. Frase introdutória por rádio: “O setor 17 deve apresentar registros para a Apuração das quinze horas.” Sem narração expositiva exagerada.

### 2. Percorrer o bairro (2–3 min)
Caminhada livre pela rua de São Paulo Velha; NPCs trabalhando (mínimo dois NPCs ativos e cenário de rua de escala crível). Um comerciante conversa sobre diferença entre a cota dos Registrados e a dos Vinculados. Tutorial contextual de agachar e observar áreas inacessíveis; preferir mundo pequeno, denso e habitado.

### 3. Raquel e Ana — Posto médico (2–3 min)
Raquel explica a condição de Ana sem fornecer diagnóstico definitivo (essa parte está em aberto no cânone). Um medicamento/terapia necessário não chegará ao bairro antes de semanas. Ana responde que a Apuração poderá mudar a prioridade. Diálogo com duas respostas; escolha altera a variável `matiasTrustsSystem`, sem decidir ainda a história.

### 4. A Apuração — Praça (3–4 min)
Pessoas aguardam relatório trazido por mensageiro humano, em papel/terminal local, NÃO recebido por EVA “via Wi-Fi”. Miriam anuncia cotas; tratamento de Ana fica com prioridade insuficiente por decisão administrativa. Mostrar discordância real entre cidadãos: alguns foram ajudados pelo sistema; outros não. O Custódio pede calma; sem combate automático.

### 5. A escolha — Começo do conflito (2–3 min)
Matias encontra indício de um carregamento no depósito da zona de distribuição. Jogador escolhe entre **buscar contestação oficial** ou **procurar Raquel em particular**. Ambas as escolhas levam a um objetivo plausível para o capítulo 1; nenhuma permite “hackear EVA remotamente”. Final em momento de tensão, não em tiroteio gratuito.

## Exemplo inicial de diálogo (PT-BR)
Miriam: “A cota do Setor Dezessete foi recalculada. Medicamentos de emergência permanecem reservados aos casos prioritários.”
Matias: “Quem definiu prioritário?”
Miriam: “O conselho de distribuição. Com base no relatório da Mãe.”
Matias: “Eu perguntei quem decidiu. Não quem assinou o relatório.”
Ana: “Pai... tem gente aqui esperando há mais tempo que eu.”
Raquel (baixo): “A fórmula não sabe o que fazer com alguém que não cabe nas categorias.”

Importante: as pessoas confundem relatório de EVA com decisão da administração. Matias percebe essa diferença.

## Regras de direção
- Não entregar um sermão anti-religioso; alternar utilidade real das previsões e injustiças humanas.
- Sem infodump expositivo de toda a cronologia no primeiro capítulo.
- Ana tem opiniões e agência.
- Não repetir a relação ou a personalidade de protagonistas de outras franquias.
- Zero marca AlwaysFit ou qualquer logotipo comercial nas roupas de Matias.
- Uma rua densa e animada vale mais que dez quilômetros de prédios vazios.

## Critérios de aceite de primeira iteração
A versão **M0 (primeiro commit jogável)** não precisa ter todos os cinco beats, mas precisa incluir:
1. Cena 3D com luz, chão, obstáculos e ao menos uma fachada urbana.
2. Matias ou humanoide temporário GLB **rigado** (e não plano com imagem) com idle/caminhada/corrida.
3. Controles WASD/mouse/Shift/C/E com colisão e câmera de terceira pessoa.
4. Ao menos um NPC 3D próximo ao posto de distribuição que fale em PT-BR, com legendas e escolha.
5. Estado de decisão salvo localmente após refresh.
6. Áudio e animações reais, ainda que de biblioteca licenciada e provisórios.
7. Build e, se ambiente permitir, teste automatizado e captura visual.

A versão **M1** fecha os cinco beats, troca placeholders e acrescenta voz/som/ambientação consistentes.
