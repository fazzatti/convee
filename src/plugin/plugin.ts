import type { ContextValues } from "@/context/types.ts";
import { PLG_ERRORS } from "@/plugin/error.ts";
import type {
  Plugin,
  PluginArgs,
  PluginCapability,
  PluginDefinition,
  PluginIdentity,
} from "@/plugin/types.ts";

/** Constructs immutable hook descriptors with identity owned by the options. */
export class PluginEngine {
  /** Validate and copy only the supported lifecycle hooks. */
  static create<
    I extends PluginArgs,
    O,
    E extends Error,
    Shared extends ContextValues = ContextValues,
    Definition extends PluginDefinition<I, O, E, Shared> = PluginDefinition<
      I,
      O,
      E,
      Shared
    >,
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(
    definition: Definition,
    options?: { id?: Id; target?: Target },
  ): Plugin<I, O, E, Definition, Shared, Target> & PluginIdentity<Id, Target> {
    const id = options?.id ?? crypto.randomUUID();
    const target = options?.target;
    const hooks: Partial<
      Record<PluginCapability, (...args: never[]) => unknown>
    > = {};
    for (const capability of ["input", "output", "error"] as const) {
      const hook = definition == null
        ? undefined
        : Reflect.get(Object(definition), capability);
      if (hook === undefined) continue;
      if (typeof hook !== "function") {
        throw PLG_ERRORS.INVALID_DEFINITION({
          capability,
          received: hook,
          pluginId: id,
          target,
        });
      }
      hooks[capability] = hook as (...args: never[]) => unknown;
    }
    if (Object.keys(hooks).length === 0) {
      throw PLG_ERRORS.INVALID_DEFINITION({
        capability: "input|output|error",
        pluginId: id,
        target,
      });
    }
    return Object.freeze({
      ...hooks,
      id,
      target,
      supports: (capability: PluginCapability) =>
        typeof hooks[capability] === "function",
      targets: (stepId: string) => target === undefined || target === stepId,
    }) as unknown as
      & Plugin<I, O, E, Definition, Shared, Target>
      & PluginIdentity<Id, Target>;
  }
}
