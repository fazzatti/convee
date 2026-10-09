import {
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { pipe, plugin, step } from "../index.ts";
import { parallel } from "./parallel.ts";
import { workerPool } from "./pool.ts";
import { workerRegistry } from "./registry.ts";
import { WorkerError } from "./error.ts";
import registry from "../../test/workers/registry.ts";
import { LocalWorker } from "../../test/workers/transport.ts";

const module = new URL("../../test/workers/registry.ts", import.meta.url);

Deno.test("parallel is an ordinary reusable async Step with typed mixed results and outer plugins", async () => {
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 2,
    createWorker: () => new LocalWorker(registry),
  });
  let finalized = 0;
  try {
    const process = parallel({
      workers: pool,
      id: "combined",
      split: (n: number) =>
        [pool.job("double", [n]), pool.job("label", [n])] as const,
      join: ([number, label]) => ({ number, label }),
    }).use(
      plugin().onFinally(() => {
        finalized++;
      }),
    );
    const flow = pipe([step((n: number) => n + 1), process]);
    assertEquals(process.isSync, false);
    assertEquals(await flow(2), { number: 6, label: "value:3" });
    assertEquals(
      await process.runWith({
        plugins: [
          plugin().onOutput((value: { number: number; label: string }) => ({
            ...value,
            number: value.number + 10,
          })),
        ],
      }, 4),
      { number: 18, label: "value:4" },
    );
    assertEquals(finalized, 2);
    assertEquals(await process(1), { number: 2, label: "value:1" });
  } finally {
    await pool.close();
  }
});

Deno.test("all mode waits for other jobs before error recovery and finalization", async () => {
  let finish!: (n: number) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const local = workerRegistry({
    tasks: {
      fail: () => () => {
        throw new Error("failed");
      },
      slow: () => () =>
        new Promise<number>((resolve) => {
          finish = resolve;
          entered();
        }),
    },
  });
  const pool = workerPool.for<typeof local>()({
    module,
    size: 2,
    createWorker: () => new LocalWorker(local),
  });
  const events: string[] = [];
  try {
    const process = parallel({
      workers: pool,
      split: () => [pool.job("fail", []), pool.job("slow", [])] as const,
      join: () => {
        events.push("join");
        return 1;
      },
    }).use(
      plugin()
        .onError((error) => {
          assertInstanceOf(error, WorkerError);
          assertEquals(error.code, "WRK_BATCH");
          assertInstanceOf(error.cause, AggregateError);
          events.push("recover");
          return 4;
        })
        .onOutput((value: number) => value + 1)
        .onFinally(() => {
          events.push("finally");
        }),
    );
    const pending = process();
    await Promise.race([started, pending]);
    assertEquals(typeof finish, "function");
    assertEquals(events, []);
    finish(2);
    assertEquals(await pending, 5);
    assertEquals(events, ["recover", "finally"]);
  } finally {
    finish?.(0);
    await pool.close();
  }
});

Deno.test("collect mode exposes ordered failures to join and supports empty work", async () => {
  let workers = 0;
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 2,
    createWorker: () => {
      workers++;
      return new LocalWorker(registry);
    },
  });
  try {
    const empty = parallel({
      workers: pool,
      split: () => [] as const,
      join: (values) => values.length,
    });
    assertEquals(await empty(), 0);
    assertEquals(workers, 0);
    const process = parallel({
      workers: pool,
      mode: "collect",
      split: () => [pool.job("fail", []), pool.job("double", [3])] as const,
      join: ([failed, succeeded]) => ({
        failed: failed.status,
        value: succeeded.status === "fulfilled" ? succeeded.value : 0,
      }),
    });
    assertEquals(await process(), { failed: "rejected", value: 6 });
  } finally {
    await pool.close();
  }
});

Deno.test("split and join failures use normal error hooks; input failures only finalize", async () => {
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 1,
    createWorker: () => new LocalWorker(registry),
  });
  const failure = new Error("caller failure");
  let finalized = 0;
  try {
    const split = parallel({
      workers: pool,
      split: (): [] => {
        throw failure;
      },
      join: () => 1,
    }).use(
      plugin().onError((error) => {
        assertEquals(error, failure);
        return 5;
      }),
    );
    assertEquals(await split(), 5);
    const join = parallel({
      workers: pool,
      split: () => [] as const,
      join: (): number => {
        throw failure;
      },
    }).use(plugin().onError(() => 6));
    assertEquals(await join(), 6);
    const input = parallel({
      workers: pool,
      split: (n: number) => [pool.job("double", [n])],
      join: ([n]) => n,
    }).use(
      plugin().onInput((_n: number): number => {
        throw failure;
      }).onError(() => 10).onFinally(() => {
        finalized++;
      }),
    );
    assertEquals(await assertRejects(() => input(1), Error), failure);
    assertEquals(finalized, 1);
  } finally {
    await pool.close();
  }
});

Deno.test("parallel validates configuration and snapshots callbacks at construction", async () => {
  for (
    const value of [null, {}, { split() {}, join() {}, workers: {} }, {
      split() {},
      join() {},
      workers: { settle() {} },
      mode: "unknown",
    }]
  ) {
    assertThrows(
      () => Reflect.apply(parallel, undefined, [value]),
      WorkerError,
    );
  }
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 1,
    createWorker: () => new LocalWorker(registry),
  });
  try {
    const config = { workers: pool, split: () => [] as const, join: () => 1 };
    const process = parallel(config);
    config.join = () => 2;
    assertEquals(await process(), 1);
  } finally {
    await pool.close();
  }
});
