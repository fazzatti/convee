import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType, EngineMetadata } from "../core/types.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";

/**
 * A ProcessEngine is a single processing unit that transforms input to output.
 * It supports plugins for input/output modification and error handling.
 *
 * @template Input - The type of input the process accepts
 * @template Output - The type of output the process produces
 * @template ErrorT - The type of errors the process may throw
 *
 * @example
 * ```typescript
 * const engine: ProcessEngine<number, number, Error> = ProcessEngine.create(
 *   (n) => n * 2,
 *   { name: "Double" }
 * );
 * ```
 */
export type ProcessEngine<Input, Output, ErrorT extends Error> = {
  /** The name of this process engine */
  name: string;
  /** Unique identifier for this process engine instance */
  id: string;
  /** The type of this process (always PROCESS_ENGINE) */
  type: CoreProcessType;
  /** Array of plugins attached to this process engine */
  plugins: BeltPlugin<Input, Output, ErrorT>[];
  /**
   * Executes the process with the given input.
   * @param item - The input to process
   * @param options - Optional run configuration
   * @returns Promise resolving to the processed output
   */
  run: (
    item: Input,
    options?: RunOptions<Input, Output, ErrorT>
  ) => Promise<Output>;
  /**
   * Adds a plugin to this process engine.
   * @param plugin - The plugin to add
   */
  addPlugin: (plugin: BeltPlugin<Input, Output, ErrorT>) => void;
  /**
   * Removes a plugin by name from this process engine.
   * @param pluginName - The name of the plugin to remove
   */
  removePlugin: (pluginName: string) => void;
};

/**
 * Options for creating a ProcessEngine.
 *
 * @template I - The input type
 * @template O - The output type
 * @template E - The error type
 */
export type ProcessEngineOptions<I, O, E extends Error> = {
  /** Optional name for the process engine (defaults to "UnnamedProcess") */
  name?: string;
  /** Optional custom ID (defaults to a generated UUID) */
  id?: string;
  /** Initial plugins to attach to the process engine */
  plugins?: BeltPlugin<I, O, E>[];
};

/**
 * Metadata collected during ProcessEngine execution.
 * Extends EngineMetadata with process-specific information.
 */
export interface ProcessEngineMetadata extends EngineMetadata {
  /** The source identifier (process engine ID) */
  source: string;
  /** Unique identifier for the current item being processed */
  itemId: string;
  /** The type of process (PROCESS_ENGINE) */
  type: CoreProcessType;
}

/**
 * Options passed to the run() method of a ProcessEngine.
 *
 * @template Input - The input type
 * @template Output - The output type
 * @template ErrorT - The error type
 *
 * @example
 * ```typescript
 * await engine.run(input, {
 *   singleUsePlugins: [loggerPlugin],
 *   existingItemId: "custom-id",
 * });
 * ```
 */
export interface RunOptions<Input, Output, ErrorT extends Error> {
  /** Use an existing item ID instead of generating a new one */
  existingItemId?: string;
  /** Plugins to use only for this single execution */
  singleUsePlugins?: BeltPlugin<Input, Output, ErrorT>[];
  /** Existing MetadataHelper to use (for sharing metadata across pipeline steps) */
  metadataHelper?: MetadataHelper;
}
