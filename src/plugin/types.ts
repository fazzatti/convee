import type { ContextValues, PluginThis } from "@/context/types.ts";
import type { Args, MaybePromise, RequireAtLeastOne } from "@/core/types.ts";

/** Raw argument tuple handled by plugin input hooks. */
export type PluginArgs = Args;

export type CompactPluginArgs<I extends PluginArgs> = I extends []
  ? void
  : I extends [infer Value]
    ? Value
    : I;

type NormalizePublicPluginArgs<I> = [I] extends [never]
  ? never
  : [I] extends [void]
    ? []
    : I extends PluginArgs
      ? I
      : [I];

/**
 * Natural return shape for an input hook.
 *
 * - no args: keep returning `[]`
 * - one arg: allow either the bare value or `[value]`
 * - many args: require the full tuple
 */
export type PluginInputResult<I extends PluginArgs> = I extends []
  ? []
  : I extends [infer Value]
    ? Value | I
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
export type PluginOutputHook<I extends PluginArgs, O> = (
  output: O,
) => MaybePromise<O>;

/**
 * Synchronous output hook used by `plugin.sync(...)`.
 */
export type SyncPluginOutputHook<I extends PluginArgs, O> = (output: O) => O;

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

type HasDefinitionHooks<Definition extends object> = [
  keyof Definition,
] extends [never]
  ? false
  : true;

type HasExplicitPluginDefinition<Definition extends object> = [
  keyof {
    [K in keyof Definition as Definition[K] extends (
      ...args: unknown[]
    ) => unknown
      ? K
      : never]: Definition[K];
  },
] extends [never]
  ? false
  : true;

type HasRegisteredPluginHooks<I, O, E> = [I] extends [never]
  ? [O] extends [never]
    ? [E] extends [never]
      ? false
      : true
    : true
  : true;

type HasPluginRuntimeState<I, O, E, Definition extends object> =
  HasDefinitionHooks<Definition> extends true
    ? true
    : HasRegisteredPluginHooks<I, O, E>;

type DefinitionPluginRuntimeMembers<
  I,
  O,
  E extends Error,
  Definition extends object,
> = ("input" extends keyof Definition
  ? { input: PluginInputHook<NormalizePublicPluginArgs<I>> }
  : Record<never, never>) &
  ("output" extends keyof Definition
    ? { output: PluginOutputHook<NormalizePublicPluginArgs<I>, O> }
    : Record<never, never>) &
  ("error" extends keyof Definition
    ? { error: PluginErrorHook<NormalizePublicPluginArgs<I>, O, E> }
    : Record<never, never>);

type PublicPluginRuntimeMembers<
  I,
  O,
  E extends Error,
  Definition extends object,
> =
  HasDefinitionHooks<Definition> extends true
    ? DefinitionPluginRuntimeMembers<I, O, E, Definition>
    : PublicBuilderDefinition<I, O, E>;

type PublicPluginBaseMembers<
  I,
  O,
  E extends Error,
  Definition extends object,
  Target extends string | undefined,
> =
  HasPluginRuntimeState<I, O, E, Definition> extends true
    ? {
        readonly id: string;
        readonly target: Target;
        supports(capability: PluginCapability): boolean;
        targets(stepId: string): boolean;
      }
    : Record<never, never>;

type PublicPluginFluentMembers<
  I,
  O,
  E extends Error,
  Shared extends ContextValues,
  Target extends string | undefined,
  Definition extends object,
