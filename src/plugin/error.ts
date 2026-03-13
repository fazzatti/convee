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

export type PluginUnknownThrownMeta = {
  pluginId: string;
  target?: string;
};

export type PluginInvalidDefinitionMeta = {
  capability: string;
  received?: unknown;
  pluginId?: string;
  target?: string;
};

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

export type PluginError = InferConveeErrors<typeof PLG_ERRORS>;
export type PluginErrorCode = PluginError["code"];
export type PluginErrorOf<Code extends PluginErrorCode> = Extract<
  PluginError,
  { code: Code }
>;

export function isPluginError(error: unknown): error is PluginError {
  return (
    ConveeError.is(error) &&
    error.domain === "plugin" &&
    error.source === "convee/plugin"
  );
}
