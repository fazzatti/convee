import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ConcurrencyError, concurrent, plugin, step } from "@convee";
import { deferred } from "@test/support/runtime.ts";

describe("Concurrent lifecycle boundaries", () => {
  it("enforces shared global capacity even when the task limits would allow more work", async () => {
    const entered = deferred(), release = deferred();
    let active = 0, peak = 0;
    const seen: number[] = [];
    const run = async (n: number) => {
      seen.push(n);
      peak = Math.max(peak, ++active);
      if (seen.length === 2) entered.resolve();
      await release.promise;
      active--;
      return n;
    };
    const unit = concurrent({
      concurrency: 2,
      tasks: {
        odd: { run, concurrency: 2 },
        even: { run, concurrency: 2 },
      },
      split: (
        { tasks },
        n: number,
      ) => [(n % 2 ? tasks.odd : tasks.even).job(n)],
      join: ([n]) => n,
    });
    const runs = [1, 2, 3, 4].map((n) => unit(n));
    await entered.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.resolve();
    assertEquals(await Promise.all(runs), [1, 2, 3, 4]);
    assertEquals(peak, 2);
    assertEquals(active, 0);
    assertEquals(seen, [1, 2, 3, 4]);
  });

  it("drains failed input and output hooks before admitting the next task", async () => {
    for (const phase of ["input", "output"] as const) {
      const failure = new RangeError(phase);
      const events: string[] = [];
      let recoveries = 0;
      const failed = step((n: number) => {
        events.push("body");
        return n;
      });
      failed.use(
        plugin.for<[number], number>()({
          input: (n) => {
            if (phase === "input") throw failure;
            return n;
          },
          output: () => {
            throw failure;
          },
          error: () => ++recoveries,
          finally: async () => {
            await Promise.resolve();
            events.push("cleanup");
          },
        }),
      );
      const unit = concurrent({
        concurrency: 1,
        mode: "collect",
        tasks: {
          failed,
          next: () => {
            events.push("next");
            return 2;
          },
        },
        split: ({ tasks }) => [tasks.failed.job(1), tasks.next.job()] as const,
        join: (results) => results,
      });
      const [first, second] = await unit();
      assert(first.status === "rejected");
      assertStrictEquals(first.error, failure);
      assertEquals(second, { status: "fulfilled", value: 2 });
      assertEquals(recoveries, 0);
      assertEquals(
        events,
        phase === "input" ? ["cleanup", "next"] : ["body", "cleanup", "next"],
      );
    }
  });

  it("keeps body recovery and finalizer failures inside their task lifecycle", async () => {
    const original = new Error("body"), cleanup = new Error("cleanup");
    const events: string[] = [];
    const recovered = step((_n: number): number => {
      throw original;
    });
    recovered.use(
      plugin.for<[number], number>()({
        input: (n) => n,
        error: (error) => {
          assertStrictEquals(error, original);
          return 42;
        },
        finally: () => {
          events.push("recovered");
        },
      }),
    );
    const failed = step(() => 1);
    failed.use(
      plugin().onFinally(() => {
        events.push("failed");
        throw cleanup;
      }),
    );
    const unit = concurrent({
      tasks: { recovered: { run: recovered }, failed },
      mode: "collect",
      split: ({ tasks }) =>
        [tasks.recovered.job(0), tasks.failed.job()] as const,
      join: (values) => values,
    });
    const [one, two] = await unit();
    assertEquals(one, { status: "fulfilled", value: 42 });
    assert(two.status === "rejected");
    assertEquals(Reflect.get(two.error, "code"), "RT_000");
    assertEquals(events.sort(), ["failed", "recovered"]);
  });

  it("normalizes non-Error failures from custom compatible callables", async () => {
    const cause = { reason: "custom" };
    const custom = Object.assign(() => 1, {
      id: "custom",
      isSync: false,
      runWith() {
        throw cause;
      },
    });
    const unit = concurrent({
      tasks: { custom },
      split: ({ tasks }) => [tasks.custom.job()],
      join: (values) => values,
    });
    const error = await unit().catch((error) => error);
    assert(error instanceof Error);
    assertStrictEquals(error.cause, cause);
    assertEquals(
      new ConcurrencyError("CNC_CONFIG", "bad").toJSON().domain,
      "concurrency",
    );
  });

  it("removes a cancelled waiting invocation while unrelated active and queued invocations continue", async () => {
    const entered = deferred(),
      release = deferred(),
      abort = new AbortController();
    const seen: number[] = [];
    const unit = concurrent({
      concurrency: 1,
      tasks: {
        work: async (n: number) => {
          seen.push(n);
          entered.resolve();
          await release.promise;
          return n;
        },
      },
      split: ({ tasks }, n: number) => [tasks.work.job(n)],
      join: ([n]) => n,
    });
    const first = unit(1);
    await entered.promise;
    const canceled = unit.runWith({ signal: abort.signal }, 2).catch((error) =>
      error
    );
    const third = unit(3);
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    assert((await canceled) instanceof ConcurrencyError);
    assertEquals(seen, [1]);
    release.resolve();
    assertEquals(await Promise.all([first, third]), [1, 3]);
    assertEquals(seen, [1, 3]);
  });

  it("does not release a timed-out non-cooperative task or run outer finalizers early", async () => {
    const entered = deferred(), expired = deferred(), release = deferred();
    let calls = 0, finalized = 0;
    const unit = concurrent({
      concurrency: 1,
      tasks: {
        work: async () => {
          calls++;
          entered.resolve();
          await release.promise;
          return calls;
        },
      },
      split: ({ tasks, signal }) => {
        signal.addEventListener("abort", () => expired.resolve(), {
          once: true,
        });
        return [tasks.work.job()];
      },
      join: ([n]) => n,
    });
    unit.use(
      plugin().onFinally(() => {
        finalized++;
      }),
    );
    const first = unit.runWith({ timeoutMs: 5 }).catch((error) => error);
    await entered.promise;
    const second = unit();
    await expired.promise;
    assertEquals(calls, 1);
    assertEquals(finalized, 0);
    release.resolve();
    const error = await first;
    assert(error instanceof ConcurrencyError);
    assertEquals(error.code, "CNC_TIMEOUT");
    assertEquals(await second, 2);
    assertEquals(finalized, 2);
  });

  it("cleans up external abort listeners and does not let a late abort affect later calls", async () => {
    const abort = new AbortController();
    let added = 0, removed = 0;
    const add = abort.signal.addEventListener.bind(abort.signal),
      remove = abort.signal.removeEventListener.bind(abort.signal);
    abort.signal.addEventListener = (...args: Parameters<typeof add>) => {
      added++;
      add(...args);
    };
    abort.signal.removeEventListener = (...args: Parameters<typeof remove>) => {
      removed++;
      remove(...args);
    };
    const unit = concurrent({
      timeoutMs: 1,
      tasks: { work: () => 1 },
      split: ({ tasks }) => [tasks.work.job()],
      join: ([n]) => n,
    });
    assertEquals(
      await unit.runWith({ signal: abort.signal, timeoutMs: 1000 }),
      1,
    );
    assertEquals([added, removed], [1, 1]);
    abort.abort();
    assertEquals(await unit.runWith({ timeoutMs: 1000 }), 1);
    await assertRejects(
      () => unit.runWith({ signal: Object.create(AbortSignal.prototype) }),
      ConcurrencyError,
      "AbortSignal",
    );
  });

  it("handles split, join and outer input failures without starting or replaying work", async () => {
    for (const phase of ["input", "split", "join"] as const) {
      let calls = 0, finals = 0;
      const failure = new Error(phase);
      const unit = concurrent({
        tasks: { work: () => ++calls },
        split: ({ tasks }) => {
          if (phase === "split") throw failure;
          return [tasks.work.job()];
        },
        join: () => {
          if (phase === "join") throw failure;
          return calls;
        },
      });
      unit.use(
        plugin.for<[], number>()({
          input: () => {
            if (phase === "input") throw failure;
            return [];
          },
          finally: () => {
            finals++;
          },
        }),
      );
      assertStrictEquals(await unit().catch((error) => error), failure);
      assertEquals(calls, phase === "join" ? 1 : 0);
      assertEquals(finals, 1);
    }
  });

  it("checks abortion during descriptor access before batch admission", async () => {
    const abort = new AbortController();
    let calls = 0;
    const unit = concurrent({
      tasks: { work: () => ++calls },
      split: ({ tasks }) =>
        Object.defineProperty([], 0, {
          get() {
            abort.abort();
            return tasks.work.job();
          },
        }),
      join: () => calls,
    });
    await assertRejects(
      () => unit.runWith({ signal: abort.signal }),
      ConcurrencyError,
    );
    assertEquals(calls, 0);
  });

  it("supports special own task names without prototype dispatch and invokes each descriptor occurrence", async () => {
    let calls = 0;
    const tasks = {
      ["__proto__"]: () => ++calls,
      constructor: () => "constructor",
    };
    const unit = concurrent({
      tasks,
      split: ({ tasks }) => {
        const job = tasks.__proto__.job();
        return [job, [job, tasks.constructor.job()]] as const;
      },
      join: (values) => values,
    });
    assertEquals(await unit(), [1, [2, "constructor"]]);
  });
});
