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
/** Structured errors exposed by the worker adapter and normal outer error hooks. */
export class WorkerError extends ConveeError<WorkerErrorCode, WorkerErrorMeta> {
  /** Build an adapter failure with task, job and worker metadata when available. */
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
