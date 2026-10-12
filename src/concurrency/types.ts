import type { StepInstance, StepPlugin, StepRunOptions } from "@/step/types.ts";

/**
 * One local function, native step or pipeline, retaining its callable contract.
 *
 * @param args - Concrete task arguments inferred from the supplied function.
 * @returns The task output or promise; scheduling awaits it and native cleanup.
 * @throws Task errors remain local and enter native task recovery/finalization.
 * This constraint does not invoke the function or add runtime validation.
 */
export type ConcurrentCallable = (...args: never[]) => unknown;

/** Optional capacity dedicated to a named callable within the selected scope's global limit. */
export interface ConcurrentTask<
  Fn extends ConcurrentCallable = ConcurrentCallable,
> {
  /** Callable invoked locally; closures, argument references and native hooks remain intact. */
  readonly run: Fn;
  /** Positive maximum active invocations of this task; defaults to the global limit. */
  readonly concurrency?: number;
}

/** Named local callables, optionally accompanied by an individual concurrency limit. */
export type ConcurrentTasks = Record<
  string,
  ConcurrentCallable | ConcurrentTask
>;

/** Infer the executable contract from a direct callable or a task configuration. */
export type ConcurrentTaskFunction<Task> = Task extends ConcurrentCallable
  ? Task
  : Task extends ConcurrentTask<infer Fn> ? Fn
  : never;

/** An inert invocation descriptor. Only descriptors created by this split are admitted. */
export interface ConcurrentJob<Output = unknown> {
  /** Opaque type-only brand; only builders produce descriptors. Absent at runtime. */
  readonly __concurrentJob: unique symbol;
  /** Type-only output marker retaining result inference. Absent at runtime. */
  readonly __output?: Output;
}

/** Named builders that validate job arguments and retain each callable's result type. */
export type ConcurrentBuilders<Tasks extends ConcurrentTasks> = {
  readonly [Key in keyof Tasks]: {
    /** Shared invocation signal; pass explicitly to cooperative tasks. Identical for every builder. */
    readonly signal: AbortSignal;
    /**
     * Describe a local task invocation without starting it.
     *
     * @param args - The configured callable's exact parameter tuple.
     * @returns An immutable descriptor retaining argument objects by reference.
     * @remarks Arguments are not cloned. No errors are intentionally thrown;
     * ownership, tree validity and capacity are checked after split completes.
     */
    job(...args: Parameters<ConcurrentTaskFunction<Tasks[Key]>>): ConcurrentJob<
      Awaited<ReturnType<ConcurrentTaskFunction<Tasks[Key]>>>
    >;
  };
};

/** Invocation-local task builders passed directly to split, as in worker parallel execution. */
export type ConcurrentScope<Tasks extends ConcurrentTasks> = ConcurrentBuilders<
  Tasks
>;

/** Dense, acyclic nested arrays and tuples of job descriptors, including empty arrays. */
export type ConcurrentJobTree = readonly (ConcurrentJob | ConcurrentJobTree)[];

/** One task's complete lifecycle outcome, including recovery and finalization. */
export type ConcurrentOutcome<Value> =
  | { readonly status: "fulfilled"; readonly value: Value }
  | { readonly status: "rejected"; readonly error: Error };

/** Replace descriptors with outputs, retaining the split's readonly tuple/array shape. */
export type ConcurrentResults<Tree> = Tree extends ConcurrentJob<infer Value>
  ? Value
  : ConcurrentJobTree extends Tree ? readonly unknown[]
  : { [Key in keyof Tree]: ConcurrentResults<Tree[Key]> };

/** Replace descriptors with outcomes, retaining the split's readonly tuple/array shape. */
export type ConcurrentOutcomes<Tree> = Tree extends ConcurrentJob<infer Value>
  ? ConcurrentOutcome<Value>
  : ConcurrentJobTree extends Tree ? readonly unknown[]
  : { [Key in keyof Tree]: ConcurrentOutcomes<Tree[Key]> };

