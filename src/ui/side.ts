// The phone-on-its-side layout on any touch screen held sideways, and on a tablet either way up (Pete: an iPad plays best like an
// iPhone on its side: the view buttons down the left, full screen and the touch-controls button beside the hotbar, the floor's
// plaque folded). The phone layout is CSS media queries on a short screen, (max-height: 520px); on a touch screen ((pointer:
// coarse), or ?touch to try it in a resized window) each of them also matches sideways and on a tablet-sized screen: phoneMedia()
// for the queries in code, widenPhoneCss() for the style sheets'. The big screen's own rules (min-height: 521px) don't apply there.
// An upright phone keeps its own layout (max-width: 720px, portrait), as do the menus (a short screen only: 32.5em, phone.css).
const PHONE_Q = /max-height:\s*520px/, SIDE = "(orientation: landscape)", TABLET = "(min-width: 600px) and (min-height: 600px)";
/** A touch screen (decided once, at load). */
export const TOUCH_SIDE = !/[?&]replay\b/.test(location.search) && (matchMedia("(pointer: coarse)").matches || /[?&]touch\b/.test(location.search));   // (a replay's frame keeps its own layout)
/** matchMedia, a phone-layout query also matching a touch screen held sideways or tablet-sized. */
export const phoneMedia = (q: string): MediaQueryList => matchMedia(TOUCH_SIDE && PHONE_Q.test(q) ? `${q}, ${SIDE}, ${TABLET}` : q);
/** The style sheets' phone-layout rules, also for a touch screen held sideways or tablet-sized (once each, as sheets come). */
export function widenPhoneCss(): void {
  if (!TOUCH_SIDE) return;
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule) {
        const t = r.media.mediaText, has = Array.from(r.media);
        if (PHONE_Q.test(t) && !has.includes(SIDE)) { r.media.appendMedium(SIDE); r.media.appendMedium(TABLET); }
        else if (/min-height:\s*521px/.test(t)) r.media.mediaText = "not all";   // (the big screen's own: never on a touch screen now)
      }
      if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of Array.from(document.styleSheets)) { try { walk(s.cssRules); } catch {} }   // (another origin's sheet: not ours)
}
