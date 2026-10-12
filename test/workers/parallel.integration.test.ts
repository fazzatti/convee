import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { pipe, plugin, step } from "@convee";
import {
  parallel,
  persistentParallel,
  worker,
  WorkerError,
  type WorkerJob,
} from "@convee/workers";
import {
  deferred,
  local,
  ManualWorker,
  until,
} from "@test/workers/transport.ts";
const definition = worker((n: number) => n * 2, { module: import.meta.url });
function simple(extra: Record<string, unknown> = {}) {
  return {
    workers: { a: { worker: definition, count: 1 } },
    split: ({ a }: { a: { job(n: number): WorkerJob<number> } }, n: number) =>
      [a.job(n)] as const,
    join: ([value]: readonly [number]) => value,
    ...extra,
  };
}
async function errorCode(
  call: () => Promise<unknown>,
  code: string,
): Promise<Error> {
  const error = await assertRejects(call, Error);
  assertEquals(Reflect.get(error, "code"), code);
  return error;
}
describe("Native parallel step integration", () => {
  it("preserves nested heterogeneous tuples and native callable, run, runWith and pipeline behavior", async () => {
    const text = worker((n: number) => `title:${n}`, {
      module: "file:///title.ts",
    });
    const runtime = local(definition, text);
    const output = parallel({
      workers: {
        a: { worker: definition, count: 3 },
        b: { worker: text, count: 4 },
      },
      createWorker: runtime.createWorker,
      split: ({ a, b }, input: number[]) =>
        input.map((n) => [a.job(n), b.job(n)] as const),
      join: (values) => values.map(([number, title]) => ({ number, title })),
    });
    assertEquals(output.isSync, false);
    assertEquals(await output([2, 3]), [{ number: 4, title: "title:2" }, {
      number: 6,
      title: "title:3",
    }]);
    assertEquals(runtime.workers.length, 7);
    assert(runtime.workers.every((remote) => remote.terminated));
    assertEquals(await output.run([1]), [{ number: 2, title: "title:1" }]);
    const flow = pipe([step((n: number): [number[]] => [[n]]), output]);
    assertEquals(await flow(4), [{ number: 8, title: "title:4" }]);
    const clean = plugin({ id: "clean" }).onFinally(() => {});
    assertEquals(output.use(clean), output);
    assertEquals(output.plugins, [clean]);
    assertEquals(output.remove("clean"), output);
    assertEquals(output.plugins, []);
    assertEquals(await output.runWith({ plugins: [clean] }, []), []);
  });
  it("uses independent group capacities with no pairing or readiness barrier", async () => {
    const remotes: { group: string; remote: ManualWorker }[] = [];
    const output = parallel({
      workers: {
        a: { worker: definition, count: 1 },
        b: { worker: definition, count: 1 },
      },
      createWorker: (_entry, slot) => {
        const remote = new ManualWorker();
        remotes.push({ group: slot.group, remote });
        return remote;
      },
      split: ({ a, b }) =>
        [[a.job(1), b.job(1)], [a.job(2), b.job(2)]] as const,
      join: (values) => values,
    });
    const pending = output();
    await until(() => remotes.length === 2);
    const a = remotes.find((item) => item.group === "a")!.remote,
      b = remotes.find((item) => item.group === "b")!.remote;
    a.ready();
    a.result(10);
    a.result(20);
    assertEquals(b.sent.length, 1);
    b.ready();
    b.result(100);
    b.result(200);
    assertEquals(await pending, [[10, 100], [20, 200]]);
  });
  it("separates inner, caller-job and outer plugins, allowing caller recovery before aggregation", async () => {
    const order: string[] = [];
    const inner = step((n: number) => {
      order.push("body");
      if (n < 0) throw new Error("negative");
      return n;
    })
      .use(
        plugin().onInput((n: number) => {
          order.push("inner input");
          return n;
        }).onFinally(() => {
          order.push("inner finally");
        }),
      );
    const plain = worker(inner, { module: import.meta.url });
    const remote = plain.use(
      plugin().onInput((n: number) => {
        order.push("caller input");
        return n;
      })
        .onError((error) => {
          order.push("caller recovery");
          assertEquals(Reflect.get(error, "code"), "WRK_TASK");
          return 10;
        })
        .onOutput((n: number) => {
          order.push("caller output");
          return n + 1;
        })
        .onFinally(() => {
          order.push("caller finally");
        }),
    );
    const runtime = local(plain);
    const output = parallel({
      ...simple(),
      workers: { a: { worker: remote, count: 1 } },
      createWorker: runtime.createWorker,
    })
      .use(
        plugin().onInput((n: number) => {
          order.push("outer input");
          return n;
        }).onOutput((n: number) => {
          order.push("outer output");
          return n + 1;
        }).onFinally(() => {
          order.push("outer finally");
        }),
      );
    assertEquals(await output(-1), 12);
    assertEquals(order, [
      "outer input",
      "caller input",
      "inner input",
      "body",
      "inner finally",
      "caller recovery",
      "caller output",
      "caller finally",
      "outer output",
      "outer finally",
    ]);
  });
  it("all mode waits for finalizers and retains failures while collect preserves the nested shape", async () => {
    const body = worker((n: number) => {
      if (n < 0) throw new Error("negative");
      return n;
    }, { module: import.meta.url });
    const runtime = local(body);
    const finalize = deferred();
    const entered = deferred();
    const configured = body.use(
      plugin().onFinally(() => {
        entered.resolve();
        return finalize.promise;
      }),
    );
    const output = parallel({
      workers: { a: { worker: configured, count: 2 } },
      createWorker: runtime.createWorker,
      split: ({ a }) => [a.job(-1), a.job(2)] as const,
      join: () => {
        throw new Error("join must be skipped");
      },
    });
    let settled = false;
    const failed = errorCode(() => output(), "WRK_BATCH").then((error) => {
      settled = true;
      return error;
    });
    await entered.promise;
    assertEquals(settled, false);
    finalize.resolve();
    const error = await failed;
    assertEquals((error as WorkerError).meta?.failures?.length, 1);
    const collect = parallel({
      workers: { a: { worker: body, count: 1 } },
      createWorker: runtime.createWorker,
      mode: "collect",
      split: ({ a }) => [[a.job(-1), a.job(2)], []] as const,
      join: (values) => values,
    });
    const values = await collect();
    assertEquals(values[0][0].status, "rejected");
    assertEquals(values[0][1], { status: "fulfilled", value: 2 });
    assertEquals(values[1], []);
  });
  it("input/output/finally hook failures follow native recovery boundaries", async () => {
    for (const phase of ["input", "output", "finally"]) {
      let recoveries = 0;
      let finalized = 0;
      const hook = phase === "input"
        ? plugin().onInput((_n: number) => {
          throw new Error("input");
        })
        : phase === "output"
        ? plugin().onOutput((_n: number) => {
          throw new Error("output");
        })
        : plugin().onFinally(() => {
          throw new Error("finally");
        });
      const definitionWithHooks = definition.use(hook).use(
        plugin().onError(() => {
          recoveries++;
          return 99;
        }).onFinally(() => {
          finalized++;
        }),
      );
      const runtime = local(definition);
      const output = parallel({
        ...simple(),
        workers: { a: { worker: definitionWithHooks, count: 1 } },
        createWorker: runtime.createWorker,
        mode: "collect",
        join: (values) => values,
      });
      const [outcome] = await output(1);
      assertEquals(outcome.status, "rejected");
      assertEquals(recoveries, 0);
      assertEquals(finalized, 1);
    }
  });
  it("outer split/join/admission failures can recover and every path finalizes", async () => {
    const runtime = local(definition);
    let finals = 0;
    for (const phase of ["split", "join", "capacity", "input"]) {
      let recoveries = 0;
      const output = parallel({
        ...simple(),
        createWorker: runtime.createWorker,
        split: ({ a }, n: number) => {
          if (phase === "split") throw new Error("split");
          return [a.job(n), ...(phase === "capacity" ? [a.job(n)] : [])];
        },
        maxPending: 1,
        join: (values) => {
          if (phase === "join") throw new Error("join");
          return values[0];
        },
      }).use(
        plugin().onError(() => {
          recoveries++;
          return 7;
        }).onFinally(() => {
          finals++;
        }),
      );
      if (phase === "input") {
        output.use(
          plugin().onInput((_n: number) => {
            throw new Error("input");
          }),
        );
        await assertRejects(() => output(1));
        assertEquals(recoveries, 0);
      } else {
        assertEquals(await output(1), 7);
        assertEquals(recoveries, 1);
      }
    }
    assertEquals(finals, 4);
    assert(runtime.workers.every((remote) => remote.terminated));
  });
  it("atomically rejects malformed, foreign, cyclic, sparse and uncloneable batches before job hooks", async () => {
    let hooks = 0;
    const configured = definition.use(
      plugin().onInput((n: number) => {
        hooks++;
        return n;
      }),
    );
    const runtime = local(definition);
    let foreign: WorkerJob | undefined;
    await parallel({
      ...simple(),
      createWorker: runtime.createWorker,
      split: ({ a }) => {
        foreign = a.job(1);
        return [];
      },
      join: () => 0,
    })();
    for (
      const kind of [
        "foreign",
        "cycle",
        "hole",
        "leaf",
        "root",
        "clone",
        "depth",
        "mutated-context",
      ]
    ) {
      const output = parallel({
        ...simple(),
        workers: { a: { worker: configured, count: 1 } },
        createWorker: runtime.createWorker,
        split: ({ a }) => {
          const tree: unknown[] = [a.job(1)];
          if (kind === "foreign") tree.push(foreign);
          if (kind === "cycle") tree.push(tree);
          if (kind === "hole") tree.length++;
          if (kind === "leaf") tree.push(1);
          if (kind === "clone") {
            tree.push(a.job(1).withContext({ seed: { fn: () => 0 } }));
          }
          if (kind === "mutated-context") {
            const context = { capture: "none" as const };
            tree.push(a.job(1).withContext(context));
            Reflect.set(context, "capture", "invalid");
          }
          if (kind === "depth") {
            let current = tree;
            for (let i = 0; i < 258; i++) {
              const next: unknown[] = [];
              current.push(next);
              current = next;
            }
          }
          return (kind === "root"
            ? null
            : tree) as unknown as readonly WorkerJob<number>[];
        },
        join: () => 0,
      });
      await errorCode(
        () => output(),
        kind === "clone" ? "WRK_CLONE" : "WRK_CONFIG",
      );
    }
    assertEquals(hooks, 0);
    assertEquals(runtime.workers.length, 0);
    assertThrows(() => Reflect.apply(parallel, undefined, [null]), WorkerError);
  });
  it("snapshots callbacks and payloads and never transfers the input buffer", async () => {
    const input = { amount: 2, buffer: new ArrayBuffer(4) };
    const begun = deferred();
    const proceed = deferred();
    const body = worker((value: typeof input) => value.amount, {
      module: import.meta.url,
    });
    const runtime = local(body);
    const configured = body.use(
      plugin().onInput(async (value: typeof input) => {
        begun.resolve();
        await proceed.promise;
        return value;
      }),
    );
    const options = {
      workers: { a: { worker: configured, count: 1 } },
      createWorker: runtime.createWorker,
      split: ({ a }: { a: { job(value: typeof input): WorkerJob<number> } }) =>
        [a.job(input)] as const,
      join: ([value]: readonly [number]) => value,
    };
    const output = parallel(options);
    options.join = () => 99;
    const pending = output();
    await begun.promise;
    input.amount = 99;
    proceed.resolve();
    assertEquals(await pending, 2);
    assertEquals(input.buffer.byteLength, 4);
  });
  it("per-job context is fresh, explicit and isolated from persistent worker closure state", async () => {
    let calls = 0;
    const body = worker(
      step(function () {
        const n = Number(this.context().state.get("n") ?? 0);
        this.context().state.set("n", n + 1);
        return [n, ++calls];
      }),
      { module: import.meta.url },
    );
    const runtime = local(body);
    const owner = persistentParallel({
      workers: { a: { worker: body, count: 1 } },
      createWorker: runtime.createWorker,
      split: ({ a }) =>
        [a.job().withContext({ seed: { n: 4 } }), a.job()] as const,
      join: (values) => values,
    });
    try {
      assertEquals(await owner.step(), [[4, 1], [0, 2]]);
      assertEquals(await owner.step(), [[4, 3], [0, 4]]);
    } finally {
      await owner.dispose();
    }
    await assertRejects(
      () =>
        parallel({
          ...simple(),
          createWorker: local(definition).createWorker,
          split: ({ a }) =>
            [a.job(1).withContext({ capture: "bad" as never })] as const,
          join: () => 0,
        })(),
      WorkerError,
    );
  });
  it("holds capacity through caller finalization and rejects reentrant admissions", async () => {
    const entered = deferred();
    const finish = deferred();
    let hooks = 0;
    const runtime = local(definition);
    const owner = persistentParallel({
      ...simple(),
      maxPending: 1,
      createWorker: runtime.createWorker,
      workers: {
        a: {
          worker: definition.use(
            plugin().onInput((n: number) => {
              hooks++;
              return n;
            }).onFinally(() => {
              entered.resolve();
              return finish.promise;
            }),
          ),
          count: 1,
        },
      },
    });
    try {
      const first = owner.step(1);
      await entered.promise;
      await errorCode(() => owner.step(2), "WRK_CAPACITY");
      assertEquals(hooks, 1);
      finish.resolve();
      assertEquals(await first, 2);
      assertEquals(await owner.step(3), 6);
    } finally {
      finish.resolve();
      await owner.dispose();
    }
  });
});
describe("Persistent ownership and disposal", () => {
  it("reuses workers, drains hooks/join before close, rejects during draining and optionally reopens", async () => {
    const runtime = local(definition);
    const entered = deferred();
    const release = deferred();
    const owner = persistentParallel({
      ...simple(),
      createWorker: runtime.createWorker,
      reopenOnUse: true,
      join: async ([value]) => {
        entered.resolve();
        await release.promise;
        return value;
      },
    });
    await owner.ready();
    const first = owner.step(1);
    await entered.promise;
    const closing = owner.close();
    await errorCode(() => owner.step(2), "WRK_CLOSED");
    assertEquals(runtime.workers[0].terminated, false);
    release.resolve();
    assertEquals(await first, 2);
    await closing;
    assert(runtime.workers[0].terminated);
    assertEquals(await owner.step(3), 6);
    assertEquals(runtime.workers.length, 2);
    await owner.dispose();
    await errorCode(() => owner.step(4), "WRK_CLOSED");
    await owner.dispose();
  });
  it("default close is terminal, await using has one lifetime per scope, and escaped steps stay closed", async () => {
    const runtime = local(definition);
    const owner = persistentParallel({
      ...simple(),
      createWorker: runtime.createWorker,
    });
    await owner.close();
    await owner.close();
    await errorCode(() => owner.ready(), "WRK_CLOSED");
    let escaped: typeof owner.step;
    async function scope(): Promise<void> {
      await using scoped = persistentParallel({
        ...simple(),
        createWorker: runtime.createWorker,
        reopenOnUse: true,
      });
      escaped = scoped.step;
      await scoped.step(1);
    }
    await scope();
    await scope();
    assertEquals(runtime.workers.length, 2);
    assert(runtime.workers.every((remote) => remote.terminated));
    await errorCode(() => escaped(1), "WRK_CLOSED");
    await assertRejects(
      async () => {
        await using scoped = persistentParallel({
          ...simple(),
          createWorker: runtime.createWorker,
        });
        await scoped.ready();
        throw new Error("scope");
      },
      Error,
      "scope",
    );
    assert(runtime.workers.every((remote) => remote.terminated));
  });
  it("idle timeout is optional and does not interrupt caller hooks or join", async () => {
    const runtime = local(definition);
    const entered = deferred();
    const finish = deferred();
    const owner = persistentParallel({
      ...simple(),
      createWorker: runtime.createWorker,
      idleTimeoutMs: 5,
      reopenOnUse: true,
    });
    owner.step.use(
      plugin().onFinally(async () => {
        entered.resolve();
        await finish.promise;
      }),
    );
    const pending = owner.step(1);
    await entered.promise;
    await new Promise((resolve) => setTimeout(resolve, 12));
    assertEquals(runtime.workers[0].terminated, false);
    finish.resolve();
    await pending;
    await until(() => runtime.workers[0].terminated);
    assertEquals(await owner.step(2), 4);
    await owner.dispose();
    const terminal = persistentParallel({
      ...simple(),
      createWorker: runtime.createWorker,
      idleTimeoutMs: 5,
    });
    await terminal.ready();
    await until(() => runtime.workers.at(-1)!.terminated);
    await errorCode(() => terminal.step(1), "WRK_CLOSED");
    await terminal.dispose();
  });
  it("terminate aborts remote work, never reopens and does not arm an idle timer", async () => {
    const remote = new ManualWorker();
    const owner = persistentParallel({
      ...simple(),
      createWorker: () => remote,
      reopenOnUse: true,
      idleTimeoutMs: 10000,
    });
    const failed = errorCode(() => owner.step(1), "WRK_BATCH");
    await until(() => remote.sent.length === 1);
    remote.ready();
    const closing = owner.close();
    await owner.terminate();
    await failed;
    await closing;
    assert(remote.terminated);
    await errorCode(() => owner.step(1), "WRK_CLOSED");
    await owner.terminate();
    await owner.dispose();
    await persistentParallel({ ...simple() }).terminate();
  });
  it("reentrant getters cannot close or exceed capacity during payload snapshotting", async () => {
    const runtime = local(definition);
    let close: Promise<void> | undefined;
    const body = worker((_value: object) => 1, { module: "file:///object.ts" });
    const localBody = local(body);
    const owner = persistentParallel({
      workers: { a: { worker: body, count: 1 } },
      createWorker: localBody.createWorker,
      split: ({ a }) =>
        [a.job({
          get value() {
            close = owner.close();
            return 1;
          },
        })] as const,
      join: ([n]) => n,
    });
    await errorCode(() => owner.step(), "WRK_CLOSED");
    await close;
    assertEquals(localBody.workers.length, 0);
    const entered = deferred();
    const release = deferred();
    let reentrant: Promise<unknown> | undefined;
    const other = persistentParallel({
      workers: {
        a: {
          worker: body.use(plugin().onFinally(() => release.promise)),
          count: 1,
        },
      },
      maxPending: 1,
      createWorker: localBody.createWorker,
      split: ({ a }, recurse: boolean) =>
        [a.job(
          recurse
            ? {
              get value() {
                reentrant = other.step(false).catch((error) => error);
                entered.resolve();
                return 1;
              },
            }
            : {},
        )] as const,
      join: ([n]) => n,
    });
    const first = other.step(true).catch((error) => error);
    await entered.promise;
    await until(() => localBody.workers.length === 1);
    release.resolve();
    const outcomes = await Promise.all([first, reentrant]);
    assertEquals(outcomes.filter((value) => value === 1).length, 1);
    assertEquals(
      outcomes.filter((value) =>
        value instanceof WorkerError && value.code === "WRK_CAPACITY"
      ).length,
      1,
    );
    await other.dispose();
    assertEquals(runtime.workers.length, 0);
  });
});

