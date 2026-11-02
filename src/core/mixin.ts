// A class split over several modules: mixin(Target, ...Parts) copies each part's methods onto Target's prototype as class methods
// are (non-enumerable, same names, same `this`), in the order given; a part is a class holding only methods.
export function mixin(target: { prototype: object }, ...parts: { prototype: object }[]): void {
  for (const part of parts) for (const k of Object.getOwnPropertyNames(part.prototype)) {
    if (k !== "constructor") Object.defineProperty(target.prototype, k, Object.getOwnPropertyDescriptor(part.prototype, k)!);
  }
}
