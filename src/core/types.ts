import { MetadataHelper } from "../metadata/collector";
import { MetadataCollected } from "../metadata/collector/types";

export type Modifier<item> = {
  (item: item, metadataHelper: MetadataHelper): Promise<item>;
};

export type Transformer<input, output> = {
  (item: input, metadataHelper: MetadataHelper): Promise<output>;
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
