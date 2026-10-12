import { worker } from "./package/workers/index.ts";
import { wasm } from "./package/wasm/index.ts";
import { abiBindings } from "./wasm-bindings.ts";

export default worker(wasm({ bindings: abiBindings }).step("throughHost"), {
  module: import.meta.url,
});
