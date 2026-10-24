# O Último Veto — EVA

Jogo **3D narrativo para navegador**, com exploração em terceira pessoa, mistério tecnológico e drama político/religioso no Brasil de 2072.

> **Estado:** pré-produção / início do prólogo. Ainda não existe build jogável.

## Identidade

- **Protagonista:** Matias (apenas Matias), engenheiro de segurança e ex-colaborador do projeto EVA.
- **Tema:** uma inteligência artificial fisicamente isolada se torna objeto de adoração por comunidades humanas após um colapso de infraestrutura.
- **Tom:** realista, dramático, investigativo e moralmente ambíguo. **Não** copiar personagens ou história de *The Last of Us*.
- **Mundo:** não é um deserto de ruínas. Existem cidades ativas, comércio, agricultura, eletricidade em parte dos territórios, religião, castas e disputas políticas.
- **Primeira missão:** **A Apuração**, em São Paulo Velha.

## Stack escolhida

- **Babylon.js** + **TypeScript** + **Vite** — jogo web 3D executado no navegador (WebGL com WebGPU quando estável e disponível).
- **Havok** — física, colisões e controle de personagem.
- **glTF/GLB** — modelos rigados e animações; Blender e bibliotecas licenciadas para produção de assets.
- **Web Audio / Howler** — ambiente sonoro, efeitos, falas.
- **IndexedDB** — salvamento local offline.
- **Vitest** e testes de navegador quando disponíveis.
- **Docker** com servidor estático — deploy futuro no Easypanel.

Não usar Unreal/Pixel Streaming nesta primeira implementação: a intenção é jogo web nativo, sem GPU dedicada no servidor.

## Documentos de produção

- [Bíblia canônica](docs/UNIVERSO_CANONICO.md)
- [Prólogo A Apuração](docs/PROLOGO_A_APURACAO.md)
- [Arquitetura e pipeline de assets](docs/ARQUITETURA.md)
- [Regras para agentes de código](CLAUDE.md)

## Primeiro marco verificável

O jogador abre `localhost` e consegue mover Matias em um **cenário 3D real** com câmera em terceira pessoa, colisões, andar/correr/agachar, interagir com um NPC, ouvir uma fala e escolher uma resposta em português.

A cena é pequena e crível: um quarteirão habitado e desgastado de São Paulo Velha, dia de distribuição de recursos. Nenhum slideshow, falso vídeo ou personagem representado por imagem plana.

**Produção de artes:** concept art é referência, não asset jogável. Modelos 3D devem ter geometria, texturas, rigging e animação, com procedência e licença documentadas. Não reutilizar em roupas a marca AlwaysFit nem outras marcas reais.

## Executando

Os comandos de instalação e execução serão adicionados pelo agente após criar o projeto e validar o build.
