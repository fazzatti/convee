import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";

export enum CoreProcessType {
  PROCESS_ENGINE = "PROCESS_ENGINE",
  PIPELINE = "PIPELINE",
}

// ============================================================
// ========= Modifier/Transformer with optional metadata ======
// ============================================================
// Use these for simple functions in pipelines that may or may not need metadata

export type Modifier<ItemType> =
  | ModifierSync<ItemType>
  | ModifierAsync<ItemType>;

export type ModifierSync<ItemType> = {
  (item: ItemType, metadataHelper?: MetadataHelper): ItemType;
};

export type ModifierAsync<ItemType> = {
  (item: ItemType, metadataHelper?: MetadataHelper): Promise<ItemType>;
};

export type Transformer<Input, Output> =
  | TransformerSync<Input, Output>
  | TransformerAsync<Input, Output>;

export type TransformerAsync<Input, Output> = {
  (item: Input, metadataHelper?: MetadataHelper): Promise<Output>;
};

export type TransformerSync<Input, Output> = {
  (item: Input, metadataHelper?: MetadataHelper): Output;
};

// ============================================================
// ========= Modifier/Transformer with required metadata ======
// ============================================================
// Use these for plugins that need guaranteed access to metadata

export type PluginModifier<ItemType> =
  | PluginModifierSync<ItemType>
  | PluginModifierAsync<ItemType>;

export type PluginModifierSync<ItemType> = {
  (item: ItemType, metadataHelper: MetadataHelper): ItemType;
};

export type PluginModifierAsync<ItemType> = {
  (item: ItemType, metadataHelper: MetadataHelper): Promise<ItemType>;
};

export type PluginTransformer<Input, Output> =
  | PluginTransformerSync<Input, Output>
  | PluginTransformerAsync<Input, Output>;

export type PluginTransformerAsync<Input, Output> = {
  (item: Input, metadataHelper: MetadataHelper): Promise<Output>;
};

export type PluginTransformerSync<Input, Output> = {
  (item: Input, metadataHelper: MetadataHelper): Output;
};

export type EngineMetadata = {
  source: string;
  type: string;
  itemId: string;
  processMeta?: MetadataCollected;
};
