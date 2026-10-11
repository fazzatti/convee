import {
  type ConveeErrorCreator,
  createErrorFactory,
  type InferConveeErrors,
} from "@/error/index.ts";
import type { ConveeErrorTrace } from "@/error/types.ts";

/** One failed cleanup callback, preserving its error and invocation trace. */
export type FinalizationFailure = {
  readonly error: Error;
  readonly trace: ConveeErrorTrace;
};

/** Execution identity and every failed finalizer in registration order. */
export type FinalizationErrorMeta = {
  readonly executionId: string;
  readonly executionError?: Error;
  readonly failures: readonly FinalizationFailure[];
};

/** Arguments used to report cleanup failures without losing the execution error. */
export type FinalizationErrorArgs = FinalizationErrorMeta & {
  readonly trace: ConveeErrorTrace;
};

/** Stable runtime error constructors. */
export type RuntimeErrorCatalog = {
  /**
   * Combine cleanup failures without losing an earlier execution failure.
   *
   * @param args - Execution ID, ordered failed finalizers with traces, optional
   * execution error and the finalization trace.
   *
   * @returns An `RT_000` ConveeError with all failures in metadata and AggregateError cause.
   * @throws Native errors for an invalid failure collection or throwing input getters.
   */
  readonly FINALIZATION_FAILED: ConveeErrorCreator<
    "RT_000",
    FinalizationErrorMeta,
    "runtime",
    "convee/runtime",
    "Execution finalization failed.",
    FinalizationErrorArgs
  >;
};

const defineRuntimeError = createErrorFactory({
  domain: "runtime",
  source: "convee/runtime",
});

/**
 * Runtime error catalog for cleanup failures after execution has finished.
 *
 * `FINALIZATION_FAILED` accepts the execution ID, optional execution error, failed
 * finalizers and trace. It returns an `RT_000` ConveeError whose AggregateError cause
 * retains the execution error first, followed by cleanup errors in registration
 * order. Creating it does not throw it or run error hooks again.
 *
 * @remarks Invalid failure collections or throwing property accessors can raise
 * native errors during construction. Original error objects remain referenced.
 */
export const RT_ERRORS: RuntimeErrorCatalog = {
  FINALIZATION_FAILED: defineRuntimeError({
    code: "RT_000",
    message: "Execution finalization failed.",
    build(args: FinalizationErrorArgs) {
      const { executionId, executionError, failures, trace } = args;
      const errors = failures.map((failure) => failure.error);
      if (executionError !== undefined) errors.unshift(executionError);
      return {
        cause: new AggregateError(errors, "Execution finalization failed.", {
          cause: errors[0],
        }),
        trace,
        meta: { executionId, executionError, failures },
      };
    },
  }),
};

/** Union of built-in runtime finalization errors. */
export type RuntimeError = InferConveeErrors<typeof RT_ERRORS>;
