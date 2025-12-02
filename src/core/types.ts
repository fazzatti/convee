import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";

/**
 * Enum representing the types of core processes in Convee.
 */
export enum CoreProcessType {
  /** A single processing unit that transforms input to output */
  PROCESS_ENGINE = "PROCESS_ENGINE",
  /** A chain of multiple processing steps */
  PIPELINE = "PIPELINE",
}

// ============================================================
// ========= Modifier/Transformer with optional metadata ======
// ============================================================

/**
 * A function that modifies an item, optionally using metadata.
 * Use this for simple functions in pipelines that may or may not need metadata.
 *
 * @template ItemType - The type of item being modified
 *
 * @example
 * ```typescript
 * const double: Modifier<number> = (n) => n * 2;
 * const withMeta: Modifier<number> = (n, meta) => {
 *   meta?.add("doubled", true);
 *   return n * 2;
 * };
 * ```
 */
export type Modifier<ItemType> =
  | ModifierSync<ItemType>
  | ModifierAsync<ItemType>;

/**
 * Synchronous modifier function.
 * @template ItemType - The type of item being modified
 */
export type ModifierSync<ItemType> = {
  (item: ItemType, metadataHelper?: MetadataHelper): ItemType;
};

/**
 * Asynchronous modifier function.
 * @template ItemType - The type of item being modified
 */
export type ModifierAsync<ItemType> = {
  (item: ItemType, metadataHelper?: MetadataHelper): Promise<ItemType>;
};

/**
 * A function that transforms input of one type to output of another type.
 * Use this for functions that change the type of data.
 *
 * @template Input - The input type
 * @template Output - The output type
 *
 * @example
 * ```typescript
 * const stringify: Transformer<number, string> = (n) => String(n);
 * ```
 */
export type Transformer<Input, Output> =
  | TransformerSync<Input, Output>
  | TransformerAsync<Input, Output>;

/**
 * Asynchronous transformer function.
 * @template Input - The input type
 * @template Output - The output type
 */
export type TransformerAsync<Input, Output> = {
  (item: Input, metadataHelper?: MetadataHelper): Promise<Output>;
};

/**
 * Synchronous transformer function.
 * @template Input - The input type
 * @template Output - The output type
 */
export type TransformerSync<Input, Output> = {
  (item: Input, metadataHelper?: MetadataHelper): Output;
};

// ============================================================
// ========= Modifier/Transformer with required metadata ======
// ============================================================

/**
 * A modifier function with guaranteed access to MetadataHelper.
 * Use this for plugins that need to read or write metadata.
 *
 * @template ItemType - The type of item being modified
 *
 * @example
 * ```typescript
 * const logPlugin: PluginModifier<number> = (n, metadata) => {
 *   metadata.add("input", n);
 *   return n;
 * };
 * ```
 */
export type PluginModifier<ItemType> =
  | PluginModifierSync<ItemType>
  | PluginModifierAsync<ItemType>;

/**
 * Synchronous plugin modifier function with required metadata.
 * @template ItemType - The type of item being modified
 */
export type PluginModifierSync<ItemType> = {
  (item: ItemType, metadataHelper: MetadataHelper): ItemType;
};

/**
 * Asynchronous plugin modifier function with required metadata.
 * @template ItemType - The type of item being modified
 */
export type PluginModifierAsync<ItemType> = {
  (item: ItemType, metadataHelper: MetadataHelper): Promise<ItemType>;
};

/**
 * A transformer function with guaranteed access to MetadataHelper.
 * Use this for plugins that transform types and need metadata access.
 *
 * @template Input - The input type
 * @template Output - The output type
 */
export type PluginTransformer<Input, Output> =
  | PluginTransformerSync<Input, Output>
  | PluginTransformerAsync<Input, Output>;

/**
 * Asynchronous plugin transformer function with required metadata.
 * @template Input - The input type
 * @template Output - The output type
 */
export type PluginTransformerAsync<Input, Output> = {
  (item: Input, metadataHelper: MetadataHelper): Promise<Output>;
};

/**
 * Synchronous plugin transformer function with required metadata.
 * @template Input - The input type
 * @template Output - The output type
 */
export type PluginTransformerSync<Input, Output> = {
  (item: Input, metadataHelper: MetadataHelper): Output;
};

/**
 * Metadata collected during process execution.
 * Contains information about the processing source, type, and collected data.
 */
export type EngineMetadata = {
  /** The source identifier (process ID) */
  source: string;
  /** The type of process (PROCESS_ENGINE or PIPELINE) */
  type: string;
  /** Unique identifier for the current item being processed */
  itemId: string;
  /** Metadata collected during processing */
  processMeta?: MetadataCollected;
};
