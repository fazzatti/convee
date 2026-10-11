import type {
  ContextValues,
  RunContextOptions,
  StepThis,
} from "@/context/types.ts";
import type { Args, MaybePromise, NoInfer } from "@/core/types.ts";
import type { AnyPlugin, AnySyncPlugin } from "@/plugin/types.ts";

/** Raw argument tuple accepted by a step. */
export type StepArgs = Args;
/** Removes PromiseLike branches from a synchronous result type. */
export type NonPromise<T> = T extends PromiseLike<unknown> ? never : T;

/** Preserves the complete argument tuple, including a single array-valued argument. */
export type CompactStepArgs<I extends StepArgs> = I;

/** Converts legacy scalar step generics to a tuple while preserving tuple generics. */
export type NormalizePublicStepArgs<I> = [I] extends [never] ? never
  : [I] extends [void] ? []
  : I extends StepArgs ? I
  : [I];

/**
 * Body callback accepted by step, with invocation-scoped context.
 *
 * @param args - Exact input tuple after the selected input hooks have transformed it.
 *
 * @returns An output value or promise, then processed by output hooks.
 * @throws A thrown or rejected body failure is normalized and offered to error hooks.
 * If no hook recovers, the run fails after finalizers finish.
 * @remarks A regular function can call this.context(); an arrow retains its lexical this.
 * Promise results are awaited before output hooks run.
 */
export type StepFn<
  I = StepArgs,
  O = unknown,
  Shared extends ContextValues = ContextValues,
> = (
  this: StepThis<Shared>,
  ...args: NormalizePublicStepArgs<I>
) => MaybePromise<O>;

/**
 * Body callback accepted by step.sync, with invocation-scoped context.
 *
 * @param args - Exact input tuple after the selected input hooks have transformed it.
 *
 * @returns A plain output value, then processed by output hooks.
 * @throws A thrown body failure is normalized and offered to error hooks.
 * If no hook recovers, the run fails after finalizers finish.
 * @remarks A regular function can call this.context(); an arrow retains its lexical this.
 * Thenable results are invalid and raise TypeError during synchronous execution.
 */
export type SyncStepFn<
  I = StepArgs,
  O = unknown,
  Shared extends ContextValues = ContextValues,
> = (
  this: StepThis<Shared>,
  ...args: NormalizePublicStepArgs<I>
) => NonPromise<O>;

/** Broad contextual callback constraint for asynchronous step inference. */
export type AnyStepFn<Shared extends ContextValues = ContextValues> = (
  this: StepThis<Shared>,
  ...args: unknown[]
) => unknown;
/** Broad contextual callback constraint for synchronous step inference. */
export type AnySyncStepFn<Shared extends ContextValues = ContextValues> = (
  this: StepThis<Shared>,
  ...args: unknown[]
) => unknown;

/** Infers shared state from a callback's explicit this context. */
export type ExtractStepContext<Fn extends (...args: never[]) => unknown> =
  ThisParameterType<Fn> extends StepThis<infer Shared> ? Shared : ContextValues;

/** Plugin contract accepted by async steps. */
export type StepPlugin<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Shared extends ContextValues = ExtractStepContext<Fn>,
> = AnyPlugin<Parameters<Fn>, Awaited<ReturnType<Fn>>, E, Shared>;

/**
 * Plugin contract accepted by `step.sync(...)`.
 */
export type SyncStepPlugin<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Shared extends ContextValues = ExtractStepContext<Fn>,
> = AnySyncPlugin<Parameters<Fn>, ReturnType<Fn>, E, Shared>;

