// Puts the two built pieces the game loads at run time where it looks for them (both git-ignored):
//   public/agent/ort/   onnxruntime-web, which runs the bots, from node_modules (npm install brings it)
//   engine/             the Craftax engine, from the craftax-wasm package (npm, or the checkout beside this one that the
//                       workspace links in its place) or CRAFTAX_WASM
// Runs before `npm run dev` and `npm run build`; a missing engine stops with a message saying how to get one.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// a package's folder, found the way Node finds it: in this folder's node_modules or any above it (a workspace keeps them at
// its root, with the checkouts beside this one linked in)
const pkgDir = (name: string) => {
  for (let d = root; ; d = dirname(d)) {
    const p = join(d, "node_modules", name);
    if (existsSync(join(p, "package.json"))) return realpathSync(p);
    if (dirname(d) === d) return undefined;
  }
};

const ort = join(pkgDir("onnxruntime-web") ?? join(root, "node_modules", "onnxruntime-web"), "dist");
mkdirSync(join(root, "public", "agent", "ort"), { recursive: true });
for (const f of ["ort.wasm.bundle.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"])
  cpSync(join(ort, f), join(root, "public", "agent", "ort", f));
// its memory is a shared one with a 4 GB maximum, which a browser reserves whole, up front; iPhone Safari refuses that ("RangeError: Out
// of memory", Pete: every agent on an iPhone 16 Pro Max): the maximum becomes the page's to choose (craftax-agents web/onnx.ts sets ORT_MAX_PAGES from the agent's `memory`)
const MEM = "new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})";
for (const f of ["ort.wasm.bundle.min.mjs", "ort-wasm-simd-threaded.mjs"]) {
  const p = join(root, "public", "agent", "ort", f), t = readFileSync(p, "utf8");
  if (t.split(MEM).length !== 2) { console.error(`runtime-files: onnxruntime-web's ${f} has changed: its memory isn't made as expected (${MEM})`); process.exit(1); }
  writeFileSync(p, t.replace(MEM, MEM.replace("maximum:65536", "maximum:globalThis.ORT_MAX_PAGES||65536")));
}

// where the engine comes from: CRAFTAX_WASM, else the craftax-wasm package (from npm, or the checkout the workspace links in)
const files = ["js/craftax.mjs", "js/meta.json", "build/craftax.mjs"];
const wasm = resolve(process.env.CRAFTAX_WASM || pkgDir("craftax-wasm") || join(root, "..", "craftax-wasm"));
const missing = files.filter((f) => !existsSync(join(wasm, f)));
if (missing.length) {
  if (existsSync(join(root, "engine", "build", "craftax.mjs"))) {
    console.warn(`runtime-files: no craftax-wasm build at ${wasm} (${missing.join(", ")}); keeping the engine already in engine/`);
  } else {
    console.error(`runtime-files: the game needs the Craftax engine: npm install brings it from npm; a craftax-wasm checkout in the\n`
      + `workspace needs \`make wasm\` run in it first (Emscripten); or set CRAFTAX_WASM to a checkout that has build/craftax.mjs.`);
    process.exit(1);
  }
} else {
  for (const f of files) { mkdirSync(join(root, "engine", dirname(f)), { recursive: true }); cpSync(join(wasm, f), join(root, "engine", f)); }
}
