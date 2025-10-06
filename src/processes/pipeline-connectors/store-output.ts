import { Modifier } from "../../core/types.ts";
import { MetadataHelper } from "../../metadata/collector/index.ts";

export type StoreOutputConnector<PreviousStepOutput> =
  Modifier<PreviousStepOutput>;

export const storeOutput = <PreviousStepOutput>(
  key: string
): StoreOutputConnector<PreviousStepOutput> => {
  return ((
    input: PreviousStepOutput,
    metadataHelper: MetadataHelper
  ): PreviousStepOutput => {
    metadataHelper.add(key, input);
    return input;
  }) as Modifier<PreviousStepOutput>;
};
