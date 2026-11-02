// Vite builds the game page and the replay page into dist/. public/ (art, sounds, the bot registry, onnxruntime) is copied
// as-is beside them, so the modules' new URL("../…", import.meta.url) lookups land on the same files in dev and in dist/.
//   CRAFTAX_CONFIG=../site/craftax.config.ts   build with a host's config (its plugins) instead of ./craftax.config.ts
//   CRAFTAX_OUT=../site/public/play            write the build there instead of dist/
//   CRAFTAX_TUNNEL=1                           behind an https tunnel (ngrok, for a phone): live reload connects on port 443
import { defineConfig, searchForWorkspaceRoot, type Connect, type Plugin } from "vite";
import { resolve } from "node:path";

const config = resolve(process.env.CRAFTAX_CONFIG || "craftax.config.ts");

// a hosted site serves the replay page at /replay/ (playcraftax copies replay.html there), and the game's "Watch it" links go
// there; the dev and preview servers send /replay/ on to replay.html, keeping the query (?open=…). A redirect, not a rewrite:
// replay.html's relative links (its styles and scripts) only resolve from the page's own address
const replayPath: Connect.NextHandleFunction = (req, res, next) => {
  const m = req.url?.match(/^\/replay\/?(\?.*)?$/);
  if (!m) return next();
  res.statusCode = 302;
  res.setHeader("Location", "/replay.html" + (m[1] ?? ""));
  res.end();
};
const replayRoute: Plugin = {
  name: "replay-route",
  configureServer: (server) => { server.middlewares.use(replayPath); },
  configurePreviewServer: (server) => { server.middlewares.use(replayPath); },
};

export default defineConfig({
  base: "./",
  plugins: [replayRoute],
  // plugins import the game they plug into as "craftax-3d/…": always this copy
  resolve: { alias: { "craftax:config": config, "craftax-3d": resolve(".") } },
  build: {
    target: "es2022",
    outDir: process.env.CRAFTAX_OUT ? resolve(process.env.CRAFTAX_OUT) : "dist",
    emptyOutDir: true,
    rollupOptions: { input: { index: "index.html", replay: "replay.html" } },
  },
  worker: { format: "es" },
  server: {
    port: 8795,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(config, "..")] },   // (the workspace: its checkouts beside this one, linked in)
    ...(process.env.CRAFTAX_TUNNEL ? { hmr: { clientPort: 443, protocol: "wss" } } : {}),
  },
});
