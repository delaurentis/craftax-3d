// Plugins use the game only through its plugin API (plugin.ts, "craftax-3d/plugin"), so the game's own files can change without
// breaking them. Fails when a file under plugins/ imports anything else of the game, or another plugin's files (plugins/shared/,
// helpers for the examples, is the one place they share), and when a plugin a player adds by hand (examples/plugins/) imports at all:
// it is one plain file, and gets what it needs from its host (host.three, host.kit).
//   npm run check
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files: string[] = [];
const walk = (p: string) => {
  const s = statSync(p, { throwIfNoEntry: false });
  if (!s) return;
  if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (/\.(ts|js|mjs)$/.test(p)) files.push(p);
};
walk(join(root, "plugins")); walk(join(root, "examples"));

const IMPORT = /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const bad: string[] = [];
for (const f of files) {
  const rel = relative(root, f), parts = rel.split(sep), added = parts[0] === "examples";
  const home = added ? null : join(root, parts[0], parts[1]);         // (plugins/<name>/: the plugin's own folder)
  for (const m of readFileSync(f, "utf8").matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (added) { bad.push(`${rel}: imports "${spec}" (a plugin added by hand is one plain file: use host.three and host.kit)`); continue; }
    if (spec === "craftax-3d/plugin" || spec === "three") continue;
    if (spec.startsWith(".")) {
      const to = resolve(dirname(f), spec);
      if (to.startsWith(home! + sep) || to.startsWith(join(root, "plugins", "shared") + sep)) continue;
      bad.push(`${rel}: imports "${spec}", another plugin's file (share it through plugins/shared/)`); continue;
    }
    bad.push(`${rel}: imports "${spec}" (only "craftax-3d/plugin" and "three")`);
  }
}
if (bad.length) { console.error("Plugins reaching past the plugin API:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`${files.length} plugin files checked: all on craftax-3d/plugin`);
