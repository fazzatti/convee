import { worker } from "./package/workers/index.ts";
import { persistentWasm } from "./package/wasm/index.ts";
import { bindings } from "./wasm-bindings.ts";

// This import-free guest owns only worker-local memory. Termination releases its
// isolate; arbitrary host-resource cleanup would need an explicit application protocol.
const text = persistentWasm({ bindings });
export default worker(text.step("increment"), { module: import.meta.url });
