import type { ContextValues, RunContextCapture } from "@/context/types.ts";
import type { Step, StepPlugin } from "@/step/types.ts";

/** One executable contract, including native callable steps and pipelines. */
export type WorkerCallable = (...args: never[]) => unknown;
/** Explicit data copied into a fresh worker-local context for one job. */
export interface WorkerContext {
  /** Structured-cloneable values; shared memory keeps its native sharing semantics. */
  readonly seed?: ContextValues;
  /** Local diagnostic capture; defaults to none. Snapshots are not sent back. */
  readonly capture?: RunContextCapture;
}
/** Immutable, import-safe description of one executable worker module. */
export interface WorkerDefinition<Fn extends WorkerCallable = WorkerCallable> {
  /** Absolute URL of a module whose default export is this definition. */
  readonly module: string;
  /**
   * Attach a caller-side plugin around each remote job.
   * @typeParam Plugin - Inferred native plugin, checked against this callable.
   * @param plugin - Native input, output, error or finally hooks for this callable.
   * @returns A new definition; the original registrations remain unchanged.
   * @throws No errors are intentionally thrown for a valid plugin. Hook failures
   * occur during execution under native Step semantics. Shared plugin objects may
   * receive concurrent calls; inner callable plugins still execute in the worker.
   */
  use<Plugin extends StepPlugin<Fn>>(plugin: Plugin): WorkerDefinition<Fn>;
  /** Type-only callable contract; never read or invoked by applications. */
  readonly __contract?: Fn;
}
/** Data descriptor created by a split builder; creating it does not execute work. */
export interface WorkerJob<Output = unknown> {
  /**
   * Supply worker-local context data for this job.
   * @param context - Cloneable seed and optional capture policy.
   * @returns A new descriptor. Arguments and seed are snapshotted at admission,
   * before caller input hooks; no parent context is copied or merged implicitly.
   * @throws WRK_CONFIG for an invalid context shape; non-cloneable data raises
   * WRK_CLONE when the containing batch is admitted.
   */
  withContext(context: WorkerContext): WorkerJob<Output>;
  /** Type-only output marker, preserving result inference without executing work. */
  readonly __output?: Output;
}
/** Capacity and failure limits dedicated to a single callable definition. */
export interface WorkerGroup<Fn extends WorkerCallable = WorkerCallable> {
  /** Single callable definition and its caller-side plugin registrations. */
  readonly worker: WorkerDefinition<Fn>;
  /** Positive maximum number of simultaneous instances, not a job multiplier. */
  readonly count: number;
  /** Initialization deadline in milliseconds, default 10000. */
  readonly startupTimeoutMs?: number;
  /** Dispatch-to-reply deadline in milliseconds, default 30000. */
  readonly timeoutMs?: number;
  /** Extra start attempts per group generation; default 2, zero disables them. */
  readonly maxRestarts?: number;
}
/** Named, independently scheduled worker groups. */
export type WorkerGroups = Record<string, WorkerGroup>;
/** Typed builders passed to split; each job retains its argument and output types. */
export type WorkerBuilders<Groups extends WorkerGroups> = {
  readonly [Key in keyof Groups]: {
    /**
     * Describe one invocation of this group's callable.
     * @param args - Exactly the callable's argument tuple.
     * @returns An inert job; submission happens only after split returns its tree.
     * @throws No errors are intentionally thrown. Admission validates ownership,
     * cloneability and the complete batch's capacity before any job hooks start.
     */
    job(
      ...args: Parameters<NonNullable<Groups[Key]["worker"]["__contract"]>>
    ): WorkerJob<
      Awaited<ReturnType<NonNullable<Groups[Key]["worker"]["__contract"]>>>
    >;
  };
};
/** Nested arrays/tuples of descriptors. Order is retained independently of scheduling. */
export type WorkerJobTree = readonly (WorkerJob | WorkerJobTree)[];
/** A job's final caller-side lifecycle outcome, including recovery/finalization. */
export type WorkerOutcome<Value> =
  | { readonly status: "fulfilled"; readonly value: Value }
  | { readonly status: "rejected"; readonly error: Error };
/** Map job leaves to outputs while preserving readonly array and tuple structure. */
export type WorkerResults<Tree> = Tree extends WorkerJob<infer Value> ? Value
  : WorkerJobTree extends Tree ? readonly unknown[]
  : { [Key in keyof Tree]: WorkerResults<Tree[Key]> };
/** Map job leaves to outcomes while preserving readonly array and tuple structure. */
export type WorkerOutcomes<Tree> = Tree extends WorkerJob<infer Value>
  ? WorkerOutcome<Value>
  : WorkerJobTree extends Tree ? readonly unknown[]
  : { [Key in keyof Tree]: WorkerOutcomes<Tree[Key]> };
