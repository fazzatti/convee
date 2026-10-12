/** Resolve a runtime sibling in both original TypeScript and emitted JavaScript. */
export function moduleUrl(name: string, parent: string): URL {
  const extension = new URL(parent).pathname.endsWith(".ts") ? ".ts" : ".js";
  return new URL(`./${name}${extension}`, parent);
}
