import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { concurrent } from "@convee";
import { persistentParallel, worker } from "@convee/workers";
import { persistentWasm } from "@convee/wasm";
import { deferred } from "@test/support/runtime.ts";

describe("Reservation, cancellation and classifier boundaries", () => {
  it("preserves a running split or join rejection when abort arrives before settlement", async () => {
    for (const where of ["split", "join"]) {
      for (const rejects of [true, false]) {
        const entered = deferred(),
          release = deferred(),
          failure = new Error(where);
        const controller = new AbortController();
        const pause = async () => {
          entered.resolve();
          await release.promise;
          if (rejects) throw failure;
        };
        const unit = concurrent({
          tasks: { identity: (n: number) => n },
          split: async ({ identity }) => {
            if (where === "split") await pause();
            return [identity.job(4)] as const;
          },
          join: async ([n]) => {
            if (where === "join") await pause();
            return n;
          },
        });
        const pending = unit.runWith({ signal: controller.signal });
        await entered.promise;
        controller.abort();
        release.resolve();
        const error = await assertRejects(() => pending, Error);
        if (rejects) assertStrictEquals(error, failure);
        else assertEquals(Reflect.get(error, "code"), "CNC_ABORTED");
      }
    }
  });

  it("rejects a batch first reserved after graceful close while waiting for the caller", async () => {
    const entered = deferred(), release = deferred();
    let starts = 0, joins = 0;
    const owner = persistentParallel({
      workers: {
        a: {
          worker: worker((n: number) => n, { module: import.meta.url }),
          count: 1,
        },
      },
      split: async ({ a }) => {
        entered.resolve();
        await release.promise;
        return [a.job(1)] as const;
      },
      join: ([n]) => {
        joins++;
        return n;
      },
      createWorker: () => {
        starts++;
        throw new Error("Unexpected worker start");
      },
    });
    const pending = owner.step();
    await entered.promise;
    const closing = owner.close();
    release.resolve();
    const error = await assertRejects(() => pending, Error);
    assertEquals(Reflect.get(error, "code"), "WRK_CLOSED");
    await closing;
    assertEquals([starts, joins], [0, 0]);
  });

  it("retires Convee-owned binding failures even when a classifier accepts every guest exception", async () => {
    let created = 0, closed = 0, classified = 0;
    const domain = new Error("domain");
    await using owner = persistentWasm({
      maxRestarts: 6,
      bindings: {
        preload: () => Promise.resolve(),
        create: () => {
          const id = ++created;
          return Promise.resolve({
            exports: {
              id: () => id,
              uncloneable: () => () => id,
              asynchronous: () => Promise.resolve(id),
              missing: undefined as unknown as () => number,
              domain: () => {
                throw domain;
              },
              trap: () => {
                throw new WebAssembly.RuntimeError("trap");
              },
            },
            isApplicationError: () => {
              classified++;
              return true;
            },
            dispose: () => {
              closed++;
            },
          });
        },
      },
    });
    assertEquals(await owner.step("id")(), 1);
    assertEquals(
      Reflect.get(
        await assertRejects(() => owner.step("domain")(), Error),
        "code",
      ),
      "WASM_APPLICATION",
    );
    assertEquals(await owner.step("id")(), 1);
    for (
      const name of ["uncloneable", "asynchronous", "missing", "trap"] as const
    ) {
      const before = created;
      await assertRejects(() => Reflect.apply(owner.step, owner, [name])());
      assertEquals(closed, before);
      assertEquals(await owner.step("id")(), before + 1);
    }
    assertEquals(classified, 1);
  });
});
