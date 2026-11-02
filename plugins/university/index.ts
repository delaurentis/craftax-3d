// The University scene pack: an example of a plugin that brings set pieces, real content written into a new world (doc/themes.md).
//   ?scene=oxford    Radcliffe Square on an edge of the map: the Radcliffe Camera on its round lawn inside an iron railing, the paved
//                    square round it and an avenue to where you start (square.ts)
//   ?scene=campus    a college campus past an edge of the map, seen across the water: cream stone and green copper domes (campus.ts)
// Its building stone is the Ruins theme's (plugins/ruins), which goes well with it: install both, `plugins: [university(), ruins()]`.
// `university({ default: true })` makes Radcliffe Square the scene new worlds are made in without ?scene=.
import type { Plugin } from "craftax-3d/plugin";
import { square } from "./square";
import { campus } from "./campus";

export interface UniversityOptions {
  /** Radcliffe Square is the scene the game starts in (its worlds are still kept apart from the standard game's). */
  default?: boolean;
}

/** The University scene pack: Radcliffe Square (?scene=oxford) and the campus. */
export default function university(opts: UniversityOptions = {}): Plugin {
  return {
    name: "university",
    provides: ["setPieces"],
    setup(host) {
      host.add("setPieces", { ...square, default: opts.default });
      host.add("setPieces", campus);
    },
  };
}
