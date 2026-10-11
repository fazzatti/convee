import type {
  WorkerPluginFactories,
  WorkerRegistry,
  WorkerTaskFactories,
} from "@/workers/types.ts";
import { WorkerError } from "@/workers/error.ts";

/**
 * Register worker-local task and plugin factories without executing them.
 *
 * Export the returned registry as the default export of the worker module. The
 * host invokes factories while assembling tasks and recipes inside each worker;
 * the parent sends names and cloneable configuration instead of live functions.
 *
 * @typeParam Tasks - Named factories for functions, steps or pipelines.
 *
 * @typeParam Plugins - Named factories accepting optional plugin configuration.
 * @param definition - Task factory map and optional plugin factory map. Own enumerable
 * entries are copied; names must be nonempty and values must be functions.
 * @returns A frozen registry with frozen, null-prototype factory maps, preserving types.
 * @throws WorkerError with `WRK_CONFIG` for invalid maps, empty names or non-functions.
 * Native errors from a missing definition or throwing property accessors propagate.
 */
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
