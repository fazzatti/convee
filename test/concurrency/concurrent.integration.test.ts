import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ConcurrencyError,
  concurrent,
  type ConcurrentJob,
  createRunContext,
  pipe,
  plugin,
  type RunContext,
  step,
} from "@convee";
import { deferred } from "@test/support/runtime.ts";

describe("Local concurrent steps", () => {
  it("composes functions, steps and pipelines with ordered heterogeneous results", async () => {
    const double = step((n: number) => n * 2);
    const label = pipe([(n: number) => n + 1, (n: number) => `item-${n}`]);
    const unit = concurrent({
      tasks: { double, label, identity: <T>(value: T) => value },
      split: (tasks, n: number) =>
        [tasks.double.job(n), [tasks.label.job(n)], []] as const,
      join: ([n, [label], empty]) => ({ n, label, empty }),
    });
    assertEquals(
      await pipe([
        unit,
        (value: { label: string; n: number }) => `${value.label}:${value.n}`,
      ])(4),
      "item-5:8",
    );
    assertEquals(unit.isSync, false);
    assertEquals(await unit.run(2), { n: 4, label: "item-3", empty: [] });
  });

  it("preserves closure, class, function and original error identities", async () => {
    class Account {
      constructor(readonly address: string) {}
      signer() {
        return this.address;
      }
    }
    const account = new Account("A");
    const signer = () => account.signer();
    const failure = new RangeError("domain");
    const unit = concurrent({
      tasks: {
        inspect: (value: Account, fn: typeof signer) => {
          assertStrictEquals(fn, signer);
          return value;
        },
        fail: () => {
          throw failure;
        },
      },
      mode: "collect",
      split: (tasks) =>
        [tasks.inspect.job(account, signer), tasks.fail.job()] as const,
      join: (results) => results,
    });
    const [ok, bad] = await unit();
    assert(ok.status === "fulfilled");
    assertStrictEquals(ok.value, account);
    assertEquals(ok.value.signer(), "A");
    assert(bad.status === "rejected");
    assertStrictEquals(bad.error, failure);
  });

  it("does not start tasks while asynchronous split is building the plan", async () => {
    const ready = deferred(), release = deferred();
    let calls = 0;
    const unit = concurrent({
      tasks: { work: () => ++calls },
      split: async (tasks) => {
        const job = tasks.work.job();
        ready.resolve();
        await release.promise;
        return [job];
      },
      join: (values) => values,
    });
    const result = unit();
    await ready.promise;
    assertEquals(calls, 0);
    release.resolve();
    assertEquals(await result, [1]);
  });

  it("shares global and per-task capacities across overlapping calls without blocking other task groups", async () => {
    const enteredA = deferred(), enteredB = deferred(), release = deferred();
    const seen: string[] = [];
    let active = 0, peak = 0;
    const body = async (name: string) => {
      seen.push(name);
      peak = Math.max(peak, ++active);
      (name.startsWith("A") ? enteredA : enteredB).resolve();
      await release.promise;
      active--;
      return name;
    };
    const unit = concurrent({
      capacityScope: "shared",
      concurrency: 2,
      tasks: { a: { run: body, concurrency: 1 }, b: body },
      split: (tasks, batch: number) =>
        batch === 1
          ? [tasks.a.job("A1"), tasks.a.job("A2")]
          : [tasks.b.job("B1")],
      join: (values) => values,
    });
    const one = unit(1);
    await enteredA.promise;
    const two = unit(2);
    await enteredB.promise;
    assertEquals(seen, ["A1", "B1"]);
    assertEquals(peak, 2);
    release.resolve();
    assertEquals(await one, ["A1", "A2"]);
    assertEquals(await two, ["B1"]);
    assertEquals(seen, ["A1", "B1", "A2"]);
    assertEquals(active, 0);
  });

  it("retains capacity through asynchronous task output and finally hooks", async () => {
    for (const phase of ["output", "finally"] as const) {
      const entered = deferred(), release = deferred();
      let calls = 0;
      const inner = step((n: number) => {
        calls++;
        return n;
      });
      inner.use(
        plugin.for<[number], number>()(
          phase === "output"
            ? {
              output: async (value: number) => {
                entered.resolve();
                await release.promise;
                return value;
              },
            }
            : {
              finally: async () => {
                entered.resolve();
                await release.promise;
              },
            },
        ),
      );
      const unit = concurrent({
        capacityScope: "shared",
        concurrency: 1,
        tasks: { inner },
        split: (tasks, n: number) => [tasks.inner.job(n)],
        join: ([n]) => n,
      });
      const one = unit(1);
      await entered.promise;
      const two = unit(2);
      await Promise.resolve();
      await Promise.resolve();
      assertEquals(calls, 1);
      release.resolve();
      assertEquals(await Promise.all([one, two]), [1, 2]);
    }
  });

  it("runs all-mode cleanup before aggregating all original errors in input order", async () => {
    const entered = deferred(), release = deferred();
    const first = new Error("first"), second = new Error("second");
    let finalized = false, joined = false;
    const inner = step(async (n: number) => {
      if (n === 1) {
        entered.resolve();
        await release.promise;
        throw first;
      }
      throw second;
    });
    inner.use(
      plugin().onFinally(() => {
        finalized = true;
      }),
    );
    const unit = concurrent({
      tasks: { inner },
      split: (tasks) => [tasks.inner.job(1), tasks.inner.job(2)],
      join: () => {
        joined = true;
      },
    });
    let settled = false;
    const result = unit().catch((error) => error).finally(() => {
      settled = true;
    });
    await entered.promise;
    await Promise.resolve();
    assertEquals(settled, false);
    release.resolve();
    const error = await result;
    assert(error instanceof ConcurrencyError);
    assertEquals(error.code, "CNC_BATCH");
    assertEquals(error.meta?.failures, [first, second]);
    assert(error.cause instanceof AggregateError);
    assertStrictEquals(error.cause.errors[0], first);
    assertStrictEquals(error.cause.errors[1], second);
    assert(finalized);
    assertEquals(joined, false);
  });

  it("keeps native outer plugins, temporary hooks and finalization behavior", async () => {
    const events: string[] = [];
    const unit = concurrent({
      id: "batch",
      tasks: { work: (n: number) => n * 2 },
      split: (tasks, n: number) => [tasks.work.job(n)],
      join: ([n]) => n,
      plugins: [
        plugin().onFinally(() => {
          events.push("finally");
        }),
      ],
    });
    const transform = plugin.for<[number], number>()({
      input: (n) => n + 1,
      output: (n) => n + 10,
    });
    assertStrictEquals(unit.use(transform), unit);
    const view = unit.plugins;
    assertEquals(view.length, 2);
    const result = await unit.runWith({
      plugins: [plugin.for<[number], number>()({ output: (n) => n + 100 })],
    }, 2);
    assertEquals(result, 116);
    assertEquals(events, ["finally"]);
    assertStrictEquals(unit.remove(transform.id), unit);
    assertEquals(view.length, 2);
    assertEquals(await unit(2), 4);
  });

  it("shares native parent state while isolating concurrent task invocation views", async () => {
    const parent = createRunContext({
      capture: "all",
      seed: { marker: "shared" },
    });
    const ready = [deferred(), deferred()], release = deferred();
    const views: RunContext[] = [];
    const inner = step(async function (n: number) {
      const context = this.context();
      views.push(context);
      ready[n].resolve();
      await release.promise;
      assertEquals(context.step.current().input, [n]);
      return context.state.get("marker");
    }, { id: "inner" });
    const unit = concurrent({
      id: "outer",
      tasks: { inner },
      split: (tasks) => [tasks.inner.job(0), tasks.inner.job(1)],
      join: (values) => values,
    });
    const result = unit.runWith({ context: { parent } });
    await Promise.all(ready.map((x) => x.promise));
    assert(views[0] !== views[1]);
    release.resolve();
    assertEquals(await result, ["shared", "shared"]);
    assertEquals(parent.step.get("outer")?.output, ["shared", "shared"]);
  });

  it("rejects admission atomically and accepts later work after capacity is released", async () => {
    const entered = deferred(), release = deferred();
    const seen: number[] = [];
    const unit = concurrent({
      capacityScope: "shared",
      concurrency: 1,
      maxPending: 2,
      tasks: {
        work: async (n: number) => {
          seen.push(n);
          entered.resolve();
          await release.promise;
          return n;
        },
      },
      split: (tasks, values: number[]) => values.map((n) => tasks.work.job(n)),
      join: (values) => values,
    });
    const first = unit([1, 2]);
    await entered.promise;
    const rejected = unit([3]).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const beforeRelease = [...seen];
    release.resolve();
    const error = await rejected;
    assert(error instanceof ConcurrencyError);
    assertEquals(error.code, "CNC_CAPACITY");
    assertEquals(beforeRelease, [1]);
    assertEquals(await first, [1, 2]);
    assertEquals(await unit([4]), [4]);
    await assertRejects(() => unit([5, 6, 7]), ConcurrencyError, "maxPending");
    assertEquals(seen, [1, 2, 4]);
  });

  it("cancels queued work but retains active capacity and outer finalizers until settlement", async () => {
    const abort = new AbortController(),
      entered = deferred(),
      release = deferred();
    const seen: number[] = [];
    let finalized = 0;
    const unit = concurrent({
      capacityScope: "shared",
      concurrency: 1,
      tasks: {
        work: async (n: number) => {
          seen.push(n);
          entered.resolve();
          await release.promise;
          return n;
        },
      },
      split: (tasks, values: number[]) => values.map((n) => tasks.work.job(n)),
      join: (values) => values,
    });
    unit.use(
      plugin().onFinally(() => {
        finalized++;
      }),
    );
    const first = unit.runWith({ signal: abort.signal }, [1, 2]).catch((
      error,
    ) => error);
    await entered.promise;
    const other = unit([3]);
    await Promise.resolve();
    abort.abort("caller");
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(finalized, 0);
    assertEquals(seen, [1]);
    release.resolve();
    const error = await first;
    assert(error instanceof ConcurrencyError);
    assertEquals(error.code, "CNC_ABORTED");
    assertEquals(error.cause, "caller");
    assertEquals(await other, [3]);
    assertEquals(seen, [1, 3]);
    assertEquals(finalized, 2);
  });

  it("propagates a derived signal to cooperative tasks and skips join", async () => {
    const external = new AbortController(), entered = deferred();
    let joined = false;
    const unit = concurrent({
      tasks: {
        work: async (signal: AbortSignal) => {
          entered.resolve();
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true })
          );
          signal.throwIfAborted();
        },
      },
      split: ({ work }) => [work.job(work.signal)],
      join: () => {
        joined = true;
      },
      mode: "collect",
    });
    const result = unit.runWith({ signal: external.signal }).catch((error) =>
      error
    );
    await entered.promise;
    external.abort();
    assert((await result) instanceof ConcurrencyError);
    assertEquals(joined, false);
  });

  it("rejects pre-aborted calls through native error/finally hooks without running split", async () => {
    const controller = new AbortController();
    controller.abort();
    let split = false, final = false;
    const unit = concurrent({
      tasks: {},
      split: () => {
        split = true;
        return [];
      },
      join: () => "done",
    });
    unit.use(
      plugin.for<[], string>()({
        error: () => "recovered",
        finally: () => {
          final = true;
        },
      }),
    );
    assertEquals(
      await unit.runWith({ signal: controller.signal }),
      "recovered",
    );
    assertEquals(split, false);
    assert(final);
  });

  it("supports deadlines during split, running work and join without early cleanup", async () => {
    for (const phase of ["split", "task", "join"] as const) {
      let signal!: AbortSignal, cleaned = false;
      const wait = async () => {
        if (!signal.aborted) {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true })
          );
        }
        cleaned = true;
      };
      const unit = concurrent({
        timeoutMs: 5,
        tasks: {
          work: async () => {
            if (phase === "task") await wait();
            return 1;
          },
        },
        split: async (scope) => {
          signal = scope.work.signal;
          if (phase === "split") await wait();
          return [scope.work.job()];
        },
        join: async (values) => {
          if (phase === "join") await wait();
          return values;
        },
      });
      const error = await unit().catch((error) => error);
      assert(error instanceof ConcurrencyError);
      assertEquals(error.code, "CNC_TIMEOUT");
      assert(cleaned);
    }
  });

  it("supports empty plans, synchronous steps and snapshots mutable configuration", async () => {
    const tasks = { value: { run: step.sync(() => 1), concurrency: 1 } };
    const unit = concurrent({
      tasks,
      split: (tasks, empty: boolean) => empty ? [] : [tasks.value.job()],
      join: (values) => values,
    });
    tasks.value.run = step.sync(() => 2);
    tasks.value.concurrency = 20;
    assertEquals(await unit(false), [1]);
    assertEquals(await unit(true), []);
    const empty = concurrent({
      tasks: {},
      split: () => [],
      join: () => "empty",
    });
    assertEquals(await empty(), "empty");
  });

  it("rejects foreign and cross-invocation jobs and malformed trees before side effects", async () => {
    let saved: ConcurrentJob | undefined, calls = 0;
    const unit = concurrent({
      tasks: { work: () => ++calls },
      split: (tasks, reuse: boolean) => {
        if (!reuse) saved = tasks.work.job();
        return [saved!];
      },
      join: (values) => values,
    });
    assertEquals(await unit(false), [1]);
    await assertRejects(() => unit(true), ConcurrencyError, "this invocation");
    for (const tree of [null, {}, [null], new Array(1), [() => 1]]) {
      const invalid = concurrent({
        tasks: { work: () => ++calls },
        split: () => tree as never,
        join: (values) => values,
      });
      await assertRejects(() => invalid(), ConcurrencyError);
    }
    const cycle: unknown[] = [];
    cycle.push(cycle);
    let deep: unknown[] = [];
    for (let n = 0; n < 258; n++) deep = [deep];
    for (const tree of [cycle, deep]) {
      await assertRejects(
        () =>
          concurrent({
            tasks: {},
            split: () => tree as never,
            join: (values) => values,
          })(),
        ConcurrencyError,
        "256 levels",
      );
    }
    assertEquals(calls, 1);
  });

  it("validates limits, callables, modes and invocation controls", async () => {
    const valid = { tasks: { work: () => 1 }, split: () => [], join: () => 1 };
    for (const field of ["concurrency", "maxPending", "timeoutMs"]) {
      for (const value of [0, -1, 1.5, NaN, Infinity, "2", null]) {
        assertThrows(
          () =>
            Reflect.apply(concurrent, undefined, [{
              ...valid,
              [field]: value,
            }]),
          ConcurrencyError,
        );
      }
    }
    for (
      const extra of [
        { tasks: null },
        { tasks: [] },
        { tasks: { work: null } },
        { tasks: { work: { run: 1 } } },
        { tasks: { work: { run: () => 1, concurrency: 0 } } },
        { split: null },
        { capacityScope: "bad" },
        { capacityScope: null },
        { join: null },
        { mode: "race" },
        { timeoutMs: 2_147_483_648 },
      ]
    ) {
      assertThrows(
        () => Reflect.apply(concurrent, undefined, [{ ...valid, ...extra }]),
        ConcurrencyError,
      );
    }
    const unit = concurrent(valid);
    await assertRejects(
      () => unit.runWith({ signal: {} as AbortSignal }),
      ConcurrencyError,
    );
    await assertRejects(() => unit.runWith({ timeoutMs: 0 }), ConcurrencyError);
  });
});
