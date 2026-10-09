import { workerHost } from "@/workers/host.ts";
import type { WorkerRegistry } from "@/workers/types.ts";

// This is the one intentional dynamic import boundary: an application-owned
// registry URL, supplied when creating the pool. It never evaluates function text.
const scope = globalThis as unknown as EventTarget & {
  postMessage(message: unknown): void;
};
const host = workerHost(
  (message) => scope.postMessage(message),
  async (url): Promise<WorkerRegistry> => (await import(url)).default,
);
scope.addEventListener("message", (event) => {
  void host.receive((event as MessageEvent<unknown>).data);
});