> =
  HasExplicitPluginDefinition<Definition> extends true
    ? Record<never, never>
    : ([I] extends [never]
        ? {
            onInput: {
              <NextI extends PluginArgs>(
                hook: PluginInputHook<NextI>,
              ): Plugin<
                CompactPluginArgs<NextI>,
                O,
                E,
                BuilderDefinitionWithHook<Definition, "input">,
                Shared,
                Target
              >;
              (...args: unknown[]): unknown;
            };
          }
        : Record<never, never>) &
        ([O] extends [never]
          ? {
              onOutput: {
                <NextO>(
                  hook: (output: NextO) => MaybePromise<NextO>,
                ): Plugin<
                  [I] extends [never] ? never : I,
                  NormalizeBuilderOutput<
                    MergeBuilderOutput<PublicBuilderOutput<O>, NextO>
                  >,
                  E,
                  BuilderDefinitionWithHook<Definition, "output">,
                  Shared,
                  Target
                >;
                (output: unknown): unknown;
              };
            }
          : Record<never, never>) &
        ([E] extends [never]
          ? {
              onError: {
                <NextE extends Error, Result>(
                  hook: (error: NextE) => MaybePromise<Result>,
                ): Plugin<
                  [I] extends [never] ? never : I,
                  [Exclude<Awaited<Result>, NextE>] extends [never]
                    ? [PublicBuilderOutput<O>] extends [PluginBuilderUnset]
                      ? never
                      : NormalizeBuilderOutput<PublicBuilderOutput<O>>
                    : NormalizeBuilderOutput<
                        MergeBuilderOutput<
                          PublicBuilderOutput<O>,
                          Exclude<Awaited<Result>, NextE>
                        >
                      >,
                  NextE,
                  BuilderDefinitionWithHook<Definition, "error">,
                  Shared,
                  Target
                >;
                <
                  NextI extends NormalizeBuilderArgs<PublicBuilderArgs<I>>,
                  NextE extends Error,
                  Result,
                >(
                  hook: (error: NextE, input: NextI) => MaybePromise<Result>,
                ): Plugin<
                  CompactBuilderArgs<
                    MergeBuilderArgs<PublicBuilderArgs<I>, NextI>
                  >,
                  [Exclude<Awaited<Result>, NextE>] extends [never]
                    ? [PublicBuilderOutput<O>] extends [PluginBuilderUnset]
                      ? never
                      : NormalizeBuilderOutput<PublicBuilderOutput<O>>
                    : NormalizeBuilderOutput<
                        MergeBuilderOutput<
                          PublicBuilderOutput<O>,
                          Exclude<Awaited<Result>, NextE>
                        >
                      >,
                  MergeBuilderError<PublicBuilderError<E>, NextE>,
                  BuilderDefinitionWithHook<Definition, "error">,
                  Shared,
                  Target
                >;
                (error: Error, input: unknown): unknown;
                (error: Error): unknown;
              };
            }
          : Record<never, never>);

/** Public runtime contract returned by async plugin builders. */
export type Plugin<
  I = PluginArgs,
  O = unknown,
  E extends Error = Error,
  Definition extends object = Record<never, never>,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = Record<never, never> &
  PublicPluginBaseMembers<I, O, E, Definition, Target> &
  PublicPluginRuntimeMembers<I, O, E, Definition> &
  PublicPluginFluentMembers<I, O, E, Shared, Target, Definition>;

