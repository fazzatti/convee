import type { ContextValues } from "@/context/types.ts";
import { StepEngine, SyncStepEngine } from "@/step/step.ts";
import type {
  AnyStepFn,
  AnySyncStepFn,
  ContextualStepFactory,
  ContextualSyncStepFactory,
  StepFactory,
  StepFromFunction,
  StepOptions,
  SyncStepFactory,
  SyncStepFromFunction,
} from "@/step/types.ts";

/**
 * Internal implementation used by the exported `step` callable object.
 */
const createStep = <
  Fn extends AnyStepFn,
  E extends Error = Error,
  Id extends string = string,
>(
  fn: Fn,
  options?: StepOptions<Fn, E> & { id?: Id },
): StepFromFunction<Fn, E, Id> =>
  StepEngine.create(fn, options) as StepFromFunction<Fn, E, Id>;

/**
 * Internal implementation used by `step.sync(...)`.
 */
const createSyncStep = <
  Fn extends AnySyncStepFn,
  E extends Error = Error,
  Id extends string = string,
>(
  fn: ReturnType<Fn> extends PromiseLike<unknown> ? never : Fn,
  options?: {
    id?: Id;
    plugins?: import("@/step/types.ts").SyncStepPlugin<Fn, E>[];
  },
): SyncStepFromFunction<Fn, E, Id> =>
  SyncStepEngine.create(fn, options) as SyncStepFromFunction<Fn, E, Id>;

const createContextualSyncStepFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualSyncStepFactory<Shared> =>
  createSyncStep as ContextualSyncStepFactory<Shared>;

const createContextualStepFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualStepFactory<Shared> =>
  Object.assign(createStep as ContextualStepFactory<Shared>, {
    sync: createContextualSyncStepFactory<Shared>(),
  });

/**
 * Creates a synchronous step from a callable and optional metadata.
 *
 * Use `step.sync(...)` when the wrapped callable and all attached plugins must
 * stay synchronous. Sync steps return plain values and reject async plugins at
 * the type level.
 *
 * @param fn The synchronous callable to wrap as a step.
 *
 * @param options Optional metadata such as `id` and attached sync plugins.
 */
const sync = Object.assign(createContextualSyncStepFactory(), {
  withContext<Shared extends ContextValues>() {
    return createContextualSyncStepFactory<Shared>();
  },
}) as SyncStepFactory;

/**
 * Wrap a function in a reusable asynchronous step with lifecycle plugins.
 *
 * The frozen callable also exposes run, runWith, use, remove, identity and plugin
 * inspection. Invocations get isolated execution scopes; an explicit parent
 * context shares state and completed snapshots. Plugin registration is snapshotted
 * per invocation. Use step.sync for synchronous execution and withContext to bind
 * the shared-state type without adding runtime validation.
 *
 * @param fn - Function receiving the input argument tuple. Regular functions can
 * access this.context(); its value or promise becomes the step's result.
 *
 * @param options - Optional stable ID and persistent plugins. ID defaults to a UUID.
 * @returns A callable Step whose normal invocation and run methods return a Promise
 * of the final output, including plugin transformation or recovery.
 * @throws TypeError during construction if fn is not callable. Accessor errors in
 * options propagate. During execution, unrecovered body/hook errors reject the run;
 * invalid input-hook results use `STP_001`, non-Error body values use `STP_000`
 * (strings become Error), and failed finalizers use `RT_000`. See StepInstance.runWith
 * for setup errors and per-invocation options.
 */
export const step = Object.assign(createContextualStepFactory(), {
  sync,
  withContext<Shared extends ContextValues>() {
    return createContextualStepFactory<Shared>();
  },
}) as StepFactory;
