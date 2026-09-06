import type { ContextValues, RunContextOptions } from "@/context/types.ts";
import type { MaybePromise, UnionToIntersection } from "@/core/types.ts";
import type { AnyPlugin, AnySyncPlugin } from "@/plugin/types.ts";
import type {
  NonPromise,
  StepArgs,
  StepFromFunction,
  StepIdentity,
  SyncStepFromFunction,
} from "@/step/types.ts";

/** Raw argument tuple accepted by the first step in a pipe. */
export type PipeArgs = StepArgs;

/** Structural contract for a step-like runtime that can participate in a pipe. */
export type PipeCompatibleStep<
  I extends PipeArgs = PipeArgs,
  O = unknown,
  Shared extends ContextValues = ContextValues,
> = {
  readonly id: string;
  readonly isSync: boolean;
  runWith(
    options: {
      context?: RunContextOptions<Shared>;
      plugins?: readonly unknown[];
    },
    ...args: I
  ): MaybePromise<O>;
};

/** Structural contract for a sync step-like runtime that can participate in a sync pipe. */
export type SyncPipeCompatibleStep<
  I extends PipeArgs = PipeArgs,
  O = unknown,
  Shared extends ContextValues = ContextValues,
> = {
  readonly id: string;
  readonly isSync: true;
  runWith(
    options: {
      context?: RunContextOptions<Shared>;
      plugins?: readonly unknown[];
    },
    ...args: I
  ): NonPromise<O>;
};

/** Erased structural child interface used for runtime composition. */
export type AnyPipeStep = PipeCompatibleStep<PipeArgs, unknown>;
/** Erased synchronous structural child interface used for composition. */
export type AnySyncPipeStep = SyncPipeCompatibleStep<PipeArgs, unknown>;

/** Excludes runtime descriptors from automatic raw-function wrapping. */
export type BarePipeFunction = {
  id?: never;
  isSync?: never;
  runWith?: never;
};

/** Unwrapped function accepted as an asynchronous pipeline child. */
export type RawPipeFn = ((...args: never[]) => unknown) & BarePipeFunction;
/** Raw function candidate checked for synchronous results by the factory. */
export type RawSyncPipeFn = ((...args: never[]) => unknown) & BarePipeFunction;

/** A structural runtime or raw callback accepted by pipe construction. */
export type PipeInputStep = AnyPipeStep | RawPipeFn;

/** A synchronous runtime or raw callback accepted by sync construction. */
export type SyncPipeInputStep = AnySyncPipeStep | RawSyncPipeFn;

/** Shallow typed view of a nested pipe, preventing recursive graph types from growing without bound. */
export type NestedStepView<Value> = Value extends
  { id: infer Id extends string; isSync: infer Sync extends boolean } ?
    & (Sync extends true
      ? SyncPipeCompatibleStep<PipeStepArgs<Value>, PipeStepOutput<Value>>
      : PipeCompatibleStep<PipeStepArgs<Value>, PipeStepOutput<Value>>)
    & { readonly id: Id; readonly isSync: Sync }
  : never;

/** Wraps raw callback types and projects nested pipes to their invocation interface. */
export type NormalizePipeStep<StepValue> = StepValue extends
  { readonly steps: readonly unknown[] } ? NestedStepView<StepValue>
  : StepValue extends { readonly isSync: boolean } ? StepValue
  : StepValue extends RawPipeFn ? StepFromFunction<StepValue>
  : never;

/** Normalizes a synchronous child while preserving its argument and result types. */
export type NormalizeSyncPipeStep<StepValue> = StepValue extends
  { readonly steps: readonly unknown[] } ? NestedStepView<StepValue>
  : StepValue extends { readonly isSync: true } ? StepValue
  : StepValue extends RawSyncPipeFn ? SyncStepFromFunction<StepValue>
  : never;

/** Normalizes each child in a pipeline tuple without losing tuple positions. */
export type NormalizePipeSteps<Steps extends readonly unknown[]> = {
  [Index in keyof Steps]: NormalizePipeStep<Steps[Index]>;
};

