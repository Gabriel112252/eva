/// <reference types="vite/client" />

declare module "*.wasm?url" {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly VITE_CHARACTER_EXT?: string;
}
