import type { ContextValues } from "@/context/types.ts";
import {
  Plugin,
  PluginArgs,
  PluginCapability,
  PluginDefinition,
  PluginIdentity,
} from "@/plugin/types.ts";

/**
 * Runtime representation of a plugin.
 *
 * A `PluginEngine` stores plugin metadata such as `id` and `target`, then uses
 * a `Proxy` to expose lifecycle hooks from the original definition alongside
 * engine-level helpers like `supports()` and `targets()`.
 */
export class PluginEngine<
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
> {
  private readonly _id: PluginIdentity<Id, Target>["id"];
  private readonly _target: PluginIdentity<Id, Target>["target"];

  /**
   * Creates a plugin runtime from a plugin definition and optional metadata.
   */
  private constructor(
    private readonly definition: Definition,
    options?: { id?: Id; target?: Target },
  ) {
    this._id = (options?.id ?? crypto.randomUUID()) as PluginIdentity<
      Id,
      Target
    >["id"];
    this._target = (options?.target ?? undefined) as PluginIdentity<
      Id,
      Target
    >["target"];
  }

  /**
   * Creates a proxy-backed plugin instance.
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
    const instance = new PluginEngine<I, O, E, Shared, Definition, Id, Target>(
      definition,
      options,
    );

    return new Proxy(instance, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && prop in definition) {
          return Reflect.get(definition, prop, definition);
        }

        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },

      has(target, prop) {
        return prop in definition || prop in target;
      },

      set() {
        return false;
      },
    }) as unknown as Plugin<I, O, E, Definition, Shared, Target> &
      PluginIdentity<Id, Target>;
  }

  /** The unique plugin identifier. */
  get id(): PluginIdentity<Id, Target>["id"] {
    return this._id;
  }

  /** The optional step identifier this plugin targets inside a pipeline. */
  get target(): PluginIdentity<Id, Target>["target"] {
    return this._target;
  }

  /** Returns whether the plugin implements the requested lifecycle hook. */
  supports(capability: PluginCapability): boolean {
    return capability in this.definition;
  }

  /**
   * Returns whether the plugin should apply to a given step id.
   *
   * Plugins without a target apply to all steps.
   */
  targets(stepId: string): boolean {
    return this._target === undefined || this._target === stepId;
  }
}
