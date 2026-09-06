import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import {
  createRunContext,
  pipe,
  plugin,
  type PluginDefinition,
  type RunContext,
  type RunContextCapture,
  step,
} from "../../src/index.ts";
import { deferred } from "../support/runtime.ts";

for (const capture of ["none", "outputs", "all"] as const) {
  for (const phase of ["input", "run", "output", "error"] as const) {
    for (const order of ["first", "second"] as const) {
      Deno.test(`shared context ${capture}: ${phase}, ${order} completes first`, async () => {
        const parent = createRunContext({ capture });
        const entered = [deferred(), deferred()];
        const release = [deferred(), deferred()];
        const views: RunContext[] = [];
        const observations: string[] = [];
        const waiting = async (
          index: number,
          context: RunContext,
        ): Promise<string> => {
          views[index] = context;
          entered[index].resolve();
          await release[index].promise;
          observations.push(context.step.current().id);
          if (phase !== "run") {
            assertEquals(context.plugin.current().id, `hook-${index}`);
          }
          return `result-${index}`;
        };
        const units = [0, 1].map((index) =>
          step<[string], string>(async function (value: string) {
            if (phase === "run") return await waiting(index, this.context());
            if (phase === "error") throw new Error("recoverable");
            return value;
          }, {
            id: `step-${index}`,
            plugins: phase === "run" ? [] : [
              plugin.for<[string], string>()({
                ...(phase === "input"
                  ? {
                    input: async function (
                      this: { context(): RunContext },
                      _value: string,
                    ) {
                      return await waiting(index, this.context());
                    },
                  }
                  : {}),
                ...(phase === "output"
                  ? {
                    output: async function (
                      this: { context(): RunContext },
                      _value: string,
                    ) {
                      return await waiting(index, this.context());
                    },
                  }
                  : {}),
                ...(phase === "error"
                  ? {
                    error: async function (
                      this: { context(): RunContext },
                      _error: Error,
                    ) {
                      return await waiting(index, this.context());
                    },
                  }
                  : {}),
              } as PluginDefinition<[string], string>, { id: `hook-${index}` }),
            ],
          })
        );
        const runs = units.map((unit, index) =>
          unit.runWith({ context: { parent } }, `input-${index}`)
        );
        await Promise.all(entered.map((gate) => gate.promise));
        const first = order === "first" ? 0 : 1;
        release[first].resolve();
        assertEquals(await runs[first], `result-${first}`);
        release[1 - first].resolve();
        assertEquals(await runs[1 - first], `result-${1 - first}`);
        assertEquals(observations, [`step-${first}`, `step-${1 - first}`]);
        assertEquals(parent.step.previous()?.id, `step-${1 - first}`);
        for (const [index, view] of views.entries()) {
          assertThrows(() => view.step.current(), Error);
          assertThrows(() => view.plugin.current(), Error);
          assertStrictEquals(view.state, parent.state);
          assertEquals(
            parent.step.get(`step-${index}`)?.output,
            capture === "none" ? undefined : `result-${index}`,
          );
          assertEquals(
            parent.step.get(`step-${index}`)?.input,
            capture === "all"
              ? [phase === "input" ? `result-${index}` : `input-${index}`]
              : undefined,
          );
        }
      });
    }
  }
}

for (const capture of ["none", "outputs", "all"] as RunContextCapture[]) {
  Deno.test(`nested pipes preserve their own live frame and previous completed child (${capture})`, async () => {
    const parent = createRunContext({ capture });
    const first = step((value: number) => value + 1, { id: "first" });
    const second = step((value: number) => value * 2, { id: "second" });
    const inner = pipe([first, second], {
      id: "inner",
      plugins: [
        plugin.for<[number], number>()({
          output(value) {
            assertEquals(this.context().step.current().id, "inner");
            assertEquals(this.context().step.previous()?.id, "second");
            assertEquals(
              this.context().step.previous()?.input,
              capture === "all" ? [3] : undefined,
            );
            return value;
          },
        }),
      ],
    });
    const outer = pipe([inner], {
      id: "outer",
      plugins: [
        plugin.for<[number], number>()({
          output(value) {
            assertEquals(this.context().step.current().id, "outer");
            assertEquals(this.context().step.previous()?.id, "inner");
            return value;
          },
        }),
      ],
    });
    assertEquals(await outer.runWith({ context: { parent } }, 2), 6);
    assertEquals(parent.step.previous()?.id, "outer");
  });
}

Deno.test("shared-parent failure cannot pop another live invocation", async () => {
  const parent = createRunContext();
  const entered = deferred();
  const release = deferred();
  const pending = step(async function () {
    entered.resolve();
    await release.promise;
    return this.context().step.current().id;
  }, { id: "pending" });
  const failed = step(() => {
    throw new Error("separate");
  }, { id: "failed" });
  const result = pending.runWith({ context: { parent } });
  await entered.promise;
  await assertRejects(
    () => failed.runWith({ context: { parent } }),
    Error,
    "separate",
  );
  release.resolve();
  assertEquals(await result, "pending");
});

Deno.test("configuration changes do not affect an in-flight step or pipe routing plan", async () => {
  for (const wrapped of [false, true]) {
    const entered = deferred();
    const release = deferred();
    const child = step(async (value: number) => {
      entered.resolve();
      await release.promise;
      return value;
    }, { id: "child" });
    const unit = wrapped ? pipe([child]) : child;
    const hook = plugin.for<[number], number>()({
      output: (value) => value * 2,
    }, { id: "double" });
    const result = unit(3);
    await entered.promise;
    unit.use(hook);
    release.resolve();
    assertEquals(await result, 3);
    assertEquals(await unit(3), 6);
  }
});
