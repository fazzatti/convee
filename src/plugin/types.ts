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

/**
 * Awaitable input lifecycle callback executed with the plugin's invocation context.
 *
 * @param args - Current execution argument tuple, spread into the callback.
 * @returns Replacement arguments: the full tuple, or a scalar for one non-array argument. Promise results are awaited by async runtimes.
 * @throws A thrown hook failure or invalid input transport fails the execution without body-error recovery; finalizers still run.
 */
export type PluginInputHook<I extends PluginArgs> = (
  ...args: I
) => MaybePromise<PluginInputResult<I>>;

/**
 * Synchronous input lifecycle callback executed with the plugin's invocation context.
 *
 * @param args - Current execution argument tuple, spread into the callback.
 * @returns Replacement arguments: the full tuple, or a scalar for one non-array argument. Thenables are invalid in a synchronous runtime.
 * @throws A thrown hook failure or invalid input transport fails the execution without body-error recovery; finalizers still run.
 */
export type SyncPluginInputHook<I extends PluginArgs> = (
  ...args: I
) => PluginInputResult<I>;

/**
 * Awaitable output lifecycle callback executed with the plugin's invocation context.
 *
 * @param output - Current successful or recovered output.
 * @returns The next output with the same contract. Promise results are awaited by async runtimes.
 * @throws A thrown hook failure fails the execution without re-entering error hooks; finalizers still run.
 */
export type PluginOutputHook<_Input extends PluginArgs, O> = (
  output: O,
) => MaybePromise<O>;

/**
 * Synchronous output lifecycle callback executed with the plugin's invocation context.
 *
 * @param output - Current successful or recovered output.
 * @returns The next output with the same contract. Thenables are invalid in a synchronous runtime.
 * @throws A thrown hook failure fails the execution without re-entering error hooks; finalizers still run.
 */
export type SyncPluginOutputHook<_Input extends PluginArgs, O> = (
  output: O,
) => O;

/**
 * Awaitable error lifecycle callback executed with the plugin's invocation context.
 *
 * @param error - Current body failure or an Error returned by a preceding error hook.
 * @param input - Copy of the argument tuple after input hooks have transformed it.
 * @returns An output value to recover, or an Error to continue to the next error hook. Promise results are awaited by async runtimes.
 * @throws A thrown hook failure ends recovery; finalizers still run. Input/output/finalizer failures do not enter these hooks.
 */
export type PluginErrorHook<
  I extends PluginArgs,
  O,
  E extends Error = Error,
> = (error: E, input: I) => MaybePromise<O | E>;

/**
 * Synchronous error lifecycle callback executed with the plugin's invocation context.
 *
 * @param error - Current body failure or an Error returned by a preceding error hook.
 * @param input - Copy of the argument tuple after input hooks have transformed it.
 * @returns An output value to recover, or an Error to continue to the next error hook. Thenables are invalid in a synchronous runtime.
 * @throws A thrown hook failure ends recovery; finalizers still run. Input/output/finalizer failures do not enter these hooks.
 */
export type SyncPluginErrorHook<
  I extends PluginArgs,
  O,
  E extends Error = Error,
> = (error: E, input: I) => O | E;

/**
 * Awaitable finally lifecycle callback executed with the plugin's invocation context.
 *
 * @returns No meaningful value; cleanup cannot replace the execution result. Promise results are awaited by async runtimes.
 *
 * @throws Thrown cleanup failures are aggregated as `RT_000` after all selected finalizers are attempted.
 */
export type PluginFinallyHook = () => MaybePromise<void>;

/**
 * Synchronous finally lifecycle callback executed with the plugin's invocation context.
 *
 * @returns No meaningful value; cleanup cannot replace the execution result. Thenables are invalid in a synchronous runtime.
 *
 * @throws Thrown cleanup failures are aggregated as `RT_000` after all selected finalizers are attempted.
 */
export type SyncPluginFinallyHook = () => undefined;

