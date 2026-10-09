import type { ContextValues, RunContextCapture } from "@/context/types.ts";
import type { MaybePromise } from "@/core/types.ts";
import type { NormalizePipeOutput, ValidLinks } from "@/pipe/types.ts";
import type { AnyPlugin, PluginInputResult } from "@/plugin/types.ts";
import type { Step } from "@/step/types.ts";
import type { WorkerError } from "@/workers/error.ts";

/** A function, callable step or callable pipeline that a worker can execute. */
export type WorkerCallable = (...args: never[]) => unknown;
/** Factories create independent definitions for each configured task/recipe node. */
export type WorkerTaskFactories = Record<string, () => WorkerCallable>;
/** Plugin factories take zero or one configuration argument. */
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
  /** Post a structured-cloned message. */
  postMessage(message: unknown): void;
  /** Stop the worker immediately; its finalizers are not guaranteed to run. */
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
    /** Override the bootstrap transport for bundlers or transport adapters. */
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
  /** Construct a precisely typed job descriptor without dispatching it. */
  job<K extends keyof Tasks & string>(
    task: K,
    args: Readonly<Parameters<Tasks[K]>>,
    ...options: [Role] extends ["default"] ? [options?: WorkerJobOptions<Role>]
      : [options: WorkerJobOptions<Role>]
  ):
    & { readonly task: K; readonly args: Readonly<Parameters<Tasks[K]>> }
    & WorkerJobOptions<Role>;
  /** Initialize every worker; automatically awaited by jobs. */
  ready(): Promise<void>;
  /** Execute one job, rejecting on its failure. */
  run<J extends WorkerJob<Tasks, Role>>(
    job: J,
  ): Promise<Awaited<ReturnType<Tasks[J["task"]]>>>;
  /** Atomically admit a batch and await ordered outcomes; never retries jobs. */
  settle<const Jobs extends readonly WorkerJob<Tasks, Role>[]>(
    jobs: Jobs,
  ): Promise<WorkerOutcomes<Tasks, Jobs>>;
  /** Drain admitted jobs and terminate workers; reject if transport cleanup fails. */
  close(): Promise<void>;
  /** Immediately terminate the pool and reject outstanding work. */
  terminate(): void;
}
/** Inference-preserving factory obtained from workerPool.for<typeof registry>(). */
export interface TypedWorkerPoolFactory<R extends WorkerRegistry> {
  <const C extends WorkerPoolOptions<R>>(
    options: C & ValidateWorkerPool<R, C>,
  ): WorkerPool<WorkerTasks<R, C>, WorkerRoles<C>>;
}
/** Typed factory facade; registry imports in the parent can be type-only. */
export interface WorkerPoolFactory {
  /** Bind the worker module's registry contract, then infer recipe and role types. */
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
  /** Turn input into an ordered job list; an empty list still calls join. */
  split: (...args: Input) => MaybePromise<Jobs>;
  /** Combine either successful values or explicit outcomes. */
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
