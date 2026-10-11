import type { ContextValues, RunContextCapture } from "@/context/types.ts";
import type { MaybePromise } from "@/core/types.ts";
import type { NormalizePipeOutput, ValidLinks } from "@/pipe/types.ts";
import type { AnyPlugin, PluginInputResult } from "@/plugin/types.ts";
import type { Step } from "@/step/types.ts";
import type { WorkerError } from "@/workers/error.ts";

/**
 * Executable function signature accepted from a worker task factory.
 *
 * @param args - Arguments delivered through structured cloning for the selected task.
 *
 * @returns A value or promise; the host awaits it and sends a cloneable result to the parent.
 * @throws Thrown/rejected task failures are reported as `WRK_TASK` with a remote diagnostic.
 * Non-cloneable results become worker job failures rather than retaining live objects.
 */
export type WorkerCallable = (...args: never[]) => unknown;
/**
 * Named zero-argument factories used to construct worker-local executable tasks.
 *
 * Each factory returns a function, callable step or callable pipeline. Factories
 * run during host initialization, separately for configured task and recipe nodes,
 * so state can persist in their returned callables across jobs on the same worker.
 * Thrown factory errors or invalid returns fail startup. No functions are transferred
 * from the parent; it references these names through job descriptors.
 */
export type WorkerTaskFactories = Record<string, () => WorkerCallable>;
/**
 * Named factories used to construct worker-local plugins from cloneable options.
 *
 * Each factory accepts zero or one configuration argument and returns a plugin
 * descriptor with an ID. The host calls it when attaching recipe or role plugins;
 * thrown factory errors or invalid descriptors fail initialization. Captured plugin
 * state belongs to that worker, while each job gets a fresh Convee run context.
 */
export type WorkerPluginFactories = Record<
  string,
  (...args: never[]) => { readonly id: string }
>;
/** Module contract returned by workerRegistry; import its type in the caller. */
export interface WorkerRegistry<
  Tasks extends WorkerTaskFactories = WorkerTaskFactories,
  Plugins extends WorkerPluginFactories = WorkerPluginFactories,
> {
  /** Registered factories for functions, steps and pipelines. */
  readonly tasks: Tasks;
  /** Registered plugin factories; their options travel as data. */
  readonly plugins: Plugins;
}

/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerPluginOptions<F extends (...args: never[]) => unknown> =
  Parameters<F> extends [] ? { readonly options?: never }
    : undefined extends Parameters<F>[0]
      ? { readonly options?: Parameters<F>[0] }
    : { readonly options: Parameters<F>[0] };
/** A plugin name with the options required by its registered factory. */
export type WorkerPluginReference<R extends WorkerRegistry> = {
  [K in keyof R["plugins"] & string]:
    & { readonly name: K }
    & WorkerPluginOptions<R["plugins"][K]>;
}[keyof R["plugins"] & string];

/** A registered task, optionally with a recipe-local ID and attached plugins. */
export type WorkerTaskReference<R extends WorkerRegistry> =
  | (keyof R["tasks"] & string)
  | {
    readonly task: keyof R["tasks"] & string;
    readonly id?: string;
    readonly plugins?: readonly WorkerPluginReference<R>[];
  };
/** Data-only sequential composition of registered tasks or prebuilt pipelines. */
export interface WorkerRecipe<R extends WorkerRegistry> {
  /** Nonempty ordered children, following normal Convee array/tuple transport. */
  readonly steps: readonly [
    WorkerTaskReference<R>,
    ...WorkerTaskReference<R>[],
  ];
  /** Untargeted plugins around the whole recipe; child plugins belong on nodes. */
  readonly plugins?: readonly WorkerPluginReference<R>[];
}

/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerReferenceName<Ref> = Ref extends string ? Ref
  : Ref extends { task: infer K } ? K
  : never;
/** Advanced inference helper for worker registry and composition contracts. */
export type RegisteredWorkerTask<R extends WorkerRegistry, Ref> =
  WorkerReferenceName<Ref> extends keyof R["tasks"]
    ? ReturnType<R["tasks"][WorkerReferenceName<Ref>]>
    : never;
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerRecipeFunctions<
  R extends WorkerRegistry,
  Nodes extends readonly unknown[],
> = {
  [K in keyof Nodes]: RegisteredWorkerTask<R, Nodes[K]>;
};
/** Advanced inference helper for worker registry and composition contracts. */
export type LastWorkerNode<T extends readonly unknown[]> = T extends
  readonly [...unknown[], infer L] ? L : never;
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerRecipeFunction<
  R extends WorkerRegistry,
  P extends WorkerRecipe<R>,
