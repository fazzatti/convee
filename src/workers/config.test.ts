import { assertEquals, assertThrows } from "@std/assert";
import {
  clone,
  name,
  plugins,
  poolSetup,
  positive,
  recipes,
  record,
} from "./config.ts";
import { WorkerError } from "./error.ts";

const module = new URL("./registry.test.ts", import.meta.url);

Deno.test("configuration validates resources before starting any workers", () => {
  const invalid: unknown[] = [
    null,
    [],
    {},
    { module: "file:///x", size: 1 },
    { module },
    { module, size: 1, roles: {} },
    { module, roles: {} },
    { module, size: 0 },
    { module, size: 1, createWorker: 1 },
    { module, roles: { a: null } },
    { module, roles: { a: { size: 1, tasks: [] } } },
    { module, roles: { a: { size: 1, tasks: "x" } } },
    { module, roles: { a: { size: 1, tasks: ["x", "x"] } } },
    { module, size: 1, pipelines: { p: { steps: [] } } },
  ];
  for (const config of invalid) {
    assertThrows(() => poolSetup(config), WorkerError);
  }
  for (const value of [0, -1, 0.5, NaN, Infinity, 2 ** 32, "1"]) {
    assertThrows(() => positive(value, 1, "limit"), WorkerError);
  }
  assertEquals(positive(undefined, 7, "limit"), 7);
  assertEquals(positive(2, 7, "limit"), 2);
  assertThrows(() => name(" ", "name"), WorkerError);
  assertThrows(() => record(null, "map"), WorkerError);
  assertEquals(record({ x: 1 }, "map"), { x: 1 });
});

Deno.test("recipes and role settings are snapshotted and retain explicit plugin placement", () => {
  const input = {
    module,
    size: 7,
    pipelines: {
      p: {
        steps: ["first", {
          task: "first",
          id: "second",
          plugins: [{ name: "p", options: { count: 2 } }],
        }],
        plugins: [{ name: "outer" }],
      },
    },
  };
  const config = poolSetup(input);
  input.pipelines.p.steps.length = 0;
  assertEquals(config.pipelines.p.steps.length, 2);
  assertEquals(config.size, 7);
  assertEquals(config.explicitRoles, false);
  assertEquals(config.pipelines.p.steps[1].plugins, [{
    name: "p",
    options: { count: 2 },
  }]);
  const configured = poolSetup({
    module,
    roles: {
      a: { size: 2, tasks: ["first"], plugins: { first: [{ name: "p" }] } },
      b: { size: 1 },
    },
    timeoutMs: 500,
  });
  assertEquals(configured.size, 3);
  assertEquals(configured.explicitRoles, true);
  assertEquals(configured.timeoutMs, 500);
  assertEquals(
    poolSetup({ module, roles: { default: { size: 1 } } }).explicitRoles,
    false,
  );
  assertEquals(plugins(), []);
  assertEquals(recipes(), {});
  for (const value of [1, null, [{ name: "" }], [null]]) {
    assertThrows(() => plugins(value), WorkerError);
  }
  for (
    const value of [{ p: null }, { p: { steps: "x" } }, {
      p: { steps: [null] },
    }, { p: { steps: ["x", "x"] } }]
  ) assertThrows(() => recipes(value), WorkerError);
});

Deno.test("payload snapshots preserve cycles but reject executable values", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  const copy = clone(cycle);
  assertEquals(copy.self === copy, true);
  assertEquals(
    assertThrows(() => clone(() => 1), WorkerError).code,
    "WRK_CLONE",
  );
});
