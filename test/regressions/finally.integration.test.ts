import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ConveeError,
  createRunContext,
  hasFinally,
  isConveeErrorOf,
  pipe,
  plugin,
  type PluginThis,
  RT_ERRORS,
  type RunContext,
  step,
} from "@convee";
import {
  deferred,
  type Hooks,
  makePlugin,
  makeUnit,
  modes,
} from "@test/support/runtime.ts";

for (const mode of modes) {
  describe(`${mode} finalization`, () => {
    for (
      const phase of [
        "success",
        "input",
        "run",
        "output",
        "error",
        "recovery",
      ] as const
    ) {
      it(`finalizes once after ${phase}, preserves the outcome and closes context`, async () => {
        const calls: string[] = [];
        const failure = new Error(phase);
        const context = createRunContext({ capture: "all" });
        let view: RunContext | undefined;
        const hooks: Hooks = {
          input: (value) => {
            calls.push("input");
            if (phase === "input") throw failure;
            return value;
          },
          output: (value) => {
            calls.push("output");
            if (phase === "output") throw failure;
            return value;
          },
          error: (error) => {
            calls.push("error");
            if (phase === "error") throw failure;
            return phase === "recovery" ? 7 : error;
          },
          finally: function () {
            calls.push("finally");
            view = this.context();
            assertEquals(view.step.current().id, "unit");
            assertEquals(view.plugin.current().id, "cleanup");
            return 999; // Foreign return values cannot replace output or recover errors.
          },
        };
        const unit = makeUnit(mode, (value) => {
          calls.push("run");
          if (["run", "error", "recovery"].includes(phase)) throw failure;
          return value;
        }, [makePlugin(hooks, "cleanup")]);
        if (phase === "success" || phase === "recovery") {
          assertEquals(
            await unit.runWith({ context: { parent: context } }, 3),
            phase === "success" ? 3 : 7,
          );
        } else {
          const error = await assertRejects(async () => {
            await unit.runWith({ context: { parent: context } }, 3);
          });
          assertStrictEquals(error, failure);
          assertStrictEquals(context.step.get("unit")?.error, failure);
        }
        assertEquals(calls.filter((call) => call === "finally").length, 1);
        assertEquals(calls.at(-1), "finally");
        if (phase === "input" || phase === "output") {
          assert(!calls.includes("error"));
        }
        assertThrows(() => view!.step.current());
        assertThrows(() => view!.plugin.current());
      });
    }

    it("continues all finalizers and aggregates failures without recovering them", async () => {
      const original = new Error("body");
      const first = new Error("first cleanup");
      const second = new Error("second cleanup");
      const calls: string[] = [];
      let errorCalls = 0;
      const context = createRunContext({ capture: "all" });
      const unit = makeUnit(mode, () => {
        throw original;
      }, [
        makePlugin({
          error: (error) => {
            errorCalls++;
            return error;
          },
          finally: () => {
            calls.push("first");
            throw first;
          },
        }, "first"),
        makePlugin({
          finally: () => {
            calls.push("second");
            throw second;
          },
        }, "second"),
        makePlugin({
          finally: () => {
            calls.push("last");
          },
        }, "last"),
      ]);
      const failure = await assertRejects(async () => {
        await unit.runWith({ context: { parent: context } });
      });
      assert(isConveeErrorOf(failure, RT_ERRORS.FINALIZATION_FAILED));
      assertStrictEquals(failure.meta.executionError, original);
      assertEquals(failure.meta.failures.map((item) => item.error), [
        first,
        second,
      ]);
      assertEquals(
        failure.meta.failures.map((item) => item.trace.frames.at(-1)),
        [
          { kind: "plugin", id: "first", phase: "finally" },
          { kind: "plugin", id: "second", phase: "finally" },
        ],
      );
      assertInstanceOf(failure.cause, AggregateError);
      assertEquals(failure.cause.errors, [original, first, second]);
      assertStrictEquals(failure.cause.cause, original);
      assertStrictEquals(context.step.get("unit")?.error, failure);
      assertEquals(failure.trace?.frames, [{
        kind: mode.includes("pipe") ? "pipe" : "step",
        id: "unit",
        phase: "finally",
      }]);
      assertEquals(calls, ["first", "second", "last"]);
      assertEquals(errorCalls, 1);
      assertEquals(failure.toJSON().code, "RT_000");
    });

    for (
      const thrown of [new Error("cleanup"), "text", undefined, { code: 7 }]
    ) {
      it(`rejects successful execution when cleanup throws ${String(thrown)}`, async () => {
        const unit = makeUnit(mode, () => 1, [makePlugin({
          finally() {
            throw thrown;
          },
        })]);
        const failure = await assertRejects(async () => {
          await unit();
        });
        assert(isConveeErrorOf(failure, RT_ERRORS.FINALIZATION_FAILED));
        assertEquals(failure.meta.executionError, undefined);
        const cleanup = failure.meta.failures[0].error;
        assertInstanceOf(failure.cause, AggregateError);
        assertEquals(failure.cause.errors, [cleanup]);
        assertStrictEquals(failure.cause.cause, cleanup);
        if (thrown instanceof Error) assertStrictEquals(cleanup, thrown);
        else if (typeof thrown === "string") {
          assertEquals(cleanup.message, thrown);
        } else {
          assertInstanceOf(cleanup, ConveeError);
          assertStrictEquals(cleanup.cause, thrown);
          assertEquals(cleanup.trace?.frames.at(-1)?.phase, "finally");
        }
      });
    }

    it("runs selected cleanup-only plugins even if an earlier input hook aborts", async () => {
      const calls: string[] = [];
      const unit = makeUnit(mode, () => 1, [
        makePlugin({
          input() {
            throw new Error("input failed");
          },
        }, "reject"),
        makePlugin({
          finally() {
            calls.push("cleanup");
          },
        }, "later"),
      ]);
      await assertRejects(async () => {
        await unit();
      });
      assertEquals(calls, ["cleanup"]);
    });

    it("finalizes after invalid input tuple normalization", async () => {
      let cleaned = false;
      const unit = makeUnit(mode, () => 1, [makePlugin({
        input: () => 4,
        finally() {
          cleaned = true;
        },
      })]);
      await assertRejects(async () => {
        await unit(1, 2);
      });
      assert(cleaned);
    });

    it("applies temporary plugins once and respects removal for later runs", async () => {
      const calls: string[] = [];
      const unit = makeUnit(mode, () => 1);
      unit.use(makePlugin({
        finally() {
          calls.push("persistent");
        },
      }, "persistent"));
      await unit.runWith({
        plugins: [makePlugin({
          finally() {
            calls.push("temporary");
          },
        }, "temporary")],
      });
      assertEquals(calls, ["persistent", "temporary"]);
      unit.remove("persistent");
      await unit();
      assertEquals(calls, ["persistent", "temporary"]);
    });
  });
}

