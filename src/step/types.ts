import type {
  ContextValues,
  RunContextOptions,
  StepThis,
} from "@/context/types.ts";
import type { Args, MaybePromise, NoInfer } from "@/core/types.ts";
import type { AnyPlugin, AnySyncPlugin, Plugin } from "@/plugin/types.ts";

/** Raw argument tuple accepted by a step. */
export type StepArgs = Args;
export type NonPromise<T> = T extends Promise<unknown> ? never : T;

export type CompactStepArgs<I extends StepArgs> = I extends []
  ? void
  : I extends [infer Value]
    ? Value
    : I;

type NormalizePublicStepArgs<I> = [I] extends [never]
  ? never
  : [I] extends [void]
    ? []
    : I extends StepArgs
      ? I
      : [I];

/** Function signature accepted by `step(...)`. */
export type StepFn<
  I = StepArgs,
  O = unknown,
  Shared extends ContextValues = ContextValues,
> = (
  this: StepThis<Shared>,
  ...args: NormalizePublicStepArgs<I>
) => MaybePromise<O>;

/**
 * Synchronous step function used by `step.sync(...)`.
 */
export type SyncStepFn<
  I = StepArgs,
  O = unknown,
  Shared extends ContextValues = ContextValues,
> = (
  this: StepThis<Shared>,
  ...args: NormalizePublicStepArgs<I>
) => NonPromise<O>;

export type AnyStepFn<Shared extends ContextValues = ContextValues> = (
  this: StepThis<Shared>,
  ...args: unknown[]
) => unknown;
export type AnySyncStepFn<Shared extends ContextValues = ContextValues> = (
  this: StepThis<Shared>,
  ...args: unknown[]
) => unknown;

export type ExtractStepContext<Fn extends (...args: never[]) => unknown> =
  ThisParameterType<Fn> extends StepThis<infer Shared> ? Shared : ContextValues;

type FluentStepPluginContract<
  I extends StepArgs,
  O,
  E extends Error,
  Shared extends ContextValues,
> = {
  readonly id: string;
  readonly target: string | undefined;
  supports(capability: string): boolean;
  targets(stepId: string): boolean;
} & (
  | Plugin<
      CompactStepArgs<I>,
      never,
      never,
      { input: true },
      Shared,
      string | undefined
    >
  | Plugin<never, O, never, { output: true }, Shared, string | undefined>
  | Plugin<
      CompactStepArgs<I>,
      O,
      never,
      { input: true; output: true },
      Shared,
      string | undefined
    >
  | Plugin<
      CompactStepArgs<I>,
      O,
      E,
      { input: true; error: true },
      Shared,
      string | undefined
    >
  | Plugin<never, O, E, { error: true }, Shared, string | undefined>
  | Plugin<
      never,
      O,
      E,
      { output: true; error: true },
      Shared,
      string | undefined
    >
  | Plugin<
      CompactStepArgs<I>,
      O,
      E,
      { input: true; output: true; error: true },
      Shared,
      string | undefined
    >
);

/** Plugin contract accepted by async steps. */
export type StepPlugin<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Shared extends ContextValues = ExtractStepContext<Fn>,
> =
  | AnyPlugin<Parameters<Fn>, Awaited<ReturnType<Fn>>, E, Shared>
  | FluentStepPluginContract<
      Parameters<Fn>,
      Awaited<ReturnType<Fn>>,
      E,
      Shared
    >;

/**
 * Plugin contract accepted by `step.sync(...)`.
 */
export type SyncStepPlugin<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Shared extends ContextValues = ExtractStepContext<Fn>,
> = AnySyncPlugin<Parameters<Fn>, ReturnType<Fn>, E, Shared>;

export type StepOptions<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> = {
  id?: string;
  plugins?: StepPlugin<Fn, E, ExtractStepContext<Fn>>[];
};

/**
 * Advanced execution options accepted by `step.runWith(...)`.
 *
 * Use this to inject plugins for a single execution without mutating the step's
 * persistent plugin list.
 */
export type StepRunOptions<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> = {
  /** Plugins to apply only to the current execution. */
  plugins?: StepPlugin<Fn, E, ExtractStepContext<Fn>>[];
  /** Execution context configuration for this specific run. */
  context?: RunContextOptions<ExtractStepContext<Fn>>;
};

/**
 * Options accepted by `step.sync(...)`.
 */
export type SyncStepOptions<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> = {
  id?: string;
  plugins?: AnySyncPlugin<
    NoInfer<Parameters<Fn>>,
    ReturnType<Fn>,
    E,
    ExtractStepContext<Fn>
  >[];
};

/**
 * Advanced execution options accepted by `step.sync.runWith(...)`.
 *
 * Use this to inject synchronous plugins for a single execution without
 * mutating the step's persistent plugin list.
 */
