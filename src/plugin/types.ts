import type { ContextValues, PluginThis } from "@/context/types.ts";
import type { Args, MaybePromise, RequireAtLeastOne } from "@/core/types.ts";

/** Raw argument tuple handled by plugin input hooks. */
export type PluginArgs = Args;

/** Preserves the complete plugin argument tuple without singleton unwrapping. */
export type CompactPluginArgs<I extends PluginArgs> = I;

/** Normalizes legacy scalar plugin generics without losing array-valued arguments. */
export type NormalizePublicPluginArgs<I> = [I] extends [never] ? PluginArgs
  : [I] extends [void] ? []
  : I extends PluginArgs ? I
  : [I];

/**
 * Natural return shape for an input hook.
 *
 * - no args: keep returning `[]`
 * - one arg: allow either the bare value or `[value]`
 * - many args: require the full tuple
 */
export type PluginInputResult<I extends PluginArgs> = I extends [] ? []
  : I extends [infer Value] ? Value extends readonly unknown[] ? I : Value | I
  : I;

/** Async input hook signature used by plugins. */
export type PluginInputHook<I extends PluginArgs> = (
  ...args: I
) => MaybePromise<PluginInputResult<I>>;

/**
 * Synchronous input hook used by `plugin.sync(...)`.
 */
export type SyncPluginInputHook<I extends PluginArgs> = (
  ...args: I
) => PluginInputResult<I>;

/** Async output hook signature used by plugins. */
export type PluginOutputHook<_Input extends PluginArgs, O> = (
  output: O,
) => MaybePromise<O>;

/**
 * Synchronous output hook used by `plugin.sync(...)`.
 */
export type SyncPluginOutputHook<_Input extends PluginArgs, O> = (
  output: O,
) => O;

/** Async error hook signature used by plugins. */
export type PluginErrorHook<
  I extends PluginArgs,
  O,
  E extends Error = Error,
> = (error: E, input: I) => MaybePromise<O | E>;

/**
 * Synchronous error hook used by `plugin.sync(...)`.
 */
export type SyncPluginErrorHook<
  I extends PluginArgs,
  O,
  E extends Error = Error,
> = (error: E, input: I) => O | E;

/** Shape of the async hooks that can be implemented by a plugin. */
export type PluginHooks<I extends PluginArgs, O, E extends Error = Error> = {
  input?: PluginInputHook<I>;
  output?: PluginOutputHook<I, O>;
  error?: PluginErrorHook<I, O, E>;
};

/**
 * Synchronous plugin hooks used by `plugin.sync(...)`.
 */
export type SyncPluginHooks<
  I extends PluginArgs,
  O,
  E extends Error = Error,
> = {
  input?: SyncPluginInputHook<I>;
  output?: SyncPluginOutputHook<I, O>;
  error?: SyncPluginErrorHook<I, O, E>;
};

/** Async plugin definition object consumed by the plugin factories. */
export type PluginDefinition<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
> = RequireAtLeastOne<PluginHooks<I, O, E>> & ThisType<PluginThis<Shared>>;

/**
 * Plugin definition accepted by `plugin.sync(...)`.
 */
export type SyncPluginDefinition<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
> = RequireAtLeastOne<SyncPluginHooks<I, O, E>> & ThisType<PluginThis<Shared>>;

/** Public hook names that a plugin can implement. */
export type PluginCapability = "input" | "output" | "error";

/** Detects whether a plugin definition declares hook fields. */
export type HasDefinitionHooks<Definition extends object> = [
  keyof Definition,
] extends [never] ? false
  : true;

/** Detects explicitly supplied callable hooks rather than fluent builder flags. */
export type HasExplicitPluginDefinition<Definition extends object> = [
  keyof {
    [
      K in keyof Definition as Definition[K] extends (
        ...args: never[]
      ) => unknown ? K
        : never
    ]: Definition[K];
  },
] extends [never] ? false
  : true;

