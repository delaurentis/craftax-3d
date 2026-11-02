// Pictures of the world: the screenshot button and My Worlds' thumbnails.
import "../looks/render";
import { HOTBAR } from "../../js/hud";
import { fx } from "../../js/fell";
import { local, GOD } from "../../js/local";
import { net } from "../../js/net";
import { $ } from "../core/shared";
import { canvas } from "../render/scene";
import { flat, game } from "../core/game";
import { view2d } from "../looks/looks";
import { flash } from "./hud/hint";
import { screens } from "./screens/screen";

// this module's state that other modules set (one module can't assign another's let): thumbWanted, shotWanted, thumbAt
export interface Snaps {
  /** A My Worlds picture wanted after the next render (grabThumb). */
  thumbWanted: boolean;
  /** A screenshot wanted after the next render (grabShot). */
  shotWanted: boolean;
  /** When the last picture was taken (performance.now()). */
  thumbAt: number;
}
export const snaps = {} as Snaps;

// the screenshot button (top bar): the scene alone at full resolution, no HUD, buttons or crosshair. Taken right after a render
// (the drawing buffer is gone after the frame); the 2D art and its memory strips are drawn over it as they sit on the screen
snaps.shotWanted = false;
// the world as the screen shows it, without the HUD: the scene, the 2D art over it and the memory strips (the screenshot; a replay's
// video draws each frame into the same canvas, c)
export function worldPicture(c = document.createElement("canvas")) {
  if (c.width !== canvas.width || c.height !== canvas.height) Object.assign(c, { width: canvas.width, height: canvas.height });
  const g = c.getContext("2d")!, sx = canvas.width / innerWidth, sy = canvas.height / innerHeight;
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0);
  if (flat.img > 0 && view2d.naturalWidth) {
    g.globalAlpha = flat.img;
    if (view2d.classList.contains("solid")) { g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height); }
    const s = Math.min(innerWidth / view2d.naturalWidth, innerHeight / view2d.naturalHeight), w = view2d.naturalWidth * s, h = view2d.naturalHeight * s;
    g.drawImage(view2d, ((innerWidth - w) / 2) * sx, ((innerHeight - h) / 2) * sy, w * sx, h * sy);
    g.globalAlpha = 1;
  }
  for (const id of ["mem-l", "mem-r"]) {
    const m = $(id) as HTMLCanvasElement; if (m.style.display === "none" || !m.width) continue;
    const r = m.getBoundingClientRect();
    g.drawImage(m, r.left * sx, r.top * sy, r.width * sx, r.height * sy);
  }
  return c;
}
export function grabShot() {
  snaps.shotWanted = false;
  const c = worldPicture();
  try {
    c.toBlob((b) => {
      if (!b) return flash("Can't take a screenshot of this view");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: "craftax-" + new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".png" });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      flash("Screenshot saved");
    }, "image/png");
  } catch (e) { flash("Can't take a screenshot of this view"); }        // a tainted canvas (another server's 2D frame)
}
// the world's picture in My Worlds: the view as it is, 96 × 54 (center-cropped to 16:9), ~3 KB of WebP; grabbed right after a
// render (the drawing buffer is gone after the frame), every 15 s of play and on the way into the pause menu, which saves too
snaps.thumbWanted = false; snaps.thumbAt = 0;
// the menu's backdrop next time (index.html #backdrop): a bigger picture of this world, kept with its save (?new and ?god keep their own)
export const SHOT_KEY = `craftax3d.${/[?&]new\b/.test(location.search) ? "new" : GOD ? "god" : "local"}.shot`, shotCv = document.createElement("canvas");
export const thumbCv = Object.assign(document.createElement("canvas"), { width: 96, height: 54 });
export function grabThumb() {
  snaps.thumbWanted = false;
  // whatever view you play in (Pete): any 3D view, the 3/4 one too, or the classic 2D art (its image, when that is what's shown)
  if (!net.local || !game.S || !game.S.world || !game.S.world.you || game.S.done) return;
  const art = flat.mode === 1 && flat.picture && view2d.naturalWidth, src = art ? view2d : canvas;
  const w = art ? view2d.naturalWidth : canvas.width, h = art ? view2d.naturalHeight : canvas.height, cw = Math.min(w, (h * 16) / 9), ch = (cw * 9) / 16;
  const g = thumbCv.getContext("2d")!; g.imageSmoothingEnabled = !art;   // (the art's pixels stay crisp)
  try { g.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, 96, 54); } catch { return; }
  try { local.thumb(thumbCv.toDataURL("image/webp", 0.75)); } catch { return; }   // (a tainted image: no picture this time)
  try {                                                                     // and the menu's backdrop when you come back (Pete)
    const k = Math.min(1, 1024 / Math.max(w, h)); shotCv.width = Math.round(w * k); shotCv.height = Math.round(h * k);
    const g2 = shotCv.getContext("2d")!; g2.imageSmoothingEnabled = !art; g2.drawImage(src, 0, 0, shotCv.width, shotCv.height);
    localStorage.setItem(SHOT_KEY, shotCv.toDataURL("image/webp", 0.6));
  } catch {}
  if (screens.screen !== null) local.flush().catch(() => {});                       // paused: save now, with its picture
}
// where a gathered piece flies (fell.ts fx.target): its slot in the materials row, stone to its hotbar slot; and its landing
fx.target = (k) => {
  const el = (k === "stone" || k === "sapling" ? $("hotbar")!.children[HOTBAR.findIndex((h) => h.action === (k === "stone" ? 7 : 10))] : $("res")!.querySelector(`[data-k="${k}"]`)) as HTMLElement | null;
  if (!el || !el.offsetParent) return null;                                 // not shown (a phone with the HUD folded): the hotbar
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
fx.arrive = (k) => game.hud.release(k);
