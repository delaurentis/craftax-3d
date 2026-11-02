// The Craftax map of the current floor as blocks: one mesh per material, rebuilt when the map, items or light change.
// World axes: x = Craftax column, z = Craftax row, y up; the ground's top is y = 0 and tile (r, c) spans [c, c+1] × [r, r+1].
// The parts live in src/world/ (blocks.ts: the block ids and looks; geo.ts: the mesh kit; core.ts: the World class, its methods in
// terrain.ts, build.ts, shapes.ts, light.ts, merged into its type there); this module keeps the names everything imports from it.
import "./textures";
import "./shading";
export { World } from "../src/world/core";
export { B, ITEM, FLOOR_BRICK, FLOOR_STONE, FLOOR_DIRT, DIRT_DIP, CEIL, isSolid } from "../src/world/blocks";
