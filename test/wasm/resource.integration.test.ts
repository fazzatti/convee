import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { FakeTime } from "@std/testing/time";
import { pipe, plugin } from "@convee";
import {
  persistentWasm,
  wasm,
  type WasmBindings,
  WasmError,
  type WasmSession,
} from "@convee/wasm";

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture() {
  const created: { count: number; disposed: number }[] = [];
  let prepared = 0;
  const bindings = {
    preload() {
      prepared++;
      return Promise.resolve();
    },
    create() {
      const state = { count: 0, disposed: 0 };
      created.push(state);
      return Promise.resolve({
        exports: {
          increment: () => ++state.count,
          add: (a: number, b: number) => a + b,
          fail: (): void => {
            throw new Error("guest failure");
          },
          domain: () => {
            throw "expected";
          },
          bytes: () => new Uint8Array([state.count]),
        },
        isApplicationError: (error: unknown) => error === "expected",
        dispose() {
          state.disposed++;
        },
      });
    },
  };
  return {
    bindings,
    created,
    get prepared() {
      return prepared;
    },
  };
}
async function code(call: () => Promise<unknown>, expected: string) {
  const error = await assertRejects(call, WasmError);
  assertEquals(error.code, expected);
  return error;
}

describe("WASM ordinary steps and explicit ownership", () => {
  it("remains lazy, composes in pipes and closes fresh sessions after finalizers", async () => {
    const f = fixture(), text = wasm({ bindings: f.bindings });
    const add = text.step("add", { id: "sum" });
    assertEquals(f.created, []);
    await text.preload();
    assertEquals(f.prepared, 1);
    assertEquals(f.created, []);
    const final = plugin({ id: "final" }).onFinally(() =>
      assertEquals(f.created.at(-1)!.disposed, 0)
    );
    assertStrictEquals(add.use(final), add);
    assertEquals(add.id, "sum");
    assertEquals(add.isSync, false);
    assertEquals(add.plugins.length, 1);
    assertEquals(await add.run(2, 3), 5);
    assertStrictEquals(add.remove("final"), add);
    assertEquals(add.plugins.length, 0);
    assertEquals(await pipe([add, (n: number) => n * 2])(4, 5), 18);
    assertEquals(f.created.map((s) => s.disposed), [1, 1]);
    assertEquals(await text.step("increment")(), 1);
    assertEquals(await text.step("increment")(), 1);
  });
  it("shares persistent guest state, owns outputs and resets only on intentional reopen", async () => {
    const f = fixture();
    await using owner = persistentWasm({
      bindings: f.bindings,
      reopenOnUse: true,
    });
    await owner.preload();
    assertEquals(f.created.length, 0);
    await Promise.all([owner.ready(), owner.ready()]);
    const increment = owner.step("increment");
    assertEquals(await Promise.all([increment(), increment(), increment()]), [
      1,
      2,
      3,
    ]);
    const bytes = await owner.step("bytes")();
    await increment();
    assertEquals(bytes, new Uint8Array([3]));
    assertEquals(f.created.length, 1);
    assertStrictEquals(owner.close(), owner.close());
    await owner.close();
    assertEquals(f.created[0].disposed, 1);
    assertEquals(await increment(), 1);
    await owner.dispose();
    await code(() => increment(), "WASM_CLOSED");
    await code(() => owner.preload(), "WASM_CLOSED");
    await code(() => owner.ready(), "WASM_CLOSED");
  });
  it("holds capacity and drains through delayed output hooks and finalizers", async () => {
    const f = fixture(), entered = gate(), release = gate();
    const owner = persistentWasm({
      bindings: f.bindings,
      maxPending: 1,
      reopenOnUse: true,
    });
    const increment = owner.step("increment").use(
      plugin().onFinally(async () => {
        entered.resolve();
        await release.promise;
      }),
    );
    const running = increment();
    await entered.promise;
    await code(() => owner.step("increment")(), "WASM_CAPACITY");
    await code(() => owner.ready(), "WASM_CAPACITY");
    let closed = false;
    const closing = owner.close().then(() => {
      closed = true;
    });
    await code(() => owner.step("increment")(), "WASM_CLOSED");
    assertEquals(f.created[0].disposed, 0);
    assertEquals(closed, false);
    release.resolve();
    assertEquals(await running, 1);
    await closing;
    assertEquals(f.created[0].disposed, 1);
    await owner.close(); // Await completion of the idle drain before reopening.
    assertEquals(await owner.step("increment")(), 1);
    await owner.dispose();
  });
  it("drains slow initialization and preserves already admitted calls after close", async () => {
    const started = gate(), release = gate(), f = fixture();
    const owner = persistentWasm({
      bindings: {
        preload: f.bindings.preload,
        async create() {
          started.resolve();
          await release.promise;
          return await f.bindings.create();
        },
      },
    });
    const warm = owner.ready();
    await started.promise;
    const call = owner.step("increment")();
    const close = owner.close();
    release.resolve();
    await warm;
    assertEquals(await call, 1);
    await close;
    assertEquals(f.created[0].disposed, 1);
    await code(() => owner.step("increment")(), "WASM_CLOSED");
    await owner.close();
  });
  it("uses optional idle close with full-lifecycle idleness and terminal disposal", async () => {
    using clock = new FakeTime();
    const f = fixture();
    const owner = persistentWasm({
      bindings: f.bindings,
      idleTimeoutMs: 10,
      reopenOnUse: true,
    });
    await owner.ready();
    await clock.tickAsync(9);
    const held = gate(), entered = gate();
    const run = owner.step("increment").use(
      plugin().onFinally(async () => {
        entered.resolve();
        await held.promise;
      }),
    )();
    await entered.promise;
    await clock.tickAsync(100);
    assertEquals(f.created[0].disposed, 0);
    held.resolve();
    await run;
    await clock.tickAsync(10);
    assertEquals(f.created[0].disposed, 1);
    await owner.close(); // Await completion of the idle drain before reopening.
    assertEquals(await owner.step("increment")(), 1);
    await owner.dispose();
    await clock.tickAsync(10);
    assertEquals(f.created.length, 2);
    await code(() => owner.step("increment")(), "WASM_CLOSED");
  });
  it("retains recognized domain errors but retires unsafe state before outer recovery", async () => {
    const f = fixture();
    await using owner = persistentWasm({ bindings: f.bindings });
    const increment = owner.step("increment");
    assertEquals(await increment(), 1);
    const error = await code(() => owner.step("domain")(), "WASM_APPLICATION");
    assertEquals(error.cause, "expected");
    assertEquals(await increment(), 2);
    const recovered = owner.step("fail").use(plugin().onError(() => undefined));
    await recovered();
    assertEquals(f.created[0].disposed, 1);
    assertEquals(await increment(), 1);
    assertEquals(f.created.length, 2);
  });
  it("bounds replacements, never replays and does not reset the budget after success", async () => {
    const f = fixture();
    await using owner = persistentWasm({
      bindings: f.bindings,
      maxRestarts: 1,
      reopenOnUse: true,
    });
    const fail = owner.step("fail"), increment = owner.step("increment");
    await assertRejects(() => fail(), Error, "guest failure");
    assertEquals(f.created.length, 1);
    assertEquals(await increment(), 1);
    await assertRejects(() => fail(), Error, "guest failure");
    const queued = await Promise.allSettled([increment(), increment()]);
    assert(
      queued.every((v) =>
        v.status === "rejected" && v.reason.code === "WASM_UNAVAILABLE"
      ),
    );
    assertEquals(f.created.length, 2);
    await code(() => owner.ready(), "WASM_UNAVAILABLE");
  });
  it("counts failed replacement starts and avoids retrying initial setup", async () => {
    const f = fixture();
    let starts = 0;
    const bindings = {
      ...f.bindings,
      async create() {
        if (++starts > 1) throw new Error("cannot start");
        return await f.bindings.create();
      },
    };
    await using owner = persistentWasm({ bindings, maxRestarts: 2 });
    await assertRejects(() => owner.step("fail")());
    await code(() => owner.step("increment")(), "WASM_UNAVAILABLE");
    assertEquals(starts, 3);
    await code(() => owner.step("increment")(), "WASM_UNAVAILABLE");
    assertEquals(starts, 3);
    await using initial = persistentWasm({ bindings });
    await code(() => initial.ready(), "WASM_UNAVAILABLE");
    await code(() => initial.step("increment")(), "WASM_UNAVAILABLE");
    assertEquals(starts, 4);
  });
  it("blocks uncertain cleanup and preserves both execution and cleanup errors", async () => {
    const f = fixture();
    const cleanup = new Error("cleanup failed");
    const owner = persistentWasm({
      bindings: {
        ...f.bindings,
        async create() {
          return {
            ...await f.bindings.create(),
            dispose() {
              throw cleanup;
            },
          };
        },
      },
      reopenOnUse: true,
    });
    const error = await assertRejects(
      () => owner.step("fail")(),
      AggregateError,
    );
    assertEquals(error.errors[0].message, "guest failure");
    assertStrictEquals(error.errors[1].cause, cleanup);
    await code(() => owner.step("increment")(), "WASM_CLEANUP");
    await code(() => owner.close(), "WASM_CLEANUP");
    await code(() => owner.ready(), "WASM_CLEANUP");
    await code(() => owner.dispose(), "WASM_CLEANUP");
  });
  it("reports cleanup in ordinary finalization, including a preexisting body failure", async () => {
    const f = fixture();
    const transient = wasm({
      bindings: {
        ...f.bindings,
        async create() {
          return {
            ...await f.bindings.create(),
            dispose() {
              throw new Error("cleanup");
            },
          };
        },
      },
    });
    const result = await assertRejects(
      () => transient.step("increment")(),
      Error,
    );
    assertEquals(Reflect.get(result, "code"), "RT_000");
    await assertRejects(() => transient.step("fail")());
  });
  it("applies input/output/error hooks and frees admission after setup or input failure", async () => {
    const f = fixture(),
      owner = persistentWasm({ bindings: f.bindings, maxPending: 1 });
    const add = owner.step("add").use(
      plugin().onInput((a: number, b: number) =>
        [a + 1, b] as [number, number]
      ),
    );
    assertEquals(
      await add.runWith(
        { plugins: [plugin().onOutput((n: number) => n * 2)] },
        1,
        2,
      ),
      8,
    );
    await assertRejects(
      () =>
        add.runWith(
          {
            get plugins(): never {
              throw new Error("setup");
            },
          },
          1,
          2,
        ),
      Error,
      "setup",
    );
    await assertRejects(
      () =>
        add.runWith(
          {
            plugins: [
              plugin().onInput((_a: number, _b: number): [number, number] => {
                throw new Error("input");
              }),
            ],
          },
          1,
          2,
        ),
      Error,
      "input",
    );
    assertEquals(await add(1, 2), 4);
    await owner.dispose();
    assertEquals(
      await add.runWith({ plugins: [plugin().onError(() => 0)] }, 1, 2),
      0,
    );
  });
  it("rejects reentrant acquisition from a guest import without waiting on itself", async () => {
    let nested!: Promise<unknown>;
    const owner = persistentWasm({
      bindings: {
        preload: async () => {},
        create: () =>
          Promise.resolve({
            exports: {
              call: () => {
                nested = owner.step("call")();
                return 1;
              },
            },
          }),
      } as WasmBindings<{ call(): number }>,
    });
    assertEquals(await owner.step("call")(), 1);
    await code(() => nested, "WASM_REENTRANT");
    await owner.dispose();
  });
  it("copies cyclic owned data but rejects shared memory hidden in nested containers", async () => {
    const cyclic: Record<string, unknown> = {
      value: 0,
      nullable: null,
      missing: undefined,
    };
    cyclic.self = cyclic;
    const mutable = new Uint8Array([1]);
    const values: unknown[] = [
      cyclic,
      new Map([["bytes", mutable]]),
      new Set([mutable]),
    ];
    for (const value of values) {
      const resource = wasm({
        bindings: {
          preload: async () => {},
          create: () => Promise.resolve({ exports: { value: () => value } }),
        },
      });
      const copy = await resource.step("value")();
      assertEquals(copy, value);
      assert(copy !== value);
    }
    for (
      const value of [
        new SharedArrayBuffer(1),
        { nested: new Uint8Array(new SharedArrayBuffer(1)) },
        new Map([[new SharedArrayBuffer(1), 0]]),
        new Set([new SharedArrayBuffer(1)]),
      ]
    ) {
      const resource = wasm({
        bindings: {
          preload: async () => {},
          create: () =>
            Promise.resolve({ exports: { value: (): unknown => value } }),
        },
      });
      await code(() => resource.step("value")(), "WASM_BINDING");
    }
  });
  it("works when the runtime does not expose shared memory", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "SharedArrayBuffer",
    )!;
    try {
      Object.defineProperty(globalThis, "SharedArrayBuffer", {
        value: undefined,
        configurable: true,
      });
      const f = fixture();
      assertEquals(
        await wasm({ bindings: f.bindings }).step("bytes")(),
        new Uint8Array([0]),
      );
    } finally {
      Object.defineProperty(globalThis, "SharedArrayBuffer", descriptor);
    }
  });
  it("rejects async, absent and uncloneable exports, and never borrows guest output memory", async () => {
    const bytes = new Uint8Array([1]);
    const bindings: WasmBindings<{ call(): unknown }> = {
      preload: async () => {},
      create: () => Promise.resolve({ exports: { call: () => bytes } }),
    };
    await using owner = persistentWasm({ bindings });
    const result = await owner.step("call")() as Uint8Array;
    bytes[0] = 9;
    assertEquals(result[0], 1);
    for (const output of [Promise.reject(new Error("async")), () => 1]) {
      // Attach before handing the intentionally rejected promise to the adapter.
      if (output instanceof Promise) void output.catch(() => {});
      await using invalid = persistentWasm({
        bindings: {
          ...bindings,
          create: () =>
            Promise.resolve({ exports: { call: (): unknown => output } }),
        },
      });
      await assertRejects(() => invalid.step("call")());
    }
    const missing = wasm({ bindings });
    await code(() => missing.step("absent" as "call")(), "WASM_BINDING");
  });
  it("retires traps even when a classifier incorrectly accepts them, and retains classifier failures", async () => {
    const trap = new WebAssembly.RuntimeError("trap"),
      classification = new Error("classifier");
    for (
      const isApplicationError of [() => true, () => {
        throw classification;
      }]
    ) {
      let disposed = 0;
      await using owner = persistentWasm({
        bindings: {
          preload: async () => {},
          create: () =>
            Promise.resolve({
              exports: {
                trap: () => {
                  throw trap;
                },
              },
              isApplicationError,
              dispose: () => {
                disposed++;
              },
            }),
        },
      });
      assertStrictEquals(await assertRejects(() => owner.step("trap")()), trap);
      assertEquals(disposed, 1);
    }
    const original = new Error("body");
    await using owner = persistentWasm({
      bindings: {
        preload: async () => {},
        create: () =>
          Promise.resolve({
            exports: {
              fail: () => {
                throw original;
              },
            },
            isApplicationError: () => {
              throw classification;
            },
          }),
      },
    });
    const error = await assertRejects(
      () => owner.step("fail")(),
      AggregateError,
    );
    assertEquals(error.errors, [original, classification]);
  });
  it("closes idle owners permanently by default and surfaces failed idle cleanup", async () => {
    using time = new FakeTime();
    const f = fixture(),
      owner = persistentWasm({ bindings: f.bindings, idleTimeoutMs: 5 });
    await owner.ready();
    await time.tickAsync(5);
    await code(() => owner.ready(), "WASM_CLOSED");
    const failed = persistentWasm({
      bindings: {
        ...f.bindings,
        create: async () => ({
          ...await f.bindings.create(),
          dispose() {
            throw new Error("idle cleanup");
          },
        }),
      },
      idleTimeoutMs: 5,
    });
    await failed.ready();
    await time.tickAsync(5);
    await code(() => failed.close(), "WASM_CLEANUP");
    await code(() => failed.ready(), "WASM_CLEANUP");
  });
  it("supports cold close/dispose and eager preparation without creating a session", async () => {
    const f = fixture(),
      eager = wasm({ bindings: f.bindings, loading: "eager" });
    assertEquals(f.prepared, 1);
    assertEquals(f.created.length, 0);
    await eager.preload();
    const owner = persistentWasm({ bindings: f.bindings, reopenOnUse: true });
    await owner.close();
    await owner.dispose();
    await code(() => owner.ready(), "WASM_CLOSED");
    const failed = wasm({
      bindings: {
        ...f.bindings,
        preload: () => Promise.reject(new Error("prepare")),
      },
      loading: "eager",
    });
    await assertRejects(() => failed.preload(), Error, "prepare");
  });
  it("makes disposal terminal even while a reopenable close is already draining", async () => {
    const f = fixture(), entered = gate(), release = gate();
    const owner = persistentWasm({ bindings: f.bindings, reopenOnUse: true });
    const call = owner.step("increment").use(
      plugin().onFinally(async () => {
        entered.resolve();
        await release.promise;
      }),
    )();
    await entered.promise;
    const closing = owner.close();
    assertStrictEquals(owner.dispose(), closing);
    release.resolve();
    await call;
    await closing;
    await code(() => owner.step("increment")(), "WASM_CLOSED");
    assertEquals(f.created.length, 1);
  });
  it("does not retire successful guest state when output or finally plugins fail", async () => {
    const f = fixture();
    await using owner = persistentWasm({ bindings: f.bindings });
    for (
      const hook of [
        plugin().onOutput((_value: number): number => {
          throw new Error("output");
        }),
        plugin().onFinally(() => {
          throw new Error("finally");
        }),
      ]
    ) {
      await assertRejects(() => owner.step("increment").use(hook)());
    }
    assertEquals(await owner.step("increment")(), 3);
    assertEquals(f.created.length, 1);
  });
  it("permits a successful replacement after a failed start within the same finite budget", async () => {
    const f = fixture();
    let starts = 0;
    await using owner = persistentWasm({
      bindings: {
        ...f.bindings,
        create() {
          if (++starts === 2) {
            return Promise.reject(new Error("one failed replacement"));
          }
          return f.bindings.create();
        },
      },
      maxRestarts: 2,
    });
    await assertRejects(() => owner.step("fail")());
    assertEquals(await owner.step("increment")(), 1);
    assertEquals(starts, 3);
    await assertRejects(() => owner.step("fail")());
    await code(() => owner.ready(), "WASM_UNAVAILABLE");
    assertEquals(starts, 3);
    await using disabled = persistentWasm({
      bindings: f.bindings,
      maxRestarts: 0,
    });
    await assertRejects(() => disabled.step("fail")());
    await code(() => disabled.step("increment")(), "WASM_UNAVAILABLE");
  });
  it("validates setup without executing imports, and requires a nonempty step name", () => {
    const f = fixture();
    for (
      const options of [
        null,
        {},
        { bindings: {} },
        { bindings: { preload() {} } },
        { bindings: f.bindings, loading: "sometimes" },
        { bindings: f.bindings, reopenOnUse: "yes" },
        ...[0, -1, 1.2, Infinity, NaN, null, 2147483648].map((maxPending) => ({
          bindings: f.bindings,
          maxPending,
        })),
        { bindings: f.bindings, maxRestarts: -1 },
        { bindings: f.bindings, idleTimeoutMs: 0 },
      ]
    ) {
      assertThrows(
        () => persistentWasm(options as Parameters<typeof persistentWasm>[0]),
        WasmError,
      );
    }
    const resource = wasm({ bindings: f.bindings });
    for (const name of ["", " ", 1]) {
      assertThrows(() => resource.step(name as "increment"), WasmError);
    }
    assertEquals(f.created.length, 0);
  });
  it("stops immediately if initial or replacement creation reports uncertain cleanup", async () => {
    const f = fixture(),
      failure = new WasmError("WASM_CLEANUP", "partial initialization leaked");
    for (const initial of [true, false]) {
      let count = 0;
      const owner = persistentWasm({
        bindings: {
          ...f.bindings,
          async create(): Promise<
            WasmSession<
              Awaited<ReturnType<typeof f.bindings.create>>["exports"]
            >
          > {
            if (initial || ++count > 1) throw failure;
            return await f.bindings.create();
          },
        },
      });
      if (!initial) await assertRejects(() => owner.step("fail")());
      assertStrictEquals(
        await assertRejects(() => owner.step("increment")()),
        failure,
      );
      assertStrictEquals(await assertRejects(() => owner.close()), failure);
    }
  });
});