> = (
  ...args: Parameters<RegisteredWorkerTask<R, P["steps"][0]>>
) => Promise<
  Awaited<ReturnType<RegisteredWorkerTask<R, LastWorkerNode<P["steps"]>>>>
>;
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerPluginInputFits<P, F extends WorkerCallable> = P extends
  { input: (...args: infer I) => infer O }
  ? Parameters<F> extends I
    ? Awaited<O> extends PluginInputResult<Parameters<F>> ? true : false
  : false
  : true;
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerPluginOutputFits<P, F extends WorkerCallable> = P extends
  { output: (value: infer I) => infer O }
  ? Awaited<ReturnType<F>> extends I
    ? Awaited<O> extends Awaited<ReturnType<F>> ? true : false
  : false
  : true;
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerPluginErrorFits<P, F extends WorkerCallable> = P extends
  { error: (...args: infer I) => infer O }
  ? [Error, Parameters<F>] extends I
    ? Awaited<O> extends Awaited<ReturnType<F>> | Error ? true : false
  : false
  : true;
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerPluginFits<P, F extends WorkerCallable> = false extends
  | WorkerPluginInputFits<P, F>
  | WorkerPluginOutputFits<P, F>
  | WorkerPluginErrorFits<P, F> ? false
  : true;
/** Advanced inference helper for worker registry and composition contracts. */
export type ValidateWorkerPlugins<
  R extends WorkerRegistry,
  Refs,
  F extends WorkerCallable,
> = Refs extends readonly unknown[] ? {
    [K in keyof Refs]: Refs[K] extends
      { name: infer N extends keyof R["plugins"] }
      ? WorkerPluginFits<ReturnType<R["plugins"][N]>, F> extends true ? Refs[K]
      : never
      : never;
  }
  : Refs;
/** Advanced inference helper for worker registry and composition contracts. */
export type ValidateWorkerNodes<
  R extends WorkerRegistry,
  Nodes extends readonly unknown[],
> = {
  [K in keyof Nodes]: Nodes[K] extends { plugins: infer P } ? Nodes[K] & {
      readonly plugins: ValidateWorkerPlugins<
        R,
        P,
        RegisteredWorkerTask<R, Nodes[K]>
      >;
    }
    : Nodes[K];
};
/** Advanced inference helper for worker registry and composition contracts. */
export type ValidateWorkerRecipe<
  R extends WorkerRegistry,
  P extends WorkerRecipe<R>,
> = ValidLinks<WorkerRecipeFunctions<R, P["steps"]>> extends true ? P & {
    readonly steps: ValidateWorkerNodes<R, P["steps"]>;
    readonly plugins?: ValidateWorkerPlugins<
      R,
      P["plugins"],
      WorkerRecipeFunction<R, P>
    >;
  }
  : never;

/** Callable contracts exposed by a registry and additional configured recipes. */
export type WorkerTasks<R extends WorkerRegistry, C> =
  & {
    [K in keyof R["tasks"]]: ReturnType<R["tasks"][K]>;
  }
  & (C extends { pipelines: infer P extends Record<string, WorkerRecipe<R>> }
    ? {
      [K in keyof P]: WorkerRecipeFunction<R, P[K]>;
    }
    : Record<never, never>);
/** Callable contracts indexed by their remote task names. */
export type WorkerTaskMap = Record<string, WorkerCallable>;
/** Cloneable context data; no parent context or live state crosses a worker boundary. */
export interface WorkerContext {
  /** Initial values in a fresh job context. */
  readonly seed?: ContextValues;
  /** Local snapshot retention; defaults to none for worker jobs. */
  readonly capture?: RunContextCapture;
}
/** Advanced inference helper for worker registry and composition contracts. */
export type WorkerRoleSelection<Role extends string> = [Role] extends
  ["default"] ? { readonly role?: Role } : { readonly role: Role };
/** Per-job role and explicit context seed. */
export type WorkerJobOptions<Role extends string = "default"> =
  & WorkerRoleSelection<Role>
  & {
    readonly context?: WorkerContext;
  };
/** A data-only invocation of one task; use pool.job for inference in mixed tuples. */
export type WorkerJob<
  Tasks extends WorkerTaskMap,
  Role extends string = "default",
