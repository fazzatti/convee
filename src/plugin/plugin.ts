import type { ContextValues } from "@/context/types.ts";
import { PLG_ERRORS } from "@/plugin/error.ts";
import type {
  Plugin,
  PluginArgs,
  PluginCapability,
  PluginDefinition,
  PluginIdentity,
} from "@/plugin/types.ts";

/**
 * Factory namespace for immutable lifecycle-hook descriptors.
 *
 * Use `PluginEngine.create(definition, options)` to materialize a plugin directly;
 * the fluent `plugin` factory delegates here after hooks are registered. Identity
 * comes from options, and only supported hooks are copied from the definition.
 *
 * @remarks No engine instance is needed. The returned descriptor exposes its hooks,
 * identity, supports and targets helpers. Validation errors are described by create.
 */
export class PluginEngine {
  /**
   * Validate a definition and copy its callable lifecycle hooks into a frozen plugin.
   *
   * @param definition - At least one of input, output, error or finally; absent hooks
   * must be undefined. Extra properties are ignored and hooks are not executed here.
   *
   * @param options - Optional stable ID and routing target; ID defaults to a random UUID.
   * @returns A frozen descriptor retaining the hook functions, ID and target, with
   * supports and targets helpers. Captured values inside hooks are not frozen.
   * @throws ConveeError with `PLG_001` when no hook is supplied or a hook is non-callable.
   * Exceptions from definition or option accessors propagate unchanged.
   */
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
    for (const capability of ["input", "output", "error", "finally"] as const) {
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
        capability: "input|output|error|finally",
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
