import { persistentWasm, wasm, WasmError } from "./package/wasm/index.ts";
import { parallel, persistentParallel } from "./package/workers/index.ts";
import { bindings, hostBindings } from "./wasm-bindings.ts";
import definition from "./wasm.worker.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const resource = wasm({ bindings });
await resource.preload();
assert(await resource.step("countWords")("Olá 世界 🌍") === 3, "Unicode");
assert(
  await resource.step("echoWide")(18446744073709551615n) ===
    18446744073709551615n,
  "u64 precision",
);
assert(
  await resource.step("increment")() === 1 &&
    await resource.step("increment")() === 1,
  "fresh instances",
);
const owner = persistentWasm({ bindings, reopenOnUse: true });
try {
  await owner.ready();
  assert(
    await owner.step("increment")() === 1 &&
      await owner.step("increment")() === 2,
    "persistent state",
  );
  try {
    await owner.step("summarize")("");
    throw new Error("expected domain failure");
  } catch (error) {
    assert(
      error instanceof WasmError && error.code === "WASM_APPLICATION",
      "domain errors",
    );
  }
  assert(
    await owner.step("increment")() === 3,
    "domain failures must preserve state",
  );
  try {
    await owner.step("trap")();
    throw new Error("expected trap");
  } catch (error) {
    assert(error instanceof WebAssembly.RuntimeError, "native trap");
  }
  assert(
    await owner.step("increment")() === 1,
    "trap replaces instance without replay",
  );
  const first = await owner.step("echoBytes")(new Uint8Array([1, 2, 3]));
  await owner.step("echoBytes")(new Uint8Array(2_000_000).fill(4));
  assert(first.join(",") === "1,2,3", "owned results after memory growth");
  await owner.close();
  assert(await owner.step("increment")() === 1, "fresh generation after close");
} finally {
  await owner.dispose();
}
const execute = parallel({
  workers: { counter: { worker: definition, count: 1 } },
  split: ({ counter }) => [counter.job(), counter.job()] as const,
  join: (values) => values.join(","),
});
assert(
  await execute() === "1,2" && await execute() === "1,2",
  "transient worker owns persistent guest",
);
const workers = persistentParallel({
  workers: { counter: { worker: definition, count: 1 } },
  split: ({ counter }) => [counter.job()] as const,
  join: ([value]) => value,
});
try {
  await workers.ready();
  assert(
    await workers.step() === 1 && await workers.step() === 2,
    "persistent worker guest state",
  );
} finally {
  await workers.dispose();
}
const freshHost = wasm({ bindings: hostBindings }).step("next");
assert(
  await freshHost() === 1 && await freshHost() === 1,
  "fresh typed host capabilities",
);
const host = persistentWasm({ bindings: hostBindings });
try {
  assert(
    await host.step("next")() === 1 && await host.step("next")() === 2,
    "persistent host state",
  );
} finally {
  await host.dispose();
}
Object.assign(globalThis, { __conveeWasmReport: { passed: true, checks: 12 } });
console.log("WASM Rust consumer: 12 checks passed");
