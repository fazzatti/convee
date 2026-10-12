import { step } from "@/step/factory.ts";
import type { Step } from "@/step/types.ts";
import { definitionData } from "@/workers/definition.ts";
import { remoteError, WorkerError } from "@/workers/error.ts";
import {
  contextValid,
  type InitMessage,
  messageRecord,
  PROTOCOL,
  type Reply,
  type RunMessage,
} from "@/workers/protocol.ts";

/** Runtime-neutral worker-side protocol and native job lifecycle. */
export function workerHost(
  send: (reply: Reply) => void,
  load: (url: string) => Promise<unknown>,
): { receive(value: unknown): Promise<void> } {
  let state: "empty" | "loading" | "ready" | "busy" | "failed" = "empty";
  let executable: Step<unknown[], unknown>;
  async function initialize(value: InitMessage): Promise<void> {
    if (state !== "empty" || typeof value.module !== "string") {
      throw new WorkerError(
        "WRK_PROTOCOL",
        "Unexpected initialization message.",
      );
    }
    state = "loading";
    const { callable } = definitionData(await load(value.module));
    if ((state as string) === "failed") return;
    executable = step(async function (...args: unknown[]) {
      const runWith: unknown = Reflect.get(callable, "runWith");
      if (typeof runWith === "function") {
        return await Reflect.apply(runWith, callable, [{
          context: { parent: this.context() },
        }, ...args]);
      }
      return await Reflect.apply(callable, this, args);
    });
    state = "ready";
    send({ protocol: PROTOCOL, kind: "ready" });
  }
  async function run(value: RunMessage): Promise<void> {
    if (
      state !== "ready" || typeof value.id !== "string" ||
      !Array.isArray(value.args) || !contextValid(value.context)
    ) {
      throw new WorkerError(
        "WRK_PROTOCOL",
        "Unexpected or malformed job message.",
      );
    }
    state = "busy";
    let reply: Reply;
    try {
      const output = await executable.runWith({
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
        if (!messageRecord(value) || value.protocol !== PROTOCOL) {
          throw new WorkerError("WRK_PROTOCOL", "Invalid worker protocol.");
        }
        if (value.kind === "init") {
          await initialize(value as unknown as InitMessage);
        } else if (value.kind === "run") {
          await run(value as unknown as RunMessage);
        } else throw new WorkerError("WRK_PROTOCOL", "Unknown worker message.");
      } catch (error) {
        state = "failed";
        send({ protocol: PROTOCOL, kind: "fatal", error: remoteError(error) });
      }
    },
  };
}
