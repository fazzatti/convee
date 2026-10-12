import { persistentWasm, wasm, WasmError } from "./package/wasm/index.ts";
import { parallel, persistentParallel } from "./package/workers/index.ts";
import {
  abiBindings,
  bindings,
  hostBindings,
  pairBindings,
} from "./wasm-bindings.ts";
import definition from "./wasm.worker.ts";
import abiWorker from "./wasm-abi.worker.ts";
import packetWorker from "./wasm-packet.worker.ts";
import { abiEqual, abiPacket, runAbiMatrix } from "./wasm-abi-cases.ts";

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
const freshAbi = await runAbiMatrix(wasm({ bindings: abiBindings }));
const persistentAbi = persistentWasm({
  bindings: abiBindings,
  maxRestarts: 32,
});
let reusedAbi;
try {
  reusedAbi = await runAbiMatrix(persistentAbi);
} finally {
  await persistentAbi.dispose();
}
abiEqual(freshAbi, reusedAbi);
const inWorker = parallel({
  // One job executes thousands of ABI calls, including a fresh instance for
  // each exhaustive scalar value. Give this conformance workload its own bound.
  workers: { abi: { worker: abiWorker, count: 1, timeoutMs: 120_000 } },
  split: ({ abi }) => [abi.job()] as const,
  join: ([value]) => value,
});
abiEqual(await inWorker(), { fresh: freshAbi, persistent: reusedAbi });
const payloads = [abiPacket(), {
  ...abiPacket(),
  pair: [NaN, "nan"] as [number, string],
}];
const crossBoundary = parallel({
  workers: { packet: { worker: packetWorker, count: 2 } },
  split: ({ packet }) => payloads.map((value) => packet.job(value)),
  join: (values) => values,
});
abiEqual(
  await crossBoundary(),
  payloads.map((value) => ({ ...value, name: "host:" + value.name })),
);
const pair = persistentWasm({ bindings: pairBindings, maxRestarts: 4 });
try {
  assert(await pair.step("add")(25) === 42, "actual multi-module linking");
  for (
    const [name, kind] of [
      ["badChar", TypeError],
      ["badUtf8", TypeError],
      ["badStringPointer", RangeError],
      ["outOfBoundsList", WebAssembly.RuntimeError],
    ] as const
  ) {
    try {
      await pair.step(name)();
      throw new Error("expected invalid guest rejection: " + name);
    } catch (error) {
      assert(error instanceof kind, "invalid guest lifting: " + name);
    }
    assert(
      await pair.step("add")(1) === 18,
      "invalid result retires and replaces its instance",
    );
  }
} finally {
  await pair.dispose();
}
Object.assign(globalThis, {
  __conveeWasmReport: {
    passed: true,
    checks: 12,
    abi: {
      cases: freshAbi.cases,
      exports: freshAbi.exports,
      modes: ["fresh", "persistent", "worker-fresh", "worker-persistent"],
      crossBoundary: true,
      multiCore: true,
      malformedGuest: ["char", "utf8", "string-pointer", "byte-list-bounds"],
    },
  },
});
console.log(
  "WASM Rust consumer: 12 original checks; " + freshAbi.cases.length +
    " ABI cases in four modes, rich worker payloads and multi-core lifting passed",
);
