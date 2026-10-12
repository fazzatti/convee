import { ConveeError } from "@/error/index.ts";

/** Stable categories for local scheduling configuration, admission and cancellation. */
export type ConcurrencyErrorCode =
  | "CNC_CONFIG"
  | "CNC_CAPACITY"
  | "CNC_ABORTED"
  | "CNC_TIMEOUT";

/**
 * Structured local scheduler failure, distinct from original task errors.
 *
 * Task Error instances pass through unchanged; this class describes invalid
 * configuration or job trees, exhausted admission capacity and aborted executions.
 * Inherited diagnostics use domain concurrency and source @fifo/convee.
 */
export class ConcurrencyError extends ConveeError<ConcurrencyErrorCode> {
  /**
   * Construct a concurrency diagnostic without throwing it.
   *
   * @param code - Stable failure category.
   * @param message - Human-readable explanation.
   * @param cause - Optional original cancellation or setup cause, retained by reference.
   * @remarks Returns a ConveeError instance. No errors are intentionally thrown
   * for valid typed inputs; inherited toJSON produces bounded diagnostic data.
   */
  constructor(code: ConcurrencyErrorCode, message: string, cause?: unknown) {
    super({
      domain: "concurrency",
      source: "@fifo/convee",
      code,
      message,
      cause,
    });
    this.name = "ConcurrencyError";
  }
}
