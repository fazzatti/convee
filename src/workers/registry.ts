import type {
  WorkerPluginFactories,
  WorkerRegistry,
  WorkerTaskFactories,
} from "@/workers/types.ts";
import { WorkerError } from "@/workers/error.ts";

/** Register factories in a worker module; export the result as that module's default. */
export function workerRegistry<
  const Tasks extends WorkerTaskFactories,
  const Plugins extends WorkerPluginFactories = Record<never, never>,
>(
  definition: { tasks: Tasks; plugins?: Plugins },
): WorkerRegistry<Tasks, Plugins> {
  const tasks = factoryMap(definition.tasks);
  const plugins = factoryMap(definition.plugins ?? {});
  return Object.freeze({
    tasks: Object.freeze(tasks),
    plugins: Object.freeze(plugins),
  }) as WorkerRegistry<Tasks, Plugins>;
}

function factoryMap(
  value: unknown,
): Record<string, (...args: never[]) => unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkerError(
      "WRK_CONFIG",
      "A registry requires a map of named factories.",
    );
  }
  const result: Record<string, (...args: never[]) => unknown> = Object.create(
    null,
  );
  for (const [key, factory] of Object.entries(value)) {
    if (!key || typeof factory !== "function") {
      throw new WorkerError(
        "WRK_CONFIG",
        "Registry entries must be named functions.",
        { key },
      );
    }
    result[key] = factory as (...args: never[]) => unknown;
  }
  return result;
}
