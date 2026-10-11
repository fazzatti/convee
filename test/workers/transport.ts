import { workerHost } from "@/workers/host.ts";
import { PROTOCOL } from "@/workers/protocol.ts";
import type {
  CreateWorker,
  WorkerDefinition,
  WorkerTransport,
} from "@convee/workers";

/** Cloning in-memory transport; actual runtime isolation is tested independently. */
export class LocalWorker extends EventTarget implements WorkerTransport {
  terminated = false;
  readonly sent: unknown[] = [];
  readonly host: ReturnType<typeof workerHost>;
  constructor(definition: unknown) {
    super();
    this.host = workerHost((reply) => {
      const snapshot = structuredClone(reply);
      queueMicrotask(() => {
        if (!this.terminated) {
          this.dispatchEvent(new MessageEvent("message", { data: snapshot }));
        }
      });
    }, () => Promise.resolve(definition));
  }
  postMessage(message: unknown): void {
    const snapshot = structuredClone(message);
    this.sent.push(snapshot);
    queueMicrotask(() => {
      if (!this.terminated) void this.host.receive(snapshot);
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}
export function local(...definitions: WorkerDefinition[]) {
  const workers: LocalWorker[] = [];
  const createWorker: CreateWorker = (_entry, slot) => {
    const worker = new LocalWorker(
      definitions.find((definition) => definition.module === slot.module),
    );
    workers.push(worker);
    return worker;
  };
  return { workers, createWorker };
}
/** Manually controlled replies for deterministic scheduler interleavings. */
export class ManualWorker extends EventTarget implements WorkerTransport {
  terminated = false;
  readonly sent: Record<string, unknown>[] = [];
  postMessage(message: unknown): void {
    this.sent.push(structuredClone(message) as Record<string, unknown>);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }
  ready(): void {
    this.reply({ protocol: PROTOCOL, kind: "ready" });
  }
  result(value: unknown): void {
    this.reply({
      protocol: PROTOCOL,
      kind: "result",
      id: this.sent.at(-1)!.id,
      ok: true,
      value,
    });
  }
  crash(): void {
    this.dispatchEvent(new Event("error", { cancelable: true }));
  }
}
export async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Expected worker transition did not occur.");
}
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
