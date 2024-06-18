import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";

export interface IModifier<item> {
  (item: item, metadataHelper: MetadataHelper): Promise<item>;
}

export interface ITransformer<input, output> {
  (item: input, metadataHelper: MetadataHelper): Promise<output>;
}

export type EngineMetadata = {
  source: string;
  type: string;
  itemId: string;
  inputBeltMeta?: MetadataCollected;
  outputBeltMeta?: MetadataCollected;
  errortBeltMeta?: MetadataCollected;
  processMeta?: MetadataCollected;
};
