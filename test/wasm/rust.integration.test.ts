import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { plugin } from "@convee";
import { persistentWasm, wasm, WasmError } from "@convee/wasm";
import { textBindings } from "@example/rust-text/bindings.ts";

describe("Real Rust/WIT/Jco component", () => {
  it("executes generated typed strings, records, variants, options, bytes and u64", async () => {
    const text = wasm({ bindings: textBindings });
    await Promise.all([text.preload(), text.preload()]);
    assertEquals(await text.step("countWords")("  Olá\t世界\n🌍 "), 3);
    assertEquals(await text.step("summarize")("Olá mundo\nOne more"), {
      words: 4,
      title: "Olá mundo",
    });
    assertEquals(await text.step("optionalTitle")(undefined), undefined);
    assertEquals(await text.step("optionalTitle")("  Title  "), "Title");
    for (
      const bytes of [
        new Uint8Array(),
        new Uint8Array([0, 127, 255]),
        new Uint8Array(1_000_000).fill(123),
      ]
    ) {
      assertEquals(await text.step("echoBytes")(bytes), bytes);
    }
    for (const value of [0n, 9007199254740993n, 18446744073709551615n]) {
      assertEquals(await text.step("echoWide")(value), value);
    }
  });
  it("creates isolated fresh instances and intentionally retains persistent state", async () => {
    const transient = wasm({ bindings: textBindings });
    assertEquals(
      await Promise.all([
        transient.step("increment")(),
        transient.step("increment")(),
      ]),
      [1, 1],
    );
    await using a = persistentWasm({
      bindings: textBindings,
      reopenOnUse: true,
    });
    await using b = persistentWasm({ bindings: textBindings });
    await a.ready();
    await b.ready();
    assertEquals(await a.step("increment")(), 1);
    assertEquals(await a.step("increment")(), 2);
    assertEquals(await b.step("increment")(), 1);
    const before = await a.step("echoBytes")(new Uint8Array([1, 2, 3]));
    await a.step("echoBytes")(new Uint8Array(2_000_000).fill(4));
    assertEquals(before, new Uint8Array([1, 2, 3]));
    await a.close();
    assertEquals(await a.step("increment")(), 1);
  });
  it("routes declared Results through error plugins, preserving state until a real panic", async () => {
    await using owner = persistentWasm({
      bindings: textBindings,
      maxRestarts: 1,
    });
    assertEquals(await owner.step("increment")(), 1);
    for (
      const [input, payload] of [["", { tag: "empty" }], ["a".repeat(4097), {
        tag: "too-long",
        val: 4097,
      }]] as const
    ) {
      const error = await assertRejects(
        () => owner.step("summarize")(input),
        WasmError,
      );
      assertEquals(error.code, "WASM_APPLICATION");
      assertEquals(error.cause, payload);
    }
    const summarize = owner.step("summarize").use(
      plugin.for<[string], { words: number; title: string }>()({
        error: () => ({ words: 0, title: "fallback" }),
      }),
    );
    assertEquals(await summarize(""), { words: 0, title: "fallback" });
    assertEquals(await owner.step("increment")(), 2);
    await assertRejects(() => owner.step("trap")(), WebAssembly.RuntimeError);
    assertEquals(await owner.step("increment")(), 1);
    await assertRejects(() => owner.step("trap")(), WebAssembly.RuntimeError);
    const unavailable = await assertRejects(
      () => owner.step("increment")(),
      WasmError,
    );
    assertEquals(unavailable.code, "WASM_UNAVAILABLE");
  });
});
