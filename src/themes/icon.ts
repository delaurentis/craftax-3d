// A theme's icon (Theme.icon: an inline SVG, or a letter or two; T without one) and Standard's, a leafy tree: the theme button beside
// the views (ui.ts) and the replay page's keyframe row draw them.
export const STANDARD_ICON = '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M7 2h6v2h2v2h1v6h-1v1h-3v1h-4v-1H5v-1H4V6h1V4h2z" fill="#4caf3c"/><path d="M8 4h3v1h2v2h-2V6H8zM5 8h2v2H5z" fill="#7ed35a"/><path d="M9 13h2v5H9zM7 17h6v1H7z" fill="#8a5a2e"/></svg>';
/** An icon as HTML with this class on it, an SVG drawn `size` square (a letter: in a <b>). */
export function iconHTML(icon: string | undefined, cls: string, size = 16): string {
  const i = icon || "T";
  if (!i.trimStart().startsWith("<svg")) return `<b class="${cls}">${i.replace(/[<&]/g, "")}</b>`;
  return i.replace("<svg", `<svg class="${cls}"`).replace(/\swidth="\d+"/, ` width="${size}"`).replace(/\sheight="\d+"/, ` height="${size}"`);
}