> = {
  [K in keyof Tasks & string]: {
    readonly task: K;
    readonly args: Readonly<Parameters<Tasks[K]>>;
  } & WorkerJobOptions<Role>;
}[keyof Tasks & string];
/** Result of one task, preserving failures for collect mode. */
export type WorkerOutcome<Value> =
  | { readonly status: "fulfilled"; readonly value: Value }
  | { readonly status: "rejected"; readonly error: WorkerError };
/** Maps a heterogeneous job tuple to its corresponding output tuple. */
export type WorkerResults<
  Tasks extends WorkerTaskMap,
  Jobs extends readonly { task: keyof Tasks }[],
> = {
  readonly [K in keyof Jobs]: Awaited<ReturnType<Tasks[Jobs[K]["task"]]>>;
};
/** Ordered success/failure outcomes for a heterogeneous job tuple. */
export type WorkerOutcomes<
  Tasks extends WorkerTaskMap,
  Jobs extends readonly { task: keyof Tasks }[],
> = {
  readonly [K in keyof Jobs]: WorkerOutcome<
    Awaited<ReturnType<Tasks[Jobs[K]["task"]]>>
  >;
};

/** Minimal Web Worker transport, also usable with bundler-specific constructors. */
export interface WorkerTransport extends EventTarget {
  /**
   * Send one data-only protocol message to the worker.
   *
   * @param message - Structured-cloneable initialization or job message supplied by the pool.
   * @returns Nothing; the transport later emits message, error or messageerror events.
   * @throws Transport or cloning failures may be thrown. The pool converts send failures
   * to worker failures and closes unsafe resources; implementations must not silently drop messages.
   */
  postMessage(message: unknown): void;
  /**
   * Stop the worker immediately and release its transport resources.
   *
   * @returns Nothing; pending worker-local work and finalizers are not guaranteed to finish.
   * @throws A custom transport may throw on cleanup failure. The pool records this as
   * `WRK_CRASH` for close(), while still attempting cleanup of all other transports.
   */
  terminate(): void;
}
/** Information passed to a custom worker constructor. */
export interface WorkerSlot {
  /** Pool-local worker identity. */
  readonly id: string;
  /** Configured routing role. */
  readonly role: string;
}
/** One group of workers with a fixed task selection and plugin setup. */
export interface WorkerRole<R extends WorkerRegistry> {
  /** Number of workers in this role. */
  readonly size: number;
  /** RegisteredWorkerTask/recipe names available in this role; omitted means all. */
  readonly tasks?: readonly string[];
  /** Additional outer plugins for selected tasks in this role. */
  readonly plugins?: Readonly<
    Record<string, readonly WorkerPluginReference<R>[]>
  >;
}
/** Pool setup; use size for homogeneous workers or roles for explicit routing. */
export type WorkerPoolOptions<R extends WorkerRegistry> =
  & {
    /** Absolute URL of a module whose default export is a workerRegistry. */
    readonly module: URL;
    /** Additional pipelines constructed from registered factories. */
    readonly pipelines?: Readonly<Record<string, WorkerRecipe<R>>>;
    /** Maximum admitted jobs across queued and executing work; default 1024. */
    readonly maxPending?: number;
    /** Maximum worker initialization time in milliseconds; default 10000. */
    readonly startupTimeoutMs?: number;
    /** Maximum execution time per dispatched job in milliseconds; default 30000. */
    readonly timeoutMs?: number;
    /**
     * Construct a transport for one lazily started pool slot.
     *
     * @param entry - Convee module-worker bootstrap URL to load, or adapt for a bundler.
     * @param slot - Pool-local worker ID and configured routing role.
     * @returns A WorkerTransport implementing the message protocol and termination lifecycle.
     * @throws Constructor failures become startup WorkerErrors and close the pool.
     * Each successful return transfers transport cleanup responsibility to the pool.
     */
    readonly createWorker?: (entry: URL, slot: WorkerSlot) => WorkerTransport;
  }
  & (
    | { readonly size: number; readonly roles?: never }
    | {
      readonly roles: Readonly<Record<string, WorkerRole<R>>>;
      readonly size?: never;
    }
  );
/** Inferred routing names; heterogeneous pools require an explicit role on each job. */
export type WorkerRoles<C> = C extends { roles: infer R } ? keyof R & string
  : "default";
