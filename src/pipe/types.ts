import type { ContextValues, RunContextOptions } from "@/context/types.ts";
import type { MaybePromise, UnionToIntersection } from "@/core/types.ts";
import type { AnyPlugin, AnySyncPlugin, Plugin } from "@/plugin/types.ts";
import type {
  CompactStepArgs,
  NonPromise,
  Step,
  StepFromFunction,
  StepArgs,
  StepIdentity,
  SyncStep,
  SyncStepFromFunction,
} from "@/step/types.ts";

export type PipeArgs = StepArgs;

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

export type AnyPipeStep = PipeCompatibleStep<PipeArgs, unknown>;
export type AnySyncPipeStep = SyncPipeCompatibleStep<PipeArgs, unknown>;

type BarePipeFunction = {
  id?: never;
  isSync?: never;
  runWith?: never;
};

type RawPipeFn = ((...args: any[]) => unknown) & BarePipeFunction;
type RawSyncPipeFn = ((...args: any[]) => unknown) & BarePipeFunction;

export type PipeInputStep = AnyPipeStep | RawPipeFn;

export type SyncPipeInputStep = AnySyncPipeStep | RawSyncPipeFn;

export type NormalizePipeStep<StepValue> = StepValue extends AnyPipeStep
  ? StepValue
  : StepValue extends RawPipeFn
    ? StepFromFunction<StepValue>
    : never;

export type NormalizeSyncPipeStep<StepValue> = StepValue extends AnySyncPipeStep
  ? StepValue
  : StepValue extends RawSyncPipeFn
    ? SyncStepFromFunction<StepValue>
    : never;

export type NormalizePipeSteps<Steps extends readonly unknown[]> = {
  [Index in keyof Steps]: NormalizePipeStep<Steps[Index]>;
};

export type NormalizeSyncPipeSteps<Steps extends readonly unknown[]> = {
  [Index in keyof Steps]: NormalizeSyncPipeStep<Steps[Index]>;
};

export type PipeStepArgs<Step> =
  NormalizePipeStep<Step> extends {
    runWith(options: unknown, ...args: infer Args): unknown;
  }
    ? Args
    : never;

export type PipeStepOutput<Step> =
  NormalizePipeStep<Step> extends {
    runWith(options: unknown, ...args: never[]): infer Output;
  }
    ? Awaited<Output>
    : never;

export type NormalizePipeOutput<Output> = Output extends readonly unknown[]
  ? [...Output]
  : [Output];

export type IsPipeLinkValid<Previous, Next> = [
  NormalizePipeOutput<PipeStepOutput<Previous>>,
] extends [PipeStepArgs<Next>]
  ? true
  : false;

export type ValidatePipeSteps<
  Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
> = Steps extends readonly [
  infer First extends PipeInputStep,
  infer Second extends PipeInputStep,
  ...infer Rest extends PipeInputStep[],
]
  ? IsPipeLinkValid<First, Second> extends true
    ? readonly [First, ...ValidatePipeSteps<readonly [Second, ...Rest]>]
    : never
  : Steps;

export type ValidateSyncPipeSteps<
  Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
> = Steps extends readonly [
  infer First extends SyncPipeInputStep,
  infer Second extends SyncPipeInputStep,
  ...infer Rest extends SyncPipeInputStep[],
]
  ? IsPipeLinkValid<First, Second> extends true
    ? readonly [First, ...ValidateSyncPipeSteps<readonly [Second, ...Rest]>]
    : never
  : Steps;

export type PipeInput<Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]]> =
  PipeStepArgs<Steps[0]>;

export type LastPipeStep<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
> = Steps extends readonly [...infer _, infer Last extends AnyPipeStep]
  ? Last
  : never;

export type PipeResult<Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]]> =
  PipeStepOutput<LastPipeStep<Steps>>;

export type PipeContext<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
> =
  UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer Shared> },
        ...args: never[]
      ): unknown;
    }
      ? Shared
      : ContextValues
  > extends infer Shared extends ContextValues
    ? Shared
    : ContextValues;