/** Selects a synchronous value or an asynchronous hook result by mode. */
export type HookResult<Value, Sync extends boolean> = Sync extends true
  ? Exclude<Value, PromiseLike<unknown>>
  : MaybePromise<Value>;
/** Resolves inferred hook arguments, defaulting an unset contract to unknown arguments. */
export type HookArguments<I> = [I] extends [never] ? PluginArgs
  : NormalizePublicPluginArgs<I>;
/** Keeps an established output type, or adopts the first inferred output type. */
export type NextOutput<Current, Next> = [Current] extends [never] ? Next
  : Current;
/** Exposes only hooks not yet registered, preserving mode, identity and inferred contracts. */
export type FluentMembers<
  I,
  O,
  E extends Error,
  Shared extends ContextValues,
  Target extends string | undefined,
  Keys,
  Sync extends boolean,
  Id extends string = string,
> =
  & ("input" extends Keys ? Record<never, never> : {
    onInput<NextI extends HookArguments<I>>(
      hook: (
        this: PluginThis<Shared>,
        ...args: NextI
      ) => HookResult<PluginInputResult<NextI>, Sync>,
    ): FluentState<NextI, O, E, Shared, Target, Keys | "input", Sync, Id>;
  })
  & ("output" extends Keys ? Record<never, never> : {
    onOutput<NextO>(
      hook: (
        this: PluginThis<Shared>,
        output: NextOutput<O, NextO>,
      ) => HookResult<NextOutput<O, NextO>, Sync>,
    ): FluentState<
      I,
      NextOutput<O, NextO>,
      E,
      Shared,
      Target,
      Keys | "output",
      Sync,
      Id
    >;
  })
  & ("error" extends Keys ? Record<never, never> : {
    onError<
      NextI extends HookArguments<I> = HookArguments<I>,
      NextE extends Error = Error,
      Result = never,
    >(
      hook:
        & ((
          this: PluginThis<Shared>,
          error: NextE,
          input: NextI,
        ) => HookResult<[O] extends [never] ? Result : O | NextE, Sync>)
        & (Sync extends true
          ? Extract<Result, PromiseLike<unknown>> extends never ? unknown
          : never
          : unknown),
    ): FluentState<
      [I] extends [never] ? NextI : I,
      NextOutput<O, Exclude<Awaited<Result>, Error>>,
      NextE,
      Shared,
      Target,
      Keys | "error",
      Sync,
      Id
    >;
  });

/** Combines registered hooks, stable identity and remaining fluent builder methods. */
export type FluentState<
  I,
  O,
  E extends Error,
  Shared extends ContextValues,
  Target extends string | undefined,
  Keys,
  Sync extends boolean,
  Id extends string = string,
> =
  & PluginIdentity<Id, Target>
  & {
    supports(capability: PluginCapability): boolean;
    targets(stepId: string): boolean;
  }
  & ("input" extends Keys ? {
      input: (
        ...args: HookArguments<I>
      ) => HookResult<PluginInputResult<HookArguments<I>>, Sync>;
    }
    : Record<never, never>)
  & ("output" extends Keys ? { output: (output: O) => HookResult<O, Sync> }
    : Record<never, never>)
  & ("error" extends Keys
    ? { error: (error: E, input: HookArguments<I>) => HookResult<O | E, Sync> }
    : Record<never, never>)
  & FluentMembers<I, O, E, Shared, Target, Keys, Sync, Id>;

/** Determines whether the fluent state has inferred any hook contract. */
export type HasRegisteredPluginHooks<I, O, E> = [I] extends [never]
  ? [O] extends [never] ? [E] extends [never] ? false
    : true
  : true
  : true;

/** Detects whether a builder has enough hook state to expose runtime members. */
export type HasPluginRuntimeState<I, O, E, Definition extends object> =
  HasDefinitionHooks<Definition> extends true ? true
    : HasRegisteredPluginHooks<I, O, E>;

