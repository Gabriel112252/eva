import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    // O módulo Havok carrega o .wasm pela própria URL; não deve ser pré-empacotado.
    exclude: ["@babylonjs/havok"],
  },
  assetsInclude: ["**/*.glb", "**/*.wasm"],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        "preview-veiculos": fileURLToPath(new URL("./preview-veiculos.html", import.meta.url)),
        "kit-tech": fileURLToPath(new URL("./kit-tech.html", import.meta.url)),
      },
      output: {
        manualChunks: (id) => {
          if (id.includes("@babylonjs/havok")) return "havok";
          if (id.includes("@babylonjs/")) return "babylon";
          return undefined;
        },
      },
    },
  },
});
