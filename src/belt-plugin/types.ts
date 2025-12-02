import { PluginModifier, PluginTransformer } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { RequireAtLeastOne } from "../utils/types/require-at-least-one.ts";

/**
 * Base interface for all plugins.
 * Every plugin must have a unique name for identification.
 */
export type PluginBase = {
  /** Unique name to identify this plugin */
  readonly name: string;
};

/**
 * Input plugin that processes data before the main process runs.
 * Use this to validate, transform, or enrich input data.
 *
 * @template Input - The type of input being processed
 *
 * @example
 * ```typescript
 * const validateInput: BeltPluginInput<number> = {
 *   name: "ValidatePositive",
 *   processInput: (n, metadata) => {
 *     if (n < 0) throw new Error("Must be positive");
 *     metadata.add("validated", true);
 *     return n;
 *   },
 * };
 * ```
 */
export type BeltPluginInput<Input> = PluginBase & {
  /** Function that processes input before the main process */
  processInput: PluginModifier<Input>;
};

/**
 * Output plugin that processes data after the main process completes.
 * Use this to transform, log, or enrich output data.
 *
 * @template Output - The type of output being processed
 *
 * @example
 * ```typescript
 * const logOutput: BeltPluginOutput<number> = {
 *   name: "LogResult",
 *   processOutput: (result, metadata) => {
 *     console.log(`Result: ${result}`);
 *     return result;
 *   },
 * };
 * ```
 */
export type BeltPluginOutput<Output> = PluginBase & {
  /** Function that processes output after the main process */
  processOutput: PluginModifier<Output>;
};

/**
 * Error plugin that handles errors during processing.
 * Can either transform the error and re-throw, or recover by returning a valid output.
 *
 * @template Output - The output type (used when recovering from errors)
 * @template ErrorT - The error type being handled
 *
 * @example
 * ```typescript
 * const handleError: BeltPluginError<number, Error> = {
 *   name: "ErrorRecovery",
 *   processError: (error, metadata) => {
 *     console.error(error.message);
 *     return 0; // Return fallback value
 *   },
 * };
 * ```
 */
export type BeltPluginError<Output, ErrorT extends Error> = PluginBase & {
  /** Function that handles errors - can return a recovery value or a transformed error */
  processError: PluginTransformer<
    ConveeError<ErrorT>,
    ConveeError<ErrorT> | Output
  >;
};

/**
 * Partial plugin interface combining all plugin types.
 * Used internally for type inference.
 */
export interface BeltPluginPartial<Input, Output, ErrorT extends Error>
  extends Partial<BeltPluginInput<Input>>,
    Partial<BeltPluginOutput<Output>>,
    Partial<BeltPluginError<Output, ErrorT>> {}

/**
 * Union type representing any valid plugin configuration.
 * A plugin can implement any combination of input, output, and error handlers.
 *
 * @template Input - The input type for input plugins
 * @template Output - The output type for output/error plugins
 * @template ErrorT - The error type for error plugins
 *
 * @example
 * ```typescript
 * // Plugin with both input and output handlers
 * const fullPlugin: BeltPlugin<number, number, Error> = {
 *   name: "FullPlugin",
 *   processInput: (n, meta) => n * 2,
 *   processOutput: (n, meta) => n + 1,
 * };
 * ```
 */
export type BeltPlugin<Input, Output, ErrorT extends Error> = (PluginBase &
  BeltPluginPartial<Input, Output, ErrorT>) &
  (
    | BeltPluginInput<Input>
    | BeltPluginOutput<Output>
    | BeltPluginError<Output, ErrorT>
    | RequireAtLeastOne<{
        processInput?: PluginModifier<Input>;
        processOutput?: PluginModifier<Output>;
        processError?: PluginTransformer<
          ConveeError<ErrorT>,
          ConveeError<ErrorT> | Output
        >;
      }>
  );
