import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { persistentWasm } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

describe("Persistent WASM result retention", () => {
  it("does not retain 1000 completed owned outputs, including the last result", async () => {
    const collect = Reflect.get(globalThis, "gc") as () => void;
    await using owner = persistentWasm({ bindings: textBindings });
    const echo = owner.step("echoBytes");
    async function populate() {
      const references: WeakRef<Uint8Array>[] = [];
      for (let i = 0; i < 1000; i++) {
        references.push(new WeakRef(await echo(new Uint8Array(1024))));
      }
      return references;
    }
    const references = await populate();
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      collect();
    }
    assertEquals(references.filter((reference) => reference.deref()).length, 0);
    assertEquals(await owner.step("increment")(), 1);
  });
});