/** Selects callable runtime hooks present in an explicit definition. */
export type DefinitionPluginRuntimeMembers<
  I,
  O,
  E extends Error,
  Definition extends object,
> =
  & ("input" extends keyof Definition
    ? { input: PluginInputHook<NormalizePublicPluginArgs<I>> }
    : Record<never, never>)
  & ("output" extends keyof Definition
    ? { output: PluginOutputHook<NormalizePublicPluginArgs<I>, O> }
    : Record<never, never>)
  & ("error" extends keyof Definition
    ? { error: PluginErrorHook<NormalizePublicPluginArgs<I>, O, E> }
    : Record<never, never>);

/** Resolves runtime hooks from either explicit or fluent definitions. */
export type PublicPluginRuntimeMembers<
  I,
  O,
  E extends Error,
  Definition extends object,
> = HasDefinitionHooks<Definition> extends true
  ? DefinitionPluginRuntimeMembers<I, O, E, Definition>
  : PublicBuilderDefinition<I, O, E>;

/** Adds identity and routing methods only to materialized plugin states. */
export type PublicPluginBaseMembers<
  I,
  O,
  E extends Error,
  Definition extends object,
  Target extends string | undefined,
> = HasPluginRuntimeState<I, O, E, Definition> extends true ? {
    readonly id: string;
    readonly target: Target;
    supports(capability: PluginCapability): boolean;
    targets(stepId: string): boolean;
  }
  : Record<never, never>;

/** Exposes remaining fluent methods only for builder-style definitions. */
export type PublicPluginFluentMembers<
  I,
  O,
  E extends Error,
  Shared extends ContextValues,
  Target extends string | undefined,
  Definition extends object,
> = HasExplicitPluginDefinition<Definition> extends true ? Record<never, never>
  : FluentMembers<
    I,
    O,
    E,
    Shared,
    Target,
    | keyof Definition
    | ([keyof Definition] extends [never]
      ? PublicMissingHooks<never, never, never> extends infer All
        ? Exclude<All, PublicMissingHooks<I, O, E>>
      : never
      : never),
    false
  >;

/** Public runtime contract returned by async plugin builders. */
export type Plugin<
  I = PluginArgs,
  O = unknown,
  E extends Error = Error,
  Definition extends object = Record<never, never>,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> =
  & Record<never, never>
  & PublicPluginBaseMembers<I, O, E, Definition, Target>
  & PublicPluginRuntimeMembers<I, O, E, Definition>
  & PublicPluginFluentMembers<I, O, E, Shared, Target, Definition>;

/** Structural async plugin type accepted by steps and pipes. */
export type AnyPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> =
  & {
    readonly id: string;
    readonly target: Target;
    supports(capability: PluginCapability): boolean;
    targets(stepId: string): boolean;
  }
  & ThisType<PluginThis<Shared>>
  & (
    | {
      input: PluginInputHook<I>;
      output?: PluginOutputHook<I, O>;
      error?: PluginErrorHook<I, O, E>;
    }
    | {
      input?: PluginInputHook<I>;
      output: PluginOutputHook<I, O>;
      error?: PluginErrorHook<I, O, E>;
    }
    | {
      input?: PluginInputHook<I>;
      output?: PluginOutputHook<I, O>;
      error: PluginErrorHook<I, O, E>;
    }
  );

/**
 * Runtime plugin contract for synchronous plugins.
 */
export type AnySyncPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> =
  & {
    readonly id: string;
    readonly target: Target;
    supports(capability: PluginCapability): boolean;
    targets(stepId: string): boolean;
  }
  & ThisType<PluginThis<Shared>>
  & (
    | {
      input: SyncPluginInputHook<I>;
      output?: SyncPluginOutputHook<I, O>;
      error?: SyncPluginErrorHook<I, O, E>;
    }
    | {
      input?: SyncPluginInputHook<I>;
      output: SyncPluginOutputHook<I, O>;
      error?: SyncPluginErrorHook<I, O, E>;
    }
    | {
      input?: SyncPluginInputHook<I>;
      output?: SyncPluginOutputHook<I, O>;
      error: SyncPluginErrorHook<I, O, E>;
    }
  );

