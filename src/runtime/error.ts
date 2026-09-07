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

/** Structured cleanup errors. The cause is an AggregateError retaining all failures. */
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
