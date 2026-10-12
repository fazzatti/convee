import { WorkerError } from "@/workers/error.ts";
import type {
  CreateWorker,
  WorkerSlot,
  WorkerTransport,
} from "@/workers/types.ts";

export interface NodeEndpoint {
  on(type: string, listener: (...args: unknown[]) => void): unknown;
  off(type: string, listener: (...args: unknown[]) => void): unknown;
  postMessage(message: unknown): void;
}
export interface NodeWorker extends NodeEndpoint {
  terminate(): Promise<unknown>;
}
export interface NodeRuntime {
  Worker: new (entry: URL, options: { name: string }) => NodeWorker;
  parentPort: NodeEndpoint | null;
}
export type LoadNode = () => Promise<NodeRuntime>;
export function usesNode(scope: typeof globalThis): boolean {
  const process =
    (scope as unknown as { process?: { versions?: { node?: unknown } } })
      .process;
  return !("Deno" in scope) && typeof process?.versions?.node === "string";
}
/** Adapt EventEmitter notifications and asynchronous termination to the shared contract. */
export function nodeTransport(worker: NodeWorker): WorkerTransport {
  const target = new EventTarget();
  const message = (data: unknown): void => {
    target.dispatchEvent(new MessageEvent("message", { data }));
  };
  const failure = (error: unknown): void => {
    const event = new Event("error", { cancelable: true });
    Object.defineProperty(event, "error", { value: error });
    target.dispatchEvent(event);
  };
  const exit = (code: unknown): void => {
    failure(new Error(`Worker exited unexpectedly (${code}).`));
  };
  const listeners: [string, (...args: unknown[]) => void][] = [
    ["message", message],
    ["error", failure],
    ["messageerror", failure],
    ["exit", exit],
  ];
  for (const [type, listener] of listeners) worker.on(type, listener);
  return Object.assign(target, {
    postMessage(message: unknown): void {
      worker.postMessage(message);
    },
    async terminate(): Promise<void> {
      // Suppress an intentional exit while retaining error handling until exit.
      worker.off("exit", exit);
      try {
        await worker.terminate();
      } finally {
        for (const [type, listener] of listeners) worker.off(type, listener);
      }
    },
  });
}
export async function constructWorker(
  entry: URL,
  slot: WorkerSlot,
  scope: typeof globalThis,
  loadNode: LoadNode,
): Promise<WorkerTransport> {
  slot.signal.throwIfAborted();
  if (usesNode(scope)) {
    const node = await loadNode();
    slot.signal.throwIfAborted();
    return nodeTransport(new node.Worker(entry, { name: slot.id }));
  }
  if (typeof scope.Worker !== "function") {
    throw new WorkerError(
      "WRK_CONFIG",
      "This runtime does not support dedicated module workers.",
    );
  }
  return new scope.Worker(entry.href, { type: "module", name: slot.id });
}
export const loadNode: LoadNode = async () =>
  await import("node:worker_threads") as unknown as NodeRuntime;
export const defaultWorker: CreateWorker = (entry, slot) =>
  constructWorker(entry, slot, globalThis, loadNode);
