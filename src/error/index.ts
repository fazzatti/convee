import { EngineMetadata } from "../core/types.ts";
import { IConveeError, IConveeErrorPayload, ParsedMetadata } from "./types.ts";

/**
 * Enhanced error class that tracks the processing stack.
 *
 * ConveeError extends the standard Error class with an `engineStack` that
 * records which processes the error passed through. This is useful for:
 * - Debugging complex pipelines
 * - Understanding where errors originated
 * - Tracking error propagation through nested pipelines
 *
 * @template ErrorT - The original error type being wrapped
 *
 * @example
 * ```typescript
 * // ConveeError is automatically created when errors are thrown in processes
 * const process = ProcessEngine.create(
 *   (n: number) => {
 *     if (n < 0) throw new Error("Must be positive");
 *     return n;
 *   },
 *   { name: "ValidatePositive" }
 * );
 *
 * try {
 *   await process.run(-1);
 * } catch (error) {
 *   if (error instanceof ConveeError) {
 *     console.log(error.engineStack);
 *     // [{ source: "process-id", type: "PROCESS_ENGINE", itemId: "..." }]
 *   }
 * }
 * ```
 */
export class ConveeError<ErrorT extends Error>
  extends Error
  implements IConveeError<ErrorT>
{
  /**
   * Stack of process metadata showing where this error has been through.
   * Each entry represents a process that handled (or failed to handle) this error.
   */
  public engineStack: ParsedMetadata[];

  /**
   * Creates a new ConveeError.
   * @param args - The error payload containing the message and original error
   */
  constructor(args: IConveeErrorPayload<ErrorT>) {
    super(args.message);

    // Restore prototype chain (for instanceof checks to work properly)
    Object.assign(this, args.error); // Copy custom properties

    this.engineStack = [];
  }

  /**
   * Enriches the error with metadata from a process.
   * Called automatically when an error propagates through a ProcessEngine.
   *
   * @param metadata - The engine metadata to add to the stack
   * @returns This error instance for chaining
   */
  public enrichConveeStack(metadata: EngineMetadata): ConveeError<ErrorT> {
    this.engineStack.push({
      source: metadata.source,
      type: metadata.type,
      itemId: metadata.itemId,
      dataKeys: [...Object.keys(metadata.processMeta || [])],
    });
    return this;
  }
}
