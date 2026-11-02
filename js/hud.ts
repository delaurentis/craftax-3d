// The HUD: status bars, hotbar, gear, info, achievement toasts and the E screen (inventory, crafting, potions, attributes, magic).
// The icons and item tables it draws from are in src/resources/items/ (re-exported here for the modules that import them).
import { iconURL, hasOutlineArt, outlineIconURL } from "./textures";
import { pixelText } from "./pixeltitle";
import { INK, hudInk, pixIcon, toolIcon } from "../src/resources/items/icons";
import type { IconKind } from "../src/resources/items/icons";
import { DONE_BADGE, ELEM, HIT_ICON, HOTBAR, LOOT, MAGIC, PIECES, POTIONS, RECIPES, SLOT_KEYS, TIER_OF, armourIcon, bar, enchNote, enchOf, gear, ingredient, invAt, made, near, nextPiece, short } from "../src/resources/items/registry";
import type { GameState, Inventory, Meta } from "../src/core/types";
export { drawHeart, pixIcon, toolPixels } from "../src/resources/items/icons";
export { SLOT_KEYS, HOTBAR, POTIONS, invAt } from "../src/resources/items/registry";
export type { HotbarSlot, Recipe } from "../src/resources/items/registry";
import type { Recipe } from "../src/resources/items/registry";
import { themedText } from "../src/themes/names";
import { phoneMedia } from "../src/ui/side";
type Timer = ReturnType<typeof setTimeout>;
type Attr = "dexterity" | "strength" | "intelligence";
// counts by name (inventory keys, the HUD's own: "potion0"...): what a lookup by a key that isn't in the inventory reads
const count = (inv: Inventory, k: string): number => invAt(inv, k) || 0;

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  declare meta: Meta;
  declare onAction: (action: number) => void;
  /** The hotbar slot picked. */
  declare sel: number;
  /** The achievements already toasted. */
  declare seen: Set<number> | null;
  /** Gathered but still flying in, by item: counted when it lands; and the counts popping as they land (until when). */
  declare pend: Record<string, number>;
  declare bump: Record<string, number>;
  declare shakeUntil: Record<string, number>;
  declare flashUntil?: Record<string, number>;
  declare hitUntil: number;
  declare hitIcon: string;
  declare onTool: ((tool: string) => void) | null;
  declare onSleep: (() => void) | null;
  declare onAch?: () => void;
  /** The last state drawn. */
  declare s?: GameState;
  /** The E screen's card: an action ("12"), "inv:<item>" or "gear:<piece>". */
  declare pick?: string;
  /** The E screen opened at an enchantment table; at a table or furnace beside you ("crafting table", "furnace"). */
  declare ench?: boolean;
  declare station?: string | null;
  /** An achievement held back until this item reaches the hotbar (until achWaitUntil), or until achHoldUntil. */
  declare achWait?: string | null;
  declare achWaitUntil?: number;
  declare achHoldUntil?: number;
  declare _achDelayed?: boolean;
  declare _achT?: Timer | 0;
  declare _nameT?: Timer;
  declare _backT?: Timer;
  declare _selUsable?: boolean | null;
  declare _selAt?: number;

  constructor(meta: Meta, onAction: (action: number) => void) {
    this.meta = meta; this.onAction = onAction; this.sel = 0; this.seen = null;
    this.pend = {}; this.bump = {};                                // gathered but still flying in (main.ts): counted when it lands
    this.shakeUntil = {}; this.hitUntil = 0; this.hitIcon = "sword"; this.onTool = null; this.onSleep = null;
    $("hotbar").innerHTML = HOTBAR.map((h, i) => `<div class="slot" data-i="${i}"><span class="k">${SLOT_KEYS[i] ?? ""}</span><img class="${h.tex ? "blk" : ""}" src="${h.icon()}"><span class="n"></span></div>`).join("");
    $("bars").addEventListener("mousedown", (e) => {                         // the Zzz button beside the energy bar: sleep
      if ((e.target as Element).closest(".zzz")) { e.preventDefault(); e.stopPropagation(); this.onSleep?.(); }
    });
    $("hotbar").addEventListener("mousedown", (e) => {                     // click a slot to select it (the click never reaches the world)
      const slot = (e.target as Element).closest<HTMLElement>(".slot");
      if (slot) { this.select(+slot.dataset.i!); e.preventDefault(); }
    });
    // touch (Pete): the hotbar as a hand of cards: a finger on it, slid along, pulls the slot under it up a little out of the bar, still
    // part of it, a little bigger, on an opaque card (index.html .dock), its neighbours nudged up a touch; let go and that one is in hand.
    // A tap is just a short slide
    const bar = $("hotbar");
    let dockId: number | null = null;
    const children = () => [...bar.children] as (HTMLElement & { _d?: number })[];
    const dock = (x: number) => {
      let best = -1, bd = 1e9;
      children().forEach((el, i) => {
        const w = el.offsetWidth, c = el.offsetParent!.getBoundingClientRect().left + el.offsetLeft + w / 2, d = Math.abs(x - c) / w;   // in slot widths, where it sits (unscaled)
        el._d = d;
        if (d < bd) { bd = d; best = i; }
      });
      children().forEach((el, i) => {                                // the card under the finger lifts clear of the thumb
        const h = el.offsetHeight, k = Math.max(0, 1 - el._d! / 1.6);
        el.style.transform = i === best ? `translateY(${-(h * 0.5 + 6)}px) scale(1.3)` : k > 0.01 ? `translateY(${-(4 * k).toFixed(1)}px)` : "";   // (Pete: a little lift, still in the dock)
        el.style.zIndex = i === best ? "30" : "";
        el.classList.toggle("dock", i === best);
      });
      return best;
    };
    const undock = () => { bar.classList.remove("docking"); for (const el of children()) { el.style.transform = el.style.zIndex = ""; el.classList.remove("dock"); } };
    bar.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      e.preventDefault();                                                   // no mouse events follow: the slot is picked on release
      dockId = e.pointerId; try { bar.setPointerCapture(e.pointerId); } catch {}
      bar.classList.add("docking"); dock(e.clientX);
    });
    bar.addEventListener("pointermove", (e) => { if (e.pointerId === dockId) dock(e.clientX); });
    const undocked = (e: PointerEvent) => {
      if (e.pointerId !== dockId) return;
      dockId = null;
      const i = e.type === "pointerup" ? dock(e.clientX) : -1;
      undock();
      if (i >= 0) this.select(i);
    };
    bar.addEventListener("pointerup", undocked); bar.addEventListener("pointercancel", undocked);
    $("panel-win").addEventListener("click", (e) => {
      const p = (e.target as Element).closest<HTMLElement>("[data-pick]");                              // an icon: its card
      if (p) { this.pick = p.dataset.pick; if (this.s) this.renderPanel(this.s); return; }
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-a]");
      if (b && !b.disabled) this.onAction(+b.dataset.a!);
    });
  }

  // damage feedback: shake a bar (food, drop, bolt: the need that cost you health), or blink what hit you beside the hearts
  shake(kind: string) {
    this.shakeUntil[kind] = performance.now() + 450;
    const el = document.querySelector<HTMLElement>(`#bars .bar[data-k="${kind}"]`);
    if (el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
  }
  hit(icon: string) {
    this.hitIcon = icon; this.hitUntil = performance.now() + 900;
    this.flashUntil = { ...this.flashUntil, heart: performance.now() + 650 };   // the hearts flash white too
    this.shake("heart");
    if (this.s) this.update(this.s);
  }

  // the tool in your hand: the hand, pickaxe or sword slot when one is selected (an item slot leaves the hand empty). Craftax itself
  // always mines with your best pickaxe and fights with your best sword, so the choice is what you hold and see, never what a hit does.
  get tool(): string { return HOTBAR[this.sel].tool || "hand"; }

  setLines(on: boolean) {                                                  // a line look (src/looks): icons in its ink (hudInk.ink)
    hudInk.lines = on;
    [...$("hotbar").children].forEach((el, i) => {                       // blocks: their laser drawing (a filtered square says nothing)
      const h = HOTBAR[i], im = el.querySelector("img")!, lz = on && h.tex && hasOutlineArt(h.tex);
      if (!h.tex) return;
      im.src = lz ? outlineIconURL(h.tex, INK()) : h.icon(); im.classList.toggle("lzi", !!lz); im.classList.toggle("blk", !lz);
    });
    if (this.s) this.update(this.s);
  }

  // quiet: the game switched for you (the right tool for a strike): no name under the hotbar, only a slot you picked is named (Pete)
  select(i: number, quiet = false, scrolling = false) {   // scrolling: the wheel passing through (an empty slot is not bounced off)
    this.sel = (i + HOTBAR.length) % HOTBAR.length;
    const h = HOTBAR[this.sel], TIERS = ["", "Wood", "Stone", "Iron", "Diamond"], t = this.s ? count(this.s.inventory, h.tool!) : 0;
    this.onTool?.(this.tool);
    if (quiet) { if (this.s) this.update(this.s); return; }
    const phone = phoneMedia("(max-width: 720px), (max-height: 520px)").matches;   // phones: the name alone, one line
    $("slotname").textContent = phone ? (h.tool === "hand" ? "Hand" : h.tool ? (t ? `${TIERS[t]} ${h.tool}` : `No ${h.tool} yet`) : h.name)
      : h.tool === "hand" ? "Hand (chop, mine, attack, drink, use)"
      : h.tool ? (t ? `${TIERS[t]} ${h.tool} (Craftax ${h.tool === "sword" ? "adds your best sword to every hit" : "mines with your best pickaxe"})`
        : `No ${h.tool} yet: craft one at a table (E). Hits work bare-handed`)
      : h.name + (h.note ? ` (${h.note})` : "");
    clearTimeout(this._nameT);
    this._nameT = setTimeout(() => ($("slotname").textContent = ""), 2000);
    if (this.s) this.update(this.s);
    // an empty slot picked (a click, or its number; Pete): it flashes, then the hand comes back out (the "none yet" line stays)
    const empty = this.s && h.tool !== "hand" && (h.tool ? !(count(this.s.inventory, h.tool) > 0) : !(h.count(this.s) > 0) || short(h, this.s));
    if (empty && !scrolling) {
      const el = document.querySelectorAll<HTMLElement>("#hotbar .slot")[this.sel], at = this.sel;
      if (el) { el.classList.remove("empty-flash"); void el.offsetWidth; el.classList.add("empty-flash"); }
      clearTimeout(this._backT);
      this._backT = setTimeout(() => { if (this.sel === at) this.select(0, true); }, 380);
    }
  }

  update(s: GameState) {
    // the item in hand run out (the last stone placed, the table's wood spent): the hand comes back out (Pete)
    const hs = HOTBAR[this.sel], usable = !hs.tool && hs.count ? hs.count(s) > 0 && !short(hs, s) : null;
    if (usable === false && this._selUsable && this._selAt === this.sel) { this._selUsable = false; this.s = s; this.select(0, true); return; }   // (select redraws with this state)
    this._selUsable = usable; this._selAt = this.sel;
    this.s = s;
    const need = 7 + 2 * (s.dexterity || 1), maxHp = 8 + (s.strength || 1), maxMana = 6 + 3 * (s.intelligence || 1);   // Craftax's maxima
    const now = performance.now(), sh = (k: string) => (now < (this.shakeUntil[k] || 0) ? "shake" : "") + (now < (this.flashUntil?.[k] || 0) ? " flash" : "");
    const hit = now < this.hitUntil ? `<img class="hiticon" src="${(HIT_ICON[this.hitIcon] || HIT_ICON.sword)()}">` : "";
    this.boss(s);
    $("bars").innerHTML = bar("heart", s.health, false, hit, sh("heart"), maxHp) + bar("food", s.food, true, "", sh("food"), need)
      + bar("drop", s.drink, false, "", sh("drop"), need)
      + bar("bolt", s.energy, true, `<button class="zzz ${s.sleeping ? "on" : ""}" title="sleep (N): energy back, the night goes fast; wall yourself in first">Zzz</button>`, sh("bolt"), need)
      + (s.spells.some(Boolean) || s.mana < maxMana ? bar("star", s.mana, false, "", "", maxMana) : "");
    ([...$("hotbar").children] as HTMLElement[]).forEach((el, i) => {
      const h = HOTBAR[i], n = h.count(s) - (h.action === 7 ? this.pend.stone || 0 : 0), act = h.hand || !s.available || s.available[h.action!];
      el.classList.toggle("sel", i === this.sel);
      const owned = h.tool === "hand" || (h.tool && count(s.inventory, h.tool) > 0);
      el.classList.toggle("off", h.tool ? !owned : !n || short(h, s));   // (a block you lack the materials for, the table with one wood: dim too, Pete)
      if (h.tool && h.tool !== "hand") {                             // a tool slot shows the tier you own
        const src = toolIcon(h.tool, count(s.inventory, h.tool) || 1), img = el.querySelector("img")!;
        if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      }
      el.querySelector(".n")!.textContent = (n > 0 ? n : "") as string;
      el.title = act ? "" : "not possible here";
    });
    const day = Math.floor(s.timestep / 300) + 1, phase = (s.timestep % 300) / 300;
    const tod = s.level ? "" : ` · Day ${day}, ${s.daylight > 0.55 ? "day" : s.daylight > 0.2 ? (phase < 0.7 ? "dusk" : "dawn") : "night"}`;
    const nAch = Object.keys(this.meta.achievements).length;
    const ladder = s.level && s.level < 8 && s.monsters_killed < 8 ? ` · ladder down opens after ${8 - s.monsters_killed} more kills` : "";
    // the status panel: the floor (a plaque with a 9-pip depth gauge), the time of day (a sun / moon dial), the attributes (Craftax's
    // own icons), achievements as a bar, and the ladder's kill count as a banner when it matters
    const pips = Array.from({ length: 9 }, (_, i) => `<i class="${i < s.level ? "done" : i === s.level ? "here" : ""}"></i>`).join("");
    const isDay = s.level === 0 && s.daylight > 0.2, dial = s.level ? "" :
      `<span class="dial ${isDay ? "sun" : "moon"}" title="${tod.replace(" · ", "")}"></span><span class="day">${tod.replace(" · ", "")}</span>`;
    const stat = (icon: "score" | "xp" | "dexterity" | "strength" | "intelligence", v: string | number, t: string) => `<span class="chip" title="${t}"><em>${{ score: "SCORE", xp: "XP", dexterity: "DEX", strength: "STR", intelligence: "INT" }[icon]}</em>${v}</span>`;
    const pct = Math.round((100 * s.achievements.length) / nAch);
    const score = stat("score", `${Math.round(s.score)}<span class="pct">${Math.round((100 * s.score) / 226)}%</span>`, "Craftax score: achievements earned, harder ones worth more; the % is your share of its 226 points, as the agents' completion");
    // (the score twice: in the plaque too, where a phone on its side shows it, opened, instead of in the chips: index.html)
    $("info").innerHTML =
      `<div class="plaque"><b>${s.floor}</b><span class="pips" title="floor ${s.level + 1} of 9">${pips}</span>${dial}${score}</div>`
      + `<div class="chips">${score}${stat("xp", s.xp, "experience: spend it on an attribute")}${stat("dexterity", s.dexterity, "dexterity")}`
      + `${stat("strength", s.strength, "strength")}${stat("intelligence", s.intelligence, "intelligence")}</div>`
      + `<div class="ach" title="achievements"><span class="bar"><i style="width:${pct}%"></i></span>${s.achievements.length}/${nAch}<span class="step">step ${s.timestep}</span></div>`
      + (ladder ? `<div class="banner">${ladder.replace(" · ", "")}</div>` : "");
    const inv = s.inventory, armour = ["helmet", "chest", "pants", "boots"];
    // the materials (Pete): what tools, armour and enchanting are made of, always in view with their counts
    $("res").innerHTML = [["wood", "log_side", "Wood"], ["coal", "i_coal", "Coal"], ["iron", "i_iron", "Iron"], ["diamond", "i_diamond", "Diamond"],
      ["sapphire", "i_sapphire", "Sapphire"], ["ruby", "i_ruby", "Ruby"]].map(([k, t, name]) => { const n = Math.max(0, count(inv, k) - (this.pend[k] || 0));
      return `<div class="slot ${n ? "" : "off"}${performance.now() < (this.bump[k] || 0) ? " bump" : ""}" data-k="${k}" title="${name}"><img class="${t.startsWith("i_") ? "" : "blk"}" src="${iconURL(t)}">${n ? `<span class="n">${n}</span>` : ""}</div>`; }).join("");
    $("gear").innerHTML = ([["pickaxe", inv.pickaxe], ["sword", inv.sword], ...armour.map((k, i): [string, number] => [k, inv.armour[i] ? inv.armour[i] + 2 : 0])] satisfies [string, number][])
      .map(([k, t]) => `<div class="slot ${t ? "" : "off"}${t && enchOf(s, k) ? " ench" : ""}"><img src="${toolIcon(k, t || 1)}"></div>`).join("");
    // new achievements: toast and bell (onAch), held back while a tree falls until its wood has reached the hotbar (main.ts sets
    // achWait / achHoldUntil; release clears the wait), so the fall is heard first (Pete)
    // and every achievement waits a moment after it is earned (Pete), so the sound of what earned it (a kill, a craft, a bite) is heard
    // before the bell and the toast
    const now2 = performance.now();
    if (this.seen && !this._achDelayed && s.achievements.some((a) => !this.seen!.has(a))) {
      this._achDelayed = true; this.achHoldUntil = Math.max(this.achHoldUntil || 0, now2 + 700);
    }
    const waiting = (this.achWait && now2 < (this.achWaitUntil || 0)) || now2 < (this.achHoldUntil || 0);
    const fresh = this.seen && !waiting ? s.achievements.filter((a) => !this.seen!.has(a)) : [];
    if (fresh.length) this._achDelayed = false;
    fresh.slice(0, 3).forEach((a) => this.toast("Achievement get!", this.meta.achievements[a]));
    if (fresh.length > 3) this.toast("Achievements", `and ${fresh.length - 3} more`);
    if (fresh.length) this.onAch?.();
    if (!waiting || !this.seen) this.seen = new Set(s.achievements);
    else if (!this._achT) this._achT = setTimeout(() => { this._achT = 0; if (this.s) this.update(this.s); }, 200);
    if ($("panel").classList.contains("on")) this.renderPanel(s);
  }

  // the Graveyard's boss bar: the necromancer's 8 hits, drained one a hit, and why he can't be hit now (Craftax: only once the
  // summoning is over and every mob on the floor is dead). A server's state (JAX) doesn't carry it: no bar there
  boss(s: GameState) {
    const el = $("boss"), on = s.level === 8 && !s.done && "boss_spawn_turns" in s && !s.achievements.includes(49);   // (beaten: gone, the victory there instead)
    el.classList.toggle("on", on);
    if (!on) return;
    const left = Math.max(0, 8 - s.boss_progress), mobs = s.melee.length + s.ranged.length;
    const st = s.boss_vulnerable ? "Vulnerable: strike now!" : s.boss_spawn_turns > 0 ? `Summoning... ${s.boss_spawn_turns}`
      : `Shielded: kill ${mobs} more ${mobs === 1 ? "minion" : "minions"}`;
    const html = `<div class="nm">Necromancer</div><div class="segs">${Array.from({ length: 8 }, (_, i) => `<i${i < left ? ' class="full"' : ""}></i>`).join("")}</div><div class="st">${st}</div>`;
    el.classList.toggle("open", !!s.boss_vulnerable);
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  toast(title: string, name: string) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<b>${title}</b>${themedText(name.toLowerCase().replace(/_/g, " ")).replace(/^\w/, (c) => c.toUpperCase())}`;   // (a theme's names: Winter's reindeer)
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 4200);
    // phones: two at most on screen; a new one pushes the oldest off
    const max = phoneMedia("(max-width: 720px), (max-height: 520px)").matches ? 2 : Infinity;
    while ($("toasts").children.length > max) $("toasts").firstElementChild!.remove();
  }

  // the E screen: what you carry, then everything you can make or do as icons; tap one and a card shows what it is and, in pictures,
  // what it takes (the ingredients, with how many you have; the table / furnace it needs beside you), with the button that does it
  renderPanel(s: GameState) {
    const inv = s.inventory, av = s.available || [];
    const items = [["wood", "log_side", "Wood"], ["stone", "stone", "Stone"], ["coal", "i_coal", "Coal"], ["iron", "i_iron", "Iron"],
      ["diamond", "i_diamond", "Diamond"], ["sapphire", "i_sapphire", "Sapphire"], ["ruby", "i_ruby", "Ruby"], ["sapling", "i_sapling", "Sapling"],
      ["torches", "i_torch", "Torches"], ["arrows", "i_arrow", "Arrows"], ["books", "i_book", "Books"]];
    const img = (t: string) => { const lz = hudInk.lines && hasOutlineArt(t); return `<img class="${lz ? "lzi" : t.startsWith("i_") ? "" : "blk"}" src="${lz ? outlineIconURL(t, INK()) : iconURL(t)}">`; };   // blk: a whole block face, framed
    const potions = POTIONS.map(([n, col], i): Recipe => [29 + i, `${n[0].toUpperCase() + n.slice(1)} potion`, () => iconURL("i_potion", col), [["potion" + i, 1]], "",
      "its effect is unknown until you drink it", "Drink"]);
    const all = [...RECIPES, ...potions, ...MAGIC];
    // simpler by where you are (Pete): Make only with a crafting table beside you (Craftax crafts nothing without one; a furnace alone
    // makes nothing either), and there every recipe, faded until you can make it, and every material in the inventory row, faded at 0;
    // the enchant cards only at an enchantment table (a crafting table can't)
    const table = !this.ench && near(s).table, make = RECIPES;
    const magic = MAGIC.filter(([, , , , where]) => where !== "ench" || this.ench);
    // what you carry, only what you have (Pete): nothing faded; the rest of the row empty slots, so each row keeps its size
    const held = potions.filter(([a]) => inv.potions[a - 29] > 0), pad = (n: number, of: number) => `<div class="cell"></div>`.repeat(Math.max(0, of - n));
    const have = items.filter(([k]) => count(inv, k) > 0), kit = gear(s).filter(([, , , has]) => has);
    // away from any table, the actions too: only what you can do now (Pete: Sleep, Rest), the rest empty slots; at a table, all, faded
    const acts = this.ench || near(s).table ? magic : magic.filter(([a]) => av[a]);
    const shown = new Set((table ? make : [...held, ...acts]).map(([a]) => String(a)));
    if (this.pick === undefined || (!shown.has(this.pick) && !/^(inv|gear):/.test(String(this.pick))))   // first open, or its card gone: something you can make
      this.pick = String(((table ? make : acts).find(([a]) => av[a]) || (table ? make : acts)[0] || held[0] || [undefined])[0]);
    const on = (k: string) => (this.pick === k ? " picked" : "");
    // a grid cell: faded when not possible now, the done badge, and a potion's count (pc) in its corner as the inventory shows it
    // k: its key while the screen is up (Pete: keyboard only), 1 to 0, - and =, along the row you act from (main.ts picks with it)
    const PK = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
    const icon = (e: Recipe, k = -1) => { const m = made(e[0], s), pc = e[0] >= 29 && e[0] <= 34 ? inv.potions[e[0] - 29] : 0; return `<div class="cell rcell${av[e[0]] ? "" : " no"}${e[0] >= 29 && e[0] <= 34 ? " pot" : ""}${on(String(e[0]))}" data-pick="${e[0]}"${PK[k] ? ` data-pk="${PK[k]}"` : ""} title="${e[1]}${m ? ": done" : ""}">${PK[k] ? `<span class="pk">${PK[k]}</span>` : ""}<img src="${e[2](s)}">${pc ? `<span class="n">${pc}</span>` : ""}${m ? DONE_BADGE : ""}</div>`; };
    const X = `<button class="x" aria-label="Close" data-tip="Close (E)"><svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 3h3v2h2v2h4V5h2V3h3v3h-2v2h-2v4h2v2h2v3h-3v-2h-2v-2H8v2H6v2H3v-3h2v-2h2V8H5V6H3z" fill="#fff"/></svg></button>`;   // closes it (main.ts)
    // opened at a table or furnace beside you (main.ts sets this.station): break it, as Shift+click does; Craftax gives nothing back
    const demo = this.station ? `<button class="recipe brk" data-a="-5"><img class="blk" src="${iconURL(this.station === "furnace" ? "furnace_front" : "table_side")}"><span>Demolish ${this.station === "furnace" ? "furnace" : "table"}</span></button>` : "";
    $("panel-win").innerHTML = X + `<div class="invpair"><section><h2>Inventory</h2><div class="grid">`
      + (table ? items : have).map(([k, t, name]) => `<div class="cell rcell${count(inv, k) ? "" : " zero"}${on("inv:" + k)}" data-pick="inv:${k}" title="${name}">${img(t)}<span class="n">${count(inv, k) || ""}</span></div>`).join("") + pad(table ? items.length : have.length, items.length)
      // what you carry to fight and dig with (Pete): your pickaxe, sword and bow and the four armour pieces, each at its tier, in a row
      + `</div></section><section><h2>Weapons and armor</h2><div class="grid">${kit.map(([k, name, icon]) => `<div class="cell rcell${on("gear:" + k)}${enchOf(s, k) ? " ench" : ""}" data-pick="gear:${k}" title="${name}"><img src="${icon}"></div>`).join("")}${pad(kit.length, 7)}</div></section></div>`   /* (side by side on a phone on its side: index.html) */
      // opened at an enchantment table (main.ts sets this.ench): no Make, crafting needs a crafting table
      // (a phone on its side: Demolish beside the Make row, not under the card; index.html shows one of the two copies)
      + `${!table ? "" : `<div class="makerow"><section><h2>Make</h2><div class="grid">${make.map((e, i) => icon(e, i)).join("")}</div></section>${demo ? `<div class="brk-side">${demo}</div>` : ""}</div>`}`
      // not at a crafting table (Pete): nothing there is made at one; potions come from chests and are drunk anywhere, as the rest is done
      + (table ? "" : `<h2>Potions, magic, attributes</h2><div class="grid">${held.map((e, i) => icon(e, i)).join("")}${pad(held.length, potions.length)}${acts.map((e, i) => icon(e, held.length + i)).join("")}${pad(acts.length, magic.length)}</div>`)
      + this.card(s, all, items)
      + (demo ? `<div class="recipes brk-low" style="margin-top:6px">${demo}</div>` : "");
  }

  // the payoff after it acts (main.ts closes the E screen first): what you made, learned or drank pops up big in the middle of the
  // screen inside a burst of rays, with a headline and its name, then fades. Returns the sound to play ("craft" or "levelUp")
  payoff(a: number, s: GameState, fx?: [string, number] | null) {                                                     // fx: a potion's effect, [stat, change]
    const potion = a >= 29 && a <= 34 ? POTIONS[a - 29] : null;
    const e = [...RECIPES, ...MAGIC].find(([k]) => k === a);
    if (!e && !potion) return null;
    const attr = ({ 39: "dexterity", 40: "strength", 41: "intelligence" } as Record<number, Attr | undefined>)[a];
    const icon = potion ? iconURL("i_potion", potion[1]) : a === 22 || a === 23 ? armourIcon(s, a - 21, true) : e![2](s);
    const [head, name, kind] = attr ? ["Level up!", `${attr[0].toUpperCase() + attr.slice(1)} ${s[attr]}`, "levelUp"]
      : potion ? [fx && fx[1] ? `${fx[1] > 0 ? "+" : "−"}${Math.abs(fx[1])} ${fx[0]}${fx[1] > 0 ? "!" : ""}` : "Nothing happened",
        `${potion[0][0].toUpperCase() + potion[0].slice(1)} potion`, fx && fx[1] < 0 ? "bad" : "craft"]
      : a === 35 ? ["Spell learned!", "Read a book", "levelUp"]
      : [36, 37, 42].includes(a) ? ["Enchanted!", e![1].replace("Enchant ", ""), "levelUp"]
      : ["Crafted!", a === 22 || a === 23 ? `${a === 22 ? "Iron" : "Diamond"} ${PIECES[nextPiece(s, a - 21, true)][1]}` : e![1], "craft"];
    $("payoff")?.remove();
    const el = document.createElement("div");
    el.id = "payoff"; el.className = kind + (potion ? " potion" : "");
    el.innerHTML = `<div class="rays"></div><img src="${icon}"><b>${head}</b><span>${name}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
    return kind === "bad" ? "hurt" : kind;
  }

  // a chest's loot (main.ts, as its lid opens): what you gained, one row each, icon and "+3 Wood", popping in one after another in the
  // middle of the screen under a headline, then gone after a few seconds; fast (the bot past 32 moves a second, Pete): in half the time
  loot(before: Inventory, after: Inventory, fast: boolean) {
    const k = fast ? 0.25 : 0.5;                                              // half the time it was (Pete: it covered the screen too long); half again for a fast bot
    const rows: { icon: string; n: number; name: string; blk?: boolean }[] = [];
    const add = (icon: string, n: number, name: string, blk?: boolean) => rows.push({ icon, n, name, blk });
    for (const [k, t, name] of LOOT) { const d = count(after, k) - count(before, k); if (d > 0) add(iconURL(t), d, name, !t.startsWith("i_")); }
    (after.potions || []).forEach((v, i) => { const d = v - ((before.potions || [])[i] || 0); if (d > 0) add(iconURL("i_potion", POTIONS[i][1]), d, POTIONS[i][0][0].toUpperCase() + POTIONS[i][0].slice(1) + " potion"); });
    $("loot")?.remove();
    const el = document.createElement("div");
    el.id = "loot";
    el.innerHTML = `<b><canvas data-pixel-size="3" aria-label="" role="img"></canvas></b>` + rows.map((r, i) =>   // (Pete: smaller, desktop and phone)
      `<div class="row" style="animation-delay:${k * (0.25 + i * 0.18)}s"><img class="${r.blk ? "blk" : ""}" src="${r.icon}"><canvas data-pixel-flat data-pixel-size="2" role="img"></canvas></div>`).join("");   // the rows: the flat pixel font (the start screen's line)
    const cvs = el.querySelectorAll("canvas");                              // the headline and each row in the title's pixel font (Pete)
    pixelText(cvs[0], rows.length ? "Treasure!" : "Empty");
    rows.forEach((r, i) => pixelText(cvs[i + 1], `+${r.n} ${r.name}`));
    el.style.animationDuration = `.35s, ${k * 3.6}s`;                      // the CSS's loot-in, payoff-out
    document.body.appendChild(el);
    setTimeout(() => el.remove(), k * (3200 + rows.length * 180));
  }

  // a need running low (main.ts, Pete): the chest's pop-up (its look, its place) with a headline and one line of what to do, the
  // bar's own icon beside it; a little longer on screen than the loot, so it's read
  need(kind: IconKind, head: string, line: string) {
    $("loot")?.remove();
    const el = document.createElement("div");
    el.id = "loot"; el.className = "need";
    el.innerHTML = `<b><canvas data-pixel-size="3" aria-label="${head}" role="img"></canvas></b><div class="row" style="animation-delay:.12s"><img src="${pixIcon(kind, 1)}"><canvas data-pixel-flat data-pixel-size="2" aria-label="${line}" role="img"></canvas></div>`;
    const cvs = el.querySelectorAll("canvas");
    pixelText(cvs[0], head); pixelText(cvs[1], line);
    el.style.animationDuration = ".35s, 2.5s";                          // up for 2.5 s (Pete)
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // a gathered piece on its way to its slot: its count waits (hold) and ticks up with a little pop as it lands (release)
  hold(k: string, n = 1) { this.pend[k] = (this.pend[k] || 0) + n; if (this.s) this.update(this.s); }
  release(k: string) { if (k === this.achWait) this.achWait = null; this.pend[k] = Math.max(0, (this.pend[k] || 0) - 1); this.bump[k] = performance.now() + 350; if (this.s) this.update(this.s); }

  // the card for what is picked: a recipe (needs → result, where, the button) or something you carry (what it is, how many)
  card(s: GameState, all: Recipe[], items: string[][]) {
    const av = s.available || [], pick = this.pick || "";
    if (pick.startsWith("gear:")) {
      const g = gear(s).find(([k]) => "gear:" + k === pick); if (!g) return "";
      const en = g[3] ? enchNote(s, g[0]) : "";
      return `<div class="card"><div class="cell big${en ? " ench" : ""}"><img src="${g[2]}"></div><div class="info"><b>${g[1]}</b><small>${g[3] ? g[4] : "none yet"}</small>${en ? `<small class="ench-note">${en}</small>` : ""}</div></div>`;
    }
    if (pick.startsWith("inv:")) {
      const it = items.find(([k]) => "inv:" + k === pick); if (!it) return "";
      const n = count(s.inventory, it[0]);
      return `<div class="card"><div class="cell big"><img src="${iconURL(it[1])}"></div><div class="info"><b>${it[2]}</b><small>you have ${n || "none"}</small></div></div>`;
    }
    const e = all.find(([a]) => String(a) === pick); if (!e) return "";
    const [a, name, ic, needs0, where, note, verb = "Craft"] = e;
    const nb = near(s), gem = where === "ench" && nb.fire !== nb.ice ? (nb.fire ? "ruby" : "sapphire") : "gem";
    const needs = needs0.map(([what, n]): [string, number] => [what === "gem" ? gem : what, n]);
    const parts = needs.map(([what, n]) => {
      const g = ingredient(what, s), short = g.have < n;
      const pic = g.icon ? `<img class="${g.blk ? "blk" : ""}" src="${g.icon}">` : `<span class="txt">${g.name}</span>`;
      const pic2 = g.icon2 ? `<span class="or">or</span><div class="cell sm${short ? " short" : ""}" title="${g.name}"><img src="${g.icon2}"><span class="n">${n}</span></div>` : "";
      return `<div class="cell sm${short ? " short" : ""}" title="${g.name}: you have ${g.have}">${pic}<span class="n">${n}</span></div>${pic2}`;
    });
    const at: [string, string, boolean | null | undefined][] = where === "ench" ? [["ench_side", "an enchantment table", nb.ench]]
      : where ? where.split(" ").map((w): [string, string, boolean | undefined] => [w === "table" ? "table_side" : "furnace_front", w === "table" ? "a crafting table beside you" : "a furnace beside you", (nb as Record<string, boolean | undefined>)[w]]) : [];
    const station = at.map(([t, title, ok]) => `<div class="cell sm${ok === false ? " short" : ""}" title="${title}"><img class="blk" src="${iconURL(t)}">${ok === null ? "" : `<span class="ok">${ok ? "✔" : "✘"}</span>`}</div>`).join("");
    const missing = needs.map(([what, n]) => { const g = ingredient(what, s); return g.have < n ? (g.have === 0 && n === 1 && (what === "ruby" || what === "sapphire") ? `a ${g.name}` : `${n - g.have} more ${g.name}`) : ""; }).filter(Boolean)
      .concat(at.filter(([, , ok]) => ok === false).map(([, title]) => title))
      // Craftax enchants only what you have: armour you wear (any piece), your sword, your bow
      .concat(a === 37 && !(s.inventory.armour || []).some((v) => v > 0) ? ["armour to wear"] : a === 36 && !s.inventory.sword ? ["a sword"]
        : a === 42 && !s.inventory.bow ? ["a bow"] : []);
    // Craftax keeps one pickaxe and one sword, your best: a tier you already have (or beat) can't be made again
    const tierOf = TIER_OF[a], owned = tierOf && count(s.inventory, tierOf[0]) >= tierOf[1];
    const attr = ({ 39: "dexterity", 40: "strength", 41: "intelligence" } as Record<number, Attr | undefined>)[a], maxed = attr && s[attr] >= 5;   // Craftax caps each attribute at 5
    const why = av[a] ? "" : maxed ? `${attr[0].toUpperCase() + attr.slice(1)} is maxed out` : (a === 22 || a === 23) && made(a, s) ? `Done: all four pieces are ${a === 22 ? "iron or better" : "diamond"}` : owned ? `You already have ${count(s.inventory, tierOf![0]) > tierOf![1] ? "a better" : "this"} ${tierOf![0]}`
      : missing.length ? "Needs " + missing.join(", ") : "Not possible right now";
    // armour: named for the piece the next craft makes ("Diamond Boots"), and how many of the four are at that tier already
    const armour = (a === 22 || a === 23) && !made(a, s), tier = a - 21;
    const title = armour ? `${tier === 1 ? "Iron" : "Diamond"} ${PIECES[nextPiece(s, tier)][1]}` : name;
    const note2 = armour ? `piece ${(s.inventory.armour || []).filter((v) => v >= tier).length + 1} of 4 · ${note.replace("one piece: ", "")}` : note;
    // the enchant cards: what is enchanted already (enchanting again replaces it)
    const done = a === 36 || a === 42 ? (ELEM[enchOf(s, a === 36 ? "sword" : "bow")] ? `Already enchanted with ${ELEM[enchOf(s, a === 36 ? "sword" : "bow")]}` : "")
      : a === 37 ? PIECES.map(([k, label]) => (enchOf(s, k) && (s.inventory.armour || [])[PIECES.findIndex(([p]) => p === k)] ? `${label} (${ELEM[enchOf(s, k)]})` : "")).filter(Boolean).join(", ") : "";
    const doneTxt = a === 37 && done ? "Already enchanted: " + done : done;
    return `<div class="card"><div class="cell big${doneTxt ? " ench" : ""}"><img src="${ic(s)}"></div><div class="info"><b>${title}</b>`
      + (parts.length ? `<div class="eq">${parts.join("")}${station ? `<span class="gap"></span>${station}` : ""}</div>` : "")
      + `<small>${note2}</small>${doneTxt ? `<small class="ench-note">${doneTxt}</small>` : ""}${why ? `<small><em>${why}</em></small>` : ""}</div>`   // the reason on a line of its own (Pete: it wrapped)
      + `<button class="mc go" data-a="${a}" ${av[a] ? "" : "disabled"}>${verb}</button></div>`;
  }
}
