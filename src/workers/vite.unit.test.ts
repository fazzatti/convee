import { assert, assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parse } from "npm:acorn@8.15.0";
import { conveeWorkers } from "@/workers/vite.ts";

function hook(name: string, ...args: unknown[]): unknown {
  return Reflect.apply(Reflect.get(conveeWorkers(), name), {
    parse: (code: string) =>
      parse(code, { ecmaVersion: "latest", sourceType: "module" }),
  }, args);
}
function transform(code: string, id = "/app/document.worker.js") {
  return hook("transform", code, id) as { code: string; map: null } | undefined;
}
const imports = 'import { worker as define, parallel } from "@convee/workers";';
describe("Vite worker build integration", () => {
  it("retains existing worker build plugins and installs the bootstrap loader", () => {
    const empty = hook("config", {}) as {
      worker: { plugins(): unknown[] };
      optimizeDeps: { exclude: string[] };
    };
    assertEquals(empty.worker.plugins().length, 1);
    assertEquals(empty.optimizeDeps.exclude, [
      "@fifo/convee",
      "@jsr/fifo__convee",
      "@convee",
    ]);
    const configured = hook("config", {
      worker: { plugins: () => [{ name: "existing" }] },
    }) as typeof empty;
    assertEquals(
      (configured.worker.plugins()[0] as { name: string }).name,
      "existing",
    );
    const withoutFactory = hook("config", { worker: {} }) as typeof empty;
    assertEquals(withoutFactory.worker.plugins().length, 1);
  });
  it("resolves synthetic entries and loads a definition without recursive worker imports", () => {
    assertEquals(hook("resolveId", "/app/a.js"), undefined);
    assertEquals(hook("load", "/app/a.js"), undefined);
    const id = "/app/a.js.convee-worker.js?worker&url";
    assertEquals(hook("resolveId", id), id);
    const source = hook("load", id) as string;
    assert(source.includes('from "/app/a.js?convee-worker-definition"'));
    assert(source.includes("bootstrap(async () => definition)"));
  });
  it("rewrites actual imported worker calls, including aliases, tuples, comments and string keys", () => {
    const source = imports +
      '\nexport default define((value) => [value], { module: import /* module */ .meta.url });\nconst extra = define(() => 1, { "module": import.meta.url, });';
    const output = transform(source)!;
    assert(
      output.code.includes(
        'from "/app/document.worker.js.convee-worker.js?worker&url"',
      ),
    );
    assertEquals(
      output.code.match(/entry: __convee_worker_entry_/g)?.length,
      2,
    );
    assertEquals(output.map, null);
    parse(output.code, { ecmaVersion: "latest", sourceType: "module" });
  });
  it("recognizes installed npm, JSR and local worker entrypoints", () => {
    for (
      const specifier of [
        "@fifo/convee/workers",
        "@jsr/fifo__convee/workers",
        "jsr:@fifo/convee/workers",
        "@convee/workers",
      ]
    ) {
      const output = transform(
        `import { worker } from "${specifier}"; export default worker(() => 1, { module: import.meta.url });`,
      )!;
      assert(output.code.includes("entry: __convee_worker_entry_"), specifier);
    }
  });
  it("does not reinterpret unrelated functions, dynamic options or non-module URLs", () => {
    for (
      const source of [
        "export const value = 1;",
        'import { worker } from "other"; worker(() => 1, {module: import.meta.url});',
        'import worker from "@convee/workers"; worker(() => 1, {module: import.meta.url});',
        imports + "define(() => 1);",
        imports + "define(() => 1, options);",
        imports + "parallel(() => 1, {module: import.meta.url});",
        imports + 'define(() => 1, {...options, ["module"]: import.meta.url});',
        imports +
        'define(() => 1, {other: import.meta.url, module: "file:///module.js"});',
        imports + "define(() => 1, {module: value.url});",
        imports + "define(() => 1, {module: import.meta.other});",
        imports +
        "function f() { return define(() => 1, {module: new.target.url}); }",
        'import * as worker from "@convee/workers"; worker.worker(() => 1, {module: import.meta.url});',
      ]
    ) assertEquals(transform(source), undefined, source);
    assertEquals(
      transform(imports, "/app/a.js?convee-worker-definition"),
      undefined,
    );
    assertEquals(transform(imports, "/app/a.js.convee-worker.js"), undefined);
    assertThrows(() => transform(imports + "invalid syntax"));
  });
  it("supports quoted named imports without colliding with application identifiers", () => {
    const source =
      'import { "worker" as define } from "@convee/workers"; export default define(() => 1, { module: import.meta.url });';
    const first = transform(source)!.code;
    const binding = first.match(/import (__convee_worker_entry_\d+)/)![1];
    const result = transform(source + ` const ${binding} = 1;`)!;
    assert(result.code.startsWith(`import ${binding}_ from`));
    parse(result.code, { ecmaVersion: "latest", sourceType: "module" });
  });
});
