import { ConveeError } from "@/error/index.ts";

/** Stable categories for local configuration, admission, aggregate task failure and cancellation. */
export type ConcurrencyErrorCode =
  | "CNC_CONFIG"
  | "CNC_CAPACITY"
  | "CNC_BATCH"
  | "CNC_ABORTED"
  | "CNC_TIMEOUT";

/** Diagnostics accompanying admission, cancellation or an all-mode batch failure. */
export interface ConcurrencyErrorMeta extends Record<string, unknown> {
  /** Original task failures in split order, including finalization errors. */
  readonly failures?: readonly Error[];
}

/**
 * Structured local scheduler failure, distinct from original task errors.
 *
 * CNC_BATCH retains original task Error instances in metadata and an AggregateError
 * cause. Other codes describe invalid configuration or job trees, exhausted
 * admission capacity and aborted executions. collect mode retains errors directly.
 * Inherited diagnostics use domain concurrency and source @fifo/convee.
 */
export class ConcurrencyError
  extends ConveeError<ConcurrencyErrorCode, ConcurrencyErrorMeta> {
  /**
   * Construct a concurrency diagnostic without throwing it.
   *
   * @param code - Stable failure category.
   * @param message - Human-readable explanation.
   * @param meta - Optional diagnostics, including ordered original batch failures.
   * @param cause - Optional aggregate, cancellation or setup cause, retained by reference.
   * @remarks Returns a ConveeError instance. No errors are intentionally thrown
   * for valid typed inputs; inherited toJSON produces bounded diagnostic data.
   */
  constructor(
    code: ConcurrencyErrorCode,
    message: string,
    meta: ConcurrencyErrorMeta = {},
    cause?: unknown,
  ) {
    super({
      domain: "concurrency",
      source: "@fifo/convee",
      code,
      message,
      meta,
      cause,
    });
    this.name = "ConcurrencyError";
  }
}
