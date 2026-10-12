import type { ContextValues } from "@/context/types.ts";
import { PipeEngine, SyncPipeEngine } from "@/pipe/pipe.ts";
import type {
  AnyPipeStep,
  AnySyncPipeStep,
  ContextualPipeFactory,
  ContextualSyncPipeFactory,
  NormalizePipeSteps,
  NormalizeSyncPipeSteps,
  Pipe,
  PipeFactory,
  PipeInputStep,
  PipeOptions,
  SyncPipe,
  SyncPipeFactory,
  SyncPipeInputStep,
  SyncPipeOptions,
} from "@/pipe/types.ts";
import { step } from "@/step/factory.ts";

const isPipeStep = (value: unknown): value is AnyPipeStep => {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "isSync") === "boolean" &&
    typeof Reflect.get(value, "runWith") === "function"
  );
};

const normalizePipeSteps = <
  Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
>(
  steps: Steps,
): NormalizePipeSteps<Steps> => {
  return steps.map((pipeStep) =>
    isPipeStep(pipeStep) ? pipeStep : step(pipeStep)
  ) as NormalizePipeSteps<Steps>;
};

const normalizeSyncPipeSteps = <
  Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
>(
  steps: Steps,
): NormalizeSyncPipeSteps<Steps> => {
  return steps.map((pipeStep) =>
    isPipeStep(pipeStep) ? pipeStep : step.sync(pipeStep)
  ) as NormalizeSyncPipeSteps<Steps>;
};

const createPipe = <
  Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
  NormalizedSteps extends readonly [AnyPipeStep, ...AnyPipeStep[]] =
    & NormalizePipeSteps<Steps>
    & readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
  Plugins extends readonly { readonly id: string }[] = readonly [],
>(
  steps: Steps,
  options?: PipeOptions<NormalizedSteps, E, Shared, Id, Plugins> & { id?: Id },
): Pipe<NormalizedSteps, E, Shared, Id, Plugins> =>
  PipeEngine.create(normalizePipeSteps(steps) as NormalizedSteps, options);

const createSyncPipe = <
  Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
  NormalizedSteps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]] =
    & NormalizeSyncPipeSteps<Steps>
    & readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
  Plugins extends readonly { readonly id: string }[] = readonly [],
>(
  steps: Steps,
  options?: SyncPipeOptions<NormalizedSteps, E, Shared, Id, Plugins> & {
    id?: Id;
  },
): SyncPipe<NormalizedSteps, E, Shared, Id, Plugins> =>
  SyncPipeEngine.create(
    normalizeSyncPipeSteps(steps) as NormalizedSteps,
    options,
  );

const createContextualSyncPipeFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualSyncPipeFactory<Shared> =>
  createSyncPipe as unknown as ContextualSyncPipeFactory<Shared>;

const createContextualPipeFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualPipeFactory<Shared> =>
  Object.assign(createPipe as unknown as ContextualPipeFactory<Shared>, {
    sync: createContextualSyncPipeFactory<Shared>(),
  });

const sync = Object.assign(createContextualSyncPipeFactory(), {
  withContext<Shared extends ContextValues>() {
    return createContextualSyncPipeFactory<Shared>();
  },
}) as SyncPipeFactory;

/**
 * Compose an ordered sequence of steps, nested pipelines and raw functions.
 *
 * Raw functions are wrapped as steps. Each child's scalar output is passed as one
 * argument to the next child; array outputs are spread as its argument tuple.
 * Untargeted plugins wrap the whole pipeline, and targeted plugins address the
 * pipeline ID or a direct child. The frozen callable exposes run, runWith, use,
 * remove and defensive configuration views. Use pipe.sync for all-sync children.
 *
 * @param steps - Nonempty tuple with compatible adjacent input/output contracts.
 *
 * @param options - Optional pipeline ID and persistent plugins; ID defaults to a UUID.
 * @returns A reusable async Pipe accepting the first child's arguments and resolving
 * to the last child's output after pipeline-level transformation or recovery.
 * @throws TypeError for no children, non-callable raw children or conflicting IDs;
 * `PIP_002` for unknown plugin targets; pipe.sync also throws `PIP_004` for async
 * children. Accessor errors propagate. Invocations reject on unrecovered child/hook
 * errors, invalid input-hook results (`PIP_001`), or finalizer failures (`RT_000`).
 */
export const pipe = Object.assign(createContextualPipeFactory(), {
  sync,
  withContext<Shared extends ContextValues>() {
    return createContextualPipeFactory<Shared>();
  },
}) as PipeFactory;
