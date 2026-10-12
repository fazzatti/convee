import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { persistentWasm, wasm } from "@convee/wasm";
import { abiBindings } from "@example/rust-abi/bindings.ts";
import { abiCases, runAbiMatrix } from "@test/wasm/abi-cases.ts";

describe("Real Rust ABI conformance", () => {
  for (const item of abiCases) {
    it(item.id + " with fresh instances", async () => {
      await item.run(wasm({ bindings: abiBindings }));
    });
    it(item.id + " with a persistent instance", async () => {
      await using owner = persistentWasm({
        bindings: abiBindings,
        maxRestarts: 32,
      });
      await item.run(owner);
    });
  }
  it("executes every generated function and every unique matrix category", async () => {
    await using owner = persistentWasm({
      bindings: abiBindings,
      maxRestarts: 32,
    });
    const evidence = await runAbiMatrix(owner);
    const reference = await abiBindings.create();
    try {
      assertEquals(evidence.exports, Object.keys(reference.exports).sort());
      assertEquals(new Set(evidence.cases).size, abiCases.length);
    } finally {
      await reference.dispose?.();
    }
  });
});