/** Shape of the async hooks that can be implemented by a plugin. */
export type PluginHooks<I extends PluginArgs, O, E extends Error = Error> = {
  input?: PluginInputHook<I>;
  output?: PluginOutputHook<I, O>;
  error?: PluginErrorHook<I, O, E>;
  finally?: PluginFinallyHook;
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
  finally?: () => void;
};

/** Reject async finalizers inferred through TypeScript's permissive void callback assignment. */
export type SyncFinallyConstraint<Definition> = Definition extends {
  finally: (...args: never[]) => infer Result;
} ? Extract<Result, PromiseLike<unknown>> extends never ? unknown : never
  : unknown;

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
export type PluginCapability = "input" | "output" | "error" | "finally";

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
  & ("finally" extends Keys ? Record<never, never> : {
    /**
     * Register cleanup after success, recovery or execution-phase failure.
     *
     * @param hook - Callback receiving no arguments and this.context(); returned values are
     * ignored and async cleanup is awaited, except that sync builders require synchronous cleanup.
     * @returns A new builder with finally registered; each selected registration finalizes once.
     * @throws TypeError unless exactly one callable hook is supplied. Execution-time cleanup
     * failures become `RT_000` after all finalizers run and do not re-enter error hooks.
     */
    onFinally<Result extends void | Promise<void>>(
      hook:
        & ((this: PluginThis<Shared>) => Result)
        & (Sync extends true
          ? Extract<Result, PromiseLike<unknown>> extends never ? unknown
          : never
          : unknown),
    ): FluentState<I, O, E, Shared, Target, Keys | "finally", Sync, Id>;
  })
  & ("input" extends Keys ? Record<never, never> : {
    /**
     * Register a hook that transforms the execution's arguments before its body runs.
     *
     * @param hook - Callback receiving arguments and this.context(); return the replacement
     * tuple, or a scalar for a single non-array argument. Sync builders require a synchronous result.
     * @returns A new builder with input registered, preserving this builder and the configured identity.
     * @throws TypeError unless exactly one callable hook is supplied. At execution time,
     * invalid tuple transport fails the owning step or pipe, and input-hook failures skip error recovery.
     */
    onInput<NextI extends HookArguments<I>>(
      hook: (
        this: PluginThis<Shared>,
        ...args: NextI
      ) => HookResult<PluginInputResult<NextI>, Sync>,
    ): FluentState<NextI, O, E, Shared, Target, Keys | "input", Sync, Id>;
  })
  & ("output" extends Keys ? Record<never, never> : {
    /**
     * Register a hook that transforms a successful or recovered result.
     *
     * @param hook - Callback receiving the current output and this.context(), returning
     * the next output of the same contract. Sync builders require a synchronous result.
     * @returns A new builder with output registered; the previous builder remains reusable.
     * @throws TypeError unless exactly one callable hook is supplied. Output-hook failures
     * fail the owning runtime without re-entering error hooks; finalizers still run.
     */
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
    /**
     * Register recovery for a failure thrown by the execution body.
     *
     * @param hook - Callback receiving the current Error, the input tuple after input hooks,
     * and this.context(). Return an output to recover or an Error to continue failure.
     * @returns A new builder with error registered, preserving the previous builder.
     * @throws TypeError unless exactly one callable hook is supplied. A thrown/rejected
     * error-hook failure ends recovery; finalizers still run. Sync builders reject thenables during execution.
     */
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
    /**
     * Check whether this plugin has a callable lifecycle hook.
     *
     * @param capability - One of input, output, error or finally.
     * @returns True when the corresponding hook is present and callable.
     * @remarks Built-in descriptors do not run hooks or intentionally throw. Custom structural
     * implementations may throw; this check does not validate a hook's result or behavior.
     */
    supports(capability: PluginCapability): boolean;
    /**
     * Check whether this plugin applies to the supplied execution identity.
     *
     * @param stepId - Step or pipeline identity being considered for routing.
     * @returns True if the plugin is untargeted or its configured target equals this ID.
     * @remarks Built-in descriptors use exact comparison without intentionally throwing;
     * custom structural implementations may throw. Pipelines route untargeted plugins to the outer pipeline.
     */
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
  & ("finally" extends Keys
    ? { finally: Sync extends true ? SyncPluginFinallyHook : PluginFinallyHook }
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
    : Record<never, never>)
  & ("finally" extends keyof Definition ? { finally: PluginFinallyHook }
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
    /**
     * Check whether this plugin has a callable lifecycle hook.
     *
     * @param capability - One of input, output, error or finally.
     * @returns True when the corresponding hook is present and callable.
     * @remarks Built-in descriptors do not run hooks or intentionally throw. Custom structural
     * implementations may throw; this check does not validate a hook's result or behavior.
     */
    supports(capability: PluginCapability): boolean;
    /**
     * Check whether this plugin applies to the supplied execution identity.
     *
     * @param stepId - Step or pipeline identity being considered for routing.
     * @returns True if the plugin is untargeted or its configured target equals this ID.
     * @remarks Built-in descriptors use exact comparison without intentionally throwing;
     * custom structural implementations may throw. Pipelines route untargeted plugins to the outer pipeline.
     */
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
    /**
     * Check whether this plugin has a callable lifecycle hook.
     *
     * @param capability - One of input, output, error or finally.
     * @returns True when the corresponding hook is present and callable.
     * @remarks Built-in descriptors do not run hooks or intentionally throw. Custom structural
     * implementations may throw; this check does not validate a hook's result or behavior.
     */
    supports(capability: PluginCapability): boolean;
    /**
     * Check whether this plugin applies to the supplied execution identity.
     *
     * @param stepId - Step or pipeline identity being considered for routing.
     * @returns True if the plugin is untargeted or its configured target equals this ID.
     * @remarks Built-in descriptors use exact comparison without intentionally throwing;
     * custom structural implementations may throw. Pipelines route untargeted plugins to the outer pipeline.
     */
    targets(stepId: string): boolean;
  }
  & ThisType<PluginThis<Shared>>
  & { finally?: PluginFinallyHook }
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
    | {
      input?: PluginInputHook<I>;
      output?: PluginOutputHook<I, O>;
      error?: PluginErrorHook<I, O, E>;
      finally: PluginFinallyHook;
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
    /**
     * Check whether this plugin has a callable lifecycle hook.
     *
     * @param capability - One of input, output, error or finally.
     * @returns True when the corresponding hook is present and callable.
     * @remarks Built-in descriptors do not run hooks or intentionally throw. Custom structural
     * implementations may throw; this check does not validate a hook's result or behavior.
     */
    supports(capability: PluginCapability): boolean;
    /**
     * Check whether this plugin applies to the supplied execution identity.
     *
     * @param stepId - Step or pipeline identity being considered for routing.
     * @returns True if the plugin is untargeted or its configured target equals this ID.
     * @remarks Built-in descriptors use exact comparison without intentionally throwing;
     * custom structural implementations may throw. Pipelines route untargeted plugins to the outer pipeline.
     */
    targets(stepId: string): boolean;
  }
  & ThisType<PluginThis<Shared>>
  & { finally?: SyncPluginFinallyHook }
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
    | {
      input?: SyncPluginInputHook<I>;
      output?: SyncPluginOutputHook<I, O>;
      error?: SyncPluginErrorHook<I, O, E>;
      finally: SyncPluginFinallyHook;
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
    /**
     * Check whether this plugin has a callable lifecycle hook.
     *
     * @param capability - One of input, output, error or finally.
     * @returns True when the corresponding hook is present and callable.
     * @remarks Built-in descriptors do not run hooks or intentionally throw. Custom structural
     * implementations may throw; this check does not validate a hook's result or behavior.
     */
    supports(capability: PluginCapability): boolean;
    /**
     * Check whether this plugin applies to the supplied execution identity.
     *
     * @param stepId - Step or pipeline identity being considered for routing.
     * @returns True if the plugin is untargeted or its configured target equals this ID.
     * @remarks Built-in descriptors use exact comparison without intentionally throwing;
     * custom structural implementations may throw. Pipelines route untargeted plugins to the outer pipeline.
     */
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
    : Record<never, never>)
  & ("finally" extends keyof Definition ? { finally: SyncPluginFinallyHook }
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
  & SyncFinallyConstraint<Definition>
  & SyncPluginDefinition<
    InferPluginArgs<Definition>,
    InferPluginOutput<Definition>,
    InferPluginErrorType<Definition>,
    Shared
  >;

/**
 * Type-only identity distinguishing an unset fluent contract from unknown.
 *
 * This declaration is used by builder inference and is re-exported only as a type
 * from the package entrypoint. It has no runtime value to read, call or instantiate;
 * use the plugin factory to construct executable plugin descriptors.
 */
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
 * Materialize a plugin under an explicitly bound input/output/error contract.
 *
 * @param definition - At least one callable lifecycle hook with the bound context type.
 * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
 * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
 * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
 * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
 */
export type TypedPluginFactory<
  I extends PluginArgs,
  O,
  E extends Error,
  Shared extends ContextValues = ContextValues,
> = {
  /**
   * Materialize a plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <Definition extends PluginDefinition<I, O, E, Shared>>(
    definition: Definition & ThisType<PluginThis<Shared>>,
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<string, undefined>;
  /**
   * Materialize a plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <Definition extends PluginDefinition<I, O, E, Shared>, Id extends string>(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { id: Id; target?: undefined },
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<Id, undefined>;
  /**
   * Materialize a plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <Definition extends PluginDefinition<I, O, E, Shared>, Target extends string>(
    definition: Definition & ThisType<PluginThis<Shared>>,
    options: { target: Target; id?: undefined },
  ):
    & Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<string, Target>;
  /**
   * Materialize a plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
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
 * Materialize a synchronous plugin under an explicitly bound input/output/error contract.
 *
 * @param definition - At least one callable lifecycle hook with the bound context type.
 * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
 * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
 * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
 * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
 */
export type SyncTypedPluginFactory<
  I extends PluginArgs,
  O,
  E extends Error,
  Shared extends ContextValues = ContextValues,
> = {
  /**
   * Materialize a synchronous plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <Definition extends SyncPluginDefinition<I, O, E, Shared>>(
    definition:
      & Definition
      & SyncFinallyConstraint<Definition>
      & ThisType<PluginThis<Shared>>,
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<string, undefined>;
  /**
   * Materialize a synchronous plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <Definition extends SyncPluginDefinition<I, O, E, Shared>, Id extends string>(
    definition:
      & Definition
      & SyncFinallyConstraint<Definition>
      & ThisType<PluginThis<Shared>>,
    options: { id: Id; target?: undefined },
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined>
    & PluginIdentity<Id, undefined>;
  /**
   * Materialize a synchronous plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Target extends string,
  >(
    definition:
      & Definition
      & SyncFinallyConstraint<Definition>
      & ThisType<PluginThis<Shared>>,
    options: { target: Target; id?: undefined },
  ):
    & SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target>
    & PluginIdentity<string, Target>;
  /**
   * Materialize a synchronous plugin under an explicitly bound input/output/error contract.
   *
   * @param definition - At least one callable lifecycle hook with the bound context type.
   * @param options - Optional stable ID and/or target; omitted IDs become random UUIDs.
   * @returns A frozen descriptor retaining the supplied hook functions and inferred literal identity.
   * @throws ConveeError with `PLG_001` for an empty definition or non-callable hook;
   * exceptions raised by definition or option accessors propagate. Hooks run only during execution.
   */
  <
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Id extends string,
    Target extends string,
  >(
    definition:
      & Definition
      & SyncFinallyConstraint<Definition>
      & ThisType<PluginThis<Shared>>,
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
  /**
   * Start a synchronous fluent builder with a fixed shared-context type.
   *
   * @param options - Optional stable ID and target; the ID defaults to a random UUID.
   * @returns An empty builder whose onInput/onOutput/onError/onFinally methods register hooks.
   * @throws Exceptions from metadata property access propagate. An empty builder has no
   * runtime descriptor until a hook is registered; registration validates its callable argument.
   */
  <
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(options?: {
    id?: Id;
    target?: Target;
  }): FluentMembers<never, never, never, Shared, Target, never, true, Id>;
  /**
   * Bind the execution input/output/error types while retaining this context type.
   *
   * @typeParam I - Execution argument tuple.
   * @typeParam O - Successful or recovered output.
   * @typeParam E - Error subtype accepted by error hooks.
   * @returns A synchronous typed factory accepting an explicit hook definition and metadata.
   * @remarks Takes no runtime arguments and does not intentionally throw. The returned
   * factory validates definitions with `PLG_001`; see TypedPluginFactory or SyncTypedPluginFactory.
   */
  for: <
    I extends PluginArgs,
    O,
    E extends Error = Error,
  >() => SyncTypedPluginFactory<I, O, E, Shared>;
  hasInput: typeof import("@/plugin/guards.ts").hasInput;
  hasOutput: typeof import("@/plugin/guards.ts").hasOutput;
  hasError: typeof import("@/plugin/guards.ts").hasError;
  hasFinally: typeof import("@/plugin/guards.ts").hasFinally;
};

/**
 * Public plugin factory type for a known execution context shape.
 */
export type ContextualPluginFactory<
  Shared extends ContextValues = ContextValues,
> = {
  /**
   * Start a fluent builder with a fixed shared-context type.
   *
   * @param options - Optional stable ID and target; the ID defaults to a random UUID.
   * @returns An empty builder whose onInput/onOutput/onError/onFinally methods register hooks.
   * @throws Exceptions from metadata property access propagate. An empty builder has no
   * runtime descriptor until a hook is registered; registration validates its callable argument.
   */
  <
    Id extends string = string,
    Target extends string | undefined = undefined,
  >(options?: {
    id?: Id;
    target?: Target;
  }): FluentPluginStart<Shared, Id, Target>;
  /**
   * Bind the execution input/output/error types while retaining this context type.
   *
   * @typeParam I - Execution argument tuple.
   * @typeParam O - Successful or recovered output.
   * @typeParam E - Error subtype accepted by error hooks.
   * @returns A typed factory accepting an explicit hook definition and metadata.
   * @remarks Takes no runtime arguments and does not intentionally throw. The returned
   * factory validates definitions with `PLG_001`; see TypedPluginFactory or SyncTypedPluginFactory.
   */
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
  hasFinally: typeof import("@/plugin/guards.ts").hasFinally;
};

/**
 * Public synchronous plugin factory type.
 */
export type PluginSyncFactory = ContextualPluginSyncFactory & {
  /**
   * Bind shared-state types for a synchronous plugin builder and its typed factories.
   *
   * @typeParam Shared - Keys and value types of this.context().state inside hooks.
   * @returns A contextual plugin factory; this operation does not create shared state or run hooks.
   * @remarks Takes no runtime arguments, performs no runtime validation and does not intentionally throw.
   */
  withContext<
    Shared extends ContextValues,
  >(): ContextualPluginSyncFactory<Shared>;
};

/**
 * Public plugin factory type, including attached helper APIs.
 */
export type PluginFactory = ContextualPluginFactory & {
  sync: PluginSyncFactory;
  /**
   * Bind shared-state types for a plugin builder and its typed factories.
   *
   * @typeParam Shared - Keys and value types of this.context().state inside hooks.
   * @returns A contextual plugin factory; this operation does not create shared state or run hooks.
   * @remarks Takes no runtime arguments, performs no runtime validation and does not intentionally throw.
   */
  withContext<Shared extends ContextValues>(): ContextualPluginFactory<Shared>;
};
