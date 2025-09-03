import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";

export enum CoreProcessType {
  PROCESS_ENGINE = "PROCESS_ENGINE",
  PIPELINE = "PIPELINE",
}

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

export type EngineMetadata = {
  source: string;
  type: string;
  itemId: string;
  inputBeltMeta?: MetadataCollected;
  outputBeltMeta?: MetadataCollected;
  errortBeltMeta?: MetadataCollected;
  processMeta?: MetadataCollected;
};