/** Normalizes each synchronous child in a pipeline tuple. */
export type NormalizeSyncPipeSteps<Steps extends readonly unknown[]> = {
  [Index in keyof Steps]: NormalizeSyncPipeStep<Steps[Index]>;
};

/** Extracts a callback or structural runtime's exact invocation argument tuple. */
export type PipeStepArgs<Step> = Step extends (...args: infer Input) => unknown
  ? Input
  : Step extends {
    runWith(options: unknown, ...args: infer Args): unknown;
  } ? Args
  : never;

/** Extracts the resolved result of a callback or structural runtime. */
export type PipeStepOutput<Step> = Step extends
  (...args: never[]) => infer Output ? Awaited<Output>
  : Step extends {
    runWith(options: unknown, ...args: never[]): infer Output;
  } ? Awaited<Output>
  : never;

/** Spreads array outputs into the next child's arguments and wraps scalar outputs. */
export type NormalizePipeOutput<Output> = Output extends readonly unknown[]
  ? [...Output]
  : [Output];

/** Checks whether one child's output can supply the next child's argument tuple. */
export type IsPipeLinkValid<Previous, Next> = [
  NormalizePipeOutput<PipeStepOutput<Previous>>,
] extends [PipeStepArgs<Next>] ? true
  : false;

/** Tail-recursively verifies all adjacent pipeline links. */
export type ValidLinks<Steps extends readonly unknown[]> = Steps extends
  readonly [infer First, infer Second, ...infer Rest]
  ? IsPipeLinkValid<First, Second> extends true
    ? ValidLinks<readonly [Second, ...Rest]>
  : false
  : true;

/** Checks each child's return type for asynchronous results. */
export type AllSync<Steps extends readonly unknown[]> = Steps extends
  readonly [infer First, ...infer Rest]
  ? First extends (...args: never[]) => infer Output
    ? Extract<Output, PromiseLike<unknown>> extends never ? AllSync<Rest>
    : false
  : First extends { isSync: true; runWith(...args: never[]): infer Output }
    ? Extract<Output, PromiseLike<unknown>> extends never ? AllSync<Rest>
    : false
  : false
  : true;

/** Retains a compatible tuple or produces never for an invalid link. */
export type ValidatePipeSteps<
  Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
> = ValidLinks<Steps> extends true ? Steps : never;

/** Retains a compatible synchronous tuple or rejects asynchronous or invalid links. */
export type ValidateSyncPipeSteps<
  Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
> = AllSync<Steps> extends true ? ValidLinks<Steps> extends true ? Steps : never
  : never;

/** Input tuple accepted by a normalized pipe. */
export type PipeInput<Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]]> =
  PipeStepArgs<Steps[0]>;

/** Extracts the final element of a nonempty pipeline tuple. */
export type LastPipeStep<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
> = Steps extends readonly [...infer _, infer Last] ? Last
  : never;

/** Final resolved output produced by a normalized pipe. */
export type PipeResult<Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]]> =
  PipeStepOutput<LastPipeStep<Steps>>;

/** Shared context shape inferred from every step in the pipe. */
export type PipeContext<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
> = UnionToIntersection<
  Steps[number] extends {
    runWith(
      options: { context?: RunContextOptions<infer Shared> },
      ...args: never[]
    ): unknown;
  } ? Shared
    : ContextValues
> extends infer Shared extends ContextValues ? Shared
  : ContextValues;

/** Retains known string identities and excludes a widened string type. */
export type LiteralString<Value> = Value extends string
  ? string extends Value ? never
  : Value
  : never;

/** Extracts statically known identities of a pipeline's direct children. */
export type PipeStepTargetIds<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
> = Steps[number]["id"];

/** Valid literal targets for plugins attached to a pipe. */
export type PipeTargetIds<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  Id extends string,
> = LiteralString<Id> | PipeStepTargetIds<Steps>;

