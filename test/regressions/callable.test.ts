import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { pipe, plugin, step } from "../../src/index.ts";
import { makePlugin, makeUnit, modes } from "../support/runtime.ts";

for (const mode of modes) {
  for (
    const method of [
      "direct",
      "run",
      "runWith",
      "bind",
      "call",
      "apply",
    ] as const
  ) {
    Deno.test(`${mode}: ${method} preserves arguments and receiver-independent identity`, async () => {
      const unit = makeUnit(
        mode,
        (left, right) => Number(left) - Number(right),
      );
      const result = method === "direct"
        ? unit(9, 4)
        : method === "run"
        ? unit.run(9, 4)
        : method === "runWith"
        ? unit.runWith({}, 9, 4)
        : method === "bind"
        ? unit.bind(null, 9)(4)
        : method === "call"
        ? unit.call(null, 9, 4)
        : unit.apply(null, [9, 4]);
      assertEquals(await result, 5);
    });
  }
  Deno.test(`${mode}: use/remove return the original callable`, async () => {
    const unit = makeUnit(mode, (value) => Number(value) + 1);
    const hook = makePlugin({ output: (value) => Number(value) * 3 });
    assertStrictEquals(unit.use(hook), unit);
    assertEquals(await unit.use(hook)(1), 18);
    assertStrictEquals(unit.remove(hook.id), unit);
    assertEquals(await unit(1), 2);
    assertStrictEquals(unit.remove("missing"), unit);
  });
  Deno.test(`${mode}: methods are stable, metadata immutable, lists defensive`, async () => {
    const unit = makeUnit(mode, (value) => value);
    const hook = makePlugin({ output: (value) => value });
    const initial = unit.plugins;
    unit.use(hook);
    assertEquals(initial.length, 0);
    assertEquals(Reflect.set(unit.plugins, "length", 0), true);
    assertEquals(unit.plugins.length, 1);
    if (unit.steps) {
      Reflect.set(unit.steps, "length", 0);
      assertEquals(unit.steps.length, 1);
    }
    assertStrictEquals(unit.use, unit.use);
    assertStrictEquals(unit.run, unit.run);
    assertEquals(Reflect.set(unit, "id", "wrong"), false);
    assertEquals("run" in unit, true);
    assertEquals("bind" in unit, true);
    assertEquals("registered" in unit, false);
    assertEquals(await unit(4), 4);
  });
  for (
    const [name, args] of [
      ["no arguments", []],
      ["undefined", [undefined]],
      ["null", [null]],
      ["empty array", [[]]],
      ["single array", [[1, 2]]],
      ["nested array", [[[1], [2]]]],
      ["optional trailing", [1, undefined]],
      ["heterogeneous", [1, "x", false]],
      ["rest arguments", [1, 2, 3, 4, 5]],
      ["object", [{ values: [1, 2] }]],
    ] as const
  ) {
    Deno.test(`${mode}: preserves ${name}`, async () => {
      const unit = makeUnit(mode, (...values) => values);
      assertEquals(await unit(...args), args);
    });
  }
  Deno.test(`${mode}: persistent hooks run before one-shot hooks without registration`, async () => {
    const unit = makeUnit(mode, (value) => Number(value) + 1, [
      makePlugin({ output: (value) => Number(value) * 2 }),
    ]);
    assertEquals(
      await unit.runWith({
        plugins: [
          makePlugin({ output: (value) => Number(value) + 3 }, "temporary"),
        ],
      }, 1),
      7,
    );
    assertEquals(await unit(1), 4);
    assertEquals(unit.plugins.length, 1);
  });
}

Deno.test("exact single-array types work at the public entrypoint", async () => {
  const length = step((values: number[]) => values.length);
  assertEquals(await length([1, 2]), 2);
  const identity = plugin.for<[number[]], number>()({
    input: (values) => [values.map((value) => value + 1)],
  });
  assertEquals(await length.use(identity)([1, 2, 3]), 3);
  const sum = step((values: number[]) =>
    values.reduce((total, value) => total + value, 0)
  );
  assertEquals(await pipe([() => [[1, 2, 3]] as [number[]], sum])(), 6);
  assertEquals(
    pipe.sync([
      () => [7, 3] as [number, number],
      (left: number, right: number) => left - right,
    ])(),
    4,
  );
});

Deno.test("duplicate IDs reject ambiguous routes but repeated step objects are allowed", async () => {
  const first = step((value: number) => value + 1, { id: "same" });
  const second = step((value: number) => value * 2, { id: "same" });
  assertThrows(() => pipe([first, second]), TypeError, "Conflicting");
  assertThrows(() => pipe([first], { id: "same" }), TypeError, "Conflicting");
  assertEquals(await pipe([first, first])(2), 4);
  assertThrows(
    () => Reflect.apply(pipe, undefined, [[]]),
    TypeError,
    "at least one",
  );
});
