import { MetadataCollected } from "./types.ts";

/**
 * Helper class for collecting and managing metadata during processing.
 *
 * MetadataHelper provides a simple key-value store that is shared across
 * all plugins and processes within a single execution. This allows you to:
 * - Pass data between input plugins and the main process
 * - Collect information during processing for output plugins
 * - Track execution context and debugging information
 *
 * @example
 * ```typescript
 * // In an input plugin
 * processInput: (input, metadata) => {
 *   metadata.add("startTime", Date.now());
 *   metadata.add("originalInput", input);
 *   return input;
 * }
 *
 * // In the main process
 * (input, metadata) => {
 *   const startTime = metadata.get("startTime");
 *   metadata.add("processedAt", new Date());
 *   return input * 2;
 * }
 *
 * // In an output plugin
 * processOutput: (output, metadata) => {
 *   const allData = metadata.getAll();
 *   console.log("Execution metadata:", allData);
 *   return output;
 * }
 * ```
 */
export class MetadataHelper {
  private metadata: Record<string, unknown>;

  /** Unique identifier for the current item being processed */
  public readonly itemId: string;

  /**
   * Creates a new MetadataHelper instance.
   * @param itemId - Optional custom item ID (defaults to a generated UUID)
   */
  constructor(itemId?: string) {
    this.metadata = {};
    this.itemId = itemId || crypto.randomUUID();
  }

  /**
   * Adds a key-value pair to the metadata store.
   * If the key already exists, it will be overwritten.
   *
   * @param key - The key to store the value under
   * @param value - The value to store (can be any type)
   *
   * @example
   * ```typescript
   * metadata.add("userId", 123);
   * metadata.add("tags", ["important", "processed"]);
   * ```
   */
  add(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  /**
   * Retrieves a value from the metadata store.
   *
   * @param key - The key to retrieve
   * @returns The stored value, or undefined if the key doesn't exist
   *
   * @example
   * ```typescript
   * const userId = metadata.get("userId"); // 123
   * const missing = metadata.get("nonexistent"); // undefined
   * ```
   */
  get(key: string): unknown {
    return this.metadata[key];
  }

  /**
   * Returns all metadata as a record.
   *
   * @returns A copy of all stored key-value pairs
   *
   * @example
   * ```typescript
   * const all = metadata.getAll();
   * // { userId: 123, tags: ["important"], startTime: 1234567890 }
   * ```
   */
  getAll(): Record<string, unknown> {
    return this.metadata as MetadataCollected;
  }

  /**
   * Clears all metadata from the store.
   */
  clear(): void {
    this.metadata = {};
  }
}
