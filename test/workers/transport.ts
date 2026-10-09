import { workerHost } from "../../src/workers/host.ts";
import type {
  WorkerRegistry,
  WorkerTransport,
} from "../../src/workers/types.ts";

/** In-memory message transport; real workers are exercised independently. */
export class LocalWorker extends EventTarget implements WorkerTransport {
  terminated = false;
  readonly sent: unknown[] = [];
  readonly host: ReturnType<typeof workerHost>;
  constructor(registry: WorkerRegistry) {
    super();
    this.host = workerHost((reply) => {
      const snapshot = structuredClone(reply);
      queueMicrotask(() => {
        if (!this.terminated) {
          this.dispatchEvent(new MessageEvent("message", { data: snapshot }));
        }
      });
    }, () => Promise.resolve(registry));
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

/** Manually controlled replies for deterministic scheduler interleavings. */
export class ManualWorker extends EventTarget implements WorkerTransport {
  terminated = false;
  readonly sent: unknown[] = [];
  postMessage(message: unknown): void {
    this.sent.push(structuredClone(message));
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }
}
