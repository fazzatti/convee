/** Optional module-worker execution for ordinary Convee steps and pipelines. */
export { workerRegistry } from "@/workers/registry.ts";
export { workerPool } from "@/workers/pool.ts";
export { parallel } from "@/workers/parallel.ts";
export { WorkerError } from "@/workers/error.ts";
export type {
  RemoteWorkerError,
  WorkerErrorCode,
  WorkerErrorMeta,
} from "@/workers/error.ts";
export type {
  ParallelOptions,
  ParallelStep,
  TypedWorkerPoolFactory,
  ValidateWorkerPool,
  WorkerCallable,
  WorkerContext,
  WorkerJob,
  WorkerJobOptions,
  WorkerNextArguments,
  WorkerOutcome,
  WorkerOutcomes,
  WorkerPluginFactories,
  WorkerPluginReference,
  WorkerPool,
  WorkerPoolFactory,
  WorkerPoolOptions,
  WorkerRecipe,
  WorkerRegistry,
  WorkerResults,
  WorkerRole,
  WorkerRoles,
  WorkerSlot,
  WorkerTaskFactories,
  WorkerTaskMap,
  WorkerTaskReference,
  WorkerTasks,
  WorkerTransport,
} from "@/workers/types.ts";

/** Advanced registry and composition type utilities. */
export type * from "@/workers/types.ts";
