import { pipe } from "@/pipe/factory.ts";
import { step } from "@/step/factory.ts";
import type { Step } from "@/step/types.ts";
import type { AnyPlugin } from "@/plugin/types.ts";
import type { WorkerCallable, WorkerRegistry } from "@/workers/types.ts";
import type { PluginSpec, RecipeSpec, RoleSpec } from "@/workers/config.ts";
import { WorkerError } from "@/workers/error.ts";

type Unit = Step<unknown[], unknown>;

function attached(
  registry: WorkerRegistry,
  refs: readonly PluginSpec[],
): AnyPlugin<unknown[], unknown>[] {
  return refs.map((ref) => {
    if (!Object.hasOwn(registry.plugins, ref.name)) {
      throw new WorkerError("WRK_CONFIG", "Unknown worker plugin.", {
        name: ref.name,
      });
    }
    const result: unknown = Reflect.apply(
      registry.plugins[ref.name],
      undefined,
      [ref.options],
    );
    if (
      !result || typeof result !== "object" ||
      typeof Reflect.get(result, "id") !== "string" ||
      !["input", "output", "error", "finally"].some((key) =>
        typeof Reflect.get(result, key) === "function"
      )
    ) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Plugin factories must return a materialized Convee plugin.",
        { name: ref.name },
      );
    }
    if (Reflect.get(result, "target") !== undefined) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Worker recipe plugins must be untargeted; attach them on a recipe node instead.",
        { name: ref.name },
      );
    }
    return result as AnyPlugin<unknown[], unknown>;
  });
}
function task(
  registry: WorkerRegistry,
  key: string,
  id: string,
  refs: readonly PluginSpec[],
): Unit {
  if (!Object.hasOwn(registry.tasks, key)) {
    throw new WorkerError("WRK_CONFIG", "Unknown registered worker task.", {
      task: key,
    });
  }
  const fn: WorkerCallable = registry.tasks[key]();
  if (typeof fn !== "function") {
    throw new WorkerError(
      "WRK_CONFIG",
      "Task factories must synchronously return a function, step or pipeline.",
      { task: key },
    );
  }
  return step(async function (...args: unknown[]) {
    const runWith: unknown = Reflect.get(fn, "runWith");
    if (typeof runWith === "function") {
      return await Reflect.apply(runWith, fn, [{
        context: { parent: this.context() },
      }, ...args]);
    }
    return await Reflect.apply(fn, this, args);
  }, { id, plugins: attached(registry, refs) });
}
function assembleRecipe(
  registry: WorkerRegistry,
  key: string,
  recipe: RecipeSpec,
): Unit {
  const nodes = recipe.steps.map((node) =>
    task(registry, node.task, `@worker/${key}/${node.id}`, node.plugins)
  );
  const result = pipe(nodes as [Unit, ...Unit[]], {
    id: `@worker/${key}`,
  }) as unknown as Unit;
  for (const plugin of attached(registry, recipe.plugins)) result.use(plugin);
  return result;
}

/** Build local definitions without mutating registered task/plugin instances. */
export function assemble(
  registry: WorkerRegistry,
  pipelines: Record<string, RecipeSpec>,
  role: RoleSpec,
): Map<string, Unit> {
  for (const key of Object.keys(pipelines)) {
    if (Object.hasOwn(registry.tasks, key)) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Pipeline names must not shadow registered tasks.",
        { task: key },
      );
    }
  }
  const selected = role.tasks ??
    [...Object.keys(registry.tasks), ...Object.keys(pipelines)];
  const output = new Map<string, Unit>();
  for (const key of selected) {
    const definition = Object.hasOwn(pipelines, key)
      ? assembleRecipe(registry, key, pipelines[key])
      : task(registry, key, `@worker/${key}`, []);
    for (
      const plugin of attached(
        registry,
        Object.hasOwn(role.plugins, key) ? role.plugins[key] : [],
      )
    ) definition.use(plugin);
    output.set(key, definition);
  }
  for (const key of Object.keys(role.plugins)) {
    if (!output.has(key)) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Role plugins refer to a task unavailable in that role.",
        { task: key, role: role.name },
      );
    }
  }
  return output;
}
