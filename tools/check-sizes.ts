// Every source file stays at or under 500 lines (CONTRIBUTING.md). Lists the ones over, longest first, and fails when there are
// any. Files still waiting to be split (the ones carried over from before the restructure) are listed under "still to split"
// and don't fail the check, so the rule holds for everything new while the old files shrink.
//   npm run sizes
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT = 500;
const ROOTS = ["src", "js", "plugins", "tools", "index.html", "replay.html", "vite.config.ts", "craftax.config.ts", "crystal.config.ts"];
const EXT = /\.(ts|js|mjs|html|css)$/;
// carried over from before the restructure, each to be split (doc/notes plan, section 5); remove a line once its file is under
const LEGACY = new Set<string>([]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files: string[] = [];
const walk = (p: string) => {
  const s = statSync(p, { throwIfNoEntry: false });
  if (!s) return;
  if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (EXT.test(p)) files.push(p);
};
for (const r of ROOTS) walk(join(root, r));

const over = files
  .map((f) => ({ f: relative(root, f), n: readFileSync(f, "utf8").split("\n").length }))
  .filter((x) => x.n > LIMIT)
  .sort((a, b) => b.n - a.n);
const failing = over.filter((x) => !LEGACY.has(x.f));
const legacy = over.filter((x) => LEGACY.has(x.f));
for (const x of failing) console.log(`over ${LIMIT}: ${x.f} (${x.n} lines)`);
if (legacy.length) console.log(`still to split: ${legacy.map((x) => `${x.f} (${x.n})`).join(", ")}`);
console.log(`${files.length} files checked, ${failing.length} over the limit`);
process.exit(failing.length ? 1 : 0);