/** Structural async plugin type accepted by steps and pipes. */
export type AnyPlugin<
  I extends PluginArgs,
  O,
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Target extends string | undefined = string | undefined,
> = {
  readonly id: string;
  readonly target: Target;
  supports(capability: PluginCapability): boolean;
  targets(stepId: string): boolean;
} & ThisType<PluginThis<Shared>> &
  (
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
> = {
  readonly id: string;
  readonly target: Target;
  supports(capability: PluginCapability): boolean;
  targets(stepId: string): boolean;
} & ThisType<PluginThis<Shared>> &
  (
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
> = {
  readonly id: string;
  readonly target: Target;
  supports(capability: PluginCapability): boolean;
  targets(stepId: string): boolean;
} & ("input" extends keyof Definition
  ? { input: SyncPluginInputHook<NormalizePublicPluginArgs<I>> }
  : Record<never, never>) &
  ("output" extends keyof Definition
    ? { output: SyncPluginOutputHook<NormalizePublicPluginArgs<I>, O> }
    : Record<never, never>) &
  ("error" extends keyof Definition
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

type InferInputHookArgs<Definition> = Definition extends {
  input: (...args: infer I) => unknown;
}
  ? I extends PluginArgs
    ? I
    : PluginArgs
  : never;

type InferOutputHookArgs<Definition> = Definition extends {
  output: (...args: infer A) => unknown;
}
  ? never
  : never;

type InferErrorHookArgs<Definition> = Definition extends {
  error: (...args: infer A) => unknown;
}
  ? A extends [unknown, infer I]
    ? I extends PluginArgs
      ? I
      : PluginArgs
    : PluginArgs
  : never;

export type InferPluginArgs<Definition> = [
  InferInputHookArgs<Definition>,
] extends [never]
  ? [InferOutputHookArgs<Definition>] extends [never]
    ? [InferErrorHookArgs<Definition>] extends [never]
      ? PluginArgs
      : InferErrorHookArgs<Definition>
    : InferOutputHookArgs<Definition>
  : InferInputHookArgs<Definition>;

type InferOutputHookValue<Definition> = Definition extends {
  output: (...args: infer A) => infer R;
}
  ? A extends [infer O, ...unknown[]]
    ? O
    : Awaited<R>
  : never;

export type InferPluginErrorType<Definition> = Definition extends {
  error: (...args: infer A) => unknown;
}
  ? A extends [infer E, ...unknown[]]
    ? E extends Error
      ? E
      : Error
    : Error
  : Error;

type InferErrorHookRecoveredValue<Definition> = Definition extends {
  error: (...args: unknown[]) => infer R;
}
  ? Exclude<Awaited<R>, InferPluginErrorType<Definition>>
  : never;

export type InferPluginOutput<Definition> = [
  InferOutputHookValue<Definition>,
] extends [never]
  ? [InferErrorHookRecoveredValue<Definition>] extends [never]
    ? unknown
    : InferErrorHookRecoveredValue<Definition>
  : InferOutputHookValue<Definition>;

export type InferredPluginDefinition<
  Definition,
  Shared extends ContextValues = ContextValues,
> = Definition &
  PluginDefinition<
    InferPluginArgs<Definition>,
    InferPluginOutput<Definition>,
    InferPluginErrorType<Definition>,
    Shared
  >;

export type InferredSyncPluginDefinition<
  Definition,
  Shared extends ContextValues = ContextValues,
> = Definition &
  SyncPluginDefinition<
    InferPluginArgs<Definition>,
    InferPluginOutput<Definition>,
    InferPluginErrorType<Definition>,
    Shared
  >;

type RuntimeDefinitionFromRaw<
  Definition,
  I extends PluginArgs,
  O,
  E extends Error,
  Shared extends ContextValues,
> = ("input" extends keyof Definition
  ? { input: PluginInputHook<I> }
  : Record<never, never>) &
  ("output" extends keyof Definition
    ? { output: PluginOutputHook<I, O> }
    : Record<never, never>) &
  ("error" extends keyof Definition
    ? { error: PluginErrorHook<I, O, E> }
    : Record<never, never>) &
  ThisType<PluginThis<Shared>>;

type RuntimeSyncDefinitionFromRaw<
  Definition,
  I extends PluginArgs,
  O,
  E extends Error,
  Shared extends ContextValues,
> = ("input" extends keyof Definition
  ? { input: SyncPluginInputHook<I> }
  : Record<never, never>) &
  ("output" extends keyof Definition
    ? { output: SyncPluginOutputHook<I, O> }
    : Record<never, never>) &
  ("error" extends keyof Definition
    ? { error: SyncPluginErrorHook<I, O, E> }
    : Record<never, never>) &
  ThisType<PluginThis<Shared>>;

type HookArgs<Hook extends (...args: never[]) => unknown> = Parameters<Hook>;

type OutputHookOutput<Hook extends (...args: never[]) => unknown> =
  HookArgs<Hook> extends [infer O, ...unknown[]]
    ? O
    : Awaited<ReturnType<Hook>>;

type ErrorHookInputArgs<Hook extends (...args: never[]) => unknown> =
  HookArgs<Hook> extends [unknown, infer I]
    ? I extends PluginArgs
      ? I
      : PluginArgs
    : PluginArgs;

type ErrorHookError<Hook extends (...args: never[]) => unknown> =
  HookArgs<Hook> extends [infer E, ...unknown[]]
    ? E extends Error
      ? E
      : Error
    : Error;

type ErrorHookRecoveredOutput<Hook extends (...args: never[]) => unknown> =
  Exclude<Awaited<ReturnType<Hook>>, ErrorHookError<Hook>> extends never
    ? unknown
    : Exclude<Awaited<ReturnType<Hook>>, ErrorHookError<Hook>>;

type RawPluginDefinition<Shared extends ContextValues = ContextValues> =
  RequireAtLeastOne<{
    input?: (...args: never[]) => unknown;
    output?: (...args: never[]) => unknown;
    error?: (...args: never[]) => unknown;
  }> &
    ThisType<PluginThis<Shared>>;

declare const PLUGIN_BUILDER_UNSET: unique symbol;

type PluginBuilderUnset = typeof PLUGIN_BUILDER_UNSET;
type BuilderArgsState = PluginArgs | PluginBuilderUnset;
type BuilderOutputState = unknown | PluginBuilderUnset;
type BuilderErrorState = Error | PluginBuilderUnset;
type BuilderHookName = "input" | "output" | "error";
type BuilderDefinitionWithHook<
  Definition extends object,
  Hook extends BuilderHookName,
> = Omit<Definition, Hook> & Record<Hook, true>;

type NormalizeBuilderArgs<I> = [I] extends [PluginBuilderUnset]
  ? PluginArgs
  : I extends PluginArgs
    ? I
    : PluginArgs;
type NormalizeBuilderOutput<O> = [O] extends [PluginBuilderUnset] ? unknown : O;
type NormalizeBuilderError<E> = [E] extends [PluginBuilderUnset]
  ? Error
  : E extends Error
    ? E
    : Error;

type MergeBuilderState<Current, Next> = [Next] extends [PluginBuilderUnset]
  ? Current
  : [Current] extends [PluginBuilderUnset]
    ? Next
    : [Current] extends [Next]
      ? [Next] extends [Current]
        ? Current
        : never
      : never;

type MergeBuilderArgs<
  Current extends BuilderArgsState,
  Next,
> = Next extends PluginArgs ? MergeBuilderState<Current, Next> : never;
type MergeBuilderOutput<Current, Next> = [Next] extends [PluginBuilderUnset]
  ? Current
  : MergeBuilderState<Current, Next>;
type MergeBuilderError<
  Current extends BuilderErrorState,
  Next,
> = Next extends Error ? MergeBuilderState<Current, Next> : never;

type ValidateBuilderHook<Hook, Expected> = [Expected] extends [never]
  ? never
  : Hook & Expected;

type BuilderInputArgs<Hook> = Hook extends (...args: infer I) => unknown
  ? I extends PluginArgs
    ? I
    : never
  : never;
type BuilderOutputValue<Hook> = Hook extends (
  output: infer O,
  ...args: unknown[]
) => unknown
  ? O
  : never;
type BuilderErrorType<Hook> = Hook extends (
  error: infer E,
  ...args: unknown[]
) => unknown
  ? E extends Error
    ? E
    : Error
  : Error;
type BuilderErrorArgs<Hook> = Hook extends (
  error: Error,
  input: infer I,
  ...args: unknown[]
) => unknown
  ? I extends PluginArgs
    ? I
    : PluginBuilderUnset
  : PluginBuilderUnset;
type BuilderErrorOutput<Hook extends (...args: unknown[]) => unknown> =
  Exclude<Awaited<ReturnType<Hook>>, BuilderErrorType<Hook>> extends never
    ? PluginBuilderUnset
    : Exclude<Awaited<ReturnType<Hook>>, BuilderErrorType<Hook>>;

type PublicBuilderArgs<I> = [I] extends [never]
  ? PluginBuilderUnset
  : NormalizePublicPluginArgs<I>;
type PublicBuilderOutput<O> = [O] extends [never] ? PluginBuilderUnset : O;
type PublicBuilderError<E> = [E] extends [never]
  ? PluginBuilderUnset
  : E extends Error
    ? E
    : PluginBuilderUnset;

type PublicBuilderDefinition<I, O, E> = ([I] extends [never]
  ? Record<never, never>
  : { input: PluginInputHook<NormalizePublicPluginArgs<I>> }) &
  ([O] extends [never]
    ? Record<never, never>
    : {
        output: PluginOutputHook<NormalizeBuilderArgs<PublicBuilderArgs<I>>, O>;
      }) &
  ([E] extends [never]
    ? Record<never, never>
    : E extends Error
      ? {
          error: PluginErrorHook<
            NormalizeBuilderArgs<PublicBuilderArgs<I>>,
            NormalizeBuilderOutput<PublicBuilderOutput<O>>,
            E
          >;
        }
      : Record<never, never>);

type PublicMissingHooks<I, O, E> =
  | ([I] extends [never] ? "input" : never)
  | ([O] extends [never] ? "output" : never)
  | ([E] extends [never] ? "error" : never);

type CompactBuilderArgs<I extends BuilderArgsState> = [I] extends [
  PluginBuilderUnset,
]
  ? never
  : CompactPluginArgs<NormalizeBuilderArgs<I>>;

/** Fluent plugin builder state returned by `plugin()` before hooks are added. */
export type PluginBuilder<
  I = never,
  O = never,
  E extends Error | never = never,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
  Target extends string | undefined = undefined,
> = Plugin<I, O, E, Record<never, never>, Shared, Target>;

export type PluginState<
  I = never,
  O = never,
  E extends Error | never = never,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
  Target extends string | undefined = undefined,
> = Plugin<I, O, E, Record<never, never>, Shared, Target>;

export type FluentPluginStart<
  Shared extends ContextValues,
  Id extends string = string,
  Target extends string | undefined = undefined,
> = Plugin<never, never, never, Record<never, never>, Shared, Target>;

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
    definition: Definition,
  ): Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined> &
    PluginIdentity<string, undefined>;
  <Definition extends PluginDefinition<I, O, E, Shared>, Id extends string>(
    definition: Definition,
    options: { id: Id; target?: undefined },
  ): Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined> &
    PluginIdentity<Id, undefined>;
  <Definition extends PluginDefinition<I, O, E, Shared>, Target extends string>(
    definition: Definition,
    options: { target: Target; id?: undefined },
  ): Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
    PluginIdentity<string, Target>;
  <
    Definition extends PluginDefinition<I, O, E, Shared>,
    Id extends string,
    Target extends string,
  >(
    definition: Definition,
    options: { id: Id; target: Target },
  ): Plugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
    PluginIdentity<Id, Target>;
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
    definition: Definition,
  ): SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined> &
    PluginIdentity<string, undefined>;
  <Definition extends SyncPluginDefinition<I, O, E, Shared>, Id extends string>(
    definition: Definition,
    options: { id: Id; target?: undefined },
  ): SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, undefined> &
    PluginIdentity<Id, undefined>;
  <
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Target extends string,
  >(
    definition: Definition,
    options: { target: Target; id?: undefined },
  ): SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
    PluginIdentity<string, Target>;
  <
    Definition extends SyncPluginDefinition<I, O, E, Shared>,
    Id extends string,
    Target extends string,
  >(
    definition: Definition,
    options: { id: Id; target: Target },
  ): SyncPlugin<CompactPluginArgs<I>, O, E, Definition, Shared, Target> &
    PluginIdentity<Id, Target>;
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
  }): FluentPluginStart<Shared, Id, Target>;
  for: <
    I extends PluginArgs,
    O,
    E extends Error = Error,
  >() => SyncTypedPluginFactory<I, O, E, Shared>;
  hasInput: unknown;
  hasOutput: unknown;
  hasError: unknown;
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
  PluginEngine: unknown;
  hasInput: unknown;
  hasOutput: unknown;
  hasError: unknown;
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
