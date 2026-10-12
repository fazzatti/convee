import {
  assertEquals,
  assertNotStrictEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { jcoBindings, type JcoOptions } from "@convee/wasm/jco";
import { WasmError } from "@convee/wasm";

const empty = () => new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const sha256 =
  "93a44bbb96c751218e4c00d479e4c14358122a389acca16205b1e4d0dc5f9476";
function options(): JcoOptions<{ call(): number }, { count: number }> {
  return {
    modules: { "a.wasm": { source: () => Promise.resolve(empty()), sha256 } },
    imports: () => ({ count: 0 }),
    instantiate: async (get, host) => {
      await WebAssembly.instantiate(await get("a.wasm"));
      return { call: () => ++host.count };
    },
  };
}
describe("Jco factory adapter", () => {
  it("prepares all modules once without instantiation and creates independent sessions", async () => {
    let loads = 0, starts = 0, cleaned = 0;
    const base = options();
    const bindings = jcoBindings({
      ...base,
      modules: {
        "a.wasm": {
          source: () => {
            loads++;
            return Promise.resolve(empty());
          },
          sha256,
        },
        "b.wasm": {
          source: () => {
            loads++;
            return Promise.resolve(empty());
          },
        },
      },
      instantiate: async (get, host) => {
        starts++;
        await get("b.wasm");
        return await base.instantiate(get, host);
      },
      disposeImports: () => {
        cleaned++;
      },
    });
    await Promise.all([bindings.preload(), bindings.preload()]);
    assertEquals(loads, 2);
    assertEquals(starts, 0);
    const [a, b] = await Promise.all([bindings.create(), bindings.create()]);
    assertNotStrictEquals(a.exports, b.exports);
    assertEquals([a.exports.call(), a.exports.call(), b.exports.call()], [
      1,
      2,
      1,
    ]);
    assertEquals(loads, 2);
    assertEquals(starts, 2);
    await a.dispose!();
    await b.dispose!();
    assertEquals(cleaned, 2);
  });
  it("rejects mismatched artifacts and malformed bytes without instantiating", async () => {
    for (
      const asset of [
        { source: () => Promise.resolve(empty()), sha256: "0".repeat(64) },
        { source: () => Promise.resolve(new Uint8Array([1])) },
      ]
    ) {
      const bindings = jcoBindings({
        ...options(),
        modules: { "a.wasm": asset },
      });
      await assertRejects(() => bindings.preload());
    }
  });
  it("shares in-flight failure and retries preparation on the next request", async () => {
    let loads = 0;
    const bindings = jcoBindings({
      ...options(),
      modules: {
        "a.wasm": {
          source: () => {
            if (++loads === 1) throw new Error("offline");
            return Promise.resolve(empty());
          },
        },
      },
    });
    const failed = await Promise.allSettled([
      bindings.preload(),
      bindings.preload(),
    ]);
    assertEquals(failed.map((v) => v.status), ["rejected", "rejected"]);
    assertEquals(loads, 1);
    await bindings.preload();
    assertEquals(loads, 2);
    await bindings.create();
    assertEquals(loads, 2);
  });
  it("loads fetchable assets and preserves failed HTTP status", async () => {
    const original = globalThis.fetch;
    const source = new URL("https://example.invalid/a.wasm");
    try {
      globalThis.fetch = () => Promise.resolve(new Response(empty()));
      const config = { ...options(), modules: { "a.wasm": { source } } };
      const bindings = jcoBindings(config);
      source.pathname = "/changed.wasm"; // Descriptor snapshots URL identity.
      await bindings.preload();
      globalThis.fetch = () =>
        Promise.resolve(new Response(null, { status: 404 }));
      const error = await assertRejects(
        () => jcoBindings(config).preload(),
        WasmError,
      );
      assertEquals(error.code, "WASM_LOAD");
    } finally {
      globalThis.fetch = original;
    }
  });
  it("rejects missing manifest entries and cleans failed initialization", async () => {
    let cleaned = 0;
    const bindings = jcoBindings({
      ...options(),
      instantiate: async (get) => {
        await get("missing");
        return { call: () => 0 };
      },
      disposeImports: () => {
        cleaned++;
      },
    });
    const error = await assertRejects(() => bindings.create(), WasmError);
    assertEquals(error.code, "WASM_BINDING");
    assertEquals(cleaned, 1);
    const failed = new Error("link"), cleanup = new Error("cleanup");
    const both = jcoBindings({
      ...options(),
      instantiate: () => {
        throw failed;
      },
      disposeImports: () => {
        throw cleanup;
      },
    });
    const combined = await assertRejects(() => both.create(), WasmError);
    assertEquals(combined.code, "WASM_CLEANUP");
    assertEquals((combined.cause as AggregateError).errors, [failed, cleanup]);
    await assertRejects(() =>
      jcoBindings({
        ...options(),
        instantiate: () => {
          throw failed;
        },
      }).create()
    );
  });
  it("supports no-import components and optional cleanup and preserves classifier identity", async () => {
    const isApplicationError = () => true;
    const bindings = jcoBindings({ ...options(), isApplicationError });
    const session = await bindings.create();
    assertStrictEquals(session.isApplicationError, isApplicationError);
    assertEquals(await session.dispose!(), undefined);
    const noModules = jcoBindings({
      modules: {},
      imports: () => ({}),
      instantiate: () => ({}),
    });
    await noModules.create();
  });
  it("rejects invalid factories, callbacks, sources and manifests at construction", () => {
    for (
      const config of [
        null,
        {},
        { ...options(), imports: 1 },
        { ...options(), instantiate: null },
        { ...options(), isApplicationError: 1 },
        { ...options(), disposeImports: 1 },
        ...[null, [], 1].map((modules) => ({ ...options(), modules })),
        ...[{ "": { source: () => Promise.resolve(empty()) } }, { a: null }, {
          a: { source: "relative.wasm" },
        }, { a: { source: new URL("https://test.invalid"), sha256: "bad" } }]
          .map((modules) => ({ ...options(), modules })),
      ]
    ) {
      assertThrows(
        () => jcoBindings(config as unknown as ReturnType<typeof options>),
        WasmError,
      );
    }
  });
});