/** Native per-invocation plugins/context plus cooperative scheduling controls. */
export type ConcurrentRunOptions<Fn extends ConcurrentCallable> =
  & StepRunOptions<Fn>
  & {
    /** Stop queued jobs and signal running work; the run still drains actual task cleanup. */
    readonly signal?: AbortSignal;
    /** Positive split/jobs/join deadline in ms. No default; overrides the definition value. */
    readonly timeoutMs?: number;
  };

/** Native async step controls, with cancellation-aware invocation options. */
export interface ConcurrentInstance<Input extends unknown[], Output>
  extends StepInstance<(...args: Input) => Output> {
  /**
   * Execute with temporary plugins/context and optional cooperative cancellation.
   *
   * @param options - Native run settings, external signal and optional deadline.
   * @param input - Exact input tuple supplied to split after outer input hooks.
   * @returns The awaited join result after native output/error/finally hooks.
   * @throws Native outer hook failures, CNC_BATCH with every task failure, or
   * CNC_CONFIG, CNC_CAPACITY, CNC_ABORTED or CNC_TIMEOUT. Cancellation is reported
   * only after running tasks finish cleanup.
   * @remarks Deadlines start after input hooks. A non-cooperative task, split or
   * join can delay completion indefinitely; arbitrary JavaScript is never killed.
   */
  runWith(
    options: ConcurrentRunOptions<(...args: Input) => Output>,
    ...input: Input
  ): Promise<Awaited<Output>>;
}

/**
 * Callable native step with invocation-owned capacity unless sharing is explicitly configured.
 *
 * @param input - Input tuple passed through outer hooks to split.
 * @returns The awaited join result after native lifecycle hooks.
 * @throws CNC_BATCH aggregates unrecovered task failures. Native outer hook failures
 * and configuration, admission, cancellation or timeout errors also reject the call.
 * All started tasks finish before outer cleanup.
 */
export type ConcurrentStep<Input extends unknown[], Output> =
  & ConcurrentInstance<Input, Output>
  & ((...input: Input) => Promise<Awaited<Output>>);

/** Configuration for typed same-runtime task composition and explicit capacity ownership. */
export interface ConcurrentOptions<
  Tasks extends ConcurrentTasks,
  Input extends unknown[],
  Jobs extends ConcurrentJobTree,
  Output,
  Mode extends "all" | "collect" = "all",
> {
  /** Named callables, steps or pipelines; configuration is captured at construction. */
  readonly tasks: Tasks;
  /** Global active-task limit within the selected capacity scope; positive integer, default 8. */
  readonly concurrency?: number;
  /** Each invocation owns its budget by default. shared explicitly reuses one budget across calls. */
  readonly capacityScope?: "invocation" | "shared";
  /** Active plus queued task limit within the selected scope; positive integer, default 1024. */
  readonly maxPending?: number;
  /** Optional positive cooperative split/jobs/join deadline; no timeout by default. */
  readonly timeoutMs?: number;
  /**
   * Create a finite job tree before any task is admitted.
   *
   * @param scope - Direct invocation-local builders, each exposing the same cooperative signal.
   * @param input - Native step inputs after input hooks.
   * @returns A dense nested job tree, optionally asynchronously; as const preserves tuples.
   * @throws Failures enter outer error/finally hooks; no task from this split starts.
   */
  readonly split: (
    scope: ConcurrentScope<Tasks>,
    ...input: Input
  ) => Jobs | Promise<Jobs>;
  /**
   * Combine ordered task values or collected outcomes after all tasks finish cleanup.
   *
   * @param results - Exact nested split shape, independent of completion order.
   * @returns The invocation output, optionally asynchronously.
   * @throws Failures enter native outer error/finally hooks. Cancellation skips
   * join if it has not started; an already-running join is awaited before cleanup.
   */
  readonly join: (
    results: NoInfer<
      Mode extends "collect" ? ConcurrentOutcomes<Jobs>
        : ConcurrentResults<Jobs>
    >,
  ) => Output | Promise<Output>;
  /** all drains then throws CNC_BATCH aggregating every failure; collect joins ordered outcomes. */
  readonly mode?: Mode;
  /** Native outer step identity; generated when omitted. */
  readonly id?: string;
  /** Native plugins around the entire split/tasks/join invocation. */
  readonly plugins?: StepPlugin<(...input: Input) => Output>[];
}
