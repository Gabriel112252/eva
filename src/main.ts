import "./style.css";
import { Game } from "./core/game";

function fatal(message: string): void {
  const err = document.getElementById("loading-error");
  const label = document.getElementById("loading-label");
  if (label) label.textContent = "Não foi possível iniciar o jogo.";
  if (err) {
    err.hidden = false;
    err.textContent = message;
  }
  console.error(message);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) {
    fatal("Canvas não encontrado.");
    return;
  }
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) {
    fatal("Seu navegador não oferece WebGL 2. Use Chrome, Edge ou Firefox recentes em um computador com aceleração gráfica habilitada.");
    return;
  }
  try {
    const game = new Game(canvas);
    (window as unknown as { eva: Game }).eva = game; // acesso para depuração/testes
    await game.init();
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    fatal(`Erro ao iniciar: ${msg}`);
  }
}

void boot();