describe("Caller setup and cleanup failures", () => {
  it("settles hostile non-Error plugin setup failures as job outcomes", async () => {
    const hooks = plugin().onFinally(() => {});
    const hostile = {
      ...hooks,
      targets() {
        throw {
          toString() {
            throw new Error("hostile");
          },
        };
      },
    };
    const output = parallel({
      ...simple(),
      workers: { a: { worker: definition.use(hostile), count: 1 } },
      mode: "collect",
      join: (values) => values,
    });
    const [outcome] = await output(1);
    assertEquals(outcome.status, "rejected");
    if (outcome.status === "rejected") {
      assertEquals(outcome.error.message, "Caller job setup failed.");
    }
  });
  it("surfaces explicit and idle cleanup errors and prevents reopening failed cleanup", async () => {
    for (const idleTimeoutMs of [undefined, 5]) {
      const runtime = local(definition);
      const owner = persistentParallel({
        ...simple(),
        reopenOnUse: true,
        idleTimeoutMs,
        createWorker: async (entry, slot) => {
          const remote = await runtime.createWorker(entry, slot);
          remote.terminate = () => {
            throw new Error("failed stop");
          };
          return remote;
        },
      });
      await owner.step(1);
      if (idleTimeoutMs === undefined) {
        await errorCode(() => owner.close(), "WRK_CRASH");
      } else await new Promise((resolve) => setTimeout(resolve, 20));
      await errorCode(() => owner.step(1), "WRK_CRASH");
      await errorCode(() => owner.dispose(), "WRK_CRASH");
    }
  });
  it("ordinary transport cleanup uses native finalizer aggregation", async () => {
    const runtime = local(definition);
    const output = parallel({
      ...simple(),
      createWorker: async (entry, slot) => {
        const remote = await runtime.createWorker(entry, slot);
        remote.terminate = () => {
          throw new Error("stop");
        };
        return remote;
      },
    });
    await errorCode(() => output(1), "RT_000");
  });
});
