import { assert, assertEquals, assertRejects } from "@std/assert";
import { workerPool } from "./pool.ts";
import { WorkerError } from "./error.ts";
import { PROTOCOL, type RunMessage } from "./protocol.ts";
import registry from "../../test/workers/registry.ts";
import { LocalWorker, ManualWorker } from "../../test/workers/transport.ts";

const module = new URL("../../test/workers/registry.ts", import.meta.url);
const ready = {
  protocol: PROTOCOL,
  kind: "ready",
  tasks: Object.keys(registry.tasks),
};
function result(worker: ManualWorker, value: unknown): void {
  const last = worker.sent.at(-1) as RunMessage;
  worker.reply({
    protocol: PROTOCOL,
    kind: "result",
    id: last.id,
    ok: true,
    value,
  });
}
function controlled(options: Record<string, unknown> = {}) {
  const workers: ManualWorker[] = [];
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 1,
    createWorker: () => {
      const worker = new ManualWorker();
      workers.push(worker);
      return worker;
    },
    ...options,
  });
  return { pool, workers };
}

Deno.test("pool admission is bounded across callers, snapshots jobs and drains queued work", async () => {
  const { pool, workers } = controlled({ maxPending: 2 });
  const args: [number] = [1];
  const one = pool.run(pool.job("double", args));
  args[0] = 99;
  const two = pool.run(pool.job("double", [2]));
  assertEquals(
    (await assertRejects(() => pool.run(pool.job("double", [3])), WorkerError))
      .code,
    "WRK_CAPACITY",
  );
  workers[0].reply(ready);
  assertEquals((workers[0].sent.at(-1) as RunMessage).args, [1]);
  const close = pool.close();
  await assertRejects(
    () => pool.run(pool.job("double", [4])),
    WorkerError,
    "not accepting",
  );
  result(workers[0], 2);
  assertEquals(await one, 2);
  assertEquals((workers[0].sent.at(-1) as RunMessage).args, [2]);
  result(workers[0], 4);
  assertEquals(await two, 4);
  await close;
  assert(workers[0].terminated);
  await pool.close();
  await assertRejects(() => pool.ready(), WorkerError, "closed");
  pool.terminate();
});

Deno.test("batch validation is atomic and empty batches do not initialize workers", async () => {
  const { pool, workers } = controlled();
  assertEquals(await pool.settle([]), []);
  const invalid = [
    null,
    { task: "", args: [] },
    { task: "double", args: 1 },
    { task: "double", args: [], context: null },
    { task: "double", args: [], role: "other" },
    { task: "double", args: [() => 1] },
  ];
  for (const value of invalid) {
    await assertRejects(
      () =>
        Reflect.apply(pool.settle, pool, [[pool.job("double", [1]), value]]),
      WorkerError,
    );
  }
  await assertRejects(
    () => Reflect.apply(pool.settle, pool, [null]),
    WorkerError,
    "array",
  );
  await assertRejects(
    () => Reflect.apply(pool.settle, pool, [Array(1)]),
    WorkerError,
  );
  assertEquals(workers.length, 0);
  await pool.close();
});

Deno.test("ready waits for every slot and mixed-role queues do not block each other", async () => {
  const workers: ManualWorker[] = [];
  const pool = workerPool.for<typeof registry>()({
    module,
    roles: { a: { size: 1, tasks: ["double"] }, b: { size: 1 } },
    createWorker: () => {
      const worker = new ManualWorker();
      workers.push(worker);
      return worker;
    },
  });
  await assertRejects(
    () => Reflect.apply(pool.run, pool, [{ task: "double", args: [1] }]),
    WorkerError,
    "role",
  );
  await assertRejects(
    () => pool.run(pool.job("label", [1], { role: "a" })),
    WorkerError,
    "not available",
  );
  const jobs = pool.settle([
    pool.job("double", [1], { role: "a" }),
    pool.job("double", [2], { role: "a" }),
    pool.job("double", [3], { role: "b" }),
  ]);
  workers[0].reply({ ...ready, tasks: ["double"] });
  assertEquals(workers[0].sent.length, 1);
  workers[1].reply(ready);
  result(workers[1], 6);
  result(workers[0], 2);
  result(workers[0], 4);
  assertEquals(await jobs, [{ status: "fulfilled", value: 2 }, {
    status: "fulfilled",
    value: 4,
  }, { status: "fulfilled", value: 6 }]);
  await pool.close();
});

