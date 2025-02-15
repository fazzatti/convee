import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";

export enum CoreProcessType {
  PROCESS_ENGINE = "PROCESS_ENGINE",
  PIPELINE = "PIPELINE",
}

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