/** Async plugin alias that guarantees an input hook. */
export type InputPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = AnyPlugin<I, O, E, Shared, Target> & {
  input: PluginInputHook<I>;
};

/** Async plugin alias that guarantees an output hook. */
export type OutputPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = AnyPlugin<I, O, E, Shared, Target> & {
  output: PluginOutputHook<I, O>;
};

/** Async plugin alias that guarantees an error hook. */
export type ErrorPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = AnyPlugin<I, O, E, Shared, Target> & {
  error: PluginErrorHook<I, O, E>;
};

/** Public runtime contract returned by synchronous plugin builders. */
export type SyncPlugin<
  I = PluginArgs,
  O = unknown,
  E extends Error = Error,
  Definition extends object = Record<never, never>,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> =
  & ThisType<PluginThis<Shared>>
  & {
    readonly id: string;
    readonly target: Target;
    supports(capability: PluginCapability): boolean;
    targets(stepId: string): boolean;
  }
  & ("input" extends keyof Definition
    ? { input: SyncPluginInputHook<NormalizePublicPluginArgs<I>> }
    : Record<never, never>)
  & ("output" extends keyof Definition
    ? { output: SyncPluginOutputHook<NormalizePublicPluginArgs<I>, O> }
    : Record<never, never>)
  & ("error" extends keyof Definition
    ? { error: SyncPluginErrorHook<NormalizePublicPluginArgs<I>, O, E> }
    : Record<never, never>);

/** Sync plugin alias that guarantees an input hook. */
export type SyncInputPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = AnySyncPlugin<I, O, E, Shared, Target> & {
  input: SyncPluginInputHook<I>;
};

/** Sync plugin alias that guarantees an output hook. */
export type SyncOutputPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = AnySyncPlugin<I, O, E, Shared, Target> & {
  output: SyncPluginOutputHook<I, O>;
};

/** Sync plugin alias that guarantees an error hook. */
export type SyncErrorPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = AnySyncPlugin<I, O, E, Shared, Target> & {
  error: SyncPluginErrorHook<I, O, E>;
};

/** Infers the argument tuple accepted by an input hook. */
export type InferInputHookArgs<Definition> = Definition extends {
  input: (...args: infer I) => unknown;
} ? I extends PluginArgs ? I
  : PluginArgs
  : never;

/** Infers the original input tuple accepted by an error hook. */
export type InferErrorHookArgs<Definition> = Definition extends {
  error: (...args: infer A) => unknown;
} ? A extends [unknown, infer I] ? I extends PluginArgs ? I
    : PluginArgs
  : PluginArgs
  : never;

/** Prefers input-hook arguments, then error-hook input, when inferring a definition. */
export type InferPluginArgs<Definition> =
  [InferInputHookArgs<Definition>] extends [never]
    ? [InferErrorHookArgs<Definition>] extends [never] ? PluginArgs
    : InferErrorHookArgs<Definition>
    : InferInputHookArgs<Definition>;

/** Infers the value consumed by an output hook. */
export type InferOutputHookValue<Definition> = Definition extends {
  output: (...args: infer A) => infer R;
} ? A extends [infer O, ...unknown[]] ? O
  : Awaited<R>
  : never;

/** Infers an error hook's error subtype, defaulting to Error. */
export type InferPluginErrorType<Definition> = Definition extends {
  error: (...args: infer A) => unknown;
} ? A extends [infer E, ...unknown[]] ? E extends Error ? E
    : Error
  : Error
  : Error;

/** Extracts non-error values returned by an error recovery hook. */
export type InferErrorHookRecoveredValue<Definition> = Definition extends {
  error: (...args: unknown[]) => infer R;
} ? Exclude<Awaited<R>, InferPluginErrorType<Definition>>
  : never;