Deno.test("ordinary remote failures retain identity metadata and pool reuse", async () => {
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 1,
    createWorker: () => new LocalWorker(registry),
  });
  try {
    const failure = await assertRejects(
      () => pool.run(pool.job("fail", [])),
      WorkerError,
      "job failed",
    );
    assertEquals(failure.code, "WRK_TASK");
    assertEquals(failure.meta?.task, "fail");
    assertEquals(typeof failure.meta?.jobId, "string");
    const missing = await assertRejects(
      () => Reflect.apply(pool.run, pool, [{ task: "missing", args: [] }]),
      WorkerError,
      "Unknown task",
    );
    assertEquals(missing.code, "WRK_CONFIG");
    assertEquals(await pool.run(pool.job("double", [3])), 6);
    const uncloneable = await assertRejects(
      () => pool.run(pool.job("unclonable", [])),
      WorkerError,
    );
    assertEquals(uncloneable.code, "WRK_CLONE");
  } finally {
    await pool.close();
  }
});

Deno.test("startup failure, constructor failure and initialization timeout close the pool", async () => {
  const broken = workerPool.for<typeof registry>()({
    module,
    size: 1,
    createWorker: () => {
      throw new Error("constructor");
    },
  });
  assertEquals(
    (await assertRejects(() => broken.ready(), WorkerError)).code,
    "WRK_STARTUP",
  );
  await broken.close();
  const timed = controlled({ startupTimeoutMs: 1 });
  assertEquals(
    (await assertRejects(() => timed.pool.ready(), WorkerError)).code,
    "WRK_STARTUP",
  );
  assert(timed.workers[0].terminated);
  await timed.pool.close();
  const { pool, workers } = controlled();
  const pending = pool.settle([
    pool.job("double", [1]),
    pool.job("double", [2]),
  ]);
  workers[0].reply({
    protocol: PROTOCOL,
    kind: "fatal",
    error: { name: "Error", message: "module failed" },
  });
  assertEquals(
    (await pending).map((outcome) =>
      outcome.status === "rejected" && outcome.error.code
    ),
    ["WRK_STARTUP", "WRK_STARTUP"],
  );
  await pool.close();
});

Deno.test("closing during initialization rejects readiness and drains accepted jobs when present", async () => {
  const first = controlled();
  const starting = first.pool.ready();
  const rejected = assertRejects(() => starting, WorkerError, "closed during");
  await first.pool.close();
  await rejected;
  const second = controlled();
  const job = second.pool.run(second.pool.job("double", [1]));
  const close = second.pool.close();
  second.workers[0].reply(ready);
  result(second.workers[0], 2);
  assertEquals(await job, 2);
  await close;
  assert(second.workers[0].terminated);
});

Deno.test("malformed, duplicate and uncorrelated replies fail outstanding jobs without retry", async () => {
  const cases = [null, ready, {
    protocol: PROTOCOL,
    kind: "result",
    id: "wrong",
    ok: true,
  }, {
    protocol: PROTOCOL,
    kind: "fatal",
    error: { name: "Error", message: "fatal" },
  }];
  for (const reply of cases) {
    const { pool, workers } = controlled();
    const pending = pool.settle([
      pool.job("double", [1]),
      pool.job("double", [2]),
    ]);
    workers[0].reply(ready);
    workers[0].reply(reply);
    assertEquals(
      (await pending).map((outcome) =>
        outcome.status === "rejected" && outcome.error.code
      ),
      ["WRK_PROTOCOL", "WRK_PROTOCOL"],
    );
    assert(workers[0].terminated);
    await pool.close();
  }
  const { pool, workers } = controlled({ size: 2 });
  const starting = pool.ready();
  workers[0].reply(ready);
  workers[1].reply({ ...ready, tasks: ["different"] });
  await assertRejects(() => starting, WorkerError, "Inconsistent");
  await pool.close();
});

