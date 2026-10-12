import { assert, assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { type GroupSetup, setup } from "@/workers/config.ts";
import { Generation, Group } from "@/workers/pool.ts";
import { PROTOCOL } from "@/workers/protocol.ts";
import { type CreateWorker, worker, WorkerError } from "@convee/workers";
import { deferred, ManualWorker, until } from "@test/workers/transport.ts";
const definition = worker((n: number) => n, { module: import.meta.url });
function options(createWorker: CreateWorker, group: Partial<GroupSetup> = {}) {
  return setup({
    workers: { a: { worker: definition, count: 1, ...group } },
    createWorker,
    split: () => [],
    join: () => 0,
  });
}
const job = (id = "job") => ({ id, group: "a", path: [2, 0], args: [3] });
function manual(group: Partial<GroupSetup> = {}) {
  const workers: ManualWorker[] = [];
  const config = options(() => {
    const worker = new ManualWorker();
    workers.push(worker);
    return worker;
  }, group);
  return { workers, group: new Group(config.groups[0], config.createWorker) };
}
async function rejection(
  promise: Promise<unknown>,
  code: string,
): Promise<WorkerError> {
  const error = await assertRejects(() => promise, WorkerError);
  assertEquals(error.code, code);
  return error;
}
describe("Independent group scheduling and bounded recovery", () => {
  it("warms every instance, queues jobs and dispatches as soon as one slot is ready", async () => {
    const { workers, group } = manual({ count: 2 });
    const ready = group.ready();
    const a = group.run(job("a"), [1]);
    const b = group.run(job("b"), [2]);
    await until(() => workers.length === 2);
    workers[0].ready();
    assertEquals(workers[0].sent.at(-1)!.args, [1]);
    workers[0].result(10);
    workers[0].result(20);
    assertEquals(await Promise.all([a, b]), [10, 20]);
    workers[1].ready();
    await ready;
    await group.ready();
    await group.close();
    assert(workers.every((worker) => worker.terminated));
  });
  it("task and output-clone failures preserve job diagnostics and reusable capacity", async () => {
    const { workers, group } = manual();
    for (const code of ["DOMAIN_EMPTY", "WRK_CLONE"]) {
      const pending = group.run(job(), [1]);
      const failed = rejection(
        pending,
        code === "WRK_CLONE" ? "WRK_CLONE" : "WRK_TASK",
      );
      await until(() => workers.length === 1);
      if (workers[0].sent.length === 1) workers[0].ready();
      workers[0].reply({
        protocol: PROTOCOL,
        kind: "result",
        id: "job",
        ok: false,
        error: {
          name: "E",
          message: "empty",
          code,
          domain: "document",
          source: "app",
          meta: { reason: 1 },
        },
      });
      const error = await failed;
      assertEquals(error.meta?.path, [2, 0]);
      assertEquals(error.meta?.group, "a");
      assertEquals(error.meta?.remote?.code, code);
    }
    await group.close();
  });
  it("initial startup errors fail the group without retrying broken initialization", async () => {
    for (const kind of ["throw", "error", "fatal", "timeout"]) {
      const workers: ManualWorker[] = [];
      const config = options(() => {
        if (kind === "throw") throw new Error("factory");
        const worker = new ManualWorker();
        workers.push(worker);
        return worker;
      }, { startupTimeoutMs: 8 });
      const group = new Group(config.groups[0], config.createWorker);
      const pending = rejection(group.run(job(), []), "WRK_STARTUP");
      if (kind !== "throw") {
        await until(() => workers.length === 1);
        if (kind === "error") workers[0].crash();
        if (kind === "fatal") {
          workers[0].reply({
            protocol: PROTOCOL,
            kind: "fatal",
            error: { name: "Error", message: "init failed" },
          });
        }
      }
      const error = await pending;
      assertEquals(error.meta?.jobId, undefined);
      assertEquals(workers.length, kind === "throw" ? 0 : 1);
      await rejection(
        Promise.resolve().then(() => group.run(job(), [])),
        "WRK_UNAVAILABLE",
      );
      await group.close();
    }
  });
  it("a crash fails only the active job, awaits termination and replaces for later work", async () => {
    const workers: ManualWorker[] = [];
    const terminated = deferred();
    const config = options(() => {
      const remote = new ManualWorker();
      workers.push(remote);
      if (workers.length === 1) {
        remote.terminate = async () => {
          remote.terminated = true;
          await terminated.promise;
        };
      }
      return remote;
    });
    const group = new Group(config.groups[0], config.createWorker);
    const first = rejection(group.run(job("first"), []), "WRK_CRASH");
    const second = group.run(job("second"), []);
    await until(() => workers.length === 1);
    workers[0].ready();
    workers[0].crash();
    await first;
    assertEquals(workers.length, 1);
    terminated.resolve();
    await until(() => workers.length === 2);
    workers[1].ready();
    assertEquals(workers[1].sent.at(-1)!.id, "second");
    workers[1].result(2);
    assertEquals(await second, 2);
    await group.close();
  });
  it("execution timeout never replays the timed out job", async () => {
    const { workers, group } = manual({ timeoutMs: 8 });
    const first = rejection(group.run(job("first"), []), "WRK_TIMEOUT");
    const second = group.run(job("second"), []);
    await until(() => workers.length === 1);
    workers[0].ready();
    await first;
    await until(() => workers.length === 2);
    workers[1].ready();
    workers[1].result(9);
    assertEquals(await second, 9);
    await group.close();
  });
  it("failed replacement attempts consume a group-wide budget and settle collateral work", async () => {
    const { workers, group } = manual({ maxRestarts: 2 });
    const first = rejection(group.run(job("first"), []), "WRK_CRASH");
    const waiting = rejection(group.run(job("waiting"), []), "WRK_UNAVAILABLE");
    await until(() => workers.length === 1);
    workers[0].ready();
    workers[0].crash();
    await first;
    for (let index = 1; index <= 2; index++) {
      await until(() => workers.length > index);
      workers[index].crash();
    }
    await waiting;
    assertEquals(workers.length, 3);
    await group.close();
    assert(workers.every((worker) => worker.terminated));
  });
  it("an exhausted budget shuts down healthy instances in that group", async () => {
    const { workers, group } = manual({ count: 2, maxRestarts: 0 });
    const first = rejection(group.run(job("first"), []), "WRK_CRASH");
    const second = rejection(group.run(job("second"), []), "WRK_UNAVAILABLE");
    await until(() => workers.length === 2);
    workers.forEach((worker) => worker.ready());
    workers[0].crash();
    await first;
    await second;
    await group.close();
    assert(workers[1].terminated);
  });
  it("malformed, duplicate, uncorrelated and hostile replies cannot settle unrelated jobs", async () => {
    for (
      const kind of [
        "malformed",
        "duplicate",
        "wrong",
        "fatal",
        "getter",
        "early",
      ]
    ) {
      const { workers, group } = manual({ maxRestarts: 0 });
      const pending = rejection(
        group.run(job(), []),
        kind === "early" ? "WRK_UNAVAILABLE" : "WRK_PROTOCOL",
      );
      await until(() => workers.length === 1);
      if (kind !== "early") workers[0].ready();
      const message = kind === "malformed"
        ? null
        : kind === "duplicate"
        ? { protocol: PROTOCOL, kind: "ready" }
        : kind === "fatal"
        ? {
          protocol: PROTOCOL,
          kind: "fatal",
          error: { name: "E", message: "bad" },
        }
        : kind === "getter"
        ? {
          get protocol() {
            throw new Error("getter");
          },
        }
        : { protocol: PROTOCOL, kind: "result", id: "wrong", ok: true };
      workers[0].reply(message);
      await pending;
      await group.close();
    }
  });
  it("dispatch throws and message decoding failures stop and replace the instance", async () => {
    const { workers, group } = manual({ maxRestarts: 0 });
    const pending = rejection(group.run(job(), []), "WRK_CRASH");
    await until(() => workers.length === 1);
    workers[0].postMessage = () => {
      throw new Error("send");
    };
    workers[0].ready();
    await pending;
    await group.close();
    const other = manual({ maxRestarts: 0 });
    const failed = rejection(other.group.run(job(), []), "WRK_CRASH");
    await until(() => other.workers.length === 1);
    other.workers[0].ready();
    other.workers[0].dispatchEvent(new Event("messageerror"));
    await failed;
    await other.group.close();
  });
  it("shutdown during async construction stops the returned transport and prevents replacement", async () => {
    const created = deferred<ManualWorker>();
    const remote = new ManualWorker();
    const entered = deferred();
    const config = options(() => {
      entered.resolve();
      return created.promise;
    });
    const group = new Group(config.groups[0], config.createWorker);
    const ready = rejection(group.ready(), "WRK_CLOSED");
    await entered.promise;
    const closed = group.close();
    created.resolve(remote);
    await closed;
    await ready;
    assert(remote.terminated);
    assertEquals(remote.sent, []);
    await group.close();
    await rejection(Promise.resolve().then(() => group.ready()), "WRK_CLOSED");
  });
  it("shutdown rejects active/queued work and ignores already-queued callbacks", async () => {
    const remote = new ManualWorker();
    const callbacks = new Map<string, EventListener>();
    const original = remote.addEventListener.bind(remote);
    remote.addEventListener = ((type: string, listener: EventListener) => {
      callbacks.set(type, listener);
      original(type, listener);
    }) as typeof remote.addEventListener;
    const config = options(() => remote);
    const group = new Group(config.groups[0], config.createWorker);
    const first = rejection(group.run(job("first"), []), "WRK_UNAVAILABLE");
    const second = rejection(group.run(job("second"), []), "WRK_UNAVAILABLE");
    await until(() => remote.sent.length === 1);
    remote.ready();
    await group.close();
    await first;
    await second;
    const hostile = new Event("message");
    Object.defineProperty(hostile, "data", {
      get() {
        throw new Error("late");
      },
    });
    callbacks.get("message")!(hostile);
    callbacks.get("error")!(new Event("error"));
    assert(remote.terminated);
  });
  it("cleanup attempts every transport and retains failures instead of hanging", async () => {
    const workers: ManualWorker[] = [];
    const config = options(() => {
      const remote = new ManualWorker();
      workers.push(remote);
      remote.removeEventListener = () => {
        throw new Error("detach");
      };
      remote.terminate = () => {
        remote.terminated = true;
        throw new Error("terminate");
      };
      return remote;
    }, { count: 2 });
    const group = new Group(config.groups[0], config.createWorker);
    const ready = group.ready();
    await until(() => workers.length === 2);
    workers.forEach((worker) => worker.ready());
    await ready;
    await rejection(group.close(), "WRK_CRASH");
    assert(workers.every((worker) => worker.terminated));
  });
});
describe("Generation admission", () => {
  it("counts complete batches across callers and releases individual slots", async () => {
    const generation = new Generation({
      ...options(() => new ManualWorker()),
      maxPending: 2,
    });
    generation.reserve([job()]);
    await rejection(
      Promise.resolve().then(() => generation.reserve([job(), job()])),
      "WRK_CAPACITY",
    );
    generation.reserve([job()]);
    generation.release();
    generation.reserve([job()]);
    generation.stopAdmission();
    await rejection(
      Promise.resolve().then(() => generation.reserve([])),
      "WRK_CLOSED",
    );
    await generation.close();
  });
});

describe("Scheduler cleanup races", () => {
  it("handles synchronous replies without recursive dispatch", async () => {
    const remote = new ManualWorker();
    const send = remote.postMessage.bind(remote);
    remote.postMessage = (value) => {
      send(value);
      if (remote.sent.at(-1)!.kind === "run") remote.result(3);
    };
    const config = options(() => remote);
    const group = new Group(config.groups[0], config.createWorker);
    const results = [group.run(job("a"), []), group.run(job("b"), [])];
    await until(() => remote.sent.length === 1);
    remote.ready();
    assertEquals(await Promise.all(results), [3, 3]);
    await group.close();
  });
  it("ignores a dispatch throw after reentrant shutdown already settled the job", async () => {
    const remote = new ManualWorker();
    const config = options(() => remote);
    const group = new Group(config.groups[0], config.createWorker);
    const failure = rejection(group.run(job(), []), "WRK_UNAVAILABLE");
    await until(() => remote.sent.length === 1);
    let closed!: Promise<void>;
    remote.postMessage = () => {
      closed = group.close();
      throw new Error("late");
    };
    remote.ready();
    await failure;
    await closed;
    assert(remote.terminated);
  });
  it("failed cleanup prevents replacement and settles waiting jobs", async () => {
    const remote = new ManualWorker();
    remote.terminate = () => {
      throw new Error("stop failed");
    };
    const config = options(() => remote);
    const group = new Group(config.groups[0], config.createWorker);
    const failed = rejection(group.run(job(), []), "WRK_CRASH");
    const queued = rejection(group.run(job("next"), []), "WRK_UNAVAILABLE");
    await until(() => remote.sent.length === 1);
    remote.ready();
    remote.crash();
    await failed;
    await queued;
    await rejection(group.close(), "WRK_CRASH");
  });
  it("cleanup failure after terminal stop does not launch replacement", async () => {
    const remote = new ManualWorker();
    const stop = deferred();
    remote.terminate = () => stop.promise;
    const config = options(() => remote);
    const group = new Group(config.groups[0], config.createWorker);
    const failed = rejection(group.run(job(), []), "WRK_CRASH");
    await until(() => remote.sent.length === 1);
    remote.ready();
    remote.crash();
    await failed;
    const closed = rejection(group.close(), "WRK_CRASH");
    stop.reject(new Error("late stop"));
    await closed;
  });
  it("generation cleanup aggregates group errors after attempting every worker", async () => {
    const remotes: ManualWorker[] = [];
    const config = options(() => {
      const remote = new ManualWorker();
      remote.terminate = () => {
        remote.terminated = true;
        throw new Error("stop");
      };
      remotes.push(remote);
      return remote;
    });
    config.groups.push({ ...config.groups[0], name: "b" });
    const generation = new Generation(config);
    const ready = generation.ready();
    await until(() => remotes.length === 2);
    remotes.forEach((remote) => remote.ready());
    await ready;
    await rejection(generation.close(), "WRK_CRASH");
    assert(remotes.every((remote) => remote.terminated));
  });
});

describe("Bounded custom construction", () => {
  it("does not construct after synchronous shutdown cancels an unstarted slot", async () => {
    let calls = 0;
    const config = options(() => {
      calls++;
      return new ManualWorker();
    });
    const group = new Group(config.groups[0], config.createWorker);
    const ready = rejection(group.ready(), "WRK_CLOSED");
    await group.close();
    await ready;
    assertEquals(calls, 0);
  });
  it("aborts the factory signal and terminates a transport returned after its deadline", async () => {
    let finish!: (remote: ManualWorker) => void;
    let signal!: AbortSignal;
    const config = options((_entry, slot) => {
      signal = slot.signal;
      return new Promise<ManualWorker>((resolve) => {
        finish = resolve;
      });
    }, { startupTimeoutMs: 5 });
    const group = new Group(config.groups[0], config.createWorker);
    await rejection(group.ready(), "WRK_STARTUP");
    await rejection(group.close(), "WRK_CRASH");
    assert(signal.aborted);
    const remote = new ManualWorker();
    finish(remote);
    await until(() => remote.terminated);
    assertEquals(remote.sent, []);
  });
  it("reports unconfirmed cleanup instead of hanging behind a constructor that never resolves", async () => {
    const config = options(() => new Promise(() => {}), {
      startupTimeoutMs: 5,
    });
    const group = new Group(config.groups[0], config.createWorker);
    await rejection(group.ready(), "WRK_STARTUP");
    let timer: ReturnType<typeof setTimeout>;
    const observed = await Promise.race([
      group.close().then(() => "unexpected success", (error: unknown) => error),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("hung"), 40);
      }),
    ]);
    clearTimeout(timer!);
    assert(
      observed instanceof WorkerError,
      "cleanup must settle with an explicit failure before the test deadline",
    );
  });
});
