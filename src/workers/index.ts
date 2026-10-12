/** Optional dedicated-worker execution with ordinary native Convee lifecycle semantics. */
export { worker } from "@/workers/definition.ts";
export { parallel, persistentParallel } from "@/workers/parallel.ts";
export { WorkerError } from "@/workers/error.ts";
export type {
  RemoteWorkerError,
  WorkerErrorCode,
  WorkerErrorMeta,
} from "@/workers/error.ts";
export type * from "@/workers/types.ts";
