import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { persistentWasm, wasm } from "@convee/wasm";
import { jcoBindings } from "@convee/wasm/jco";
// @deno-types="@example/rust-host/generated/host.d.ts"
import { instantiate } from "@example/rust-host/generated/host.js";
import { modules } from "@example/rust-host/generated/modules.ts";

describe("Rust guest with explicit typed host imports", () => {
  it("creates fresh import closures per session and releases them on close", async () => {
    let imports = 0, disposals = 0;
    const bindings = jcoBindings({
      instantiate,
      modules,
      imports: () => {
        imports++;
        let count = 0;
        return { "next-value": { default: () => ++count } };
      },
      disposeImports: () => {
        disposals++;
      },
    });
    await bindings.preload();
    assertEquals(imports, 0);
    const fresh = wasm({ bindings }).step("next");
    assertEquals([await fresh(), await fresh()], [1, 1]);
    assertEquals(disposals, 2);
    const owner = persistentWasm({ bindings });
    assertEquals([await owner.step("next")(), await owner.step("next")()], [
      1,
      2,
    ]);
    await owner.close();
    assertEquals(imports, 3);
    assertEquals(disposals, 3);
  });
  it("preserves an unknown host exception and retires the affected session", async () => {
    const failure = new Error("host rejected");
    let starts = 0, disposed = 0;
    await using owner = persistentWasm({
      bindings: jcoBindings({
        instantiate,
        modules,
        imports: () => {
          const generation = ++starts;
          return {
            "next-value": {
              default: () => {
                if (generation === 1) throw failure;
                return 42;
              },
            },
          };
        },
        disposeImports: () => {
          disposed++;
        },
      }),
    });
    assertStrictEquals(
      await assertRejects(() => owner.step("next")()),
      failure,
    );
    assertEquals(disposed, 1);
    assertEquals(await owner.step("next")(), 42);
    assertEquals(starts, 2);
  });
});
