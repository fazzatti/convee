import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { clone, setup } from "@/workers/config.ts";
import { worker, WorkerError } from "@convee/workers";
const definition = worker((n: number) => n, { module: import.meta.url });
const options = {
  workers: { a: { worker: definition, count: 1 } },
  split: () => [],
  join: () => 0,
};
describe("Worker configuration", () => {
  it("validates complete resource and lifetime configuration without starting workers", () => {
    const valid = setup(options);
    assertEquals([
      valid.maxPending,
      valid.groups[0].timeoutMs,
      valid.groups[0].startupTimeoutMs,
      valid.groups[0].maxRestarts,
    ], [1024, 30000, 10000, 2]);
    assertEquals(
      setup({ ...options, reopenOnUse: true, idleTimeoutMs: 1 }).reopenOnUse,
      true,
    );
    for (
      const value of [
        null,
        [],
        {},
        { ...options, split: 0 },
        { ...options, join: 0 },
        { ...options, mode: "invalid" },
        { ...options, createWorker: 0 },
        { ...options, reopenOnUse: "yes" },
        { ...options, workers: {} },
        { ...options, workers: { " ": options.workers.a } },
        { ...options, workers: { a: null } },
      ]
    ) {
      assertThrows(() => setup(value), WorkerError);
    }
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, null, "1"]) {
      for (const key of ["maxPending", "idleTimeoutMs"]) {
        assertThrows(() => setup({ ...options, [key]: value }), WorkerError);
      }
      for (const key of ["count", "timeoutMs", "startupTimeoutMs"]) {
        assertThrows(
          () =>
            setup({
              ...options,
              workers: { a: { ...options.workers.a, [key]: value } },
            }),
          WorkerError,
        );
      }
    }
    assertEquals(
      setup({
        ...options,
        workers: { a: { ...options.workers.a, maxRestarts: 0 } },
      }).groups[0].maxRestarts,
      0,
    );
    assertThrows(
      () =>
        setup({
          ...options,
          workers: { a: { ...options.workers.a, maxRestarts: -1 } },
        }),
      WorkerError,
    );
  });
  it("snapshots group settings and rejects invalid branded modules", () => {
    const input = { ...options, workers: { a: { ...options.workers.a } } };
    const config = setup(input);
    input.workers.a.count = 5;
    assertEquals(config.groups[0].count, 1);
    const fake = { ...definition, module: 0 };
    assertThrows(
      () => setup({ ...options, workers: { a: { worker: fake, count: 1 } } }),
      WorkerError,
    );
  });
  it("clones data and cycles without transferring buffer ownership", () => {
    const buffer = new ArrayBuffer(4);
    const input: { buffer: ArrayBuffer; self?: unknown } = { buffer };
    input.self = input;
    const output = clone(input);
    assertEquals(output.self, output);
    assertEquals(buffer.byteLength, 4);
    assertThrows(
      () => clone({ callback: () => 0 }),
      WorkerError,
      "structured cloning",
    );
  });
});
