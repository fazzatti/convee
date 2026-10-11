import { plugin } from "./package/index.ts";
import {
  parallel,
  persistentParallel,
  WorkerError,
  type WorkerJob,
} from "./package/workers/index.ts";
import definition, { type Request, type Result } from "./worker-registry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function options() {
  return {
    workers: { document: { worker: definition, count: 1, timeoutMs: 250 } },
    split: (
      { document }: { document: { job(input: Request): WorkerJob<Result> } },
      inputs: Request[],
    ) => inputs.map((input) => [document.job(input)] as const),
    join: (values: readonly (readonly [Result])[]) =>
      values.map(([value]) => value),
  };
}
async function rejected(call: () => Promise<unknown>, code: string) {
  try {
    await call();
  } catch (error) {
    assert(
      error instanceof WorkerError && error.code === code,
      `Expected ${code}, received ${String(error)}`,
    );
    return;
  }
  throw new Error(`Expected ${code}`);
}
Object.assign(globalThis, { __conveeStage: "transient" });
const transient = parallel(options());
const first = await transient([{ value: 1 }, { value: 2 }]);
const next = await transient([{ value: 3 }]);
assert(
  first[0].value === 2 && first[1].counter === 2 && next[0].counter === 1,
  "ordered nested results or transient lifetime",
);
assert(first[0].instance !== next[0].instance, "transient instance reused");
Object.assign(globalThis, { __conveeStage: "persistent" });
const owner = persistentParallel({ ...options(), reopenOnUse: true });
try {
  await owner.ready();
  const a = await owner.step([{ value: 1 }]),
    b = await owner.step([{ value: 2 }]);
  assert(
    a[0].instance === b[0].instance && b[0].counter === 2,
    "persistent reuse",
  );
  await owner.close();
  const c = await owner.step([{ value: 3 }]);
  assert(
    c[0].instance !== a[0].instance && c[0].counter === 1,
    "new generation after close",
  );
} finally {
  await owner.dispose();
}
await rejected(() => owner.step([]), "WRK_CLOSED");
Object.assign(globalThis, { __conveeStage: "seed" });
const seeded = parallel({
  workers: options().workers,
  split: ({ document }) =>
    [
      document.job({ operation: "context", value: 0 }).withContext({
        seed: { seed: 8 },
      }),
      document.job({ operation: "context", value: 0 }),
    ] as const,
  join: ([a, b]) => [a.value, b.value],
});
assert(JSON.stringify(await seeded()) === "[9,1]", "fresh job contexts");
Object.assign(globalThis, { __conveeStage: "collect" });
const collecting = persistentParallel({
  ...options(),
  mode: "collect",
  join: (values) => values,
});
try {
  const outcomes = await collecting.step([{ operation: "error", value: 0 }, {
    operation: "clone",
    value: 0,
  }, { value: 2 }]);
  assert(
    outcomes[0][0].status === "rejected" &&
      outcomes[1][0].status === "rejected" &&
      outcomes[2][0].status === "fulfilled",
    "collect outcomes",
  );
  const failure = outcomes[0][0].error as WorkerError;
  assert(
    failure.code === "WRK_TASK" && failure.meta?.remote?.code === "EMPTY" &&
      failure.meta?.remote?.domain === "consumer",
    "remote diagnostics",
  );
  for (const operation of ["crash", "timeout"] as const) {
    const values = await collecting.step([{ operation, value: 0 }, {
      value: 4,
    }]);
    assert(
      values[0][0].status === "rejected" && values[1][0].status === "fulfilled",
      "replacement did not serve later work",
    );
    assert(
      (values[0][0].error as WorkerError).code ===
        (operation === "crash" ? "WRK_CRASH" : "WRK_TIMEOUT"),
      "wrong transport failure",
    );
    assert(
      values[1][0].value.counter === 1,
      "failed job replayed or replacement retained state",
    );
  }
  const exhausted = await collecting.step([{ operation: "crash", value: 0 }, {
    value: 1,
  }]);
  assert(
    exhausted.every(([outcome]) => outcome.status === "rejected"),
    "restart budget was reset",
  );
  await rejected(() => collecting.step([{ value: 1 }]), "WRK_UNAVAILABLE");
} finally {
  await collecting.dispose();
}
Object.assign(globalThis, { __conveeStage: "recovery" });
const recovery = definition.use(
  plugin().onError((): Result => ({
    value: 42,
    instance: "recovery",
    counter: 0,
  })),
);
const recovered = await parallel({
  ...options(),
  workers: { document: { worker: recovery, count: 1, timeoutMs: 40 } },
})([{ operation: "timeout", value: 0 }]);
assert(recovered[0].value === 42, "caller timeout recovery");
Object.assign(globalThis, { __conveeStage: "idle" });
const idle = persistentParallel({
  ...options(),
  reopenOnUse: true,
  idleTimeoutMs: 10,
});
try {
  const before = await idle.step([{ value: 1 }]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const after = await idle.step([{ value: 1 }]);
  assert(
    before[0].instance !== after[0].instance,
    "idle generation did not close/reopen",
  );
} finally {
  await idle.dispose();
}
Object.assign(globalThis, { __conveeStage: "scoped" });
const scoped = persistentParallel(options());
await scoped.ready();
await scoped[Symbol.asyncDispose]();
await rejected(() => scoped.step([]), "WRK_CLOSED");
Object.assign(globalThis, { __conveeStage: "terminate" });
const terminated = persistentParallel({ ...options(), reopenOnUse: true });
await terminated.ready();
await terminated.terminate();
await rejected(() => terminated.step([]), "WRK_CLOSED");
await terminated.dispose();
Object.assign(globalThis, { __conveeStage: "complete" });
const report = {
  passed: true,
  checks: [
    "nested-order",
    "transient-cleanup",
    "persistent-reuse",
    "reopen",
    "job-contexts",
    "remote-diagnostics",
    "clone-failure",
    "crash",
    "timeout",
    "bounded-replacement",
    "caller-recovery",
    "idle",
    "disposal",
    "termination",
  ],
};
Object.assign(globalThis, { __conveeReport: report });
console.log(JSON.stringify(report));
