import {
  ConveeError,
  createErrorFactory,
  type ConveeErrorTrace,
  type Diagnostic,
  type InferConveeErrors,
} from "@/error/index.ts";

const defineStepError = createErrorFactory({
  domain: "step",
  source: "convee/step",
});

export type StepUnknownThrownMeta = {
  stepId: string;
  pluginId?: string;
};

export type StepInvalidInputPluginResultMeta = {
  stepId: string;
  pluginId: string;
  inputArity: number;
  received: unknown;
};

export const STP_ERRORS = {
  UNKNOWN_THROWN: defineStepError({
    code: "STP_000",
    message: "Unknown step error",
    build(args: {
      cause: unknown;
      stepId: string;
      pluginId?: string;
      trace?: ConveeErrorTrace;
      diagnostic?: Diagnostic;
    }) {
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
    build(args: {
      stepId: string;
      pluginId: string;
      inputArity: number;
      received: unknown;
      trace?: ConveeErrorTrace;
    }) {
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

export type StepError = InferConveeErrors<typeof STP_ERRORS>;
export type StepErrorCode = StepError["code"];
export type StepErrorOf<Code extends StepErrorCode> = Extract<
  StepError,
  { code: Code }
>;

export function isStepError(error: unknown): error is StepError {
  return (
    ConveeError.is(error) &&
    error.domain === "step" &&
    error.source === "convee/step"
  );
}
