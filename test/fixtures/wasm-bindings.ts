import { jcoBindings } from "./package/wasm/jco.ts";
// @deno-types="./rust-text/text.d.ts"
import { instantiate } from "./rust-text/text.js";
import { modules } from "./rust-text/modules.ts";
export const bindings = jcoBindings({
  instantiate,
  modules,
  imports: () => ({}),
  isApplicationError: (value: unknown) =>
    !!value && typeof value === "object" && !(value instanceof Error) &&
    (Reflect.get(value, "tag") === "empty" ||
      Reflect.get(value, "tag") === "too-long"),
});

// @deno-types="./rust-host/host.d.ts"
import { instantiate as hostFactory } from "./rust-host/host.js";
import { modules as hostModules } from "./rust-host/modules.ts";
export const hostBindings = jcoBindings({
  instantiate: hostFactory,
  modules: hostModules,
  imports: () => {
    let count = 0;
    return { "next-value": { default: () => ++count } };
  },
});
