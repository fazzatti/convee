import { workerHost } from "@/workers/host.ts";
import { type LoadNode, loadNode, usesNode } from "@/workers/transport.ts";
import { WorkerError } from "@/workers/error.ts";

/** Connect a host to its actual runtime, keeping callable loading independent. */
export async function bootstrap(
  load: (url: string) => Promise<unknown>,
  scope = globalThis,
  node: LoadNode = loadNode,
): Promise<void> {
  if (usesNode(scope)) {
    const port = (await node()).parentPort;
    if (!port) {
      throw new WorkerError(
        "WRK_CONFIG",
        "The worker bootstrap must run in a worker thread.",
      );
    }
    const host = workerHost((reply) => port.postMessage(reply), load);
    port.on("message", (value) => {
      void host.receive(value);
    });
  } else {
    const target = scope as unknown as EventTarget & {
      postMessage(value: unknown): void;
    };
    const host = workerHost((reply) => target.postMessage(reply), load);
    target.addEventListener("message", (event) => {
      void host.receive((event as MessageEvent).data);
    });
  }
}
