import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { pipe, plugin, step } from "../../src/index.ts";
import {
  type Body,
  type Hooks,
  makePlugin,
  makeUnit,
} from "../support/runtime.ts";

const thenables: [string, () => unknown][] = [
  ["native promise", () => Promise.resolve(1)],
  ["custom thenable", () => ({
    then(resolve: (value: number) => void) {
      resolve(1);
    },
  })],
  [
    "callable thenable",
    () =>
      Object.assign(() => 1, {
        then(resolve: (value: number) => void) {
          resolve(1);
        },
      }),
  ],
  [
    "inherited then",
    () =>
      Object.create({
        then(resolve: (value: number) => void) {
          resolve(1);
        },
      }),
  ],
];
for (const mode of ["sync-step", "sync-pipe"] as const) {
  for (const phase of ["input", "run", "output", "error"] as const) {
    Deno.test(`${mode}: rejected native Promise in ${phase} has no secondary unhandled rejection`, async () => {
      const reject = () =>
        Promise.reject(new Error("unexpected async rejection"));
      const hooks: Hooks = phase === "run" ? {} : { [phase]: reject };
      const body: Body = phase === "run" ? reject : phase === "error"
        ? () => {
          throw new Error("trigger");
        }
        : () => 1;
      const unit = makeUnit(
        mode,
        body,
        Object.keys(hooks).length ? [makePlugin(hooks)] : [],
      );
      assertThrows(() => unit(1), TypeError, "thenable");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (const [label, make] of thenables) {
      Deno.test(`${mode}: rejects ${label} in ${phase}`, () => {
        const hooks: Hooks = phase === "run" ? {} : { [phase]: make };
        const body: Body = phase === "run" ? make : phase === "error"
          ? () => {
            throw new Error("trigger");
          }
          : () => 1;
        const unit = makeUnit(
          mode,
          body,
          Object.keys(hooks).length ? [makePlugin(hooks)] : [],
        );
        assertThrows(() => unit(1), TypeError, "thenable");
      });
    }
  }
}

for (const missing of [undefined, null, 0, "hook", true, {}]) {
  Deno.test(`plugin validation rejects invalid hook ${String(missing)}`, () => {
    assertThrows(
      () =>
        Reflect.apply(plugin.for<[number], number>(), undefined, [{
          input: missing,
        }]),
      Error,
      "invalid",
    );
  });
}
Deno.test("typed plugin construction rejects a null definition from JavaScript", () => {
  assertThrows(
    () => Reflect.apply(plugin.for<[number], number>(), undefined, [null]),
    Error,
    "invalid",
  );
});
Deno.test("hook guards support callable structural descriptors", () => {
  const callable = Object.assign(() => 1, { input: (value: number) => value });
  assertEquals(plugin.hasInput(callable), true);
});
Deno.test("optional undefined hook is absent and reserved properties cannot override identity", async () => {
  const definition = {
    input: undefined,
    output: (value: number) => value + 1,
    id: "bad",
    target: "bad",
    supports: () => false,
  };
  const hook = plugin.for<[number], number>()(definition, {
    id: "correct",
    target: "unit",
  });
  definition.output = () => 99;
  assertEquals(hook.id, "correct");
  assertEquals(hook.target, "unit");
  assertEquals(hook.supports("input"), false);
  assertEquals(hook.supports("output"), true);
  assertEquals(Reflect.set(hook, "output", () => 99), false);
  assertEquals(
    await step((value: number) => value, { id: "unit", plugins: [hook] })(1),
    2,
  );
  assertEquals(plugin.hasInput({ supports: () => true }), false);
});

Deno.test("sync rejection does not invoke a custom thenable or trust an overridden Promise.catch", () => {
  let calls = 0;
  const thenable = {
    then() {
      calls++;
    },
  };
  assertThrows(
    () => makeUnit("sync-step", () => thenable)(),
    TypeError,
    "thenable",
  );
  const pending = Promise.resolve(1);
  Object.defineProperty(pending, "catch", {
    value: () => {
      throw new Error("overridden catch");
    },
  });
  assertThrows(
    () => makeUnit("sync-step", () => pending)(),
    TypeError,
    "thenable",
  );
  assertEquals(calls, 0);
});

Deno.test("sync rejection remains explicit when a Promise subclass has hostile species", () => {
  class HostilePromise extends Promise<number> {
    static override get [Symbol.species](): PromiseConstructor {
      throw new Error("species trap");
    }
  }
  const pending = new HostilePromise((resolve) => resolve(1));
  assertThrows(
    () => makeUnit("sync-step", () => pending)(),
    TypeError,
    "thenable",
  );
});
Deno.test("all six sync fluent orders compose without casts", () => {
  const first = plugin.sync().onInput((value: number) => value + 1).onOutput((
    value: number,
  ) => value * 2).onError((_error: Error, input: [number]) => input[0]);
  const second = plugin.sync().onInput((value: number) => value + 1).onError((
    _error: Error,
    input: [number],
  ) => input[0]).onOutput((value: number) => value * 2);
  const third = plugin.sync().onOutput((value: number) => value * 2).onInput((
    value: number,
  ) => value + 1).onError((_error: Error, input: [number]) => input[0]);
  const fourth = plugin.sync().onOutput((value: number) => value * 2).onError((
    _error: Error,
    input: [number],
  ) => input[0]).onInput((value: number) => value + 1);
  const fifth = plugin.sync().onError((_error: Error, input: [number]) =>
    input[0]
  ).onInput((value: number) => value + 1).onOutput((value: number) =>
    value * 2
  );
  const sixth = plugin.sync().onError((_error: Error, input: [number]) =>
    input[0]
  ).onOutput((value: number) => value * 2).onInput((value: number) =>
    value + 1
  );
  for (const hook of [first, second, third, fourth, fifth, sixth]) {
    assertEquals(
      step.sync((value: number) => value, { plugins: [hook] })(2),
      6,
    );
  }
});
Deno.test("structural sync adapter cannot smuggle a Promise", () => {
  const adapter = {
    id: "external",
    isSync: true,
    runWith: () => Promise.resolve(9),
  };
  const unit = Reflect.apply(pipe.sync, undefined, [[adapter]]);
  assertThrows(() => unit(), TypeError, "thenable");
});
Deno.test("async failures in one-shot target validation reject rather than throwing synchronously", async () => {
  const unit = pipe([(value: number) => value]);
  await assertRejects(
    () =>
      Reflect.apply(unit.runWith, unit, [{
        plugins: [makePlugin({ output: (value) => value }, "bad", "missing")],
      }, 1]),
    Error,
    "targets",
  );
});