describe("async finalization boundaries", () => {
  for (const mode of ["step", "pipe"] as const) {
    it(`${mode} awaits cleanup and freezes the hook plan for an in-flight invocation`, async () => {
      const entered = deferred();
      const release = deferred();
      const calls: string[] = [];
      const unit = makeUnit(mode, () => 1, [makePlugin({
        async finally() {
          calls.push("enter");
          entered.resolve();
          await release.promise;
          calls.push("leave");
        },
      }, "cleanup")]);
      let settled = false;
      const first = Promise.resolve(unit()).then((output) => {
        settled = true;
        return output;
      });
      await entered.promise;
      assertEquals(settled, false);
      unit.remove("cleanup");
      release.resolve();
      assertEquals(await first, 1);
      await unit();
      assertEquals(calls, ["enter", "leave"]);
    });
  }

  it("releases a one-slot resource after input and output hook failures", async () => {
    for (const phase of ["input", "output"] as const) {
      let owner: string | undefined;
      let reject = true;
      let completed = 0;
      const resource = plugin({ id: "resource" }).onInput(
        function (value: unknown) {
          assertEquals(owner, undefined);
          owner = this.context().runId;
          return value;
        },
      ).onFinally(function () {
        assertEquals(owner, this.context().runId);
        owner = undefined;
        completed++;
      });
      const broken = makePlugin({
        [phase]: (value: unknown) => {
          if (reject) throw new Error("hook failed");
          return value;
        },
      }, "broken");
      const execute = makeUnit("pipe", (value) => value);
      if (phase === "output") execute.use(broken);
      execute.use(resource);
      if (phase === "input") execute.use(broken);
      await assertRejects(async () => {
        await execute(1);
      });
      assertEquals(owner, undefined);
      reject = false;
      assertEquals(await execute(2), 2);
      assertEquals(completed, 2);
    }
  });

  it("keeps concurrent contexts isolated and awaits rejecting finalizers", async () => {
    const release = deferred();
    const entered = deferred();
    const states: string[] = [];
    const execute = step(async function (this: PluginThis, value: string) {
      this.context().state.set("value", value);
      if (value === "slow") {
        entered.resolve();
        await release.promise;
      }
      return value;
    }).use(
      plugin().onFinally(async function () {
        const context = this.context();
        await Promise.resolve();
        states.push(context.state.get("value") as string);
        if (context.state.get("value") === "slow") {
          throw new Error("slow cleanup");
        }
      }),
    );
    const slow = execute("slow");
    await entered.promise;
    assertEquals(await execute("fast"), "fast");
    release.resolve();
    await assertRejects(() => slow);
    assertEquals(states, ["fast", "slow"]);
  });

  it("routes child cleanup independently and finalizes nested pipes inside out", async () => {
    const calls: string[] = [];
    const cleanup = <Target extends string | undefined = undefined>(
      id: string,
      target?: Target,
    ) =>
      plugin({ id, target }).onFinally(function () {
        calls.push(`${id}:${this.context().step.current().id}`);
      });
    const child = step(() => 1, { id: "child" }).use(cleanup("own"));
    const inner = pipe([child], { id: "inner" }).use(
      cleanup<undefined>("inner-only"),
    );
    const outer = pipe([inner], { id: "outer" });
    outer.use(cleanup("targeted", "inner"));
    outer.use(cleanup<undefined>("outer-only"));
    assertEquals(await outer(), 1);
    assertEquals(calls, [
      "own:child",
      "inner-only:inner",
      "targeted:inner",
      "outer-only:outer",
    ]);
  });

  for (const capture of ["none", "outputs", "all"] as const) {
    it(`retains invocation-local cleanup frames with a shared parent and ${capture} capture`, async () => {
      const context = createRunContext({ capture });
      const entered = deferred();
      const release = deferred();
      const observations: unknown[] = [];
      const execute = step(async (value: string) => {
        if (value === "slow") {
          entered.resolve();
          await release.promise;
        }
        return value;
      }, { id: "shared" }).use(
        plugin({ id: "cleanup" }).onFinally(async function () {
          const view = this.context();
          await Promise.resolve();
          observations.push(view.step.current().input?.[0]);
          assertEquals(view.plugin.current().id, "cleanup");
          assertEquals(view.runId, context.runId);
        }),
      );
      const slow = execute.runWith({ context: { parent: context } }, "slow");
      await entered.promise;
      await execute.runWith({ context: { parent: context } }, "fast");
      release.resolve();
      await slow;
      assertEquals(observations, ["fast", "slow"]);
    });
  }

  it("continues after an asynchronous rejection and finalizes duplicate registrations individually", async () => {
    const calls: string[] = [];
    const failure = new Error("async cleanup");
    const duplicate = plugin({ id: "duplicate" }).onFinally(() => {
      calls.push("duplicate");
    });
    const execute = step(() => 1)
      .use(
        plugin().onFinally(async () => {
          await Promise.resolve();
          throw failure;
        }),
      )
      .use(duplicate)
      .use(duplicate);
    const error = await assertRejects(() => execute());
    assert(isConveeErrorOf(error, RT_ERRORS.FINALIZATION_FAILED));
    assertStrictEquals(error.meta.failures[0].error, failure);
    assertEquals(calls, ["duplicate", "duplicate"]);
  });
});

