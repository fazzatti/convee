import type { RecipeSpec, RoleSpec } from "@/workers/config.ts";
import type { RemoteWorkerError } from "@/workers/error.ts";
import type { WorkerContext } from "@/workers/types.ts";

export const PROTOCOL = "convee.worker/1";
export interface InitMessage {
  protocol: typeof PROTOCOL;
  kind: "init";
  module: string;
  pipelines: Record<string, RecipeSpec>;
  role: RoleSpec;
}
export interface RunMessage {
  protocol: typeof PROTOCOL;
  kind: "run";
  id: string;
  task: string;
  args: unknown[];
  context?: WorkerContext;
}
export type Request = InitMessage | RunMessage;
export type Reply =
  | { protocol: typeof PROTOCOL; kind: "ready"; tasks: string[] }
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
    (value.stack === undefined || typeof value.stack === "string") &&
    (value.code === undefined || typeof value.code === "string");
}
export function isReply(value: unknown): value is Reply {
  if (!messageRecord(value) || value.protocol !== PROTOCOL) return false;
  if (value.kind === "ready") {
    return Array.isArray(value.tasks) && value.tasks.every((task) =>
      typeof task === "string"
    ) && new Set(value.tasks).size === value.tasks.length;
  }
  if (value.kind === "fatal") return errorValid(value.error);
  if (value.kind !== "result" || typeof value.id !== "string") return false;
  return value.ok === true || (value.ok === false && errorValid(value.error));
}