/** Infers output from an output hook or recovery value. */
export type InferPluginOutput<Definition> = [
  InferOutputHookValue<Definition>,
] extends [never]
  ? [InferErrorHookRecoveredValue<Definition>] extends [never] ? unknown
  : InferErrorHookRecoveredValue<Definition>
  : InferOutputHookValue<Definition>;

/** Combines an explicit definition with its inferred asynchronous contract. */
export type InferredPluginDefinition<
  Definition,
  Shared extends ContextValues = ContextValues,
> =
  & Definition
  & PluginDefinition<
    InferPluginArgs<Definition>,
    InferPluginOutput<Definition>,
    InferPluginErrorType<Definition>,
    Shared
  >;

/** Combines an explicit definition with its inferred synchronous contract. */
export type InferredSyncPluginDefinition<
  Definition,
  Shared extends ContextValues = ContextValues,
> =
  & Definition
  & SyncPluginDefinition<
    InferPluginArgs<Definition>,
    InferPluginOutput<Definition>,
    InferPluginErrorType<Definition>,
    Shared
  >;

/** Type-only sentinel distinguishing unset builder state from unknown. */
export declare const PLUGIN_BUILDER_UNSET: unique symbol;

/** Type-only marker for a hook contract that has not yet been inferred. */
export type PluginBuilderUnset = typeof PLUGIN_BUILDER_UNSET;

/** Resolves unset builder inputs to the general argument tuple. */
export type NormalizeBuilderArgs<I> = [I] extends [PluginBuilderUnset]
  ? PluginArgs
  : I extends PluginArgs ? I
  : PluginArgs;
/** Resolves unset builder output to unknown. */
export type NormalizeBuilderOutput<O> = [O] extends [PluginBuilderUnset]
  ? unknown
  : O;

/** Converts an absent public input generic to the builder sentinel. */
export type PublicBuilderArgs<I> = [I] extends [never] ? PluginBuilderUnset
  : NormalizePublicPluginArgs<I>;
/** Converts an absent public output generic to the builder sentinel. */
export type PublicBuilderOutput<O> = [O] extends [never] ? PluginBuilderUnset
  : O;

/** Builds runtime hook fields from established public generic contracts. */
export type PublicBuilderDefinition<I, O, E> =
  & ([I] extends [never] ? Record<never, never>
    : { input: PluginInputHook<NormalizePublicPluginArgs<I>> })
  & ([O] extends [never] ? Record<never, never>
    : {
      output: PluginOutputHook<NormalizeBuilderArgs<PublicBuilderArgs<I>>, O>;
    })
  & ([E] extends [never] ? Record<never, never>
    : E extends Error ? {
        error: PluginErrorHook<
          NormalizeBuilderArgs<PublicBuilderArgs<I>>,
          NormalizeBuilderOutput<PublicBuilderOutput<O>>,
          E
        >;
      }
    : Record<never, never>);

/** Computes hook names not yet represented by the public builder state. */
export type PublicMissingHooks<I, O, E> =
  | ([I] extends [never] ? "input" : never)
  | ([O] extends [never] ? "output" : never)
  | ([E] extends [never] ? "error" : never);

/** Fluent plugin builder state returned by `plugin()` before hooks are added. */
export type PluginBuilder<
  I = never,
  O = never,
  E extends Error | never = never,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
  Target extends string | undefined = undefined,
> =
  & Plugin<I, O, E, Record<never, never>, Shared, Target>
  & PluginIdentity<Id, Target>;

/** Compatibility alias for materialized or partially built plugin state. */
export type PluginState<
  I = never,
  O = never,
  E extends Error | never = never,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
  Target extends string | undefined = undefined,
> =
  & Plugin<I, O, E, Record<never, never>, Shared, Target>
  & PluginIdentity<Id, Target>;

/** An empty fluent builder preserving the configured identity and target. */
export type FluentPluginStart<
  Shared extends ContextValues,
  Id extends string = string,
  Target extends string | undefined = undefined,
