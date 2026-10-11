import { assertEquals, assertNotStrictEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { pipe, plugin, step } from "@convee";
import { worker, WorkerError } from "@convee/workers";
import { definitionData } from "@/workers/definition.ts";
describe("Single-callable worker definitions", () => {
  it("is immutable and import-safe, accepts native units, and copies caller registrations", () => {
    let calls = 0;
    const definition = worker(() => ++calls, { module: import.meta.url });
    const hooks = plugin().onFinally(() => {});
    const configured = definition.use(hooks);
    assertNotStrictEquals(configured, definition);
    assertEquals(Object.isFrozen(configured), true);
    assertEquals(definitionData(definition).plugins.length, 0);
    assertEquals(definitionData(configured).plugins, [hooks]);
    assertEquals(calls, 0);
    const emitted = worker(() => 1, {
      module: import.meta.url,
      ...{ entry: "./emitted.js" },
    });
    assertEquals(
      definitionData(emitted).entry,
      new URL("./emitted.js", import.meta.url).href,
    );
    assertEquals(
      definitionData(emitted.use(hooks)).entry,
      definitionData(emitted).entry,
    );
    assertEquals(
      worker(step((n: number) => n), { module: new URL(import.meta.url) })
        .module,
      import.meta.url,
    );
    assertEquals(
      worker(pipe([step(() => 1)]), { module: import.meta.url }).module,
      import.meta.url,
    );
  });
  it("rejects invalid executable definitions, module locations and brands", () => {
    assertThrows(
      () =>
        Reflect.apply(worker, undefined, [null, { module: import.meta.url }]),
      WorkerError,
    );
    for (
      const options of [
        undefined,
        {},
        { module: "relative.ts" },
        { module: 1 },
        { module: null },
      ]
    ) {
      assertThrows(
        () => Reflect.apply(worker, undefined, [() => 0, options]),
        WorkerError,
      );
    }
    for (
      const input of [null, 0, {}, {
        [Symbol.for("convee/worker-definition")]: {},
      }, {
        [Symbol.for("convee/worker-definition")]: {
          callable: () => 0,
          plugins: {},
        },
      }]
    ) assertThrows(() => definitionData(input), WorkerError);
  });
});
