import { WorkerError } from "@/workers/error.ts";
import { type DefinitionData, definitionData } from "@/workers/definition.ts";
import { defaultWorker } from "@/workers/transport.ts";
import type { CreateWorker } from "@/workers/types.ts";

export interface GroupSetup extends DefinitionData {
  name: string;
  module: string;
  count: number;
  timeoutMs: number;
  startupTimeoutMs: number;
  maxRestarts: number;
}
export interface Setup {
  groups: GroupSetup[];
  maxPending: number;
  createWorker: CreateWorker;
  reopenOnUse: boolean;
  idleTimeoutMs?: number;
}
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkerError("WRK_CONFIG", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
export function positive(
  value: unknown,
  fallback: number,
  label: string,
  min = 1,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" || !Number.isSafeInteger(result) ||
    result < min || result > 2_147_483_647
  ) {
    throw new WorkerError(
      "WRK_CONFIG",
      `${label} must be an integer between ${min} and 2147483647.`,
    );
  }
  return result;
}
export function clone<Value>(value: Value): Value {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw new WorkerError(
      "WRK_CLONE",
      "Worker payloads must support structured cloning.",
      {},
      cause,
    );
  }
}
export function setup(value: unknown): Setup {
  const input = record(value, "parallel options");
  if (
    typeof input.split !== "function" || typeof input.join !== "function" ||
    (input.mode !== undefined && input.mode !== "all" &&
      input.mode !== "collect") ||
    (input.createWorker !== undefined &&
      typeof input.createWorker !== "function") ||
    (input.reopenOnUse !== undefined && typeof input.reopenOnUse !== "boolean")
  ) {
    throw new WorkerError(
      "WRK_CONFIG",
      "Invalid parallel callbacks, mode or lifetime options.",
    );
  }
  const groups = Object.entries(record(input.workers, "workers")).map(
    ([name, value]): GroupSetup => {
      if (!name.trim()) {
        throw new WorkerError(
          "WRK_CONFIG",
          "A worker group needs a nonempty name.",
        );
      }
      const group = record(value, "worker group");
      const data = definitionData(group.worker);
      const module = Reflect.get(group.worker as object, "module");
      if (typeof module !== "string") {
        throw new WorkerError("WRK_CONFIG", "Invalid worker module.");
      }
      return {
        ...data,
        plugins: [...data.plugins],
        name,
        module,
        count: positive(group.count, 0, "count"),
        timeoutMs: positive(group.timeoutMs, 30000, "timeoutMs"),
        startupTimeoutMs: positive(
          group.startupTimeoutMs,
          10000,
          "startupTimeoutMs",
        ),
        maxRestarts: positive(group.maxRestarts, 2, "maxRestarts", 0),
      };
    },
  );
  if (!groups.length) {
    throw new WorkerError(
      "WRK_CONFIG",
      "At least one worker group is required.",
    );
  }
  return {
    groups,
    maxPending: positive(input.maxPending, 1024, "maxPending"),
    createWorker: input.createWorker as CreateWorker ?? defaultWorker,
    reopenOnUse: input.reopenOnUse === true,
    idleTimeoutMs: input.idleTimeoutMs === undefined
      ? undefined
      : positive(input.idleTimeoutMs, 0, "idleTimeoutMs"),
  };
}
