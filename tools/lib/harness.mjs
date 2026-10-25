/**
 * Utilitários compartilhados pelos testes em navegador: servidor estático de `dist/`
 * e carregamento do Playwright (local ou global).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  const candidates = ["playwright", "/opt/npm-tools/node_modules/playwright", `${process.env.HOME}/.npm-global/lib/node_modules/playwright`];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error("Playwright não encontrado. Instale com `npm i -D playwright` e `npx playwright install chromium`.");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/** Serve `dist/` numa porta livre de 127.0.0.1 e devolve `{ base, close }`. */
export async function serveDist(dir = resolve("dist")) {
  if (!existsSync(dir)) {
    console.error(`${dir} não existe. Rode \`npm run build\` antes.`);
    process.exit(1);
  }
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = join(dir, url === "/" ? "index.html" : url);
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  return { base, close: () => server.close() };
}

/** Argumentos do Chromium para WebGL por software (SwiftShader) em ambientes sem GPU. */
export const CHROMIUM_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"];

/** Lê `--flag valor` da linha de comando. */
export function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