> = FluentMembers<never, never, never, Shared, Target, never, false, Id>;

/** Factory options shared by the fluent and typed plugin builders. */
export type PluginFactoryOptions = {
  id?: string;
  target?: string;
};

/** Stable identity fields exposed by plugin runtimes. */
export type PluginIdentity<
  Id extends string = string,
  Target extends string | undefined = undefined,
> = {
  readonly id: Id;
  readonly target: Target;
};

/**
 * Strongly typed plugin factory for a known input/output/error contract.
 */
export type TypedPluginFactory<
  I extends PluginArgs,
  O,
  E extends Error,
  Shared extends ContextValues = ContextValues,
> = {
  <Definition extends PluginDefinition<I, O, E, Shared>>(
    definition: Definition & ThisType<PluginThis<Shared>>,
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<string, undefined>;
  <Definition extends PluginDefinition<I, O, E, Shared>, Id extends string>(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { id: Id; target?: undefined },
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<Id, undefined>;
  <Definition extends PluginDefinition<I, O, E, Shared>, Target extends string>(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { target: Target; id?: undefined },
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<string, Target>;
  <
    Definition extends PluginDefinition<I, O, E, Shared>,
    Id extends string,
    Target extends string,
  >(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { id: Id; target: Target },
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<Id, Target>;
};

/**
 * Strongly typed synchronous plugin factory for a known contract.
 */
export type SyncTypedPluginFactory<
  I extends PluginArgs,
  O,
  E extends Error,
  Shared extends ContextValues = ContextValues,
> = {
  <Definition extends SyncPluginDefinition<I, O, E, Shared>>(
    definition: Definition & ThisType<PluginThis<Shared>>,
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<string, undefined>;
  <Definition extends SyncPluginDefinition<I, O, E, Shared>, Id extends string>(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { id: Id; target?: undefined },
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<Id, undefined>;
  <
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Target extends string,
  >(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { target: Target; id?: undefined },
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<string, Target>;
  <
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Id extends string,
    Target extends string,
  >(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { id: Id; target: Target },
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<Id, Target>;
};

/**
 * Public synchronous plugin factory type for a known execution context shape.
 */
export type ContextualPluginSyncFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(options?: {
    id?: Id;
    target?: Target;
  }): FluentMembers<never, never, never, Shared, Target, never, true, Id>;
  for: <
    I extends PluginArgs,
    O,
    E extends Error = Error,
  >() => SyncTypedPluginFactory<I, O, E, Shared>;
  hasInput: typeof import("@/plugin/guards.ts").hasInput;
  hasOutput: typeof import("@/plugin/guards.ts").hasOutput;
  hasError: typeof import("@/plugin/guards.ts").hasError;
};

/**
 * Public plugin factory type for a known execution context shape.
 */
export type ContextualPluginFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(options?: {
    id?: Id;
    target?: Target;
  }): FluentPluginStart<Shared, Id, Target>;
  for: <
    I extends PluginArgs,
    O,
    E extends Error = Error,
  >() => TypedPluginFactory<I, O, E, Shared>;
  sync: ContextualPluginSyncFactory<Shared>;
  PluginEngine: typeof import("@/plugin/plugin.ts").PluginEngine;
  hasInput: typeof import("@/plugin/guards.ts").hasInput;
  hasOutput: typeof import("@/plugin/guards.ts").hasOutput;
  hasError: typeof import("@/plugin/guards.ts").hasError;
};

/**
 * Public synchronous plugin factory type.
 */
export type PluginSyncFactory = ContextualPluginSyncFactory & {
  withContext<
    Shared extends ContextValues,
  >(): ContextualPluginSyncFactory<Shared>;
};

/**
 * Public plugin factory type, including attached helper APIs.
 */
export type PluginFactory = ContextualPluginFactory & {
  sync: PluginSyncFactory;
  withContext<Shared extends ContextValues>(): ContextualPluginFactory<Shared>;
};
