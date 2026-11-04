import { REPO } from "./agent";
import { config } from "../src/config";

// The Research screen (the start menu's Research button): the papers behind Craftax and the agents here, then the agents you can watch
// (the bot window's picker, public/models.json) and where each came from. Each paper checked against its arXiv / proceedings page.
const PAPERS = [
  {
    title: "Craftax: A Lightning-Fast Benchmark for Open-Ended Reinforcement Learning",
    authors: "Michael Matthews, Michael Beukman, Benjamin Ellis, Mikayel Samvelyan, Matthew Jackson, Samuel Coward, Jakob Foerster",
    venue: "ICML",
    year: 2024,
    links: [
      { label: "arXiv 2402.16801", href: "https://arxiv.org/abs/2402.16801" },
      { label: "PMLR", href: "https://proceedings.mlr.press/v235/matthews24a.html" },
      { label: "code", href: "https://github.com/MichaelTMatthews/Craftax" },
    ],
    why: "The game this site plays: Crafter's ideas, NetHack's depth, written in JAX so agents train on billions of steps.",
  },
  {
    title: "Benchmarking the Spectrum of Agent Capabilities",
    authors: "Danijar Hafner",
    venue: "ICLR",
    year: 2022,
    links: [{ label: "arXiv 2109.06780", href: "https://arxiv.org/abs/2109.06780" }],
    why: "Crafter, the 2D survival benchmark Craftax extends: one world, many achievements, scored by how many an agent unlocks.",
  },
  {
    title: "The NetHack Learning Environment",
    authors: "Heinrich Küttler, Nantas Nardelli, Alexander H. Miller, Roberta Raileanu, Marco Selvatici, Edward Grefenstette, Tim Rocktäschel",
    venue: "NeurIPS",
    year: 2020,
    links: [{ label: "arXiv 2006.13760", href: "https://arxiv.org/abs/2006.13760" }],
    why: "The roguelike benchmark Craftax borrows its floors, monsters and potions from.",
  },
  {
    title: "BALROG: Benchmarking Agentic LLM and VLM Reasoning On Games",
    authors: "Davide Paglieri et al.",
    venue: "arXiv",
    year: 2024,
    links: [{ label: "arXiv 2411.13543", href: "https://arxiv.org/abs/2411.13543" }],
    why: "Language and vision-language models playing Crafter, NetHack and others: how far reasoning gets without RL training.",
  },
  {
    title: "Multi-Agent Craftax",
    authors: "see the paper",
    venue: "arXiv",
    year: 2025,
    links: [{ label: "arXiv 2511.04904", href: "https://arxiv.org/abs/2511.04904" }],
    why: "Craftax for teams of agents: the rules we plan to follow for co-op rooms.",
  },
  {
    title: "PufferLib: Making Reinforcement Learning Libraries and Environments Play Nice",
    authors: "Joseph Suarez",
    venue: "arXiv",
    year: 2024,
    links: [
      { label: "arXiv 2406.12905", href: "https://arxiv.org/abs/2406.12905" },
      { label: "code", href: "https://github.com/PufferAI/PufferLib" },
    ],
    why: "Fast RL tooling, and the C port of Craftax our engine is forked from; its released agent, PufferLib 162, plays here.",
  },
  {
    title: "Proximal Policy Optimization Algorithms",
    authors: "John Schulman, Filip Wolski, Prafulla Dhariwal, Alec Radford, Oleg Klimov",
    venue: "arXiv",
    year: 2017,
    links: [{ label: "arXiv 1707.06347", href: "https://arxiv.org/abs/1707.06347" }],
    why: "PPO: how all three agents here were trained.",
  },
  {
    title: "Stabilizing Transformers for Reinforcement Learning",
    authors: "Emilio Parisotto, H. Francis Song, Jack W. Rae, Razvan Pascanu, Caglar Gulcehre, Siddhant M. Jayakumar, Max Jaderberg, Raphael Lopez Kaufman, Aidan Clark, Seb Noury, Matthew M. Botvinick, Nicolas Heess, Raia Hadsell",
    venue: "arXiv",
    year: 2019,
    links: [{ label: "arXiv 1910.06764", href: "https://arxiv.org/abs/1910.06764" }],
    why: "The gated Transformer-XL: the memory of the TransformerXL PPO agent.",
  },
  {
    title: "Were RNNs All We Needed?",
    authors: "Leo Feng, Frederick Tung, Mohamed Osama Ahmed, Yoshua Bengio, Hossein Hajimirsadeghi",
    venue: "arXiv",
    year: 2024,
    links: [{ label: "arXiv 2410.01201", href: "https://arxiv.org/abs/2410.01201" }],
    why: "The minGRU: the recurrent layer PufferLib 162 remembers with.",
  },
  {
    title: "A 15M-parameter RL agent trained from scratch vs GPT-6 Astra: who would win?",
    authors: "Dan Kondratyuk, Ming-Chang Chiu, Junpeng Lao, Joshua V. Dillon",
    venue: "rekursiv.ai blog",
    year: 2026,
    links: [
      { label: "post", href: "https://rekursiv.ai/blog/craftax/" },
      { label: "code", href: "https://github.com/rekursiv-ai/priml/tree/main/priml/baselines/craftax" },
    ],
    why: "PPO with minGRU memory and a convolutional board encoder, from random weights: beats the final boss in 44% of games, 73% achievement score at 20B steps. The authors published the training code, not the weights; the agent here is a retraining of their recipe.",
  },
];