/** Extracts the shared state accepted by a structural child's runWith method. */
export type PipeStepContext<Step extends AnyPipeStep> = Step extends {
  runWith(
    options: {
      context?: RunContextOptions<infer Shared>;
      plugins?: readonly unknown[];
    },
    ...args: never[]
  ): unknown;
} ? Shared
  : ContextValues;

/** Plugin contract for a single targeted inner step. */
export type PipeStepPlugin<Step extends AnyPipeStep, E extends Error = Error> =
  AnyPlugin<
    PipeStepArgs<Step>,
    PipeStepOutput<Step>,
    E,
    PipeStepContext<Step>,
    Step["id"]
  >;

/** Plugin contract for a pipe-level plugin that wraps the full run. */
export type PipeLevelPlugin<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = PipePlugin<Steps, E, Shared, Id | undefined>;

/** Distributes a targeted plugin contract over a union of child runtimes. */
export type DistributePipeStepPlugin<Step, E extends Error> = Step extends
  AnyPipeStep ? PipeStepPlugin<Step, E>
  : never;

/** Union of valid plugin contracts for direct pipeline children. */
export type PipeStepPluginUnion<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error,
> = DistributePipeStepPlugin<Steps[number], E>;

/** Any plugin that can be attached to a pipe or one of its direct steps. */
export type PipeAttachablePlugin<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = PipeLevelPlugin<Steps, E, Shared, Id> | PipeStepPluginUnion<Steps, E>;

/** Retains a plugin only when its target and hook contract match the pipeline. */
export type AllowedPipePlugin<
  Plugin,
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = Plugin extends PipeAttachablePlugin<Steps, E, Shared, Id> ? Plugin : never;

/** Runtime plugin contract evaluated at the pipe level. */
export type PipePlugin<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Target extends string | undefined = string | undefined,
> = AnyPlugin<PipeInput<Steps>, PipeResult<Steps>, E, Shared, Target>;

/** Sync plugin contract for a single targeted inner step. */
export type SyncPipeStepPlugin<
  Step extends AnySyncPipeStep,
  E extends Error = Error,
> = AnySyncPlugin<
  PipeStepArgs<Step>,
  PipeStepOutput<Step>,
  E,
  PipeStepContext<Step & AnyPipeStep>,
  Step["id"]
>;

/** Sync plugin contract for a pipe-level plugin. */
export type SyncPipeLevelPlugin<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: {
          context?: RunContextOptions<infer StepShared>;
          plugins?: readonly unknown[];
        },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
> = SyncPipePlugin<Steps, E, Shared, Id | undefined>;

/** Distributes synchronous targeted plugin contracts over child runtimes. */
export type DistributeSyncPipeStepPlugin<
  Step,
  E extends Error,
> = Step extends AnySyncPipeStep ? SyncPipeStepPlugin<Step, E> : never;

/** Union of valid synchronous plugin contracts for direct children. */
export type SyncPipeStepPluginUnion<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error,
> = DistributeSyncPipeStepPlugin<Steps[number], E>;

/** Any sync plugin that can be attached to a sync pipe or direct sync step. */
export type SyncPipeAttachablePlugin<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: {
          context?: RunContextOptions<infer StepShared>;
          plugins?: readonly unknown[];
        },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
> =
  | SyncPipeLevelPlugin<Steps, E, Shared, Id>
  | SyncPipeStepPluginUnion<Steps, E>;

/** Retains a plugin only when its target and synchronous hooks match. */
export type AllowedSyncPipePlugin<
  Plugin,
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: {
          context?: RunContextOptions<infer StepShared>;
          plugins?: readonly unknown[];
        },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
> = Plugin extends SyncPipeAttachablePlugin<Steps, E, Shared, Id> ? Plugin
  : never;

/** Runtime plugin contract evaluated at the sync pipe level. */
export type SyncPipePlugin<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Target extends string | undefined = string | undefined,
> = AnySyncPlugin<PipeInput<Steps>, PipeResult<Steps>, E, Shared, Target>;