/** Advanced inference helper for worker registry and composition contracts. */
export type ValidateWorkerRoles<R extends WorkerRegistry, C> = C extends
  { roles: infer Roles } ? {
    readonly roles: {
      [K in keyof Roles]: Roles[K] & {
        readonly tasks?: readonly (keyof WorkerTasks<R, C> & string)[];
        readonly plugins?: Roles[K] extends { plugins: infer P } ? {
            [N in keyof P]: N extends keyof WorkerTasks<R, C>
              ? ValidateWorkerPlugins<R, P[N], WorkerTasks<R, C>[N]>
              : never;
          }
          : never;
      };
    };
  }
  : unknown;
/** Validation applied by the curried typed pool factory. */
export type ValidateWorkerPool<
  R extends WorkerRegistry,
  C extends WorkerPoolOptions<R>,
> =
  & ValidateWorkerRoles<R, C>
  & (C extends { pipelines: infer P extends Record<string, WorkerRecipe<R>> }
    ? {
      readonly pipelines: {
        [K in keyof P]: K extends keyof R["tasks"] ? never
          : ValidateWorkerRecipe<R, P[K]>;
      };
    }
    : unknown);

/** Reusable bounded worker resources, independent of individual Step invocations. */
export interface WorkerPool<
  Tasks extends WorkerTaskMap,
  Role extends string = "default",
> {
  /** Total configured workers, shared by all callers. */
  readonly size: number;
  /**
   * Describe one typed remote invocation without dispatching or cloning it.
   *
   * @param task - Registered task or configured recipe name.
   * @param args - Exact argument tuple for the selected task; values must be cloneable at submission.
   * @param options - Explicit role for heterogeneous pools and optional fresh-job context seed/capture.
   * @returns A descriptor retaining args and context references until run/settle snapshots them.
   * @throws Exceptions raised while spreading options propagate. Validation, cloning,
   * capacity checks and execution happen only when the descriptor is submitted.
   */
  job<K extends keyof Tasks & string>(
    task: K,
    args: Readonly<Parameters<Tasks[K]>>,
    ...options: [Role] extends ["default"] ? [options?: WorkerJobOptions<Role>]
      : [options: WorkerJobOptions<Role>]
  ):
    & { readonly task: K; readonly args: Readonly<Parameters<Tasks[K]>> }
    & WorkerJobOptions<Role>;
  /**
   * Start workers lazily and wait for every configured slot to initialize.
   *
   * @returns A Promise fulfilled once all workers report compatible task registries.
   * Repeated calls share startup; later job submission also starts workers automatically.
   * @throws Rejects with WorkerError on startup/configuration/protocol/transport failure
   * or initialization timeout. A closed pool rejects with its stored failure or `WRK_CLOSED`.
   * Startup failure closes the pool and settles any admitted jobs without retry.
   */
  ready(): Promise<void>;
  /**
   * Submit one job and await its successful output.
   *
   * @param job - Descriptor with task, cloneable argument tuple, role and optional context.
   * @returns A Promise of the task's awaited result, received through structured cloning.
   * @throws Rejects on admission failures (`WRK_CONFIG`, `WRK_CLONE`, `WRK_CAPACITY`,
   * `WRK_CLOSED`) or the job's WorkerError. Execution failures include remote task errors,
   * startup failure, transport/protocol failure and timeout; no automatic retry occurs.
   * Property access failures while reading the descriptor also reject the promise.
   */
  run<J extends WorkerJob<Tasks, Role>>(
    job: J,
  ): Promise<Awaited<ReturnType<Tasks[J["task"]]>>>;
  /**
   * Atomically admit a batch, then await outcomes in input order.
   *
   * @param jobs - Ordered descriptors; validation/cloning completes before any are admitted.
   * An empty batch returns [] without starting workers, but still checks pool admission state.
   * @returns A Promise of fulfilled/rejected outcomes in tuple order, independent of completion
   * order. Admitted job failures are values, including failures caused by pool shutdown.
   * @throws Rejects the entire batch before admission for invalid configuration, non-cloneable
   * inputs, insufficient capacity or a closing/closed pool. Input property-access errors
   * also reject. No partial admission or automatic retry occurs.
   */
  settle<const Jobs extends readonly WorkerJob<Tasks, Role>[]>(
    jobs: Jobs,
  ): Promise<WorkerOutcomes<Tasks, Jobs>>;
  /**
   * Stop accepting new jobs, drain admitted work, then terminate worker transports.
   *
   * @returns A Promise fulfilled after all admitted jobs settle and transport cleanup completes.
   * Repeated calls share the drain result; an unused pool closes without spawning workers.
   * @throws Rejects with `WRK_CRASH` if listener removal or transport termination fails,
   * after cleanup is attempted for every transport. Job failures remain in their own outcomes.
   * @remarks This is graceful pool shutdown; an individual job timeout or crash may still
   * force termination, in which case worker-local finalizers are not guaranteed.
   */
  close(): Promise<void>;
  /**
   * Immediately abort the pool and settle queued and executing work.
   *
   * @returns Nothing; outstanding jobs settle with `WRK_CLOSED` and later submissions reject.
   * Repeated calls after closure are no-ops, and worker-local finalizers are not guaranteed.
   * @remarks Transport cleanup exceptions are captured rather than thrown here. Observe
   * close() for a cleanup rejection; no retries or replacement workers are started.
   */
  terminate(): void;
}
/** Inference-preserving factory obtained from workerPool.for<typeof registry>(). */
export interface TypedWorkerPoolFactory<R extends WorkerRegistry> {
  /**
   * Validate and snapshot configuration for a lazily started worker pool.
   *
   * @param options - Registry module URL, size or named roles, optional recipes,
   * capacity/time limits and transport constructor. Configuration data must be cloneable.
   * @returns A typed WorkerPool with bounded shared resources; no worker has started yet.
   * @throws WorkerError with `WRK_CONFIG` for invalid shapes, limits, names or recipes,
   * and `WRK_CLONE` for non-cloneable setup data. Option accessor exceptions propagate.
   * Registry imports, factories and available task names are validated later during startup.
   */
  <const C extends WorkerPoolOptions<R>>(
    options: C & ValidateWorkerPool<R, C>,
  ): WorkerPool<WorkerTasks<R, C>, WorkerRoles<C>>;
}
/** Typed factory facade; registry imports in the parent can be type-only. */
export interface WorkerPoolFactory {
  /**
   * Bind a worker registry's types before inferring pool recipes and role names.
   *
   * @typeParam R - Registry type imported from the application's worker module; may be type-only.
   * @returns A configuration factory that produces a WorkerPool with inferred job/result types.
   * @remarks Takes no runtime arguments, imports no worker module and does not intentionally
   * throw. Configuration validation and resource ownership begin when the returned factory is called.
   */
  for<R extends WorkerRegistry>(): TypedWorkerPoolFactory<R>;
}
/** Shared options for a parallel Step. split and join execute in the calling thread. */
export interface ParallelOptions<
  Tasks extends WorkerTaskMap,
  Role extends string,
  Input extends unknown[],
  Jobs extends readonly WorkerJob<Tasks, Role>[],
  Output,
  Mode extends "all" | "collect",
