import type { StepFromFunction, StepOptions } from "@/step/types.ts";

/** A synchronous guest function. Loading and Convee execution remain asynchronous. */
export type WasmCallable = (...args: never[]) => unknown;
/** Names of callable, synchronous exports. Resources and asynchronous exports are excluded. */
export type WasmFunctionKey<Exports> =
  & {
    [Key in keyof Exports]: Exports[Key] extends WasmCallable
      ? [Extract<ReturnType<Exports[Key]>, PromiseLike<unknown>>] extends
        [never] ? Key : never
      : never;
  }[keyof Exports]
  & string;
/** One independently owned instance and its generated bindings. */
export interface WasmSession<Exports extends object> {
  /** Generated callable exports; mutable imported state must belong to this session. */
  readonly exports: Exports;
  /**
   * Recognize an expected domain error that leaves the instance safe for reuse.
   * @param error - Original exception, before native Step normalization.
   * @returns True only for known application failures; omitted means all failures are unsafe.
   * @throws A classifier failure retires the session and preserves both errors.
   */
  readonly isApplicationError?: (error: unknown) => boolean;
  /**
   * Release host resources owned by this session.
   * @returns Nothing, or a promise after cleanup; called at most once by the owner.
   * @throws Cleanup failures are reported and prevent unsafe replacement/reopening.
   * Dropping guest references does not guarantee immediate GC or OS memory return.
   */
  readonly dispose?: () => void | Promise<void>;
}
/** Adapter contract for prepared code and independent, synchronous guest sessions. */
export interface WasmBindings<Exports extends object> {
  /**
   * Prepare reusable code without creating an instance or invoking exports.
   * @returns A promise fulfilled when all required code is prepared.
   * @throws Loading, integrity or compilation errors reject. Implementations must
   * deduplicate preparation and document retries; no detached rejection is allowed.
   */
  preload(): Promise<void>;
  /**
   * Create one independently owned binding session from prepared code.
   * @returns A new session; never a hidden singleton shared with another owner.
   * @throws Initialization errors reject. The adapter must clean partially created
   * host resources before rejecting. It must not reacquire its own Convee owner.
   */
  create(): Promise<WasmSession<Exports>>;
}
/** Loading and capacity options shared by both ownership variants. */
export interface WasmOptions<Exports extends object> {
  /** Generated binding adapter. Sharing it shares code preparation, not instances. */
  readonly bindings: WasmBindings<Exports>;
  /** Lazy by default. Eager starts code preparation only, wherever this definition loads. */
  readonly loading?: "lazy" | "eager";
  /** Maximum admitted calls, including hooks/finalizers; default 1024. Overload rejects. */
  readonly maxPending?: number;
}
/** Persistent instance lifecycle, using the same policy names as persistent workers. */
export interface PersistentWasmOptions<Exports extends object>
  extends WasmOptions<Exports> {
  /** Extra instance creation attempts after unsafe execution; default 2. No call is replayed. */
  readonly maxRestarts?: number;
  /** Permit fresh state after completed explicit/idle close; default false. */
  readonly reopenOnUse?: boolean;
  /** Optional positive idle period, measured only when no complete call or warmup remains. */
  readonly idleTimeoutMs?: number;
}
/** Typed ordinary steps backed by a shared preparation resource. */
export interface WasmResource<Exports extends object> {
  /**
   * Load and prepare code without allocating a live guest instance.
   * @returns Completion of adapter preparation; concurrent requests share its work.
   * @throws Preparation failures reject directly. Persistent closed/disposed owners reject.
   * This does not warm another worker or guarantee completion of engine tiering.
   */
  preload(): Promise<void>;
  /**
   * Bind one generated export as an ordinary asynchronous Convee Step.
   * @typeParam Key - Inferred callable export name, with IntelliSense and compiler checking.
   * @param name - Export selected at execution, after input plugins.
   * @param options - Native step identity and plugins.
   * @returns A reusable Step preserving the export's input tuple and output type.
   * @throws Invalid names/options fail setup; absent runtime exports fail execution.
   * Body failures use native error hooks. Outputs are copied to owned JS values.
   */
  step<Key extends WasmFunctionKey<Exports>>(
    name: Key,
    options?: StepOptions<Extract<Exports[Key], WasmCallable>>,
  ): StepFromFunction<Extract<Exports[Key], WasmCallable>>;
}
/** Owner of one exclusive guest session shared across its bound steps. */
export interface PersistentWasm<Exports extends object>
  extends WasmResource<Exports> {
  /**
   * Prepare code and initialize the live session, without calling application exports.
   * @returns Completion of warmup; repeated calls reuse the same live instance.
   * @throws Startup, closed, reentrant or capacity errors reject directly.
   */
  ready(): Promise<void>;
  /**
   * Stop admission and drain complete calls, then release the session.
   * @returns The shared close promise; reopening is possible only after it fulfills.
   * @throws Cleanup errors reject and prohibit reopening. Do not await close from
   * within one of this owner's own hooks/imports: it waits for that call to finish.
   */
  close(): Promise<void>;
  /**
   * Permanently close, including previously obtained steps.
   * @returns Completion of graceful draining and cleanup.
   * @throws Cleanup failures reject. Disposal cannot preempt synchronous guest code.
   */
  dispose(): Promise<void>;
  /**
   * Dispose at the end of an await-using scope.
   * @returns The terminal disposal promise.
   * @throws The same cleanup errors as dispose; garbage collection is not a substitute.
   */
  [Symbol.asyncDispose](): Promise<void>;
}
