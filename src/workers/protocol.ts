import type { RemoteWorkerError } from "@/workers/error.ts";
import type { WorkerContext } from "@/workers/types.ts";

export const PROTOCOL = "convee.worker/2";
export interface InitMessage {
  protocol: typeof PROTOCOL;
  kind: "init";
  module: string;
}
export interface RunMessage {
  protocol: typeof PROTOCOL;
  kind: "run";
  id: string;
  args: unknown[];
  context?: WorkerContext;
}
export type Request = InitMessage | RunMessage;
export type Reply =
  | { protocol: typeof PROTOCOL; kind: "ready" }
  | { protocol: typeof PROTOCOL; kind: "fatal"; error: RemoteWorkerError }
  | {
    protocol: typeof PROTOCOL;
    kind: "result";
    id: string;
    ok: true;
    value: unknown;
  }
  | {
    protocol: typeof PROTOCOL;
    kind: "result";
    id: string;
    ok: false;
    error: RemoteWorkerError;
  };
export function messageRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function contextValid(
  value: unknown,
): value is WorkerContext | undefined {
  if (value === undefined) return true;
  if (!messageRecord(value)) return false;
  return (value.seed === undefined || messageRecord(value.seed)) &&
    (value.capture === undefined ||
      ["none", "outputs", "all"].includes(value.capture as string));
}
function errorValid(value: unknown): value is RemoteWorkerError {
  return messageRecord(value) && typeof value.name === "string" &&
    typeof value.message === "string" &&
    ["stack", "code", "domain", "source"].every((key) =>
      value[key] === undefined || typeof value[key] === "string"
    );
}
export function isReply(value: unknown): value is Reply {
  if (!messageRecord(value) || value.protocol !== PROTOCOL) return false;
  if (value.kind === "ready") return true;
  if (value.kind === "fatal") return errorValid(value.error);
  if (value.kind !== "result" || typeof value.id !== "string") return false;
  return value.ok === true || (value.ok === false && errorValid(value.error));
}
