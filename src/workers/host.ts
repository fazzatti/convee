import { assemble } from "@/workers/assemble.ts";
import { remoteError, WorkerError } from "@/workers/error.ts";
import {
  contextValid,
  type InitMessage,
  messageRecord,
  PROTOCOL,
  type Reply,
  type RunMessage,
} from "@/workers/protocol.ts";
import { workerRegistry } from "@/workers/registry.ts";
import type { WorkerRegistry } from "@/workers/types.ts";

/** Worker-side message handling, separated from the runtime-specific module loader. */
export function workerHost(
  send: (reply: Reply) => void,
  load: (url: string) => Promise<WorkerRegistry>,
): { receive(value: unknown): Promise<void> } {
  let state: "empty" | "loading" | "ready" | "busy" | "failed" = "empty";
  let tasks: ReturnType<typeof assemble> = new Map();
  async function initialize(value: InitMessage): Promise<void> {
    if (state !== "empty" || typeof value.module !== "string") {
      throw new WorkerError(
        "WRK_PROTOCOL",
        "Unexpected initialization message.",
      );
    }
    state = "loading";
    const registry = workerRegistry(await load(value.module));
    // A concurrent invalid message may have failed initialization while loading.
    if ((state as string) === "failed") return;
    tasks = assemble(registry, value.pipelines, value.role);
    state = "ready";
    send({ protocol: PROTOCOL, kind: "ready", tasks: [...tasks.keys()] });
  }
  async function run(value: RunMessage): Promise<void> {
    if (
      state !== "ready" || typeof value.id !== "string" ||
      typeof value.task !== "string" || !Array.isArray(value.args) ||
      !contextValid(value.context)
    ) {
      throw new WorkerError(
        "WRK_PROTOCOL",
        "Unexpected or malformed job message.",
      );
    }
    state = "busy";
    let reply: Reply;
    try {
      const task = tasks.get(value.task);
      if (!task) {
        throw new WorkerError("WRK_CONFIG", "Unknown worker task.", {
          task: value.task,
        });
      }
      const output = await task.runWith({
        context: {
          ...value.context,
          capture: value.context?.capture ?? "none",
        },
      }, ...value.args);
      reply = {
        protocol: PROTOCOL,
        kind: "result",
        id: value.id,
        ok: true,
        value: output,
      };
    } catch (error) {
      reply = {
        protocol: PROTOCOL,
        kind: "result",
        id: value.id,
        ok: false,
        error: remoteError(error),
      };
    }
    if ((state as string) === "failed") return;
    state = "ready";
    try {
      send(reply);
    } catch (cause) {
      send({
        protocol: PROTOCOL,
        kind: "result",
        id: value.id,
        ok: false,
        error: remoteError(
          new WorkerError(
            "WRK_CLONE",
            "Worker result could not be cloned.",
            {},
            cause,
          ),
        ),
      });
    }
  }
  return {
    async receive(value: unknown): Promise<void> {
      if (state === "failed") return;
      try {
        if (
          !messageRecord(value) || value.protocol !== PROTOCOL
        ) throw new WorkerError("WRK_PROTOCOL", "Invalid worker protocol.");
        if (value.kind === "init") {
          await initialize(
            value as unknown as InitMessage,
          );
        } else if (value.kind === "run") {
          await run(
            value as unknown as RunMessage,
          );
        } else {throw new WorkerError(
            "WRK_PROTOCOL",
            "Unknown worker message.",
          );}
      } catch (error) {
        state = "failed";
        tasks.clear();
        send({ protocol: PROTOCOL, kind: "fatal", error: remoteError(error) });
      }
    },
  };
}
