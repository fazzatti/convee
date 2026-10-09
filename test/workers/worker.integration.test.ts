import { assertEquals, assertRejects } from "@std/assert";
import { parallel, WorkerError, workerPool } from "../../src/workers/index.ts";
import type registry from "./registry.ts";

const module = new URL("./registry.ts", import.meta.url);

Deno.test("real workers assemble mixed recipes, roles and worker-local finalizers", async () => {
  const pool = workerPool.for<typeof registry>()({
    module,
    pipelines: {
      measured: {
        steps: ["length", "double"],
        plugins: [{ name: "add", options: { amount: 1 } }],
      },
    },
    roles: {
      normal: { size: 1 },
      audit: {
        size: 1,
        plugins: { measured: [{ name: "add", options: { amount: 10 } }] },
      },
    },
  });
  try {
    const operation = parallel({
      workers: pool,
      split: (text: string) =>
        [
          pool.job("measured", [text], { role: "normal" }),
          pool.job("measured", [text], { role: "audit" }),
          pool.job("label", [2], { role: "normal" }),
        ] as const,
      join: ([normal, audit, label]) => ({ normal, audit, label }),
    });
    assertEquals(await operation("abc"), {
      normal: 7,
      audit: 17,
      label: "value:2",
    });
    assertEquals(
      await pool.run(pool.job("finalized", [], { role: "normal" })),
      { done: true },
    );
    assertEquals(
      await pool.run(
        pool.job("count", [], {
          role: "normal",
          context: { seed: { count: 4 } },
        }),
      ),
      5,
    );
    assertEquals(await pool.run(pool.job("count", [], { role: "normal" })), 1);
  } finally {
    await pool.close();
  }
});

Deno.test("CPU jobs run in separate real workers and keep result order", async () => {
  const pool = workerPool.for<typeof registry>()({
    module,
    size: 2,
    timeoutMs: 10000,
  });
  try {
    const buffer = new SharedArrayBuffer(4);
    const values = await pool.settle(
      [
        pool.job("barrier", [buffer, "first"]),
        pool.job("barrier", [buffer, "second"]),
      ] as const,
    );
    assertEquals(values, [{ status: "fulfilled", value: "first" }, {
      status: "fulfilled",
      value: "second",
    }]);
    assertEquals(new Int32Array(buffer)[0], 2);
  } finally {
    await pool.close();
  }
});

Deno.test("real task errors and uncloneable results reject jobs without poisoning the pool", async () => {
  const pool = workerPool.for<typeof registry>()({ module, size: 1 });
  try {
    const failure = await assertRejects(
      () => pool.run(pool.job("fail", [])),
      WorkerError,
      "job failed",
    );
    assertEquals(failure.code, "WRK_TASK");
    const clone = await assertRejects(
      () => pool.run(pool.job("unclonable", [])),
      WorkerError,
      "could not be cloned",
    );
    assertEquals(clone.code, "WRK_CLONE");
    assertEquals(await pool.run(pool.job("double", [4])), 8);
  } finally {
    await pool.close();
  }
});