/** Identity and persistent plugins supplied when constructing a step. */
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
  /** Stable identity used for routing and per-identity state. */
  readonly id: string;
  /** Whether invocation completes synchronously without accepting thenables. */
  readonly isSync: false;
  /** Defensive copy of the current registration list; mutation methods change the same runtime. */
  readonly plugins: readonly StepPlugin<Fn, E>[];
  /**
   * Execute this step with its persistent plugin registrations.
   *
   * @param args - Exact argument tuple matching the wrapped function's input contract.
   * @returns A Promise resolving to the final output after output hooks or recovery.
   * @throws Rejects with unrecovered body or hook errors. Invalid input-hook results use
   * `STP_001`; failed finalizers aggregate as `RT_000` after all finalizers are attempted.
   * Plugin selection/property access can throw synchronously before the lifecycle starts.
   * @remarks Equivalent to direct invocation; uses a fresh context with outputs capture by default.
   */
  run(...args: Parameters<Fn>): Promise<Awaited<ReturnType<Fn>>>;
  /**
   * Execute once with additional plugins and an explicit context configuration.
   *
   * @param options - Per-call plugins and optional parent, seed and capture settings. Plugins are not persisted.
   * @param args - Exact argument tuple matching the wrapped function's input contract.
   * @returns A Promise resolving to the final output after output hooks or recovery.
   * @throws Rejects with unrecovered body or hook errors. Invalid input-hook results use
   * `STP_001`; failed finalizers aggregate as `RT_000` after all finalizers are attempted.
   * Plugin selection/property access can throw synchronously before the lifecycle starts.
   * An invalid parent context raises TypeError before execution hooks start.
   * @remarks Persistent plugins precede per-call plugins. Execution snapshots the registrations;
   * sharing a parent shares state and completed snapshots, while invocation scopes remain isolated.
   */
  runWith(
    options: StepRunOptions<Fn, E>,
    ...args: Parameters<Fn>
  ): Promise<Awaited<ReturnType<Fn>>>;
  /**
   * Append a persistent plugin for future invocations of this step.
   *
   * @param plugin - Plugin compatible with the execution contract and routing namespace.
   * @returns The same callable step; registrations already captured by an invocation are unchanged.
   * @remarks Registration does not execute or validate hooks and does not intentionally throw for a valid plugin.
   */
  use(plugin: StepPlugin<Fn, E>): this;
  /**
   * Remove every persistent registration with the specified plugin ID.
   *
   * @param pluginId - Identity to remove; missing IDs are a no-op.
   * @returns The same callable step; previously captured invocation plans are unchanged.
   * @throws Exceptions raised by ID getters on custom plugin objects propagate.
   */
  remove(pluginId: string): this;
}

/**
 * Public runtime surface for synchronous steps.
 */
export interface SyncStepInstance<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
> {
  /** Stable identity used for routing and per-identity state. */
  readonly id: string;
  /** Whether invocation completes synchronously without accepting thenables. */
  readonly isSync: true;
  /** Defensive copy of the current registration list; mutation methods change the same runtime. */
  readonly plugins: readonly SyncStepPlugin<Fn, E>[];
  /**
   * Execute this step with its persistent plugin registrations.
   *
   * @param args - Exact argument tuple matching the wrapped function's input contract.
   * @returns The final output value after output hooks or recovery.
   * @throws Throws unrecovered body or hook errors. Invalid input-hook results use
   * `STP_001`; failed finalizers aggregate as `RT_000` after all finalizers are attempted.
   * Thenables from a body or hook are rejected with TypeError; body failures can be recovered by error hooks.
   * Plugin selection/property access can throw synchronously before the lifecycle starts.
   * @remarks Equivalent to direct invocation; uses a fresh context with outputs capture by default.
   */
  run(...args: Parameters<Fn>): ReturnType<Fn>;
  /**
   * Execute once with additional plugins and an explicit context configuration.
   *
   * @param options - Per-call plugins and optional parent, seed and capture settings. Plugins are not persisted.
   * @param args - Exact argument tuple matching the wrapped function's input contract.
   * @returns The final output value after output hooks or recovery.
   * @throws Throws unrecovered body or hook errors. Invalid input-hook results use
   * `STP_001`; failed finalizers aggregate as `RT_000` after all finalizers are attempted.
   * Thenables from a body or hook are rejected with TypeError; body failures can be recovered by error hooks.
   * Plugin selection/property access can throw synchronously before the lifecycle starts.
   * An invalid parent context raises TypeError before execution hooks start.
   * @remarks Persistent plugins precede per-call plugins. Execution snapshots the registrations;
   * sharing a parent shares state and completed snapshots, while invocation scopes remain isolated.
   */
  runWith(
    options: SyncStepRunOptions<Fn, E>,
    ...args: Parameters<Fn>
  ): ReturnType<Fn>;
  /**
   * Append a persistent plugin for future invocations of this step.
   *
   * @param plugin - Synchronous plugin compatible with the execution contract and routing namespace.
   * @returns The same callable step; registrations already captured by an invocation are unchanged.
   * @remarks Registration does not execute or validate hooks and does not intentionally throw for a valid plugin.
   */
  use(plugin: SyncStepPlugin<Fn, E>): this;
  /**
   * Remove every persistent registration with the specified plugin ID.
   *
   * @param pluginId - Identity to remove; missing IDs are a no-op.
   * @returns The same callable step; previously captured invocation plans are unchanged.
   * @throws Exceptions raised by ID getters on custom plugin objects propagate.
   */
  remove(pluginId: string): this;
}

