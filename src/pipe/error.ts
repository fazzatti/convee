import {
  ConveeError,
  createErrorFactory,
  type ConveeErrorTrace,
  type Diagnostic,
  type InferConveeErrors,
} from "@/error/index.ts";

const definePipeError = createErrorFactory({
  domain: "pipe",
  source: "convee/pipe",
});

export type PipeUnknownThrownMeta = {
  pipeId: string;
};

export type PipeInvalidInputPluginResultMeta = {
  pipeId: string;
  pluginId: string;
  inputArity: number;
  received: unknown;
};

export type PipeUnknownPluginTargetMeta = {
  pipeId: string;
  pluginId: string;
  target: string;
  allowedTargets: readonly string[];
};

export type PipeUnpluggableTargetMeta = {
  pipeId: string;
  stepId: string;
  pluginId: string;
  target: string;
};

export type PipeNonSyncStepMeta = {
  pipeId: string;
  stepIds: readonly string[];
};

export const PIP_ERRORS = {
  UNKNOWN_THROWN: definePipeError({
    code: "PIP_000",
    message: "Unknown pipe error",
    build(args: {
      cause: unknown;
      pipeId: string;
      trace?: ConveeErrorTrace;
      diagnostic?: Diagnostic;
    }) {
      return {
        details: "A pipe or pipe plugin threw a non-Error value.",
        cause: args.cause,
        trace: args.trace,
        diagnostic: args.diagnostic,
        meta: {
          pipeId: args.pipeId,
        } satisfies PipeUnknownThrownMeta,
      };
    },
  }),
  INVALID_INPUT_PLUGIN_RESULT: definePipeError({
    code: "PIP_001",
    message:
      "Input plugins for multi-input pipelines must return the full input tuple.",
    build(args: {
      pipeId: string;
      pluginId: string;
      inputArity: number;
      received: unknown;
      trace?: ConveeErrorTrace;
    }) {
      return {
        trace: args.trace,
        meta: {
          pipeId: args.pipeId,
          pluginId: args.pluginId,
          inputArity: args.inputArity,
          received: args.received,
        } satisfies PipeInvalidInputPluginResultMeta,
      };
    },
  }),
  UNKNOWN_PLUGIN_TARGET: definePipeError({
    code: "PIP_002",
    message: "Unknown pipe plugin target",
    build(args: {
      pipeId: string;
      pluginId: string;
      target: string;
      allowedTargets: readonly string[];
      trace?: ConveeErrorTrace;
    }) {
      return {
        trace: args.trace,
        message: `Plugin "${args.pluginId}" targets "${args.target}", but only "${args.pipeId}" or one of [${args.allowedTargets.join(", ")}] can be used.`,
        meta: {
          pipeId: args.pipeId,
          pluginId: args.pluginId,
          target: args.target,
          allowedTargets: args.allowedTargets,
        } satisfies PipeUnknownPluginTargetMeta,
      };
    },
  }),
  UNPLUGGABLE_TARGET: definePipeError({
    code: "PIP_003",
    message: "Pipe inner step does not accept plugins",
    build(args: {
      pipeId: string;
      stepId: string;
      pluginId: string;
      target: string;
      trace?: ConveeErrorTrace;
    }) {
      return {
        trace: args.trace,
        message: `Plugin "${args.pluginId}" targets "${args.target}", but that inner step does not accept plugins.`,
        meta: {
          pipeId: args.pipeId,
          stepId: args.stepId,
          pluginId: args.pluginId,
          target: args.target,
        } satisfies PipeUnpluggableTargetMeta,
      };
    },
  }),
  NON_SYNC_STEP: definePipeError({
    code: "PIP_004",
    message: "Sync pipelines can only contain sync steps.",
    build(args: {
      pipeId: string;
      stepIds: readonly string[];
      trace?: ConveeErrorTrace;
    }) {
      return {
        trace: args.trace,
        meta: {
          pipeId: args.pipeId,
          stepIds: args.stepIds,
        } satisfies PipeNonSyncStepMeta,
      };
    },
  }),
} as const;

export type PipeError = InferConveeErrors<typeof PIP_ERRORS>;
export type PipeErrorCode = PipeError["code"];
export type PipeErrorOf<Code extends PipeErrorCode> = Extract<
  PipeError,
  { code: Code }
>;

export function isPipeError(error: unknown): error is PipeError {
  return (
    ConveeError.is(error) &&
    error.domain === "pipe" &&
    error.source === "convee/pipe"
  );
}
