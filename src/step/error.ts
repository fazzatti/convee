import { matchesMeta } from "@/error/meta.ts";
import {
  ConveeError,
  type ConveeErrorCreator,
  type ConveeErrorTrace,
  createErrorFactory,
  type Diagnostic,
  type ErrorFactory,
  type InferConveeErrors,
} from "@/error/index.ts";

const defineStepError: ErrorFactory<"step", "convee/step"> = createErrorFactory(
  {
    domain: "step",
    source: "convee/step",
  },
);

/** Metadata attached to step errors created from non-`Error` throws. */
export type StepUnknownThrownMeta = {
  stepId: string;
  pluginId?: string;
};

/** Metadata attached to invalid step input plugin results. */
export type StepInvalidInputPluginResultMeta = {
  stepId: string;
  pluginId: string;
  inputArity: number;
  received: unknown;
};

/** Explicit public types for the step error catalog. */
export type StepErrorCatalog = {
  readonly UNKNOWN_THROWN: ConveeErrorCreator<
    "STP_000",
    StepUnknownThrownMeta,
    "step",
    "convee/step",
    "Unknown step error",
    StepUnknownThrownArgs
  >;
  readonly INVALID_INPUT_PLUGIN_RESULT: ConveeErrorCreator<
    "STP_001",
    StepInvalidInputPluginResultMeta,
    "step",
    "convee/step",
    "Input plugins for multi-input steps must return the full input tuple.",
    StepInvalidInputPluginResultArgs
  >;
};

/** Arguments for STP_ERRORS.UNKNOWN_THROWN. */
export type StepUnknownThrownArgs = {
  cause: unknown;
  stepId: string;
  pluginId?: string;
  trace?: ConveeErrorTrace;
  diagnostic?: Diagnostic;
};

/** Arguments for STP_ERRORS.INVALID_INPUT_PLUGIN_RESULT. */
export type StepInvalidInputPluginResultArgs = {
  stepId: string;
  pluginId: string;
  inputArity: number;
  received: unknown;
  trace?: ConveeErrorTrace;
};

/** Built-in step error catalog. */
export const STP_ERRORS: StepErrorCatalog = {
  UNKNOWN_THROWN: defineStepError({
    code: "STP_000",
    message: "Unknown step error",
    build(args: StepUnknownThrownArgs) {
      const meta: StepUnknownThrownMeta = {
        stepId: args.stepId,
        ...(args.pluginId === undefined ? {} : { pluginId: args.pluginId }),
      };

      return {
        details: "A step or step plugin threw a non-Error value.",
        cause: args.cause,
        trace: args.trace,
        diagnostic: args.diagnostic,
        meta,
      };
    },
  }),
  INVALID_INPUT_PLUGIN_RESULT: defineStepError({
    code: "STP_001",
    message:
      "Input plugins for multi-input steps must return the full input tuple.",
    build(args: StepInvalidInputPluginResultArgs) {
      return {
        trace: args.trace,
        meta: {
          stepId: args.stepId,
          pluginId: args.pluginId,
          inputArity: args.inputArity,
          received: args.received,
        } satisfies StepInvalidInputPluginResultMeta,
      };
    },
  }),
} as const;

/** Union of every built-in step error variant. */
export type StepError = InferConveeErrors<typeof STP_ERRORS>;
/** Stable code union for built-in step errors. */
export type StepErrorCode = StepError["code"];
/** Extracts a specific step error variant by its code. */
export type StepErrorOf<Code extends StepErrorCode> = Extract<
  StepError,
  { code: Code }
>;

/** Returns `true` when the provided error belongs to the step domain. */
export function isStepError(error: unknown): error is StepError {
  if (
    !ConveeError.is(error) || error.domain !== "step" ||
    error.source !== "convee/step"
  ) return false;
  switch (error.code) {
    case "STP_000":
      return matchesMeta(error.meta, {
        stepId: "string",
        pluginId: "optional-string",
      });
    case "STP_001":
      return matchesMeta(error.meta, {
        stepId: "string",
        pluginId: "string",
        inputArity: "number",
        received: "unknown",
      });
    default:
      return false;
  }
}
