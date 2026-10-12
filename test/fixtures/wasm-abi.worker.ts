import { worker } from "./package/workers/index.ts";
import { persistentWasm, wasm } from "./package/wasm/index.ts";
import { abiBindings } from "./wasm-bindings.ts";
import { runAbiMatrix } from "./wasm-abi-cases.ts";

export default worker(async () => {
  const fresh = await runAbiMatrix(wasm({ bindings: abiBindings }));
  await using owner = persistentWasm({
    bindings: abiBindings,
    maxRestarts: 32,
  });
  const persistent = await runAbiMatrix(owner);
  return { fresh, persistent };
}, { module: import.meta.url });