const AGENTS = [
  {
    name: "Rekursiv priml 194", params: "15M parameters", by: "rekursiv.ai's priml recipe (reproduced)", score: "194 / 226 in priml's own evaluation",
    about: "A convolutional board encoder and 4 MinGRU layers of 1,024 that also read their last action, fine-tuned to fight the final boss: beats the necromancer in 43% of games.",
    links: [
      { label: "priml", href: "https://github.com/rekursiv-ai/priml" },
      { label: "weights", href: "https://huggingface.co/delaurentis/craftax-agents/tree/main/priml-boss" },
    ],
  },
  {
    name: "PufferLib 162", params: "14M parameters", by: "PufferAI", score: "162 / 226 in PufferLib's own evaluation",
    about: "PPO with 4 minGRU layers of 1,024, trained by PufferLib 5.0; reaches the sixth floor. Converted unchanged to ONNX to play here.",
    links: [
      { label: "PufferLib", href: "https://github.com/PufferAI/PufferLib" },
      { label: "weights (5.0 release)", href: "https://github.com/PufferAI/PufferLib/releases/tag/5.0-experiments" },
    ],
  },
  {
    name: "TransformerXL PPO", params: "4.7M parameters", by: "Gautier Hamon", score: "41.9 / 226 training return at 1e9 steps",
    about: "PPO with a gated Transformer-XL remembering its last 128 steps; of the ten published Craftax runs, the one that goes deepest.",
    links: [{ label: "transformerXL_PPO_JAX", href: "https://github.com/Reytuag/transformerXL_PPO_JAX" }],
  },
  {
    name: "PPO-RNN (Craftax paper)", params: "6.9M parameters", by: "Matthews et al., Craftax paper (reproduced)", score: "35 / 226 (15.3%, reported in the Craftax paper)",
    about: "The Craftax paper's PPO-RNN baseline, retrained to its reported score: one GRU of 512.",
    links: [{ label: "Craftax_Baselines", href: "https://github.com/MichaelTMatthews/Craftax_Baselines" }],
  },
  {
    name: "NeuralCrystal 27", params: "21M parameters", by: "NeuralCrystal", score: "27 / 226 over 580 games",
    about: "An optical neural network: a simulated crystal with 80 etched surfaces sees the game board, lights up its next move, and changes its recurrent memory.",
    links: [
      { label: "weights", href: "https://huggingface.co/neuralcrystal/craftax-crystal" },
      { label: "neuralcrystal.com", href: "https://neuralcrystal.com" },
    ],
  },
];

// the code behind the game and its agents (Pete: one short line, no ours and theirs)
// who made each (Pete: a name a repo, linking their GitHub page, in the links' yellow)
const ME = ["Pete DeLaurentis", "https://github.com/delaurentis"], MATTHEWS = ["Michael Matthews", "https://github.com/MichaelTMatthews"];
// more: links beside GitHub (Pete: neuralcrystal.com on the engine)
const REPOS: { name: string; by: string[]; about: string; href: string; more?: { label: string; href: string }[] }[] = [
  { name: "craftax-3d", by: ME, about: "This game: Craftax in your browser in 3D, with its views and looks, touch controls, agents to watch, and recording and replay.", href: "https://github.com/delaurentis/craftax-3d" },
  { name: "craftax-wasm", by: ME, about: "Craftax rewritten in C and compiled to WebAssembly, exact with the JAX original: the engine this game plays on.", href: "https://github.com/delaurentis/craftax-wasm" },
  { name: "craftax-agents", by: ME, about: "The agents' playable format, the converters, the checker and the registry of agents in this game.", href: REPO },
  { name: "craftax-crystal", by: ME, about: "The neural crystal agent: a simulated optical chip that plays Craftax, and the code that runs it in your browser.", href: "https://github.com/delaurentis/craftax-crystal" },
  { name: "neuralcrystal-typescript", by: ME, about: "The neural crystal engine in TypeScript, on npm as neuralcrystal: it simulates shining light through the crystal, on the CPU or the GPU.", href: "https://github.com/neuralcrystal/neuralcrystal-typescript", more: [{ label: "neuralcrystal.com", href: "https://neuralcrystal.com" }] },
  { name: "Craftax", by: MATTHEWS, about: "The original game and benchmark, in JAX.", href: "https://github.com/MichaelTMatthews/Craftax" },
  { name: "Craftax_Baselines", by: MATTHEWS, about: "The paper's PPO, PPO-RNN and other baselines.", href: "https://github.com/MichaelTMatthews/Craftax_Baselines" },
  { name: "PufferLib", by: ["Joseph Suarez", "https://github.com/jsuarez5341"], about: "Fast RL tooling and the C port of Craftax our engine is forked from.", href: "https://github.com/PufferAI/PufferLib" },
  { name: "transformerXL_PPO_JAX", by: ["Gautier Hamon", "https://github.com/Reytuag"], about: "PPO with a gated Transformer-XL, trained on Craftax.", href: "https://github.com/Reytuag/transformerXL_PPO_JAX" },
];
// a copy button beside a command (Pete): copies it, says "Copied" for a moment (renderResearch wires it)
const COPY = (t: string) => ` <button class="cp" data-copy="${t}" aria-label="Copy" title="Copy"><svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">`
  + `<path d="M4 1h7v7h-1V2H4z" fill="currentColor"/><path d="M1 4h7v7H1zM2 5v5h5V5z" fill="currentColor"/></svg></button>`;