/**
 * Callable asynchronous step with identity and lifecycle registration methods.
 *
 * @param args - The wrapped function's input argument tuple; direct calls match run().
 *
 * @returns A Promise of the final output after hooks and any successful recovery.
 * @throws Rejects with unrecovered execution errors or aggregated finalizer failures.
 * Plugin selection can throw before the lifecycle starts; see StepInstance.runWith
 * for context options, setup failures and the full execution contract.
 */
export type StepRuntime<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Id extends string = string,
> =
  & ((...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>>)
  & StepIdentity<Id>
  & StepInstance<Fn, E>;

/**
 * Callable synchronous step with identity and lifecycle registration methods.
 *
 * @param args - The wrapped function's input argument tuple; direct calls match run().
 *
 * @returns The final output value after hooks and any successful recovery.
 * @throws Throws unrecovered execution errors or aggregated finalizer failures.
 * Plugin selection can throw before the lifecycle starts; see SyncStepInstance.runWith
 * for context options, setup failures and the full execution contract.
 */
export type SyncStepRuntime<
  Fn extends (...args: never[]) => unknown,
  E extends Error = Error,
  Id extends string = string,
> =
  & ((...args: Parameters<Fn>) => ReturnType<Fn>)
  & StepIdentity<Id>
  & SyncStepInstance<Fn, E>;

/**
 * Callable asynchronous step with identity and lifecycle registration methods.
 *
 * @param args - The wrapped function's input argument tuple; direct calls match run().
 *
 * @returns A Promise of the final output after hooks and any successful recovery.
 * @throws Rejects with unrecovered execution errors or aggregated finalizer failures.
 * Plugin selection can throw before the lifecycle starts; see StepInstance.runWith
 * for context options, setup failures and the full execution contract.
 */
export type Step<
  I = StepArgs,
  O = unknown,
  E extends Error = Error,
  Id extends string = string,
  Shared extends ContextValues = ContextValues,
> = StepRuntime<StepFn<I, O, Shared>, E, Id>;

/**
 * Callable synchronous step with identity and lifecycle registration methods.
 *
 * @param args - The wrapped function's input argument tuple; direct calls match run().
 *
 * @returns The final output value after hooks and any successful recovery.
 * @throws Throws unrecovered execution errors or aggregated finalizer failures.
 * Plugin selection can throw before the lifecycle starts; see SyncStepInstance.runWith
 * for context options, setup failures and the full execution contract.
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
 * Construct a synchronous step with a fixed shared-context type.
 *
 * @param fn - Callable receiving the input tuple and this.context().
 * @param options - Optional stable identity and persistent synchronous plugins.
 * @returns A reusable SyncStep retaining its inferred input, output and identity types.
 * @throws TypeError when fn is not callable; option accessor errors propagate.
 *
 * @remarks Construction does not invoke the body or hooks. All execution results must stay synchronous; thenables are rejected during execution.
 */
export type ContextualSyncStepFactory<
  Shared extends ContextValues = ContextValues,
> = {
  /**
   * Construct a synchronous step with a fixed shared-context type.
   *
   * @param fn - Callable receiving the input tuple and this.context().
   * @param options - Optional stable identity and persistent synchronous plugins.
   * @returns A reusable SyncStep retaining its inferred input, output and identity types.
   * @throws TypeError when fn is not callable; option accessor errors propagate.
   *
   * @remarks Construction does not invoke the body or hooks. All execution results must stay synchronous; thenables are rejected during execution.
   */
  <I extends StepArgs, O, E extends Error = Error, Id extends string = string>(
    fn: (this: StepThis<Shared>, ...args: I) => NonPromise<O>,
    options?: {
      id?: Id;
      plugins?: AnySyncPlugin<I, O, E, Shared>[];
    },
  ): SyncStep<I, O, E, Id, Shared>;
};

/**
 * Construct an asynchronous step with a fixed shared-context type.
 *
 * @param fn - Callable receiving the input tuple and this.context().
 * @param options - Optional stable identity and persistent plugins.
 * @returns A reusable Step retaining its inferred input, output and identity types.
 * @throws TypeError when fn is not callable; option accessor errors propagate.
 *
 * @remarks Construction does not invoke the body or hooks. Execution resolves asynchronously and follows the runtime run/runWith error contract.
 */
export type ContextualStepFactory<
  Shared extends ContextValues = ContextValues,
> = {
  /**
   * Construct an asynchronous step with a fixed shared-context type.
   *
   * @param fn - Callable receiving the input tuple and this.context().
   * @param options - Optional stable identity and persistent plugins.
   * @returns A reusable Step retaining its inferred input, output and identity types.
   * @throws TypeError when fn is not callable; option accessor errors propagate.
   *
   * @remarks Construction does not invoke the body or hooks. Execution resolves asynchronously and follows the runtime run/runWith error contract.
   */
  <I extends StepArgs, O, E extends Error = Error, Id extends string = string>(
    fn: (this: StepThis<Shared>, ...args: I) => MaybePromise<O>,
    options?: {
      id?: Id;
      plugins?: AnyPlugin<NoInfer<I>, Awaited<NoInfer<O>>, E, Shared>[];
    },
  ): Step<I, Awaited<O>, E, Id, Shared>;
  sync: ContextualSyncStepFactory<Shared>;
};

/**
 * Public synchronous step factory type.
 */
export type SyncStepFactory = ContextualSyncStepFactory & {
  /**
   * Bind the shared-state shape used by newly constructed steps.
   *
   * @typeParam Shared - Keys and value types accessible through this.context().state.
   * @returns A contextual synchronous factory with the same runtime construction behavior.
   * @remarks Takes no runtime arguments, adds no validation or state, and does not intentionally throw.
   */
  withContext<
    Shared extends ContextValues,
  >(): ContextualSyncStepFactory<Shared>;
};

/**
 * Public step factory type.
 */
export type StepFactory = ContextualStepFactory & {
  sync: SyncStepFactory;
  /**
   * Bind the shared-state shape used by newly constructed steps.
   *
   * @typeParam Shared - Keys and value types accessible through this.context().state.
   * @returns A contextual factory with the same runtime construction behavior.
   * @remarks Takes no runtime arguments, adds no validation or state, and does not intentionally throw.
   */
  withContext<Shared extends ContextValues>(): ContextualStepFactory<Shared>;
};
