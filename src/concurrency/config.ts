import { ConcurrencyError } from "@/concurrency/error.ts";
import type { ConcurrentTasks } from "@/concurrency/types.ts";
import { step } from "@/step/factory.ts";
import type { RunContext } from "@/context/types.ts";

export interface Executable {
  runWith(
    options: { context: { parent: RunContext } },
    ...args: unknown[]
  ): unknown;
}
export interface TaskSetup {
  name: string;
  concurrency: number;
  executable: Executable;
}
export interface Setup {
  tasks: readonly TaskSetup[];
  concurrency: number;
  maxPending: number;
}

export function positive(
  value: unknown,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) || (value as number) <= 0 ||
    (value as number) > maximum
  ) {
    throw new ConcurrencyError(
      "CNC_CONFIG",
      `${label} must be a positive integer at most ${maximum}.`,
    );
  }
  return value as number;
}

export function timeout(value: unknown): number | undefined {
  return value === undefined
    ? undefined
    : positive(value, "timeoutMs", 2_147_483_647);
}

export function configure(options: {
  tasks: ConcurrentTasks;
  concurrency?: number;
  maxPending?: number;
  timeoutMs?: number;
  mode?: string;
  split: unknown;
  join: unknown;
}): Setup {
  if (
    !options || typeof options.split !== "function" ||
    typeof options.join !== "function" ||
    !options.tasks || typeof options.tasks !== "object" ||
    Array.isArray(options.tasks) ||
    (options.mode !== undefined && options.mode !== "all" &&
      options.mode !== "collect")
  ) {
    throw new ConcurrencyError(
      "CNC_CONFIG",
      "Expected named tasks, split, join and an all/collect mode.",
    );
  }
  const concurrency = positive(
    options.concurrency === undefined ? 8 : options.concurrency,
    "concurrency",
  );
  const maxPending = positive(
    options.maxPending === undefined ? 1024 : options.maxPending,
    "maxPending",
  );
  timeout(options.timeoutMs);
  const tasks = Object.entries(options.tasks).map(([name, value]) => {
    const fn = typeof value === "function" ? value : value?.run;
    if (typeof fn !== "function") {
      throw new ConcurrencyError(
        "CNC_CONFIG",
        `Task ${name} requires a callable.`,
      );
    }
    const limit = typeof value === "function"
      ? concurrency
      : value.concurrency === undefined
      ? concurrency
      : value.concurrency;
    const native = typeof Reflect.get(fn, "id") === "string" &&
      typeof Reflect.get(fn, "isSync") === "boolean" &&
      typeof Reflect.get(fn, "runWith") === "function";
    return {
      name,
      concurrency: positive(limit, `tasks.${name}.concurrency`),
      executable: native
        ? fn as unknown as Executable
        : step(fn, { id: `@concurrent/${name}` }),
    };
  });
  return { tasks, concurrency, maxPending };
}
