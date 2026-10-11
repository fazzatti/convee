import { ConveeError } from "@/error/index.ts";

/** Stable worker adapter failure categories. */
export type WorkerErrorCode =
  | "WRK_CONFIG"
  | "WRK_CLOSED"
  | "WRK_CAPACITY"
  | "WRK_CLONE"
  | "WRK_STARTUP"
  | "WRK_PROTOCOL"
  | "WRK_CRASH"
  | "WRK_TIMEOUT"
  | "WRK_TASK"
  | "WRK_BATCH";
/** Data-only remote error report; prototypes and object identity are not retained. */
export interface RemoteWorkerError {
  /** Original error name, or NonError for thrown values. */
  readonly name: string;
  /** Original message, with a fallback for hostile thrown objects. */
  readonly message: string;
  /** Remote stack when available. */
  readonly stack?: string;
  /** Original Convee code when available. */
  readonly code?: string;
}
/** Structured errors exposed by the worker adapter and normal outer error hooks. */
export interface WorkerErrorMeta extends Record<string, unknown> {
  /** Identifier of the affected job when available. */
  jobId?: string;
  /** Registered task or configured recipe name. */
  task?: string;
  /** Pool-local worker identity. */
  workerId?: string;
  /** Worker routing role. */
  role?: string;
  /** Explicit remote report; not the original Error object. */
  remote?: RemoteWorkerError;
  /** Individual failures retained by an all-mode parallel Step. */
  failures?: readonly WorkerError[];
}
/**
 * Structured failure from worker configuration, transport, execution or aggregation.
 *
 * The code identifies the failure category, and metadata can identify a job, task,
 * role, worker or remote diagnostic. Remote exceptions are data projections, not
 * the original worker Error objects. `WRK_BATCH` retains individual failures.
 *
 * @remarks Construct with a code and message plus optional metadata and cause.
 * The result is a ConveeError in domain `worker`, source `@fifo/convee/workers`;
 * construction does not throw it. Inherited toJSON provides bounded diagnostics.
 */
export class WorkerError extends ConveeError<WorkerErrorCode, WorkerErrorMeta> {
  /**
   * Create an adapter error with explicit failure category and diagnostics.
   *
   * @param code - Stable worker failure code used for programmatic handling.
   *
   * @param message - Human-readable explanation of the failure.
   * @param meta - Optional job, task, worker, role, remote or batch details; defaults to {}.
   * @param cause - Optional local cause or AggregateError for a failed batch.
   * @remarks Produces a WorkerError without throwing it. Metadata is retained by
   * reference without runtime validation; valid typed inputs do not intentionally throw.
   */
  constructor(
    code: WorkerErrorCode,
    message: string,
    meta: WorkerErrorMeta = {},
    cause?: unknown,
  ) {
    super({
      domain: "worker",
      source: "@fifo/convee/workers",
      code,
      message,
      meta,
      cause,
    });
    this.name = "WorkerError";
  }
}

/** Safely project a thrown value into a small explicit transport contract. */
export function remoteError(error: unknown): RemoteWorkerError {
  try {
    if (error instanceof Error) {
      const code: unknown = Reflect.get(error, "code");
      return {
        name: String(error.name),
        message: String(error.message),
        ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
        ...(typeof code === "string" ? { code } : {}),
      };
    }
    return { name: "NonError", message: String(error) };
  } catch {
    return {
      name: "NonError",
      message: "Unable to inspect the remote thrown value.",
    };
  }
}