> {
  /** Reusable execution resources. */
  workers: WorkerPool<Tasks, Role>;
  /**
   * Build the ordered batch for one parallel-step invocation in the calling thread.
   *
   * @param args - Input tuple after the outer step's input plugins have run.
   * @returns A job tuple or promise; tuple positions determine join's result positions.
   * @throws A thrown/rejected callback failure enters the outer step's body-error handling;
   * no jobs from this invocation are submitted until split succeeds.
   */
  split: (...args: Input) => MaybePromise<Jobs>;
  /**
   * Combine remote outcomes in the calling thread after every admitted job settles.
   *
   * @param results - Ordered values in all mode, or explicit success/failure outcomes in collect mode.
   * @returns The combined output or promise, then passed through the outer step's output hooks.
   * @throws A thrown/rejected callback failure enters the outer step's body-error handling.
   * In all mode, any failed job prevents join from running; an empty batch still calls join.
   */
  join: (
    results: Mode extends "collect" ? WorkerOutcomes<Tasks, Jobs>
      : WorkerResults<Tasks, Jobs>,
  ) => MaybePromise<Output>;
  /** all requires every job to succeed; collect passes failures to join. */
  mode?: Mode;
  /** Identity of the ordinary outer Convee step. */
  id?: string;
  /** Plugins around split, remote execution and join. */
  plugins?: AnyPlugin<NoInfer<Input>, Awaited<NoInfer<Output>>>[];
}
/** Result type of a parallel factory, retaining the normal Step API. */
export type ParallelStep<Input extends unknown[], Output> = Step<
  Input,
  Awaited<Output>
>;

// Keep tuple transport linked to the core contract in declaration consumers.
/** How a worker recipe passes each output to its next child. */
export type WorkerNextArguments<Output> = NormalizePipeOutput<Output>;
