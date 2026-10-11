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

// @deno-types="./rust-abi/abi.d.ts"
import { instantiate as abiFactory } from "./rust-abi/abi.js";
import { modules as abiModules } from "./rust-abi/modules.ts";
export const abiBindings = jcoBindings({
  instantiate: abiFactory,
  modules: abiModules,
  imports: () => ({
    observe: { default: (value) => ({ ...value, name: "host:" + value.name }) },
  }),
  isApplicationError: (value: unknown) =>
    value === undefined || value === "declared" ||
    (!!value && typeof value === "object" && !(value instanceof Error) &&
      ["none", "number", "text", "points"].includes(Reflect.get(value, "tag"))),
});

// @deno-types="./component-pair/pair.d.ts"
import { instantiate as pairFactory } from "./component-pair/pair.js";
import { modules as pairModules } from "./component-pair/modules.ts";
export const pairBindings = jcoBindings({
  instantiate: pairFactory,
  modules: pairModules,
  imports: () => ({}),
});
