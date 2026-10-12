import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ConcurrencyError, concurrent, plugin, step } from "@convee";
import { deferred } from "@test/support/runtime.ts";

describe("Concurrent worker API alignment", () => {
  it("gives overlapping invocations independent capacity and admission by default", async () => {
    for (const capacityScope of [undefined, "invocation"] as const) {
      let active = 0, peak = 0;
      const release = deferred();
      const unit = concurrent({
        capacityScope,
        concurrency: 1,
        maxPending: 1,
        tasks: {
          work: async (n: number) => {
            peak = Math.max(peak, ++active);
            await release.promise;
            active--;
            return n;
          },
        },
        split: ({ work }, values: number[]) => values.map((n) => work.job(n)),
        join: (values) => values,
      });
      const runs = Promise.allSettled([unit([1]), unit([2])]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      release.resolve();
      assertEquals(await runs, [
        { status: "fulfilled", value: [1] },
        { status: "fulfilled", value: [2] },
      ]);
      assertEquals(peak, 2);
      assertEquals(active, 0);
      await assertRejects(() => unit([3, 4]), ConcurrencyError, "maxPending");
      assertEquals(await unit([5]), [5]);
    }
  });

  it("captures explicit shared ownership at construction without sharing budgets between definitions", async () => {
    const release = deferred(), entered = deferred();
    const config = {
      capacityScope: "shared" as "shared" | "invocation",
      concurrency: 1,
      maxPending: 1,
    };
    const options = () => ({
      ...config,
      tasks: {
        work: async (n: number) => {
          entered.resolve();
          await release.promise;
          return n;
        },
      },
      split: (
        { work }: {
          work: { job(n: number): import("@convee").ConcurrentJob<number> };
        },
        n: number,
      ) => [work.job(n)],
      join: ([n]: readonly number[]) => n,
    });
    const firstOptions = options();
    const first = concurrent(firstOptions), second = concurrent(options());
    firstOptions.capacityScope = "invocation";
    const running = first(1);
    await entered.promise;
    const other = second(2);
    const rejected = first(3).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.resolve();
    const error = await rejected;
    assert(error instanceof ConcurrencyError);
    assertEquals(error.code, "CNC_CAPACITY");
    assertEquals(await Promise.all([running, other]), [1, 2]);
    assertEquals(await first(4), 4);
  });

  it("exposes a common invocation signal without reserving task names", async () => {
    const signals: AbortSignal[] = [];
    const unit = concurrent({
      tasks: { signal: (value: AbortSignal) => value, tasks: () => 2 },
      split: ({ signal, tasks }) => {
        assertStrictEquals(signal.signal, tasks.signal);
        signals.push(signal.signal);
        assert(Object.isFrozen(signal));
        return [signal.job(signal.signal), tasks.job()] as const;
      },
      join: ([signal, n]) => ({ signal, n }),
    });
    assertEquals((await unit()).n, 2);
    const next = await unit();
    assertStrictEquals(next.signal, signals[1]);
    assert(signals[0] !== signals[1]);
  });

  it("cancels one invocation without affecting another invocation's tasks or signals", async () => {
    const release = deferred();
    const signals: AbortSignal[] = [];
    const seen: number[] = [];
    let active = 0, finalized = 0;
    const work = step(async (value: number, signal: AbortSignal) => {
      seen.push(value);
      signals.push(signal);
      active++;
      await release.promise;
      active--;
      signal.throwIfAborted();
      return value;
    }).use(
      plugin().onFinally(() => {
        finalized++;
      }),
    );
    const unit = concurrent({
      concurrency: 1,
      tasks: { work },
      split: ({ work }, value: number) =>
        [
          work.job(value, work.signal),
          work.job(value + 1, work.signal),
        ] as const,
      join: (values) => values,
    });
    const controller = new AbortController(), reason = new Error("one caller");
    const first = unit.runWith({ signal: controller.signal }, 1).catch((
      error,
    ) => error);
    const second = unit(3);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(reason);
    const aborted = signals.map((signal) => signal.aborted);
    const prematureFinalizers = finalized;
    release.resolve();
    const error = await first;
    assert(error instanceof ConcurrencyError);
    assertEquals(error.code, "CNC_ABORTED");
    assertStrictEquals(error.cause, reason);
    assertEquals(await second, [3, 4]);
    assertEquals(aborted, [true, false]);
    assertEquals(prematureFinalizers, 0);
    assertEquals(seen, [1, 3, 4]);
    assertEquals([active, finalized], [0, 3]);
  });

  it("keeps body and finalizer failures in one batch and exposes them to outer recovery", async () => {
    const bodyError = new RangeError("body"),
      cleanupError = new Error("cleanup");
    const failed = step(() => {
      throw bodyError;
    });
    const cleanup = step(() => 1).use(
      plugin().onFinally(() => {
        throw cleanupError;
      }),
    );
    let joined = false, recovered = 0, finalized = 0;
    const unit = concurrent({
      tasks: { failed, cleanup, ok: () => 3 },
      split: ({ failed, cleanup, ok }) =>
        [failed.job(), ok.job(), cleanup.job()] as const,
      join: () => {
        joined = true;
        return 1;
      },
    });
    unit.use(
      plugin.for<[], number>()({
        error: (error) => {
          assert(error instanceof ConcurrencyError);
          assertEquals(error.code, "CNC_BATCH");
          assert(error.cause instanceof AggregateError);
          const errors = error.cause.errors;
          assertEquals(errors.length, 2);
          assertStrictEquals(errors[0], bodyError);
          assertEquals(Reflect.get(errors[1], "code"), "RT_000");
          assertStrictEquals(error.meta?.failures?.[1], errors[1]);
          recovered++;
          return 42;
        },
        finally: () => {
          finalized++;
        },
      }),
    );
    assertEquals(await unit(), 42);
    assertEquals([joined, recovered, finalized], [false, 1, 1]);
    const returnedError = new Error("ordinary output");
    const ordinary = concurrent({
      tasks: { value: () => returnedError },
      split: ({ value }) => [value.job()] as const,
      join: ([value]) => value,
    });
    assertStrictEquals(await ordinary(), returnedError);
  });
});
