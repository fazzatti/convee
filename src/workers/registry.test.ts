import { assertEquals, assertThrows } from "@std/assert";
import { workerRegistry } from "./registry.ts";
import { WorkerError } from "./error.ts";

Deno.test("registry snapshots named factories and ignores inherited entries", () => {
  const factories = Object.assign(Object.create({ inherited: () => () => 0 }), {
    double: () => (n: number) => n * 2,
  });
  const registry = workerRegistry({ tasks: factories });
  delete factories.double;
  assertEquals(Object.keys(registry.tasks), ["double"]);
  assertEquals(Object.isFrozen(registry.tasks), true);
  assertEquals(Object.keys(registry.plugins), []);
});
Deno.test("invalid registries fail at definition time", () => {
  for (const value of [null, [], { x: 1 }, { "": () => () => 1 }]) {
    assertThrows(
      () => Reflect.apply(workerRegistry, undefined, [{ tasks: value }]),
      WorkerError,
    );
  }
  assertThrows(
    () =>
      Reflect.apply(workerRegistry, undefined, [{ tasks: {}, plugins: [] }]),
    WorkerError,
  );
});
