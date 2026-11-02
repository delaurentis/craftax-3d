/// <reference types="vite/client" />

// craftax.config.ts, or the host's own config (vite.config.ts resolves it)
declare module "craftax:config" {
  import type { CraftaxConfig } from "./config";
  const config: Partial<CraftaxConfig>;
  export default config;
}
