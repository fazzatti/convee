import {
  ConveeError,
  createErrorFactory,
  type ConveeErrorTrace,
  type Diagnostic,
  type InferConveeErrors,
} from "@/error/index.ts";

const definePluginError = createErrorFactory({
  domain: "plugin",
  source: "convee/plugin",
});

/** Metadata attached to plugin errors created from non-`Error` throws. */
export type PluginUnknownThrownMeta = {
  pluginId: string;
  target?: string;
};

/** Metadata attached to invalid plugin definition errors. */
export type PluginInvalidDefinitionMeta = {
  capability: string;
  received?: unknown;
  pluginId?: string;
  target?: string;
};

/** Built-in plugin error catalog. */
export const PLG_ERRORS = {
  UNKNOWN_THROWN: definePluginError({
    code: "PLG_000",
    message: "Unknown plugin error",
    build(args: {
      cause: unknown;
      pluginId: string;
      target?: string;
      trace?: ConveeErrorTrace;
      diagnostic?: Diagnostic;
    }) {
      return {
        details: "A plugin hook threw a non-Error value.",
        cause: args.cause,
        trace: args.trace,
        diagnostic: args.diagnostic,
        meta: {
          pluginId: args.pluginId,
          ...(args.target === undefined ? {} : { target: args.target }),
        } satisfies PluginUnknownThrownMeta,
      };
    },
  }),
  INVALID_DEFINITION: definePluginError({
    code: "PLG_001",
    message: "Plugin definition is invalid.",
    build(args: {
      capability: string;
      received?: unknown;
      pluginId?: string;
      target?: string;
      trace?: ConveeErrorTrace;
    }) {
      return {
        trace: args.trace,
        message: `Plugin definition is invalid for capability "${args.capability}".`,
        meta: {
          capability: args.capability,
          ...(args.received === undefined ? {} : { received: args.received }),
          ...(args.pluginId === undefined ? {} : { pluginId: args.pluginId }),
          ...(args.target === undefined ? {} : { target: args.target }),
        } satisfies PluginInvalidDefinitionMeta,
      };
    },
  }),
} as const;

/** Union of every built-in plugin error variant. */
export type PluginError = InferConveeErrors<typeof PLG_ERRORS>;
/** Stable code union for built-in plugin errors. */
export type PluginErrorCode = PluginError["code"];
/** Extracts a specific plugin error variant by its code. */
export type PluginErrorOf<Code extends PluginErrorCode> = Extract<
  PluginError,
  { code: Code }
>;

/** Returns `true` when the provided error belongs to the plugin domain. */
export function isPluginError(error: unknown): error is PluginError {
  return (
    ConveeError.is(error) &&
    error.domain === "plugin" &&
    error.source === "convee/plugin"
  );
}
