import { assert, assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { bootstrap } from "@/workers/bootstrap.ts";
import {
  constructWorker,
  loadNode,
  type NodeEndpoint,
  type NodeRuntime,
  nodeTransport,
  usesNode,
} from "@/workers/transport.ts";
import { PROTOCOL } from "@/workers/protocol.ts";
import { worker, WorkerError, type WorkerSlot } from "@convee/workers";
import { deferred, until } from "@test/workers/transport.ts";
class Endpoint implements NodeEndpoint {
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly sent: unknown[] = [];
  on(type: string, listener: (...args: unknown[]) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  off(type: string, listener: (...args: unknown[]) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(value: unknown): void {
    this.sent.push(value);
  }
  emit(type: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(type) ?? []) listener(...args);
  }
  terminate(): Promise<void> {
    return Promise.resolve();
  }
}
const slot: WorkerSlot = {
  id: "test",
  group: "a",
  index: 0,
  restart: 0,
  module: import.meta.url,
  signal: new AbortController().signal,
};
describe("Runtime adapter contracts", () => {
  it("honors cancellation before construction and across the asynchronous Node loader", async () => {
    const abort = new AbortController();
    const cancelled = { ...slot, signal: abort.signal };
    const scope = { process: { versions: { node: "test" } } } as never;
    const failure = new Error("cancelled");
    let constructed = 0;
    const runtime: NodeRuntime = {
      Worker: class extends Endpoint {
        constructor() {
          super();
          constructed++;
        }
      },
      parentPort: null,
    };
    await assertRejects(
      () =>
        constructWorker(new URL(import.meta.url), cancelled, scope, () => {
          abort.abort(failure);
          return Promise.resolve(runtime);
        }),
      Error,
      "cancelled",
    );
    await assertRejects(
      () =>
        constructWorker(
          new URL(import.meta.url),
          cancelled,
          scope,
          () => Promise.resolve(runtime),
        ),
      Error,
      "cancelled",
    );
    assertEquals(constructed, 0);
  });
  it("selects Node/Bun threads, web module workers and explicit unsupported-host failures", async () => {
    assertEquals(usesNode(globalThis), false);
    assertEquals(
      usesNode({ process: { versions: { node: "test" } } } as never),
      true,
    );
    assertEquals(usesNode({} as never), false);
    const node: NodeRuntime = { Worker: Endpoint, parentPort: null };
    const transport = await constructWorker(
      new URL(import.meta.url),
      slot,
      { process: { versions: { node: "test" } } } as never,
      () => Promise.resolve(node),
    );
    transport.postMessage(1);
    await transport.terminate();
    let args: unknown[] = [];
    class Web extends EventTarget {
      constructor(...input: unknown[]) {
        super();
        args = input;
      }
      postMessage() {}
      terminate() {}
    }
    await constructWorker(
      new URL(import.meta.url),
      slot,
      { Worker: Web } as never,
      () => Promise.resolve(node),
    );
    assertEquals(args, [import.meta.url, { type: "module", name: "test" }]);
    await assertRejects(
      () =>
        constructWorker(
          new URL(import.meta.url),
          slot,
          {} as never,
          () => Promise.resolve(node),
        ),
      WorkerError,
      "does not support",
    );
    assert(typeof (await loadNode()).Worker === "function");
  });
  it("maps EventEmitter messages, crashes and clean unexpected exits and awaits asynchronous termination", async () => {
    const endpoint = new Endpoint();
    const finish = deferred();
    endpoint.terminate = () => finish.promise;
    const transport = nodeTransport(endpoint);
    const messages: unknown[] = [], failures: unknown[] = [];
    transport.addEventListener(
      "message",
      (event) => messages.push((event as MessageEvent).data),
    );
    transport.addEventListener(
      "error",
      (event) => failures.push(Reflect.get(event, "error")),
    );
    endpoint.emit("message", { result: 1 });
    endpoint.emit("error", new Error("crash"));
    endpoint.emit("messageerror", new Error("decode"));
    endpoint.emit("exit", 0);
    assertEquals(messages, [{ result: 1 }]);
    assertEquals(failures.length, 3);
    const closing = transport.terminate();
    endpoint.emit("exit", 0);
    assertEquals(failures.length, 3);
    finish.resolve();
    await closing;
    assert([...endpoint.listeners.values()].every((set) => set.size === 0));
    const broken = new Endpoint();
    broken.terminate = () => Promise.reject(new Error("cleanup"));
    await assertRejects(
      () => Promise.resolve(nodeTransport(broken).terminate()),
      Error,
      "cleanup",
    );
    assert([...broken.listeners.values()].every((set) => set.size === 0));
  });
  it("connects worker bootstrap to parentPort and rejects accidental main-thread startup", async () => {
    const port = new Endpoint();
    const node: NodeRuntime = { Worker: Endpoint, parentPort: port };
    const definition = worker((n: number) => n + 1, {
      module: import.meta.url,
    });
    await bootstrap(
      () => Promise.resolve(definition),
      { process: { versions: { node: "test" } } } as never,
      () => Promise.resolve(node),
    );
    port.emit("message", {
      protocol: PROTOCOL,
      kind: "init",
      module: import.meta.url,
    });
    await until(() => port.sent.length === 1);
    assertEquals(port.sent[0], { protocol: PROTOCOL, kind: "ready" });
    port.emit("message", {
      protocol: PROTOCOL,
      kind: "run",
      id: "job",
      args: [2],
    });
    await until(() => port.sent.length === 2);
    assertEquals(port.sent[1], {
      protocol: PROTOCOL,
      kind: "result",
      id: "job",
      ok: true,
      value: 3,
    });
    await assertRejects(
      () =>
        bootstrap(
          () => Promise.resolve(definition),
          { process: { versions: { node: "test" } } } as never,
          () => Promise.resolve({ ...node, parentPort: null }),
        ),
      WorkerError,
      "must run in a worker",
    );
  });
  it("connects web-worker message events to a runtime-neutral host", async () => {
    const replies: unknown[] = [];
    const scope = Object.assign(new EventTarget(), {
      postMessage(value: unknown) {
        replies.push(value);
      },
    });
    await bootstrap(
      () => Promise.resolve(worker(() => 1, { module: import.meta.url })),
      scope as never,
    );
    scope.dispatchEvent(
      new MessageEvent("message", {
        data: { protocol: PROTOCOL, kind: "init", module: import.meta.url },
      }),
    );
    await until(() => replies.length === 1);
    assertEquals(replies[0], { protocol: PROTOCOL, kind: "ready" });
  });
});
