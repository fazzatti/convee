import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { plugin } from "@convee";
import { persistentWasm, wasm, WasmError } from "@convee/wasm";
import { jcoBindings, type JcoModule } from "@convee/wasm/jco";
// @deno-types="@example/component-pair/generated/pair.d.ts"
import { instantiate as pairFactory } from "@example/component-pair/generated/pair.js";
import { modules as pairModules } from "@example/component-pair/generated/modules.ts";
// @deno-types="@example/rust-abi/generated/abi.d.ts"
import { instantiate as abiFactory } from "@example/rust-abi/generated/abi.js";
import { modules as abiModules } from "@example/rust-abi/generated/modules.ts";
import type { Packet } from "@example/rust-abi/generated/abi.d.ts";
import { abiEqual, abiPacket } from "@test/wasm/abi-cases.ts";

describe("Real generated ABI failure boundaries", () => {
  for (
    const [name, kind] of [
      ["badUtf8", TypeError],
      ["badStringPointer", RangeError],
      ["outOfBoundsList", WebAssembly.RuntimeError],
    ] as const
  ) {
    it(
      "rejects malformed guest " + name + " and releases its session",
      async () => {
        let disposed = 0;
        const bindings = jcoBindings({
          instantiate: pairFactory,
          modules: pairModules,
          imports: () => ({}),
          disposeImports: () => {
            disposed++;
          },
        });
        await using owner = persistentWasm({ bindings });
        await assertRejects(() => owner.step(name)(), kind);
        assertEquals(disposed, 1);
        assertEquals(await owner.step("add")(25), 42);
        await owner.dispose();
        assertEquals(disposed, 2);
      },
    );
  }
  it("links both core modules and retires malformed guest output before recovery", async () => {
    const disposed: number[] = [];
    let starts = 0;
    const bindings = jcoBindings({
      instantiate: pairFactory,
      modules: pairModules,
      imports: () => ({ id: ++starts }),
      disposeImports: ({ id }) => {
        disposed.push(id);
      },
    });
    await bindings.preload();
    assertEquals(starts, 0);
    await using owner = persistentWasm({ bindings, maxRestarts: 1 });
    assertEquals(await owner.step("add")(25), 42);
    const invalid = owner.step("badChar").use(
      plugin().onError((error) => {
        assertEquals(error instanceof TypeError, true);
        assertEquals(disposed, [1]);
        return "fallback";
      }),
    );
    assertEquals(await invalid(), "fallback");
    assertEquals(starts, 1); // Recovery does not replay the unsafe call.
    assertEquals(await owner.step("add")(1), 18);
    await owner.dispose();
    assertEquals(starts, 2);
    assertEquals(disposed, [1, 2]);
  });
  it("rejects a missing non-first core module and cleans the created imports", async () => {
    let disposed = 0;
    const bindings = jcoBindings({
      instantiate: pairFactory,
      modules: { "pair.core.wasm": pairModules["pair.core.wasm"] },
      imports: () => ({}),
      disposeImports: () => {
        disposed++;
      },
    });
    await bindings.preload(); // Preparation cannot infer a factory's missing paths.
    const error = await assertRejects(() => bindings.create(), WasmError);
    assertEquals(error.code, "WASM_BINDING");
    assertEquals(disposed, 1);
  });
  it("checks the digest of every core asset before constructing any imports", async () => {
    let starts = 0;
    const bindings = jcoBindings({
      instantiate: pairFactory,
      modules: {
        ...pairModules,
        "pair.core2.wasm": {
          ...pairModules["pair.core2.wasm"],
          sha256: "0".repeat(64),
        },
      },
      imports: () => {
        starts++;
        return {};
      },
    });
    const error = await assertRejects(() => bindings.create(), WasmError);
    assertEquals(error.code, "WASM_INTEGRITY");
    assertEquals(starts, 0);
  });
  it("rejects valid core bytes paired with incompatible generated glue", async () => {
    let disposed = 0;
    const modules: Record<string, JcoModule> = {
      // The second core is valid and has a matching digest, but requires imports
      // that the first core's generated instantiation site does not provide.
      "pair.core.wasm": pairModules["pair.core2.wasm"],
      "pair.core2.wasm": pairModules["pair.core2.wasm"],
    };
    const bindings = jcoBindings({
      instantiate: pairFactory,
      modules,
      imports: () => ({}),
      disposeImports: () => {
        disposed++;
      },
    });
    await bindings.preload(); // Binary validity and integrity are not ABI compatibility.
    await assertRejects(() => bindings.create(), TypeError);
    assertEquals(disposed, 1);
  });
  for (const failure of ["throw", "malformed-return"] as const) {
    it(
      "retires a real aggregate host " + failure + " without replay",
      async () => {
        let starts = 0, calls = 0;
        const disposed: number[] = [];
        const thrown = new Error("host failure");
        const bindings = jcoBindings({
          instantiate: abiFactory,
          modules: abiModules,
          imports: () => {
            const id = ++starts;
            return {
              id,
              observe: {
                default: (value: Packet): Packet => {
                  calls++;
                  abiEqual(value, abiPacket()); // The host receives a fully lifted aggregate.
                  if (id === 1) {
                    if (failure === "throw") throw thrown;
                    return { ...value, shade: "invalid" as Packet["shade"] };
                  }
                  return { ...value, name: "recovered" };
                },
              },
            };
          },
          disposeImports: ({ id }) => {
            disposed.push(id);
          },
        });
        await using owner = persistentWasm({ bindings, maxRestarts: 1 });
        const error = await assertRejects(() =>
          owner.step("throughHost")(abiPacket())
        );
        if (failure === "throw") assertStrictEquals(error, thrown);
        else assertEquals(error instanceof TypeError, true);
        assertEquals(calls, 1);
        assertEquals(disposed, [1]);
        abiEqual(await owner.step("throughHost")(abiPacket()), {
          ...abiPacket(),
          name: "recovered",
        });
        assertEquals(starts, 2);
        assertEquals(calls, 2);
        await owner.dispose();
        assertEquals(disposed, [1, 2]);
      },
    );
  }
  it("releases fresh-session imports when generated input lowering fails", async () => {
    let disposed = 0, calls = 0;
    const bindings = jcoBindings({
      instantiate: abiFactory,
      modules: abiModules,
      imports: () => ({
        observe: {
          default: (value: Packet) => {
            calls++;
            return value;
          },
        },
      }),
      disposeImports: () => {
        disposed++;
      },
    });
    const run = wasm({ bindings }).step("throughHost");
    await assertRejects(
      () => run({ ...abiPacket(), shade: "invalid" as Packet["shade"] }),
      TypeError,
    );
    assertEquals(calls, 0);
    assertEquals(disposed, 1);
    abiEqual(await run(abiPacket()), abiPacket());
    assertEquals(calls, 1);
    assertEquals(disposed, 2);
  });
});
