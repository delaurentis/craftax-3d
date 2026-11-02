// Files that sit beside the page (the Craftax art, replay.html), found from this module's own place: it is one folder below the
// page, in src/ while developing and in assets/ in a build, so "../x" is the page's x either way, wherever the page is served.
export const besidePage = (rel: string): URL => new URL(/* @vite-ignore */ "../" + rel, import.meta.url);
