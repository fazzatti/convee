import { ConveeError } from "@/error/index.ts";
import { diagnosticValue } from "@/error/serialize.ts";

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
  | "WRK_BATCH"
  | "WRK_UNAVAILABLE";
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
  /** Original Convee domain and source when present. */
  readonly domain?: string;
  /** Original Convee source identifier when present. */
  readonly source?: string;
  /** Bounded data projection, never the original mutable object. */
  readonly meta?: unknown;
  /** Bounded cause chain, including cycle and unsupported-value summaries. */
  readonly cause?: unknown;
}
/** Structured errors exposed by the worker adapter and normal outer error hooks. */
export interface WorkerErrorMeta extends Record<string, unknown> {
  /** Identifier of the affected job when available. */
  jobId?: string;
  /** Configured independently scheduled worker group. */
  group?: string;
  /** Original job position in the nested split result. */
  path?: readonly number[];
  /** Pool-local worker identity. */
  workerId?: string;
  /** Explicit remote report; not the original Error object. */
  remote?: RemoteWorkerError;
  /** Individual failures retained by an all-mode parallel Step. */
  failures?: readonly Error[];
}
/**
 * Structured failure from worker configuration, transport, execution or aggregation.
 *
 * The code identifies the failure category, and metadata can identify a job, group,
 * path, worker or remote diagnostic. Remote exceptions are data projections, not
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
   * @param meta - Optional job, group, worker, path, remote or batch details; defaults to {}.
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

/** Safely project errors without running arbitrary toJSON methods or cloning live objects. */
export function remoteError(error: unknown): RemoteWorkerError {
  try {
    if (!(error instanceof Error)) {
      return { name: "NonError", message: String(error) };
    }
    const data = diagnosticValue(error) as Record<string, unknown>;
    const report: Record<string, unknown> = {
      name: typeof data.name === "string" ? data.name : "Error",
      message: typeof data.message === "string" ? data.message : "Remote error",
    };
    for (const key of ["code", "domain", "source"]) {
      if (typeof data[key] === "string") report[key] = data[key];
    }
    const stack = Reflect.get(error, "stack");
    if (typeof stack === "string") report.stack = stack.slice(0, 32768);
    for (const key of ["meta", "cause"]) {
      if (data[key] !== undefined) report[key] = data[key];
    }
    return report as unknown as RemoteWorkerError;
  } catch {
    return {
      name: "NonError",
      message: "Unable to inspect the remote thrown value.",
    };
  }
}
