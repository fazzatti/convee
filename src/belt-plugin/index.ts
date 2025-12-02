// deno-lint-ignore-file no-explicit-any
import { Modifier, Transformer } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { Unwrap } from "../utils/types/unwrap.ts";
import {
  BeltPlugin,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "./types.ts";

/**
 * Creates an input-only plugin.
 * @template I - The input type
 */
function create<I>(methods: {
  name: string;
  processInput: Modifier<I>;
}): BeltPluginInput<Unwrap<I>>;

/**
 * Creates an output-only plugin.
 * @template O - The output type
 */
function create<O>(methods: {
  name: string;
  processOutput: Modifier<O>;
}): BeltPluginOutput<Unwrap<O>>;

/**
 * Creates an error-only plugin.
 * @template O - The output type (for error recovery)
 * @template E - The error type
 */
function create<O, E extends Error>(methods: {
  name: string;
  processError: Transformer<ConveeError<E>, ConveeError<E> | O>;
}): BeltPluginError<Unwrap<O>, E>;

/**
 * Creates a plugin with any combination of input, output, and error handlers.
 * @template I - The input type
 * @template O - The output type
 * @template E - The error type
 */
function create<I, O, E extends Error>(methods: {
  name: string;
  processInput?: Modifier<I>;
  processOutput?: Modifier<O>;
  processError?: Transformer<ConveeError<E>, ConveeError<E> | O>;
}): BeltPlugin<Unwrap<I>, Unwrap<O>, E>;

/**
 * Creates a plugin with the specified handlers.
 *
 * Plugins hook into the processing lifecycle at three points:
 * - **processInput**: Runs before the main process, can modify input
 * - **processOutput**: Runs after the main process, can modify output
 * - **processError**: Handles errors, can recover or transform them
 *
 * @param methods - Object containing the plugin name and handler functions
 * @returns A typed plugin object
 *
 * @example
 * ```typescript
 * // Input plugin
 * const validate = Plugin.create({
 *   name: "Validate",
 *   processInput: (n: number, metadata) => {
 *     if (n < 0) throw new Error("Must be positive");
 *     return n;
 *   },
 * });
 *
 * // Output plugin
 * const logger = Plugin.create({
 *   name: "Logger",
 *   processOutput: (result: number, metadata) => {
 *     console.log(`Result: ${result}`);
 *     return result;
 *   },
 * });
 *
 * // Combined plugin
 * const audit = Plugin.create({
 *   name: "Audit",
 *   processInput: (n: number, metadata) => {
 *     metadata.add("startTime", Date.now());
 *     return n;
 *   },
 *   processOutput: (result: number, metadata) => {
 *     metadata.add("endTime", Date.now());
 *     return result;
 *   },
 * });
 * ```
 */
function create(methods: any): any {
  return methods;
}

/**
 * Factory for creating plugins.
 *
 * @example
 * ```typescript
 * import { Plugin } from "@fifo/convee";
 *
 * const myPlugin = Plugin.create({
 *   name: "MyPlugin",
 *   processInput: (input, metadata) => input,
 * });
 * ```
 */
export const Plugin = { create };
