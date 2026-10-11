import type { ContextValues } from "@/context/types.ts";
import { hasError, hasFinally, hasInput, hasOutput } from "@/plugin/guards.ts";
import { PluginEngine } from "@/plugin/plugin.ts";
import type {
  CompactPluginArgs,
  ContextualPluginFactory,
  ContextualPluginSyncFactory,
  FluentPluginStart,
  Plugin,
  PluginArgs,
  PluginDefinition,
  PluginFactory,
  PluginFactoryOptions,
  PluginIdentity,
  PluginSyncFactory,
  SyncPlugin,
  SyncPluginDefinition,
  SyncTypedPluginFactory,
  TypedPluginFactory,
} from "@/plugin/types.ts";

const PLUGIN_HOOK_REGISTRATIONS = [
  { method: "onInput", hook: "input" },
  { method: "onOutput", hook: "output" },
  { method: "onError", hook: "error" },
  { method: "onFinally", hook: "finally" },
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
  const pluginInstance = Object.keys(definition).length === 0
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
 * Bind a known input, output, error and context contract to a plugin factory.
 *
 * @typeParam I - Input argument tuple accepted by the wrapped execution.
 *
 * @typeParam O - Successful output, including values returned by recovery hooks.
 * @typeParam E - Error subtype accepted by error hooks.
 * @typeParam Shared - Shared state available through each hook's this.context().
 * @returns A function accepting a hook definition and optional ID/target, producing
 * a frozen plugin with the bound contract. Binding itself takes no runtime arguments.
 * @remarks Binding does not intentionally throw. Calling the returned factory throws
 * `PLG_001` for empty or non-callable hook definitions and propagates accessor errors.
 * Asynchronous hook results are awaited by the step or pipeline executing the plugin.
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
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<Id, Target> {
    return PluginEngine.create<I, O, E, Shared, Definition, Id, Target>(
      definition,
      options,
    ) as
      & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
      & PluginIdentity<Id, Target>;
  }

  return createTypedPlugin as TypedPluginFactory<I, O, E, Shared>;
}

/**
 * Bind a known input, output, error and context contract to a synchronous plugin factory.
 *
 * @typeParam I - Input argument tuple accepted by the wrapped execution.
 *
 * @typeParam O - Successful output, including values returned by recovery hooks.
 * @typeParam E - Error subtype accepted by error hooks.
 * @typeParam Shared - Shared state available through each hook's this.context().
 * @returns A function accepting a hook definition and optional ID/target, producing
 * a frozen plugin with the bound contract. Binding itself takes no runtime arguments.
 * @remarks Binding does not intentionally throw. Calling the returned factory throws
 * `PLG_001` for empty or non-callable hook definitions and propagates accessor errors.
 * Synchronous types reject async hooks; execution also rejects thenables at runtime.
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
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<Id, Target> {
    return PluginEngine.create<I, O, E, Shared, Definition, Id, Target>(
      definition,
      options,
    ) as unknown as
      & SyncPlugin<
        CompactPluginArgs<I>,
        O,
        E,
        Definition,
        Shared,
        Target
      >
      & PluginIdentity<Id, Target>;
  }

  return createTypedSyncPlugin as SyncTypedPluginFactory<I, O, E, Shared>;
}

function createPlugin(definition: object, options?: PluginFactoryOptions) {
  return PluginEngine.create(
    definition as PluginDefinition<PluginArgs, unknown>,
    options,
  );
}

/**
 * Internal implementation used by `plugin.sync(...)`.
 */
function createSyncPlugin(definition: object, options?: PluginFactoryOptions) {
  return PluginEngine.create(
    definition as PluginDefinition<PluginArgs, unknown>,
    options,
  );
}

const createContextualSyncPluginFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualPluginSyncFactory<Shared> => {
  const syncFor = <I extends PluginArgs, O, E extends Error = Error>() =>
    syncPluginFor<I, O, E, Shared>();

  function fluentSyncPlugin(options?: PluginFactoryOptions) {
    return createFluentPluginBuilder<Shared>(
      (definition, normalizedOptions) =>
        createSyncPlugin(definition, normalizedOptions),
      options,
    );
  }

  return Object.assign(fluentSyncPlugin, {
    for: syncFor,
    hasInput,
    hasOutput,
    hasError,
    hasFinally,
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
        createPlugin(definition, normalizedOptions),
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
    hasFinally,
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
 * - `plugin.sync.hasFinally(...)` to narrow plugins with a cleanup hook
 *
 * Start with `plugin.sync({ id, target })` and then chain `.onInput(...)`,
 * `.onOutput(...)`, `.onError(...)`, and/or `.onFinally(...)`.
 */
const basePluginFactory = createContextualPluginFactory();

/**
 * Start a fluent plugin definition with optional identity and routing metadata.
 *
 * Chain onInput, onOutput, onError and/or onFinally; each registration returns a
 * new builder with that hook set and preserves the earlier builder. At least one
 * hook is needed before the value exposes a materialized plugin. Input hooks
 * transform arguments, output hooks transform results, and error hooks recover a
 * result or continue failure by returning an Error. Finalizers run after all phases
 * and cannot replace the result; cleanup failures are aggregated as `RT_000`.
 *
 * Use `plugin.for<I, O, E>()` for an explicit definition, `plugin.sync` for
 * synchronous hooks and `plugin.withContext<Shared>()` to bind shared-state types.
 * Untargeted pipeline plugins wrap the whole pipeline; a target routes to the
 * pipeline itself or one of its direct children.
 *
 * @param options - Optional ID and target. ID defaults to a random UUID.
 *
 * @returns A builder exposing unregistered hook methods and, after registration,
 * the plugin's hooks, identity, supports and targets helpers.
 * @throws Exceptions raised while reading metadata propagate. Hook registration
 * throws TypeError unless given exactly one function; explicit definitions use
 * `PLG_001` validation. Execution errors are handled later by the owning runtime.
 *
 * @example
 * ```ts
 * const audit = plugin({ id: "audit", target: "sum" })
 *   .onInput((value: number): [number] => [value + 1])
 *   .onOutput((output: number) => output * 2);
 * ```
 */
export const plugin = Object.assign(basePluginFactory, {
  withContext<Shared extends ContextValues>() {
    return createContextualPluginFactory<Shared>();
  },
}) as PluginFactory;
