import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  dependencies,
  parse,
  resolve,
  resolvedPublicExports,
  sourceFiles,
} from "../../tools/source.ts";
import * as api from "../../src/index.ts";

const layers: Record<string, readonly string[]> = {
  core: ["core"],
  context: ["core", "context"],
  error: ["core", "error"],
  runtime: ["core", "context", "error", "runtime"],
  plugin: ["core", "context", "error", "plugin"],
  step: ["core", "context", "error", "runtime", "plugin", "step"],
  pipe: ["core", "context", "error", "runtime", "plugin", "step", "pipe"],
};

Deno.test("production graph resolves every import and re-export within approved layers", async () => {
  const files = await sourceFiles();
  const graph = new Map<string, string[]>();
  for (const path of files) {
    const imports = dependencies(parse(path, await Deno.readTextFile(path)));
    const edges: string[] = [];
    for (const dependency of imports) {
      const destination = resolve(path, dependency.specifier);
      assert(
        files.includes(destination),
        `Production imports a missing/test module: ${path} -> ${destination}`,
      );
      if (path !== "src/index.ts") {
        assert(
          layers[path.split("/")[1]].includes(destination.split("/")[1]),
          `Layer violation: ${path} -> ${destination}`,
        );
      }
      if (!dependency.runtime) continue;
      edges.push(destination);
    }
    graph.set(path, edges);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(path: string): void {
    assert(!active.has(path), `Runtime import cycle through ${path}`);
    if (visited.has(path)) return;
    active.add(path);
    for (const target of graph.get(path) ?? []) visit(target);
    active.delete(path);
    visited.add(path);
  }
  for (const path of files) visit(path);
});

Deno.test("public type and runtime exports match the reviewed package fixture", async () => {
  const expected = JSON.parse(
    await Deno.readTextFile("test/fixtures/public-api.json"),
  );
  const actual = await resolvedPublicExports();
  assertEquals(actual, expected);
  assertEquals(
    Object.keys(api).sort(),
    actual.filter((entry) => !entry.typeOnly).map((entry) => entry.name).sort(),
  );
});

Deno.test("packaging exports only production source, license and documentation", async () => {
  const config = JSON.parse(await Deno.readTextFile("deno.json"));
  assertEquals(config.exports, "./src/index.ts");
  assertEquals(config.publish.include, [
    "src/**/*.ts",
    "README.md",
    "TESTING.md",
    "LICENSE",
    "deno.json",
  ]);
  assertEquals(config.publish.exclude, ["**/*.test.ts"]);
  const files = await sourceFiles();
  assert(files.length > 20);
  for (const file of files) {
    assert(!/fixture|test|secret|credential|node_modules/.test(file));
  }
});

Deno.test("import analysis distinguishes type-only imports and runtime re-exports", () => {
  const file = parse(
    "fixture.ts",
    `import type { A } from './a.ts'; import { type B, c } from './b.ts'; export * from './c.ts'; export type { D } from './d.ts'; const loaded = import('./e.ts');`,
  );
  assertEquals(dependencies(file), [
    { specifier: "./a.ts", runtime: false },
    { specifier: "./b.ts", runtime: true },
    { specifier: "./c.ts", runtime: true },
    { specifier: "./d.ts", runtime: false },
    { specifier: "./e.ts", runtime: true },
  ]);
});

Deno.test("architecture rejects external dependencies and computed dynamic imports", () => {
  for (
    const specifier of [
      "npm:example",
      "jsr:@example/pkg",
      "https://example.com/module.ts",
      "node:fs",
    ]
  ) {
    assertThrows(
      () => resolve("src/step/step.ts", specifier),
      Error,
      "External production dependency",
    );
  }
  assertThrows(
    () => dependencies(parse("fixture.ts", "import(location);")),
    Error,
    "Non-static runtime import",
  );
  assertEquals(
    dependencies(
      parse("fixture.ts", "type Remote = import('./types.ts').Remote;"),
    ),
    [
      { specifier: "./types.ts", runtime: false },
    ],
  );
  assertEquals(
    resolve("src/pipe/pipe.ts", "../step/step.ts"),
    "src/step/step.ts",
  );
});
