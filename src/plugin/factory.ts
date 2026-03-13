import type { ContextValues } from "@/context/types.ts";
import { hasError, hasInput, hasOutput } from "@/plugin/guards.ts";
import { PluginEngine } from "@/plugin/plugin.ts";
import type {
  CompactPluginArgs,
  ContextualPluginFactory,
  ContextualPluginSyncFactory,
  FluentPluginStart,
  Plugin,
  PluginArgs,
  PluginCapability,
  PluginDefinition,
  PluginFactory,
  PluginFactoryOptions,
  PluginIdentity,
  PluginSyncFactory,
  TypedPluginFactory,
  SyncPlugin,
  SyncPluginDefinition,
  SyncTypedPluginFactory,
} from "@/plugin/types.ts";

const PLUGIN_HOOK_REGISTRATIONS = [
  { method: "onInput", hook: "input" },
  { method: "onOutput", hook: "output" },
  { method: "onError", hook: "error" },
] as const;

type HookName = (typeof PLUGIN_HOOK_REGISTRATIONS)[number]["hook"];
type HookRegistrationName =
  (typeof PLUGIN_HOOK_REGISTRATIONS)[number]["method"];
type HookDefinition = Partial<
  Record<HookName, (...args: unknown[]) => unknown>
>;

function normalizePluginOptions<
  Id extends string = string,
  Target extends string | undefined = undefined,
>(options?: { id?: Id; target?: Target }): { id: Id | string; target: Target } {
  return {
    id: options?.id ?? crypto.randomUUID(),
    target: (options?.target ?? undefined) as Target,
  };
}

function createFluentPluginBuilder<Shared extends ContextValues>(
  create: (
    definition: HookDefinition,
    options: { id: string; target?: string },
  ) => object,
  options?: { id?: string; target?: string },
  definition: HookDefinition = {},
): FluentPluginStart<Shared> {
  const normalized = normalizePluginOptions(options);
  const pluginInstance =
    Object.keys(definition).length === 0
      ? undefined
      : create(definition, {
          id: normalized.id as string,
          target: normalized.target,
        });

  const hookSetters = Object.fromEntries(
    PLUGIN_HOOK_REGISTRATIONS.filter(({ hook }) => !(hook in definition)).map(
      ({ method, hook }) => [
        method,
        (...args: unknown[]) => {
          if (args.length === 1 && typeof args[0] === "function") {
            return createFluentPluginBuilder<Shared>(create, normalized, {
              ...definition,
              [hook]: args[0] as (...args: unknown[]) => unknown,
            });
          }

          throw new TypeError(
            `Plugin hook \"${hook}\" is not defined yet. Chain .${method}(fn) to register it first.`,
          );
        },
      ],
    ),
  ) as Partial<Record<HookRegistrationName, (...args: unknown[]) => unknown>>;

  return new Proxy(
    {},
    {
      get(_target, prop, receiver) {
        if (typeof prop === "string" && prop in hookSetters) {
          return Reflect.get(hookSetters, prop, receiver);
        }

        if (pluginInstance) {
          return Reflect.get(pluginInstance, prop, receiver);
        }

        return undefined;
      },

      has(_target, prop) {
        if (typeof prop === "string" && prop in hookSetters) {
          return true;
        }

        return pluginInstance ? prop in pluginInstance : false;
      },

      set() {
        return false;
      },
    },
  ) as FluentPluginStart<Shared>;
}

/**
 * Creates a typed plugin factory for a known input/output/error contract.
 */
export function pluginFor<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
>(): TypedPluginFactory<I, O, E, Shared> {
  function createTypedPlugin<
    Definition extends PluginDefinition<I, O, E, Shared>,
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(
    definition: Definition,
    options?: { id?: Id; target?: Target },
  ): Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
    PluginIdentity<Id, Target> {
    return PluginEngine.create<I, O, E, Shared, Definition, Id, Target>(
      definition,
      options,
    ) as Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
      PluginIdentity<Id, Target>;
  }

  return createTypedPlugin as TypedPluginFactory<I, O, E, Shared>;
}

/**
 * Creates a typed synchronous plugin factory for a known contract.
 */
export function syncPluginFor<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
>(): SyncTypedPluginFactory<I, O, E, Shared> {
  function createTypedSyncPlugin<
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(
    definition: Definition,
    options?: { id?: Id; target?: Target },
  ): SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
    PluginIdentity<Id, Target> {
    return PluginEngine.create<I, O, E, Shared, never, Id, Target>(
      definition as never,
      options,
    ) as unknown as SyncPlugin<
      CompactPluginArgs<I>,
      O,
      E,
      Definition,
      Shared,
      Target
    > &
      PluginIdentity<Id, Target>;
  }

  return createTypedSyncPlugin as SyncTypedPluginFactory<I, O, E, Shared>;
}

function createPlugin(definition: object, options?: PluginFactoryOptions) {
  return PluginEngine.create(definition as never, options);
}

/**
 * Internal implementation used by `plugin.sync(...)`.
 */
