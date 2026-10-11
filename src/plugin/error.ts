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

const definePluginError: ErrorFactory<"plugin", "convee/plugin"> =
  createErrorFactory({
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

/** Explicit public types for the plugin error catalog. */
export type PluginErrorCatalog = {
  /**
   * Describe a non-Error value thrown during plugin execution.
   *
   * @param args - Original cause and plugin identity, with optional trace and
   * diagnostic guidance, plus the target when known.
   *
   * @returns A `PLG_000` ConveeError retaining the cause and identity metadata.
   * @throws Exceptions from input property access propagate; the created error is returned.
   */
  readonly UNKNOWN_THROWN: ConveeErrorCreator<
    "PLG_000",
    PluginUnknownThrownMeta,
    "plugin",
    "convee/plugin",
    "Unknown plugin error",
    PluginUnknownThrownArgs
  >;
  /**
   * Describe a missing or non-callable lifecycle hook in a plugin definition.
   *
   * @param args - Capability name and optional received value, plugin ID, target and trace.
   *
   * @returns A `PLG_001` ConveeError with a message identifying the invalid capability.
   * @throws Exceptions from input property access propagate; the created error is returned.
   */
  readonly INVALID_DEFINITION: ConveeErrorCreator<
    "PLG_001",
    PluginInvalidDefinitionMeta,
    "plugin",
    "convee/plugin",
    "Plugin definition is invalid.",
    PluginInvalidDefinitionArgs
  >;
};

/** Arguments for PLG_ERRORS.UNKNOWN_THROWN. */
export type PluginUnknownThrownArgs = {
  cause: unknown;
  pluginId: string;
  target?: string;
  trace?: ConveeErrorTrace;
  diagnostic?: Diagnostic;
};

/** Arguments for PLG_ERRORS.INVALID_DEFINITION. */
export type PluginInvalidDefinitionArgs = {
  capability: string;
  received?: unknown;
  pluginId?: string;
  target?: string;
  trace?: ConveeErrorTrace;
};

/**
 * Built-in plugin error constructors, indexed by stable failure category.
 *
 * Each member accepts its named argument object and returns a ConveeError in the
 * `plugin` domain with source `convee/plugin`. Constructors preserve diagnostic
 * payload references and do not throw the error they create. Their identifier
 * properties support code-based narrowing; see each member for inputs and output.
 *
 * @remarks Invalid runtime arguments or throwing property accessors can raise
 * native errors during construction. Metadata is not deep-frozen or redacted.
 */
export const PLG_ERRORS: PluginErrorCatalog = {
  UNKNOWN_THROWN: definePluginError({
    code: "PLG_000",
    message: "Unknown plugin error",
    build(args: PluginUnknownThrownArgs) {
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
    build(args: PluginInvalidDefinitionArgs) {
      return {
        trace: args.trace,
        message:
          `Plugin definition is invalid for capability "${args.capability}".`,
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

/**
 * Recognize a built-in plugin error and validate its required metadata fields.
 *
 * @param error - Unknown caught value to check against the PLG_ERRORS catalog.
 *
 * @returns True only for a ConveeError with the expected domain, source, known
 * code and metadata shape. Unknown codes return false; this is not authentication.
 * @throws Exceptions from getters or proxies encountered during inspection propagate.
 */
export function isPluginError(error: unknown): error is PluginError {
  if (
    !ConveeError.is(error) || error.domain !== "plugin" ||
    error.source !== "convee/plugin"
  ) return false;
  switch (error.code) {
    case "PLG_000":
      return matchesMeta(error.meta, {
        pluginId: "string",
        target: "optional-string",
      });
    case "PLG_001":
      return matchesMeta(error.meta, {
        capability: "string",
        pluginId: "optional-string",
        target: "optional-string",
      });
    default:
      return false;
  }
}