type LiteralString<Value> = Value extends string
  ? string extends Value
    ? never
    : Value
  : never;

export type PipeStepTargetIds<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
> = LiteralString<Steps[number]["id"]>;

export type PipeTargetIds<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  Id extends string,
> = LiteralString<Id> | PipeStepTargetIds<Steps>;

export type PipeStepContext<Step extends AnyPipeStep> = Step extends {
  runWith(
    options: {
      context?: RunContextOptions<infer Shared>;
      plugins?: readonly unknown[];
    },
    ...args: never[]
  ): unknown;
}
  ? Shared
  : ContextValues;

export type PipeStepPlugin<
  Step extends AnyPipeStep,
  E extends Error = Error,
> = {
  readonly id: string;
  readonly target: LiteralString<Step["id"]>;
  supports(capability: string): boolean;
  targets(stepId: string): boolean;
} & (
  | AnyPlugin<
      PipeStepArgs<Step>,
      PipeStepOutput<Step>,
      E,
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      CompactStepArgs<PipeStepArgs<Step>>,
      never,
      never,
      { input: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      never,
      PipeStepOutput<Step>,
      never,
      { output: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      CompactStepArgs<PipeStepArgs<Step>>,
      PipeStepOutput<Step>,
      never,
      { input: true; output: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      CompactStepArgs<PipeStepArgs<Step>>,
      PipeStepOutput<Step>,
      E,
      { input: true; error: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      never,
      PipeStepOutput<Step>,
      E,
      { error: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      never,
      PipeStepOutput<Step>,
      E,
      { output: true; error: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
  | Plugin<
      CompactStepArgs<PipeStepArgs<Step>>,
      PipeStepOutput<Step>,
      E,
      { input: true; output: true; error: true },
      PipeStepContext<Step>,
      LiteralString<Step["id"]>
    >
);

export type PipeLevelPlugin<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = PipePlugin<Steps, E, Shared, LiteralString<Id> | undefined>;

type DistributePipeStepPlugin<Step, E extends Error> = Step extends AnyPipeStep
  ? PipeStepPlugin<Step, E>
  : never;

type PipeStepPluginUnion<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error,
> = DistributePipeStepPlugin<Steps[number], E>;

export type PipeAttachablePlugin<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = PipeLevelPlugin<Steps, E, Shared, Id> | PipeStepPluginUnion<Steps, E>;

export type AllowedPipePlugin<
  Plugin,
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = Plugin extends PipeAttachablePlugin<Steps, E, Shared, Id> ? Plugin : never;

export type PipePlugin<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Target extends string | undefined = string | undefined,
> = {
  readonly id: string;
  readonly target: Target;
  supports(capability: string): boolean;
  targets(stepId: string): boolean;
} & (
  | AnyPlugin<PipeInput<Steps>, PipeResult<Steps>, E, Shared, Target>
  | Plugin<
      CompactStepArgs<PipeInput<Steps>>,
      never,
      never,
      { input: true },
      Shared,
      Target
    >
  | Plugin<never, PipeResult<Steps>, never, { output: true }, Shared, Target>
  | Plugin<
      CompactStepArgs<PipeInput<Steps>>,
      PipeResult<Steps>,
      never,
      { input: true; output: true },
      Shared,
      Target
    >
  | Plugin<
      CompactStepArgs<PipeInput<Steps>>,
      PipeResult<Steps>,
      E,
      { input: true; error: true },
      Shared,
      Target
    >
  | Plugin<never, PipeResult<Steps>, E, { error: true }, Shared, Target>
  | Plugin<
      never,
      PipeResult<Steps>,
      E,
      { output: true; error: true },
      Shared,
      Target
    >
  | Plugin<
      CompactStepArgs<PipeInput<Steps>>,
      PipeResult<Steps>,
      E,
      { input: true; output: true; error: true },
      Shared,
      Target
    >
);

export type SyncPipeStepPlugin<
  Step extends AnySyncPipeStep,
  E extends Error = Error,
> = AnySyncPlugin<
  PipeStepArgs<Step>,
  PipeStepOutput<Step>,
  E,
  any,
  LiteralString<Step["id"]>
>;

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
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
> = SyncPipePlugin<Steps, E, Shared, LiteralString<Id> | undefined>;

type DistributeSyncPipeStepPlugin<
  Step,
  E extends Error,
> = Step extends AnySyncPipeStep ? SyncPipeStepPlugin<Step, E> : never;

type SyncPipeStepPluginUnion<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error,
> = DistributeSyncPipeStepPlugin<Steps[number], E>;

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
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
> =
  | SyncPipeLevelPlugin<Steps, E, Shared, Id>
  | SyncPipeStepPluginUnion<Steps, E>;

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
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
> =
  Plugin extends SyncPipeAttachablePlugin<Steps, E, Shared, Id>
    ? Plugin
    : never;

export type SyncPipePlugin<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Target extends string | undefined = string | undefined,
> = AnySyncPlugin<PipeInput<Steps>, PipeResult<Steps>, E, Shared, Target>;

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

export type PipeRunOptions<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
> = {
  plugins?: readonly PipeAttachablePlugin<Steps, E, Shared, Id>[];
  context?: RunContextOptions<Shared>;
};

export type SyncPipeOptions<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
  Plugins extends readonly PluginWithId[] = readonly [],
> = {
  id?: Id;
  plugins?: ValidateSyncPipePlugins<Plugins, Steps, E, Shared, Id>;
};

export type SyncPipeRunOptions<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
> = {
  plugins?: readonly SyncPipeAttachablePlugin<Steps, E, Shared, Id>[];
  context?: RunContextOptions<Shared>;
};

type PluginWithId = {
  readonly id: string;
};

type ValidatePipePlugins<
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

type ValidateSyncPipePlugins<
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

type KnownPluginIds<Plugins extends readonly PluginWithId[]> = [
  Plugins[number],
] extends [never]
  ? string
  : Plugins[number]["id"];

type RemovePluginsById<
  Plugins extends readonly PluginWithId[],
  PluginId extends string,
> = Plugins extends readonly [
  infer Head extends PluginWithId,
  ...infer Tail extends readonly PluginWithId[],
]
  ? Head["id"] extends PluginId
    ? RemovePluginsById<Tail, PluginId>
    : readonly [Head, ...RemovePluginsById<Tail, PluginId>]
  : readonly [];

type PipePluginList<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error,
  Shared extends ContextValues,
  Id extends string,
> = readonly PluginWithId[];

type SyncPipePluginList<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error,
  Shared extends ContextValues,
  Id extends string,
> = readonly PluginWithId[];

export interface PipeInstance<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
  Plugins extends PipePluginList<Steps, E, Shared, Id> = readonly [],
> {
  readonly id: string;
  readonly isSync: false;
  readonly steps: Steps;
  readonly plugins: Plugins;
  run(...args: PipeInput<Steps>): Promise<PipeResult<Steps>>;
  runWith(
    options: PipeRunOptions<Steps, E, Shared, Id>,
    ...args: PipeInput<Steps>
  ): Promise<PipeResult<Steps>>;
}

export interface SyncPipeInstance<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
  Plugins extends SyncPipePluginList<Steps, E, Shared, Id> = readonly [],
> {
  readonly id: string;
  readonly isSync: true;
  readonly steps: Steps;
  readonly plugins: Plugins;
  run(...args: PipeInput<Steps>): PipeResult<Steps>;
  runWith(
    options: SyncPipeRunOptions<Steps, E, Shared, Id>,
    ...args: PipeInput<Steps>
  ): PipeResult<Steps>;
}

export type Pipe<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = PipeContext<Steps>,
  Id extends string = string,
  Plugins extends PipePluginList<Steps, E, Shared, Id> = readonly [],
> = ((...args: PipeInput<Steps>) => Promise<PipeResult<Steps>>) &
  StepIdentity<Id> &
  PipeInstance<Steps, E, Shared, Id, Plugins> & {
    use<Plugin extends PipeAttachablePlugin<Steps, E, Shared, Id>>(
      plugin: AllowedPipePlugin<Plugin, Steps, E, Shared, Id>,
    ): Pipe<Steps, E, Shared, Id, readonly [...Plugins, Plugin]>;
    remove<PluginId extends KnownPluginIds<Plugins>>(
      pluginId: PluginId,
    ): Pipe<Steps, E, Shared, Id, RemovePluginsById<Plugins, PluginId>>;
  };

export type SyncPipe<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = UnionToIntersection<
    Steps[number] extends {
      runWith(
        options: { context?: RunContextOptions<infer StepShared> },
        ...args: never[]
      ): unknown;
    }
      ? StepShared
      : ContextValues
  > extends infer StepShared extends ContextValues
    ? StepShared
    : ContextValues,
  Id extends string = string,
  Plugins extends SyncPipePluginList<Steps, E, Shared, Id> = readonly [],
> = ((...args: PipeInput<Steps>) => PipeResult<Steps>) &
  StepIdentity<Id> &
  SyncPipeInstance<Steps, E, Shared, Id, Plugins> & {
    use<Plugin extends SyncPipeAttachablePlugin<Steps, E, Shared, Id>>(
      plugin: AllowedSyncPipePlugin<Plugin, Steps, E, Shared, Id>,
    ): SyncPipe<Steps, E, Shared, Id, readonly [...Plugins, Plugin]>;
    remove<PluginId extends KnownPluginIds<Plugins>>(
      pluginId: PluginId,
    ): SyncPipe<Steps, E, Shared, Id, RemovePluginsById<Plugins, PluginId>>;
  };

export type PipeIdentity<Id extends string = string> = StepIdentity<Id>;

export type ContextualSyncPipeFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <
    Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
    E extends Error = Error,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps: ValidateSyncPipeSteps<Steps> & Steps,
    options?: SyncPipeOptions<
      NormalizeSyncPipeSteps<Steps>,
      E,
      Shared,
      never,
      Plugins
    >,
  ): SyncPipe<NormalizeSyncPipeSteps<Steps>, E, Shared, string, Plugins>;
  <
    Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
    E extends Error = Error,
    Id extends string = string,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps: ValidateSyncPipeSteps<Steps> & Steps,
    options: SyncPipeOptions<
      NormalizeSyncPipeSteps<Steps>,
      E,
      Shared,
      Id,
      Plugins
    > & { id: Id },
  ): SyncPipe<NormalizeSyncPipeSteps<Steps>, E, Shared, Id, Plugins>;
};

export type ContextualPipeFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <
    Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
    E extends Error = Error,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps: ValidatePipeSteps<Steps> & Steps,
    options?: PipeOptions<NormalizePipeSteps<Steps>, E, Shared, never, Plugins>,
  ): Pipe<NormalizePipeSteps<Steps>, E, Shared, string, Plugins>;
  <
    Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
    E extends Error = Error,
    Id extends string = string,
    Plugins extends readonly PluginWithId[] = readonly [],
  >(
    steps: ValidatePipeSteps<Steps> & Steps,
    options: PipeOptions<NormalizePipeSteps<Steps>, E, Shared, Id, Plugins> & {
      id: Id;
    },
  ): Pipe<NormalizePipeSteps<Steps>, E, Shared, Id, Plugins>;
  sync: ContextualSyncPipeFactory<Shared>;
};

export type SyncPipeFactory = ContextualSyncPipeFactory & {
  withContext<
    Shared extends ContextValues,
  >(): ContextualSyncPipeFactory<Shared>;
};

export type PipeFactory = ContextualPipeFactory & {
  sync: SyncPipeFactory;
  withContext<Shared extends ContextValues>(): ContextualPipeFactory<Shared>;
};
