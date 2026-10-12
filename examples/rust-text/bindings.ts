import { jcoBindings } from "@convee/wasm/jco";
// @deno-types="@example/rust-text/generated/text.d.ts"
import { instantiate } from "@example/rust-text/generated/text.js";
import { modules } from "@example/rust-text/generated/modules.ts";

/**
 * Import-free Rust text component with fresh-instance generated bindings.
 * Use with wasm or persistentWasm; importing this descriptor does not load WASM.
 * Generated top-level Result payloads are recognized for this import-free world.
 * Traps and unknown failures remain fatal, and asset mismatches reject preload.
 */
export const textBindings = jcoBindings({
  instantiate,
  modules,
  imports: () => ({}),
  isApplicationError(error) {
    // This exact world has no host imports that can throw lookalike payloads.
    return !!error && typeof error === "object" &&
      !(error instanceof Error) &&
      (Reflect.get(error, "tag") === "empty" ||
        (Reflect.get(error, "tag") === "too-long" &&
          Number.isInteger(Reflect.get(error, "val"))));
  },
});
