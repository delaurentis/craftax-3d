// The simulation's caption (Pete): a line typed out in phosphor's pixel green over the world, after the win, through the portal, on
// Try Again. Its colors: phosphor.css #pcap (laser.css: white with the laser's red glow).
import { $ } from "../../core/shared";

/** The caption's element, with its typing timers. */
type Caption = HTMLElement & { _type?: ReturnType<typeof setInterval>; _t?: ReturnType<typeof setTimeout>; _parts?: ReturnType<typeof setTimeout>[] };
// a line typed out in the pixel font, a blinking | cursor after it (Pete), near-white with a green tint and glow (class "white": pure
// white, as the world leaves phosphor); top: where on the screen; fades away after ms
// text: a line, or a list of short pieces shown one after another in its time (Pete: a phone fits "The simulation conta" at most)
export function simCaption(text: string | string[], ms: number, top = "38%") {
  let el = $("pcap") as Caption | null;
  if (!el) {
    el = document.createElement("div"); el.id = "pcap";
    el.style.cssText = "position:fixed;left:50%;transform:translate(-50%,-50%);z-index:47;pointer-events:none;font-family:'Craftax Pixel','Courier New',monospace;font-size:28px;-webkit-font-smoothing:none;white-space:nowrap;transition:opacity .9s,color .8s,text-shadow .8s;opacity:0;max-width:calc(100vw - 32px)";
    document.body.append(el);
  }
  const cap: Caption = el;
  cap.classList.remove("white"); cap.style.top = top; cap.style.opacity = "1";
  clearInterval(cap._type); clearTimeout(cap._t); (cap._parts || []).forEach(clearTimeout);
  const parts = ([] as string[]).concat(text), type = (line: string) => {
    let n = 0;
    const show = () => { cap.textContent = line.slice(0, n); const c = document.createElement("i"); c.textContent = "|"; cap.append(c); };
    clearInterval(cap._type); show();
    cap._type = setInterval(() => { n++; show(); if (n >= line.length) clearInterval(cap._type); }, 45);   // typed, a character at a time
  };
  type(parts[0]);
  const w = parts.map((l, i) => l.length + (i === parts.length - 1 ? 20 : 10)), W = w.reduce((x, y) => x + y);   // time by length, the last held longest
  let at = 0;
  cap._parts = parts.slice(1).map((line, i) => setTimeout(() => type(line), ((at += w[i]) * ms) / W));
  cap._t = setTimeout(() => (cap.style.opacity = "0"), ms);
}
