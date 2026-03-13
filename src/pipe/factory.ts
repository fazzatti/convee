import type { ContextValues } from "@/context/types.ts";
import { PipeEngine, SyncPipeEngine } from "@/pipe/pipe.ts";
import type {
  AnyPipeStep,
  NormalizePipeSteps,
  NormalizeSyncPipeSteps,
  PipeInputStep,
  AnySyncPipeStep,
  ContextualPipeFactory,
  ContextualSyncPipeFactory,
  Pipe,
  PipeAttachablePlugin,
  PipeFactory,
  PipeOptions,
  SyncPipe,
  SyncPipeAttachablePlugin,
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
    isPipeStep(pipeStep) ? pipeStep : step(pipeStep),
  ) as NormalizePipeSteps<Steps>;
};

const normalizeSyncPipeSteps = <
  Steps extends readonly [SyncPipeInputStep, ...SyncPipeInputStep[]],
>(
  steps: Steps,
): NormalizeSyncPipeSteps<Steps> => {
  return steps.map((pipeStep) =>
    isPipeStep(pipeStep) ? pipeStep : step.sync(pipeStep),
  ) as NormalizeSyncPipeSteps<Steps>;
};

const createPipe = <
  Steps extends readonly [PipeInputStep, ...PipeInputStep[]],
  NormalizedSteps extends readonly [AnyPipeStep, ...AnyPipeStep[]] =
    NormalizePipeSteps<Steps> & readonly [AnyPipeStep, ...AnyPipeStep[]],
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
    NormalizeSyncPipeSteps<Steps> &
      readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
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
  createSyncPipe as ContextualSyncPipeFactory<Shared>;

const createContextualPipeFactory = <
  Shared extends ContextValues = ContextValues,
>(): ContextualPipeFactory<Shared> =>
  Object.assign(createPipe as ContextualPipeFactory<Shared>, {
    sync: createContextualSyncPipeFactory<Shared>(),
  });

const sync = Object.assign(createContextualSyncPipeFactory(), {
  withContext<Shared extends ContextValues>() {
    return createContextualSyncPipeFactory<Shared>();
  },
}) as SyncPipeFactory;

export const pipe = Object.assign(createContextualPipeFactory(), {
  sync,
  withContext<Shared extends ContextValues>() {
    return createContextualPipeFactory<Shared>();
  },
}) as PipeFactory;
