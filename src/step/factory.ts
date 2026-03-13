import type { ContextValues } from "@/context/types.ts";
import { StepEngine, SyncStepEngine } from "@/step/step.ts";
import type {
  AnySyncStepFn,
  AnyStepFn,
  ContextualStepFactory,
  ContextualSyncStepFactory,
  StepFromFunction,
  StepFactory,
  StepOptions,
  SyncStepFromFunction,
  SyncStepFactory,
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
  fn: ReturnType<Fn> extends Promise<unknown> ? never : Fn,
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
 * @param options Optional metadata such as `id` and attached sync plugins.
 */
const sync = Object.assign(createContextualSyncStepFactory(), {
  withContext<Shared extends ContextValues>() {
    return createContextualSyncStepFactory<Shared>();
  },
}) as SyncStepFactory;

/**
 * Creates a step from a callable and optional metadata.
 *
 * The returned value is a proxy-backed callable step instance that exposes:
 *
 * - direct invocation of the wrapped callable
 * - metadata like `id`
 * - runtime helpers like `run()`, `use()`, and `remove()`
 * - `step.sync(...)` for explicitly synchronous steps
 *
 * @param fn The callable to wrap as a step.
 * @param options Optional metadata such as `id` and attached plugins.
 */
export const step = Object.assign(createContextualStepFactory(), {
  sync,
  withContext<Shared extends ContextValues>() {
    return createContextualStepFactory<Shared>();
  },
}) as StepFactory;