Deno.test("worker transport errors and execution deadlines terminate outstanding work", async () => {
  for (const type of ["error", "messageerror"]) {
    const { pool, workers } = controlled();
    const pending = pool.settle([pool.job("double", [1])]);
    workers[0].reply(ready);
    workers[0].dispatchEvent(new Event(type, { cancelable: true }));
    assertEquals((await pending)[0].status, "rejected");
    await pool.close();
  }
  const timed = controlled({ timeoutMs: 1 });
  const job = timed.pool.run(timed.pool.job("double", [1]));
  timed.workers[0].reply(ready);
  assertEquals(
    (await assertRejects(() => job, WorkerError)).code,
    "WRK_TIMEOUT",
  );
  await timed.pool.close();
  const dispatch = controlled();
  const outcome = dispatch.pool.run(dispatch.pool.job("double", [1]));
  dispatch.workers[0].postMessage = () => {
    throw new Error("broken transport");
  };
  dispatch.workers[0].reply(ready);
  assertEquals(
    (await assertRejects(() => outcome, WorkerError)).code,
    "WRK_CRASH",
  );
  await dispatch.pool.close();
});

Deno.test("force termination settles active and queued jobs and is safe before startup", async () => {
  const { pool, workers } = controlled();
  const jobs = pool.settle([pool.job("double", [1]), pool.job("double", [2])]);
  workers[0].reply(ready);
  pool.terminate();
  assertEquals(
    (await jobs).map((outcome) =>
      outcome.status === "rejected" && outcome.error.code
    ),
    ["WRK_CLOSED", "WRK_CLOSED"],
  );
  await assertRejects(
    () => pool.run(pool.job("double", [1])),
    WorkerError,
    "terminated",
  );
  await pool.close();
  const empty = controlled();
  empty.pool.terminate();
  await empty.pool.close();
  assertEquals(empty.workers.length, 0);
});

Deno.test("reentrant input getters cannot admit jobs after close or exceed capacity", async () => {
  const closed = controlled();
  const args: [number] = [1];
  Object.defineProperty(args, "0", {
    get() {
      void closed.pool.close();
      return 1;
    },
  });
  assertEquals(
    (await assertRejects(
      () => closed.pool.run(closed.pool.job("double", args)),
      WorkerError,
    )).code,
    "WRK_CLOSED",
  );
  assertEquals(closed.workers.length, 0);
  const bounded = controlled({ maxPending: 1 });
  let nested: Promise<number> | undefined;
  Object.defineProperty(args, "0", {
    get() {
      nested = bounded.pool.run(bounded.pool.job("double", [3]));
      return 1;
    },
  });
  assertEquals(
    (await assertRejects(
      () => bounded.pool.run(bounded.pool.job("double", args)),
      WorkerError,
    )).code,
    "WRK_CAPACITY",
  );
  bounded.workers[0].reply(ready);
  result(bounded.workers[0], 6);
  assertEquals(await nested, 6);
  assertEquals(bounded.workers[0].sent.length, 2);
  await bounded.pool.close();
});

Deno.test("closing from a custom worker factory releases its transport and stops spawning", async () => {
  const transports: ManualWorker[] = [];
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 2,
    createWorker: () => {
      void pool.close();
      const transport = new ManualWorker();
      transports.push(transport);
      return transport;
    },
  });
  await assertRejects(() => pool.ready(), WorkerError, "closed during");
  assertEquals(transports.length, 1);
  assert(transports[0].terminated);
  await pool.close();
});

Deno.test("transport cleanup failure still stops other workers and rejects close", async () => {
  const { pool, workers } = controlled({ size: 2 });
  const starting = pool.ready();
  workers.forEach((worker) => worker.reply(ready));
  await starting;
  workers[0].removeEventListener = () => {
    throw new Error("listener cleanup");
  };
  workers[0].terminate = () => {
    throw new Error("termination failed");
  };
  const failure = await assertRejects(
    () => pool.close(),
    WorkerError,
    "cleanup failed",
  );
  assertEquals(failure.code, "WRK_CRASH");
  assert(workers[1].terminated);
  await assertRejects(() => pool.close(), WorkerError, "cleanup failed");
});