/** Construction options accepted by `pipe(...)`. */
export type PipeOptions<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
> = {
  id?: Id;
  plugins?: ValidatePipePlugins<Plugins, Steps, E, Shared, Id>;
};

/** Per-run overrides accepted by `pipe.runWith(...)`. */
export type PipeRunOptions<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = {
  plugins?: readonly PipeAttachablePlugin<Steps, E, Shared, Id>[];
  context?: RunContextOptions<Shared>;
};

/** Construction options accepted by `pipe.sync(...)`. */
export type SyncPipeOptions<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
> = {
  id?: Id;
  plugins?: ValidateSyncPipePlugins<Plugins, Steps, E, Shared, Id>;
};

/** Per-run overrides accepted by `pipe.sync.runWith(...)`. */
export type SyncPipeRunOptions<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
> = {
  plugins?: readonly SyncPipeAttachablePlugin<Steps, E, Shared, Id>[];
  context?: RunContextOptions<Shared>;
};

/** Minimal identity contract used by configured plugin list inference. */
export type PluginWithId = {
  readonly id: string;
};

/** Checks each configured plugin against the pipeline and its direct children. */
export type ValidatePipePlugins<
  Plugins extends readonly PluginWithId[],
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error,
  Shared extends ContextValues,
  Id extends string,
> = {
  [Index in keyof Plugins]: AllowedPipePlugin<
    Plugins[Index],
    Steps,
    E,
    Shared,
    Id
  >;
};

/** Checks every configured plugin against synchronous pipeline contracts. */
export type ValidateSyncPipePlugins<
  Plugins extends readonly PluginWithId[],
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error,
  Shared extends ContextValues,
  Id extends string,
> = {
  [Index in keyof Plugins]: AllowedSyncPipePlugin<
    Plugins[Index],
    Steps,
    E,
    Shared,
    Id
  >;
};

/** Public runtime surface shared by async pipes. */
export interface PipeInstance<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
  Input extends PipeArgs = PipeInput<Steps>,
  Output = PipeResult<Steps>,
> {
  /** Stable identity used for routing and per-identity state. */
  readonly id: string;
  /** Whether invocation completes synchronously without accepting thenables. */
  readonly isSync: false;
  /** Defensive copy of direct children; nested pipe types expose a shallow invocation view. */
  readonly steps: Steps;
  /** Defensive copy of the current registration list; mutation methods change the same runtime. */
  readonly plugins: readonly (PluginWithId | Plugins[number])[];
  /** Invokes the callable with its exact argument tuple. */
  run(...args: Input): Promise<Output>;
  /** Invokes with per-call context and plugins without persisting those plugins. */
  runWith(
    options: PipeRunOptions<Steps, E, Shared, Id>,
    ...args: Input
  ): Promise<Output>;
}

/** Public runtime surface shared by sync pipes. */
export interface SyncPipeInstance<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
  Input extends PipeArgs = PipeInput<Steps>,
  Output = PipeResult<Steps>,
> {
  /** Stable identity used for routing and per-identity state. */
  readonly id: string;
  /** Whether invocation completes synchronously without accepting thenables. */
  readonly isSync: true;
  /** Defensive copy of direct children; nested pipe types expose a shallow invocation view. */
  readonly steps: Steps;
  /** Defensive copy of the current registration list; mutation methods change the same runtime. */
  readonly plugins: readonly (PluginWithId | Plugins[number])[];
  /** Invokes the callable with its exact argument tuple. */
  run(...args: Input): Output;
  /** Invokes with per-call context and plugins without persisting those plugins. */
  runWith(
    options: SyncPipeRunOptions<Steps, E, Shared, Id>,
    ...args: Input
  ): Output;
}

/** Callable async pipe type returned by `pipe(...)`. */
export type Pipe<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
  Input extends PipeArgs = PipeInput<Steps>,
  Output = PipeResult<Steps>,
