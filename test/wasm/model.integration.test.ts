import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { persistentWasm, WasmError } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

describe("Persistent Rust state model", () => {
  it("matches 300 seeded close, ready, trap, application-error and state transitions", async () => {
    await using owner = persistentWasm({
      bindings: textBindings,
      reopenOnUse: true,
      maxRestarts: 2,
    });
    let seed = 1082, count = 0, started = false, retired = false, remaining = 2;
    for (let index = 0; index < 300; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const action = seed % 7;
      if (action === 0) {
        await owner.close();
        count = 0;
        started = false;
        retired = false;
        remaining = 2;
        continue;
      }
      const execute = action === 1
        ? () => owner.ready()
        : action === 2
        ? () => owner.step("trap")()
        : action === 3
        ? () => owner.step("summarize")("")
        : () => owner.step("increment")();
      if (retired) {
        if (!remaining) {
          const error = await assertRejects(execute, WasmError);
          assertEquals(error.code, "WASM_UNAVAILABLE");
          continue;
        }
        remaining--;
        retired = false;
        count = 0;
      }
      if (!started) {
        started = true;
        count = 0;
      }
      if (action === 1) await execute();
      else if (action === 2) {
        await assertRejects(execute, WebAssembly.RuntimeError);
        retired = true;
      } else if (action === 3) {
        const error = await assertRejects(execute, WasmError);
        assertEquals(error.code, "WASM_APPLICATION");
      } else assertEquals(await execute(), ++count);
    }
  });
});