/** Stable identity provided to custom transport constructors. */
export interface WorkerSlot {
  /** Unique identity for this instance, including replacements. */
  readonly id: string;
  /** Key of the configured group that owns this instance. */
  readonly group: string;
  /** Zero-based capacity slot within the group; retained across replacements. */
  readonly index: number;
  /** Number of this extra start attempt; initial workers use zero. */
  readonly restart: number;
  /** Module containing the default worker definition. */
  readonly module: string;
  /** Aborted on stop or startup expiry; async constructors must honor cancellation. */
  readonly signal: AbortSignal;
}
/** Minimal transport contract; Convee owns listeners, dispatch and termination. */
export interface WorkerTransport extends EventTarget {
  /**
   * Deliver one structured-cloneable protocol message without implicit transfers.
   * @param message - Initialization or invocation envelope.
   * @returns Nothing; replies arrive through message events.
   * @throws Clone/transport errors; Convee reports them through the job lifecycle.
   */
  postMessage(message: unknown): void;
  /**
   * Stop the underlying worker and release its resources.
   * @returns Nothing or a promise fulfilled after actual termination.
   * @throws Cleanup failures are reported after every transport is asked to stop.
   * Worker-local finally hooks cannot be guaranteed after a hard stop.
   */
  terminate(): void | Promise<unknown>;
}
/**
 * Construct a transport for an independently loadable bootstrap entry.
 * @param entry - Convee bootstrap URL, or a build integration's emitted entry.
 * @param slot - Group, definition module and instance identity.
 * @returns An owned transport, optionally asynchronously. A late result after
 * shutdown is terminated; custom constructors must honor slot.signal and release
 * their own failed setup. An unsettled constructor at the startup deadline makes
 * cleanup unconfirmed and prevents replacement or persistent reopening.
 * @throws Construction failures become WRK_STARTUP. No caller-thread fallback exists.
 */
export type CreateWorker = (
  entry: URL,
  slot: WorkerSlot,
) => WorkerTransport | Promise<WorkerTransport>;
/** Native async Step returned by parallel and exposed as a persistent owner's step. */
export type ParallelStep<Input extends unknown[], Output> = Step<
  Input,
  Awaited<Output>
>;
/** Configuration common to invocation-owned and persistent parallel execution. */
export interface ParallelOptions<
  Groups extends WorkerGroups,
  Input extends unknown[],
  Jobs extends WorkerJobTree,
  Output,
  Mode extends "all" | "collect" = "all",
> {
  /** Named definitions with independent instance counts and failure budgets. */
  readonly workers: Groups;
  /**
   * Build a nested job tree in the caller after outer input hooks.
   * @param workers - Strongly typed builders for the configured groups.
   * @param input - This step's input tuple.
   * @returns Descriptors or a promise of descriptors; use as const for heterogeneous tuples.
   * @throws Failures enter the outer step's error/finally lifecycle; no batch is admitted.
   */
  readonly split: (
    workers: WorkerBuilders<Groups>,
    ...input: Input
  ) => Jobs | Promise<Jobs>;
  /**
   * Aggregate ordered values or outcomes once, after every admitted job settles.
   * @param results - The exact nested split shape, including empty arrays.
   * @returns The step's output, optionally asynchronously.
   * @throws Failures enter the outer step's native error/finally lifecycle.
   */
  readonly join: (
    results: NoInfer<
      Mode extends "collect" ? WorkerOutcomes<Jobs> : WorkerResults<Jobs>
    >,
  ) => Output | Promise<Output>;
  /** Default all aggregates failures and skips join; collect passes every outcome. */
  readonly mode?: Mode;
  /** Positive whole-batch admission limit, default 1024; includes caller job hooks. */
  readonly maxPending?: number;
  /** Optional advanced runtime/build adapter; normal runtimes are selected automatically. */
  readonly createWorker?: CreateWorker;
  /** Native Step identity; generated when omitted. */
  readonly id?: string;
  /** Native caller-side plugins wrapping the complete parallel invocation. */
  readonly plugins?: StepPlugin<(...input: Input) => Output>[];
}
/** Optional lifetime policies; omitted values mean explicit, terminal close. */
export interface PersistentOptions {
  /** Permit a new generation after completed close; never after disposal/termination. */
  readonly reopenOnUse?: boolean;
  /** Positive idle duration in milliseconds; disabled when omitted. */
  readonly idleTimeoutMs?: number;
}
/** Explicit owner of a shared worker generation and its ordinary callable step. */
export interface PersistentParallel<Input extends unknown[], Output>
  extends AsyncDisposable {
  /** Ordinary callable Step sharing this owner's capacity and lifetime. */
  readonly step: ParallelStep<Input, Output>;
  /**
   * Warm every configured group without submitting jobs.
   * @returns A promise fulfilled when all initial instances are ready.
   * @throws WRK_STARTUP for failed initialization, or WRK_CLOSED after terminal close/disposal.
   * Failed groups remain unavailable until an explicitly closed, reopenable generation ends.
   */
  ready(): Promise<void>;
  /**
   * Stop admission, drain complete active invocations and release transports.
   * @returns A shared promise fulfilled after cleanup. With reopenOnUse, a later
   * call starts a fresh generation; calls during draining are rejected.
   * @throws Cleanup failures are reported after all transports were asked to stop.
   */
  close(): Promise<void>;
  /**
   * Stop transports immediately and make this owner permanently unusable.
   * @returns A promise fulfilled after transport termination; caller hooks may
   * still finish independently, since JavaScript promises cannot be forcibly cancelled.
   * @throws Transport cleanup failures. Unfinished jobs fail without automatic retry.
   */
  terminate(): Promise<void>;
  /**
   * Permanently stop admission and gracefully drain this owner.
   * @returns A cleanup promise; escaped steps cannot reopen a disposed owner.
   * @throws Cleanup failures; equivalent to async disposal, regardless of reopenOnUse.
   */
  dispose(): Promise<void>;
  /**
   * End an await-using scope through terminal graceful disposal.
   * @returns The disposal promise, awaited on scope exit including throws/returns.
   * @throws Cleanup failures propagate according to JavaScript disposal semantics.
   */
  [Symbol.asyncDispose](): Promise<void>;
}