export type SyncStepRunOptions<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> = {
  /** Synchronous plugins to apply only to the current execution. */
  plugins?: AnySyncPlugin<
    NoInfer<Parameters<Fn>>,
    ReturnType<Fn>,
    E,
    ExtractStepContext<Fn>
  >[];
  /** Execution context configuration for this specific run. */
  context?: RunContextOptions<ExtractStepContext<Fn>>;
};

/** Stable identity fields exposed by step runtimes. */
export type StepIdentity<Id extends string = string> = {
  readonly id: Id;
};

/** Public runtime surface shared by every async step instance. */
export interface StepInstance<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> {
  readonly id: string;
  readonly isSync: false;
  readonly plugins: readonly StepPlugin<Fn, E>[];
  run(...args: Parameters<Fn>): Promise<Awaited<ReturnType<Fn>>>;
  runWith(
    options: StepRunOptions<Fn, E>,
    ...args: Parameters<Fn>
  ): Promise<Awaited<ReturnType<Fn>>>;
  use(plugin: StepPlugin<Fn, E>): this;
  remove(pluginId: string): this;
}

/**
 * Public runtime surface for synchronous steps.
 */
export interface SyncStepInstance<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> {
  readonly id: string;
  readonly isSync: true;
  readonly plugins: readonly SyncStepPlugin<Fn, E>[];
  run(...args: Parameters<Fn>): ReturnType<Fn>;
  runWith(
    options: SyncStepRunOptions<Fn, E>,
    ...args: Parameters<Fn>
  ): ReturnType<Fn>;
  use(plugin: SyncStepPlugin<Fn, E>): this;
  remove(pluginId: string): this;
}

export type StepRuntime<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Id extends string = string,
> = ((...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>>) &
  StepIdentity<Id> &
  StepInstance<Fn, E>;

/**
 * Public callable surface returned by `step.sync(...)`.
 */
export type SyncStepRuntime<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Id extends string = string,
> = ((...args: Parameters<Fn>) => ReturnType<Fn>) &
  StepIdentity<Id> &
  SyncStepInstance<Fn, E>;

/** Callable step type returned by `step(...)`. */
export type Step<
  I = StepArgs,
  O = unknown,
  E extends Error = Error,
  Id extends string = string,
  Shared extends ContextValues = ContextValues,
> = StepRuntime<StepFn<I, O, Shared>, E, Id>;

/**
 * Public callable surface returned by `step.sync(...)`.
 */
export type SyncStep<
  I = StepArgs,
  O = unknown,
  E extends Error = Error,
  Id extends string = string,
  Shared extends ContextValues = ContextValues,
> = SyncStepRuntime<SyncStepFn<I, O, Shared>, E, Id>;

/** Derives the public step type from an existing function signature. */
export type StepFromFunction<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Id extends string = string,
> = Step<
  CompactStepArgs<Parameters<Fn>>,
  Awaited<ReturnType<Fn>>,
  E,
  Id,
  ExtractStepContext<Fn>
>;

/** Derives the public sync step type from an existing function signature. */
export type SyncStepFromFunction<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Id extends string = string,
> = SyncStep<
  CompactStepArgs<Parameters<Fn>>,
  ReturnType<Fn>,
  E,
  Id,
  ExtractStepContext<Fn>
>;

/**
 * Context-aware synchronous step factory.
 */
export type ContextualSyncStepFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <I extends StepArgs, O, E extends Error = Error, Id extends string = string>(
    fn: SyncStepFn<I, O, Shared>,
    options?: {
      id?: Id;
      plugins?: AnySyncPlugin<I, O, E, Shared>[];
    },
  ): SyncStep<CompactStepArgs<I>, O, E, Id, Shared>;
};

/**
 * Context-aware step factory.
 */
export type ContextualStepFactory<
  Shared extends ContextValues = ContextValues,
> = {
  <I extends StepArgs, O, E extends Error = Error, Id extends string = string>(
    fn: StepFn<I, O, Shared>,
    options?: {
      id?: Id;
      plugins?: (
        | AnyPlugin<NoInfer<I>, Awaited<NoInfer<O>>, E, Shared>
        | FluentStepPluginContract<NoInfer<I>, Awaited<NoInfer<O>>, E, Shared>
      )[];
    },
  ): Step<CompactStepArgs<I>, O, E, Id, Shared>;
  sync: ContextualSyncStepFactory<Shared>;
};

/**
 * Public synchronous step factory type.
 */
export type SyncStepFactory = ContextualSyncStepFactory & {
  withContext<
    Shared extends ContextValues,
  >(): ContextualSyncStepFactory<Shared>;
};

/**
 * Public step factory type.
 */
export type StepFactory = ContextualStepFactory & {
  sync: SyncStepFactory;
  withContext<Shared extends ContextValues>(): ContextualStepFactory<Shared>;
};