> =
  & ((...args: Input) => Promise<Output>)
  & StepIdentity<Id>
  & PipeInstance<Steps, E, Shared, Id, Plugins, Input, Output>
  & {
    use(
      plugin: PipeAttachablePlugin<Steps, E, Shared, Id>,
    ): Pipe<Steps, E, Shared, Id, Plugins, Input, Output>;
    remove(
      pluginId: string,
    ): Pipe<Steps, E, Shared, Id, Plugins, Input, Output>;
  };

/** Callable sync pipe type returned by `pipe.sync(...)`. */
export type SyncPipe<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    } ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues ? StepShared
    : ContextValues,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
  Input extends PipeArgs = PipeInput<Steps>,
  Output = PipeResult<Steps>,
> =
  & ((...args: Input) => Output)
  & StepIdentity<Id>
  & SyncPipeInstance<Steps, E, Shared, Id, Plugins, Input, Output>
  & {
    use(
      plugin: SyncPipeAttachablePlugin<Steps, E, Shared, Id>,
    ): SyncPipe<Steps, E, Shared, Id, Plugins, Input, Output>;
    remove(
      pluginId: string,
    ): SyncPipe<Steps, E, Shared, Id, Plugins, Input, Output>;
  };

/** Stable identity fields exposed by pipe runtimes. */
export type PipeIdentity<Id extends string = string> = StepIdentity<Id>;

/** Context-aware sync pipe factory for a fixed shared context shape. */
export type ContextualSyncPipeFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <
    const Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
    E extends Error = Error,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps:
      & Steps
      & (AllSync<Steps> extends true
        ? ValidLinks<Steps> extends true ? unknown : never
        : never),
    options?: SyncPipeOptions<
      NoInfer<NormalizeSyncPipeSteps<Steps>>,
      E,
      Shared,
      never,
      Plugins
    >,
  ): SyncPipe<NormalizeSyncPipeSteps<Steps>, E, Shared, string, Plugins>;
  <
    const Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
    E extends Error = Error,
    Id extends string = string,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps:
      & Steps
      & (AllSync<Steps> extends true
        ? ValidLinks<Steps> extends true ? unknown : never
        : never),
    options:
      & SyncPipeOptions<
        NoInfer<NormalizeSyncPipeSteps<Steps>>,
        E,
        Shared,
        Id,
        Plugins
      >
      & { id: Id },
  ): SyncPipe<NormalizeSyncPipeSteps<Steps>, E, Shared, Id, Plugins>;
};

/** Context-aware async pipe factory for a fixed shared context shape. */
export type ContextualPipeFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <
    const Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
    E extends Error = Error,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps: Steps & (ValidLinks<Steps> extends true ? unknown : never),
    options?: PipeOptions<
      NoInfer<NormalizePipeSteps<Steps>>,
      E,
      Shared,
      never,
      Plugins
    >,
  ): Pipe<NormalizePipeSteps<Steps>, E, Shared, string, Plugins>;
  <
    const Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
    E extends Error = Error,
    Id extends string = string,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps: Steps & (ValidLinks<Steps> extends true ? unknown : never),
    options:
      & PipeOptions<NoInfer<NormalizePipeSteps<Steps>>, E, Shared, Id, Plugins>
      & {
        id: Id;
      },
  ): Pipe<NormalizePipeSteps<Steps>, E, Shared, Id, Plugins>;
  sync: ContextualSyncPipeFactory<Shared>;
};

/** Public sync pipe factory type, including `withContext(...)`. */
export type SyncPipeFactory = ContextualSyncPipeFactory & {
  withContext<
    Shared extends ContextValues,
  >(): ContextualSyncPipeFactory<Shared>;
};

/** Public async pipe factory type, including sync and context-aware variants. */
export type PipeFactory = ContextualPipeFactory & {
  sync: SyncPipeFactory;
  withContext<Shared extends ContextValues>(): ContextualPipeFactory<Shared>;
};
