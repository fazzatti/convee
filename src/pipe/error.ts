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

const definePipeError: ErrorFactory<"pipe", "convee/pipe"> = createErrorFactory(
  {
    domain: "pipe",
    source: "convee/pipe",
  },
);

/** Metadata attached to pipe errors created from non-`Error` throws. */
export type PipeUnknownThrownMeta = {
  pipeId: string;
};

/** Metadata attached to invalid pipe input plugin results. */
export type PipeInvalidInputPluginResultMeta = {
  pipeId: string;
  pluginId: string;
  inputArity: number;
  received: unknown;
};

/** Metadata attached to unknown targeted plugin errors. */
export type PipeUnknownPluginTargetMeta = {
  pipeId: string;
  pluginId: string;
  target: string;
  allowedTargets: readonly string[];
};

/** Metadata attached to non-sync-step validation errors. */
export type PipeNonSyncStepMeta = {
  pipeId: string;
  stepIds: readonly string[];
};

/** Explicit public types for the pipe error catalog. */
export type PipeErrorCatalog = {
  /**
   * Describe a non-Error value thrown during pipe execution.
   *
   * @param args - Original cause and pipe identity, with optional trace and
   * diagnostic guidance.
   *
   * @returns A `PIP_000` ConveeError retaining the cause and identity metadata.
   * @throws Exceptions from input property access propagate; the created error is returned.
   */
  readonly UNKNOWN_THROWN: ConveeErrorCreator<
    "PIP_000",
    PipeUnknownThrownMeta,
    "pipe",
    "convee/pipe",
    "Unknown pipe error",
    PipeUnknownThrownArgs
  >;
  /**
   * Describe an input hook result that cannot supply the expected argument tuple.
   *
   * @param args - Pipe and plugin IDs, expected input arity, actual received value,
   * and optional invocation trace.
   *
   * @returns A `PIP_001` ConveeError retaining the received value in metadata.
   * @throws Exceptions from input property access propagate; the created error is returned.
   */
  readonly INVALID_INPUT_PLUGIN_RESULT: ConveeErrorCreator<
    "PIP_001",
    PipeInvalidInputPluginResultMeta,
    "pipe",
    "convee/pipe",
    "Input plugins for multi-input pipelines must return the full input tuple.",
    PipeInvalidInputPluginResultArgs
  >;
  /**
   * Describe a plugin whose target is outside a pipeline's direct routing namespace.
   *
   * @param args - Pipeline and plugin IDs, requested target, allowed target IDs and trace.
   *
   * @returns A `PIP_002` ConveeError listing the allowed targets in its message and metadata.
   * @throws Native errors if allowedTargets cannot be joined, or input getters throw.
   */
  readonly UNKNOWN_PLUGIN_TARGET: ConveeErrorCreator<
    "PIP_002",
    PipeUnknownPluginTargetMeta,
    "pipe",
    "convee/pipe",
    "Unknown pipe plugin target",
    PipeUnknownPluginTargetArgs
  >;
  /**
   * Describe asynchronous children rejected during synchronous pipeline construction.
   *
   * @param args - Pipeline ID, child identity list and optional trace.
   *
   * @returns A `PIP_004` ConveeError retaining the supplied child IDs for diagnostics.
   * @throws Exceptions from input property access propagate; the created error is returned.
   */
  readonly NON_SYNC_STEP: ConveeErrorCreator<
    "PIP_004",
    PipeNonSyncStepMeta,
    "pipe",
    "convee/pipe",
    "Sync pipelines can only contain sync steps.",
    PipeNonSyncStepArgs
  >;
};

/** Arguments for PIP_ERRORS.UNKNOWN_THROWN. */
export type PipeUnknownThrownArgs = {
  cause: unknown;
  pipeId: string;
  trace?: ConveeErrorTrace;
  diagnostic?: Diagnostic;
};

/** Arguments for PIP_ERRORS.INVALID_INPUT_PLUGIN_RESULT. */
export type PipeInvalidInputPluginResultArgs = {
  pipeId: string;
  pluginId: string;
  inputArity: number;
  received: unknown;
  trace?: ConveeErrorTrace;
};

/** Arguments for PIP_ERRORS.UNKNOWN_PLUGIN_TARGET. */
export type PipeUnknownPluginTargetArgs = {
  pipeId: string;
  pluginId: string;
  target: string;
  allowedTargets: readonly string[];
  trace?: ConveeErrorTrace;
};

/** Arguments for PIP_ERRORS.NON_SYNC_STEP. */
export type PipeNonSyncStepArgs = {
  pipeId: string;
  stepIds: readonly string[];
  trace?: ConveeErrorTrace;
};

/**
 * Built-in pipe error constructors, indexed by stable failure category.
 *
 * Each member accepts its named argument object and returns a ConveeError in the
 * `pipe` domain with source `convee/pipe`. Constructors preserve diagnostic
 * payload references and do not throw the error they create. Their identifier
 * properties support code-based narrowing; see each member for inputs and output.
 *
 * @remarks Invalid runtime arguments or throwing property accessors can raise
 * native errors during construction. Metadata is not deep-frozen or redacted.
 */
export const PIP_ERRORS: PipeErrorCatalog = {
  UNKNOWN_THROWN: definePipeError({
    code: "PIP_000",
    message: "Unknown pipe error",
    build(args: PipeUnknownThrownArgs) {
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
    build(args: PipeInvalidInputPluginResultArgs) {
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
    build(args: PipeUnknownPluginTargetArgs) {
      return {
        trace: args.trace,
        message:
          `Plugin "${args.pluginId}" targets "${args.target}", but only "${args.pipeId}" or one of [${
            args.allowedTargets.join(", ")
          }] can be used.`,
        meta: {
          pipeId: args.pipeId,
          pluginId: args.pluginId,
          target: args.target,
          allowedTargets: args.allowedTargets,
        } satisfies PipeUnknownPluginTargetMeta,
      };
    },
  }),
  NON_SYNC_STEP: definePipeError({
    code: "PIP_004",
    message: "Sync pipelines can only contain sync steps.",
    build(args: PipeNonSyncStepArgs) {
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

/** Union of every built-in pipe error variant. */
export type PipeError = InferConveeErrors<typeof PIP_ERRORS>;
/** Stable code union for built-in pipe errors. */
export type PipeErrorCode = PipeError["code"];
/** Extracts a specific pipe error variant by its code. */
export type PipeErrorOf<Code extends PipeErrorCode> = Extract<
  PipeError,
  { code: Code }
>;

/**
 * Recognize a built-in pipe error and validate its required metadata fields.
 *
 * @param error - Unknown caught value to check against the PIP_ERRORS catalog.
 *
 * @returns True only for a ConveeError with the expected domain, source, known
 * code and metadata shape. Unknown codes return false; this is not authentication.
 * @throws Exceptions from getters or proxies encountered during inspection propagate.
 */
export function isPipeError(error: unknown): error is PipeError {
  if (
    !ConveeError.is(error) || error.domain !== "pipe" ||
    error.source !== "convee/pipe"
  ) return false;
  switch (error.code) {
    case "PIP_000":
      return matchesMeta(error.meta, { pipeId: "string" });
    case "PIP_001":
      return matchesMeta(error.meta, {
        pipeId: "string",
        pluginId: "string",
        inputArity: "number",
        received: "unknown",
      });
    case "PIP_002":
      return matchesMeta(error.meta, {
        pipeId: "string",
        pluginId: "string",
        target: "string",
        allowedTargets: "strings",
      });
    case "PIP_004":
      return matchesMeta(error.meta, { pipeId: "string", stepIds: "strings" });
    default:
      return false;
  }
}