const HOME = (config.site || "https://playcraftax.com").replace(/^https?:\/\//, "");   // this site's name, in the steps below
// how an agent gets into the game, in two parts (Pete): trying it yourself, then publishing it for everyone (craftax-agents' README)
const TRY = [
  "Export it to ONNX: <code>obs</code> [1, 843] in (the engine's packed observation), <code>logits</code> [1, 43] out; any memory as inputs fed back from outputs named <code>X_out</code>.",
  "Check it on the engine: <code>python -m craftax_agents.check_model your.onnx</code>" + COPY("python -m craftax_agents.check_model your.onnx"),
  `Play it on ${HOME}: <b>Test My Agent</b> below (or Settings, Agent), with a link to the file (Hugging Face works). It stays in your browser.`,
];
const PUBLISH = [
  "Open a pull request to craftax-agents adding its entry to <code>models.json</code>: its name, a line about it, and the link to its file.",
  `Once it's merged, your agent is in everyone's list on ${HOME}.`,
];

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
const links = (ls: { label: string; href: string }[]) => `<p class="links">${ls.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</p>`;
// one tab at a time (the tabs above the list, index.html #research-tabs); the last one opened stays open for this visit
let tab = "papers";
export function renderResearch(el: HTMLElement, which = tab) {
  tab = which;
  document.querySelectorAll<HTMLElement>("#research-tabs .tab").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    b.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); if (b.dataset.tab !== tab) renderResearch(el, b.dataset.tab); };
  });
  el.innerHTML = tab === "agents"
    ? `<p class="meta">The agents you can watch: pick one from the bot window in the game; each runs in your browser.</p>`
      + AGENTS.map((a) => `<div class="entry"><div class="head"><b>${esc(a.name)}</b><span class="compl" title="${esc(a.score)}"><big>${Math.round((100 * parseFloat(a.score)) / 226)}%</big> completion</span></div><p class="meta">${esc(a.by)} · ${esc(a.params)} · ${esc(a.score)}</p><p>${esc(a.about)}</p>${links(a.links)}</div>`).join("")
      + `<div class="entry" id="add-your-agent"><b>Try your agent</b><ol>${TRY.map((t) => `<li>${t}</li>`).join("")}</ol>${links([{ label: "FORMAT.md", href: REPO + "/blob/main/FORMAT.md" }])}</div>`
      + `<div class="entry" id="publish-your-agent"><b>Publish your agent</b><ol>${PUBLISH.map((t) => `<li>${t}</li>`).join("")}</ol>${links([{ label: "README", href: REPO + "#add-your-agent" }])}</div>`
    : tab === "repos"
      ? `<p class="meta">The code behind the game and its agents.</p>`
        + REPOS.map((r) => `<div class="entry"><b>${esc(r.name)}</b><p class="meta">by <a class="by" href="${esc(r.by[1])}" target="_blank" rel="noopener">${esc(r.by[0])}</a></p><p>${esc(r.about)}</p>${links([{ label: "GitHub", href: r.href }, ...(r.more ?? [])])}</div>`).join("")
      : `<p class="meta">The papers behind the game and its agents.</p>`
        + PAPERS.map((p) => `<div class="entry"><b>${esc(p.title)}</b><p class="meta">${esc(p.authors)} · ${esc(p.venue)} ${p.year}</p><p>${esc(p.why)}</p>${links(p.links)}</div>`).join("");
  el.querySelectorAll<HTMLElement>("button.cp").forEach((b) => (b.onclick = () => {
    navigator.clipboard?.writeText(b.dataset.copy!).then(() => { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1200); }, () => {});
  }));
  el.closest(".win")?.scrollTo(0, 0);
}
