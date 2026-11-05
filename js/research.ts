import { config } from "../src/config";
import { researchHTML } from "./research-content";

// The Research screen (the start menu's Research button, or a page of its own: /papers/, /agents/, /repos/, and /research/ for the first):
// one tab at a time (the tabs above the list, index.html #research-tabs); the last one opened stays open for this visit
const HOME = (config.site || "https://playcraftax.com").replace(/^https?:\/\//, "");   // this site's name, in the agent steps
const ROUTES: Record<string, string> = { "/research/": "papers", "/papers/": "papers", "/agents/": "agents", "/repos/": "repos" };
// the tab this address opens, if it's one of Research's own pages
export const routeTab = (): string | undefined => ROUTES[location.pathname.replace(/\/?$/, "/")];
// off Research's own page, back to the home address (the screen closed)
export function leaveResearchRoute() { if (routeTab()) history.replaceState(null, "", "/" + location.search); }
let tab = "papers";
export function renderResearch(el: HTMLElement, which = tab) {
  tab = which;
  document.querySelectorAll<HTMLElement>("#research-tabs .tab").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    b.onclick = (e) => {   // (on a host's pages a tab is a link, for search engines; here it just switches)
      e.preventDefault(); (e.currentTarget as HTMLElement).blur();
      if (b.dataset.tab === tab) return;
      if (routeTab()) history.replaceState(null, "", `/${b.dataset.tab}/` + location.search);   // the address follows, on Research's own pages
      renderResearch(el, b.dataset.tab);
    };
  });
  el.innerHTML = researchHTML(tab, HOME);
  el.querySelectorAll<HTMLElement>("button.cp").forEach((b) => (b.onclick = () => {
    navigator.clipboard?.writeText(b.dataset.copy!).then(() => { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1200); }, () => {});
  }));
  el.closest(".win")?.scrollTo(0, 0);
}
