import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { plugin } from "@convee";
import { parallel, persistentParallel, WorkerError } from "@convee/workers";
import definition, { type Input } from "@test/workers/registry.ts";
function options(count = 1) {
  return {
    workers: {
      operation: { worker: definition, count, timeoutMs: 200, maxRestarts: 2 },
    },
    split: (
      { operation }: {
        operation: {
          job(
            input: Input,
          ): import("@convee/workers").WorkerJob<
            { value: number; instance: string; counter: number }
          >;
        };
      },
      inputs: Input[],
    ) => inputs.map((input) => operation.job(input)),
    join: (
      values: readonly { value: number; instance: string; counter: number }[],
    ) => values,
  };
}
describe("Real module workers", () => {
  it("isolates worker state, retains ordered CPU results and cleans ordinary invocations", async () => {
    const execute = parallel(options(2));
    const first = await execute([{ operation: "cpu", value: 2 }, {
      operation: "cpu",
      value: 3,
    }]);
    assert(first.every((value) => value.counter >= 1));
    await using warmed = persistentParallel(options(2));
    await warmed.ready();
    const simultaneous = await warmed.step([{ operation: "cpu" }, {
      operation: "cpu",
    }]);
    assertEquals(simultaneous.map((value) => value.counter), [1, 1]);
    assertNotEquals(simultaneous[0].instance, simultaneous[1].instance);
    const next = await execute([{ operation: "value", value: 5 }]);
    assertEquals(next[0].counter, 1);
    assertEquals(next[0].value, 6);
    assertNotEquals(next[0].instance, first[0].instance);
  });
  it("keeps persistent closure state but creates fresh seeded job contexts", async () => {
    await using owner = persistentParallel({ ...options(), reopenOnUse: true });
    const first = await owner.step([{ operation: "state" }]);
    const second = await owner.step([{ operation: "state" }]);
    assertEquals(first[0].instance, second[0].instance);
    assertEquals(second[0].counter, 2);
    await owner.close();
    const reopened = await owner.step([{ operation: "state" }]);
    assertNotEquals(reopened[0].instance, first[0].instance);
    assertEquals(reopened[0].counter, 1);
    const seeded = parallel({
      workers: { operation: { worker: definition, count: 1 } },
      split: ({ operation }) =>
        [
          operation.job({ operation: "context" }).withContext({
            seed: { count: 7 },
          }),
          operation.job({ operation: "context" }),
        ] as const,
      join: (values) => values.map((value) => value.value),
    });
    assertEquals(await seeded(), [8, 1]);
  });
  it("reports bounded domain diagnostics and clone failures without poisoning the worker", async () => {
    await using owner = persistentParallel({
      ...options(),
      mode: "collect",
      join: (values) => values,
    });
    const values = await owner.step([{ operation: "error" }, {
      operation: "clone",
    }, { operation: "value", value: 2 }]);
    assertEquals(values.map((value) => value.status), [
      "rejected",
      "rejected",
      "fulfilled",
    ]);
    if (values[0].status !== "rejected" || values[1].status !== "rejected") {
      throw new Error("Missing diagnostics");
    }
    const error = values[0].error as WorkerError;
    assertEquals(error.code, "WRK_TASK");
    assertEquals(error.meta?.group, "operation");
    assertEquals(error.meta?.path, [0]);
    assertEquals(error.meta?.remote?.code, "DOCUMENT_EMPTY");
    assertEquals(error.meta?.remote?.domain, "document");
    assertEquals(error.meta?.remote?.meta, { bounded: "[Function]" });
    assertEquals((values[1].error as WorkerError).code, "WRK_CLONE");
  });
  it("replaces crashed and timed out instances without replaying their jobs", async () => {
    await using owner = persistentParallel({
      ...options(),
      mode: "collect",
      join: (values) => values,
    });
    for (const operation of ["crash", "timeout"] as const) {
      const values = await owner.step([{ operation }, {
        operation: "value",
        value: 2,
      }]);
      assertEquals(values[0].status, "rejected");
      assertEquals(values[1].status, "fulfilled");
      if (values[0].status === "rejected") {
        assertEquals(
          (values[0].error as WorkerError).code,
          operation === "crash" ? "WRK_CRASH" : "WRK_TIMEOUT",
        );
      }
      if (values[1].status === "fulfilled") {
        assertEquals(values[1].value.counter, 1);
      }
    }
    const exhausted = await owner.step([{ operation: "crash" }, {
      operation: "value",
    }]);
    assert(exhausted.every((value) => value.status === "rejected"));
    await assertRejects(
      () => owner.step([{ operation: "value" }]),
      WorkerError,
      "unavailable",
    );
  });
  it("caller error hooks recover a real transport timeout before join", async () => {
    const fallback = { value: 42, instance: "recovered", counter: 0 };
    const recoverable = definition.use(plugin().onError(() => fallback));
    const result = await parallel({
      ...options(),
      workers: { operation: { worker: recoverable, count: 1, timeoutMs: 30 } },
    })([{ operation: "timeout" }]);
    assertEquals(result, [fallback]);
  });
});
