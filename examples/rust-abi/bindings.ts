import { jcoBindings } from "@convee/wasm/jco";
// @deno-types="@example/rust-abi/generated/abi.d.ts"
import { instantiate } from "@example/rust-abi/generated/abi.js";
import { modules } from "@example/rust-abi/generated/modules.ts";
import type { Packet } from "@example/rust-abi/generated/abi.d.ts";

/**
 * Typed conformance guest with one deterministic, owned-value host capability.
 * Importing only describes the component. Guest Result failures preserve their
 * payloads; all other failures retire the instance. The classifier is specific
 * to this fixture's declared Results and its nonthrowing observe capability.
 */
export const abiBindings = jcoBindings({
  instantiate,
  modules,
  imports: () => ({
    observe: {
      default: (value: Packet) => ({ ...value, name: "host:" + value.name }),
    },
  }),
  isApplicationError: (value: unknown) =>
    value === undefined || value === "declared" ||
    (!!value && typeof value === "object" && !(value instanceof Error) &&
      ["none", "number", "text", "points"].includes(Reflect.get(value, "tag"))),
});
