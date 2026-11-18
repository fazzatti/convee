import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { createRunContext, pipe, plugin, step } from "@convee";
import {
  deferred,
  makePlugin,
  makeUnit,
  modes,
} from "@test/support/runtime.ts";

describe("Public lifecycle traces", () => {
  it("compares both drivers and enclosing pipes against every exit from the phase table", async () => {
    const original = new Error("body"), replacement = new Error("replacement");
    const cleanup = new Error("cleanup");
    for (const mode of modes) {
      for (
        const fault of [
          "none",
          "input",
          "recover",
          "unrecovered",
          "recovery-throws",
          "output",
        ]
      ) {
        for (const cleanupFails of [false, true]) {
          const trace: string[] = [];
          const finalizer = makePlugin({
            finally() {
              trace.push("finally");
              if (cleanupFails) throw cleanup;
            },
          });
          const first = makePlugin({
            input(n) {
              trace.push("input");
              if (fault === "input") throw original;
              return n;
            },
            error(e) {
              trace.push("replace");
              assertStrictEquals(e, original);
              return replacement;
            },
            output(v) {
              trace.push("output");
              if (fault === "output") throw original;
              return v;
            },
          });
          const last = makePlugin({
            error(e) {
              trace.push("recover");
              assertStrictEquals(e, replacement);
              if (fault === "recovery-throws") throw original;
              return fault === "unrecovered" ? replacement : undefined;
            },
          });
          const unit = makeUnit(mode, () => {
            trace.push("run");
            if (["recover", "unrecovered", "recovery-throws"].includes(fault)) {
              throw original;
            }
            return 1;
          }, [first, finalizer, last, finalizer]);
          const expected = ["input"];
          if (fault !== "input") expected.push("run");
          if (["recover", "unrecovered", "recovery-throws"].includes(fault)) {
            expected.push("replace", "recover");
          }
          if (["none", "recover", "output"].includes(fault)) {
            expected.push("output");
          }
          expected.push("finally", "finally");
          const executionFailure = fault === "unrecovered"
            ? replacement
            : ["input", "recovery-throws", "output"].includes(fault)
            ? original
            : undefined;
          if (cleanupFails || executionFailure) {
            const e = await assertRejects(async () => {
              await unit(1);
            }, Error);
            if (cleanupFails) {
              const causes = (e.cause as AggregateError).errors;
              const expectedErrors = executionFailure
                ? [executionFailure, cleanup, cleanup]
                : [cleanup, cleanup];
              assertEquals(causes.length, expectedErrors.length);
              causes.forEach((cause, i) =>
                assertStrictEquals(cause, expectedErrors[i])
              );
            } else assertStrictEquals(e, executionFailure);
          } else {assertEquals(
              await unit(1),
              fault === "recover" ? undefined : 1,
            );}
          assertEquals(trace, expected, mode + " " + fault);
        }
      }
    }
  });

  it("captures the parent plan on entry and the next child's own registrations when it starts", async () => {
    const entered = deferred(), release = deferred();
    const first = step(async (n: number) => {
      entered.resolve();
      await release.promise;
      return n;
    });
    const next = step((n: number) => n, { id: "next" });
    const parent = pipe([first, next], { id: "parent" });
    const pending = parent(1);
    await entered.promise;
    next.use(plugin.for<[number], number>()({ output: (n) => n + 10 }));
    parent.use(plugin.for<[number], number>()({ output: (n) => n + 100 }));
    release.resolve();
    assertEquals(await pending, 11);
    assertEquals(await parent(1), 111);
  });

  it("regrouping pure children preserves each argument vector and the final result", async () => {
    for (const sync of [false, true]) {
      for (
        const intermediate of [[], [undefined], [[1, 2]], [1, 2], undefined, 4]
      ) {
        const traces: unknown[][][] = [[], []];
        for (const nested of [false, true]) {
          const seen = traces[Number(nested)];
          const factory = sync ? step.sync : step;
          const compose = sync ? pipe.sync : pipe;
          const make = (fn: (...args: unknown[]) => unknown) =>
            Reflect.apply(factory, undefined, [
              (...args: unknown[]) => {
                seen.push(args);
                return fn(...args);
              },
            ]);
          const a = make(() => intermediate),
            b = make((...xs) => [xs]),
            c = make((x) => x);
          const children = nested
            ? [Reflect.apply(compose, undefined, [[a, b]]), c]
            : [a, b, c];
          const unit = Reflect.apply(compose, undefined, [children]);
          const result = await unit(1, 2);
          assertEquals(
            result,
            Array.isArray(intermediate) ? intermediate : [intermediate],
          );
        }
        assertEquals(traces[0], traces[1]);
      }
    }
  });

  it("keeps the active registration target separate from shared state for reused IDs", async () => {
    const context = createRunContext();
    const seen: (string | undefined)[] = [];
    const a = step((n: number) => n, { id: "A" });
    const b = step((n: number) => n, { id: "B" });
    const registry = (target: string) =>
      makePlugin(
        {
          output(v) {
            const live = this.context().plugin.current();
            seen.push(live.target);
            assertStrictEquals(
              live.state,
              this.context().plugin.get("shared")!.state,
            );
            return v;
          },
        },
        "shared",
        target,
      );
    // Exercise the same dynamic plugin contract used by JavaScript consumers.
    const plan = pipe([a, b]);
    await Reflect.apply(plan.runWith, plan, [{
      context: { parent: context },
      plugins: [registry("A"), registry("B")],
    }, 1]);
    assertEquals(seen, ["A", "B"]);
    assertEquals(context.plugin.all().map((p) => p.target), ["A"]);
    assertThrows(() => context.plugin.current());
  });
});