describe("finalizer construction and sync runtime safety", () => {
  it("supports factories, context variants, and truthful guards", () => {
    const cleanup = plugin().onFinally(() => {});
    assert(cleanup.supports("finally"));
    assert(hasFinally(cleanup));
    assertEquals("onFinally" in cleanup, false);
    assertEquals("onFinally" in plugin(), true);
    assert(plugin.hasFinally(cleanup));
    assert(plugin.sync.hasFinally(cleanup));
    assert(plugin.withContext()().onFinally(() => {}).supports("finally"));
    assert(plugin.sync.withContext()().onFinally(() => {}).supports("finally"));
    assert(hasFinally(plugin.sync.for<[], number>()({ finally() {} })));
    assert(hasFinally(plugin.for<[], number>()({ finally() {} })));
    for (
      const invalid of [null, undefined, 42, {}, { supports: () => true }, {
        finally: true,
      }]
    ) {
      assertEquals(hasFinally(invalid), false);
    }
    const callable = Object.assign(() => {}, { finally() {} });
    assert(hasFinally(callable));
    assertThrows(
      () => Reflect.apply(plugin().onFinally, undefined, [5]),
      TypeError,
    );
    assertThrows(
      () =>
        Reflect.apply(plugin.for<[], number>(), undefined, [{ finally: 5 }]),
      ConveeError,
    );
  });

  for (const mode of ["sync-step", "sync-pipe"] as const) {
    for (
      const result of [
        () => Promise.reject(new Error("async")),
        () => ({ then() {} }),
      ]
    ) {
      it(`${mode} rejects hidden async cleanup but continues other finalizers`, () => {
        let cleaned = false;
        const unit = makeUnit(mode, () => 1, [
          makePlugin({ finally: result }, "invalid"),
          makePlugin({
            finally() {
              cleaned = true;
            },
          }, "valid"),
        ]);
        const failure = assertThrows(() => unit());
        assert(isConveeErrorOf(failure, RT_ERRORS.FINALIZATION_FAILED));
        assertInstanceOf(failure.meta.failures[0].error, TypeError);
        assert(cleaned);
      });
    }
  }
});