function createSyncPlugin(definition: object, options?: PluginFactoryOptions) {
  return PluginEngine.create(definition as never, options);
}

const createContextualSyncPluginFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualPluginSyncFactory<Shared> => {
  const syncFor = <I extends PluginArgs, O, E extends Error = Error>() =>
    syncPluginFor<I, O, E, Shared>();

  function fluentSyncPlugin(options?: PluginFactoryOptions) {
    return createFluentPluginBuilder<Shared>(
      (definition, normalizedOptions) =>
        createSyncPlugin(definition as never, normalizedOptions),
      options,
    );
  }

  return Object.assign(fluentSyncPlugin, {
    for: syncFor,
    hasInput,
    hasOutput,
    hasError,
  }) as unknown as ContextualPluginSyncFactory<Shared>;
};

const createContextualPluginFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualPluginFactory<Shared> => {
  const forFactory = <I extends PluginArgs, O, E extends Error = Error>() =>
    pluginFor<I, O, E, Shared>();
  const syncFactory = Object.assign(
    createContextualSyncPluginFactory<Shared>(),
    {
      withContext<NextShared extends ContextValues>() {
        return createContextualSyncPluginFactory<NextShared>();
      },
    },
  ) as PluginSyncFactory;

  function fluentPlugin(options?: PluginFactoryOptions) {
    return createFluentPluginBuilder<Shared>(
      (definition, normalizedOptions) =>
        createPlugin(definition as never, normalizedOptions),
      options,
    );
  }

  return Object.assign(fluentPlugin, {
    for: forFactory,
    sync: syncFactory,
    PluginEngine,
    hasInput,
    hasOutput,
    hasError,
  }) as unknown as ContextualPluginFactory<Shared>;
};

/**
 * Creates a synchronous plugin builder with optional metadata.
 *
 * Use `plugin.sync(...)` when every lifecycle hook must stay synchronous.
 * Sync plugins can be used by `step.sync(...)`, and their hooks cannot return
 * `Promise` values.
 *
 * Attached helper APIs:
 *
 * - `plugin.sync.for(...)` for more explicit typed sync factories
 * - `plugin.sync.hasInput(...)` to narrow plugins with an input hook
 * - `plugin.sync.hasOutput(...)` to narrow plugins with an output hook
 * - `plugin.sync.hasError(...)` to narrow plugins with an error hook
 *
 * Start with `plugin.sync({ id, target })` and then chain `.onInput(...)`,
 * `.onOutput(...)`, and/or `.onError(...)`.
 */
const basePluginFactory = createContextualPluginFactory();
const sync = basePluginFactory.sync as PluginSyncFactory;

/**
 * Creates a plugin builder with optional metadata.
 *
 * This is the main plugin factory for v1.
 *
 * Use `plugin(...)` to start a fluent plugin definition.
 *
 * Chain one or more lifecycle hooks:
 *
 * - `.onInput(...args)`
 *   Runs before the step/process execution.
 *   It receives the full input tuple and must return the transformed input tuple.
 *
 * - `.onOutput(output)`
 *   Runs after successful execution.
 *   It receives the produced output and must return the final output.
 *
 * - `.onError(error, input)`
 *   Runs when execution fails.
 *   It receives the thrown error and the original input tuple, and may either
 *   return a recovered output or return an error to continue the error flow.
 *
 * At least one hook must be chained before the plugin is materialized.
 *
 * The optional `options` object supports:
 *
 * - `id`
 *   A stable identifier for the plugin.
 *   If omitted, a random id is generated.
 *
 * - `target`
 *   An optional step identifier used to scope the plugin when running inside a
 *   pipeline.
 *   If omitted, the plugin is considered applicable to any step.
 *
 * The returned value is a proxy-backed builder that exposes:
 *
 * - remaining lifecycle hook registration methods
 * - metadata like `id` and `target` once at least one hook is registered
 * - runtime helpers like `supports()` and `targets()` once materialized
 *
 * Additional helper APIs are exposed on the factory itself:
 *
 * - `plugin.for(...)` for a more explicit typed factory
 * - `plugin.sync(...)` for strictly synchronous plugins
 * - `plugin.hasInput(...)` to narrow plugins with an input hook
 * - `plugin.hasOutput(...)` to narrow plugins with an output hook
 * - `plugin.hasError(...)` to narrow plugins with an error hook
 * - `plugin.PluginEngine` for direct access to the underlying runtime class
 *
 * @param options Optional plugin metadata such as `id` and `target`.
 *
 * @example
 * ```ts
 * const auditPlugin = plugin({
 *   id: "audit-plugin",
 *   target: "sum-step",
 * })
 *   .onInput((value: number): number => value + 1)
 *   .onOutput((output: number) => output * 2);
 * ```
 */
export const plugin = Object.assign(basePluginFactory, {
  withContext<Shared extends ContextValues>() {
    return createContextualPluginFactory<Shared>();
  },
}) as PluginFactory;
