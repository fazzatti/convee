// deno-lint-ignore-file no-explicit-any
import { Modifier, ModifierAsync, ModifierSync } from "../../core/types.ts";
import { MetadataHelper } from "../../metadata/collector/index.ts";
import { PipelineStep } from "../../pipeline/types.ts";

export type StoreOutputConnector<PreviousStep> =
  PreviousStep extends PipelineStep<any, infer PreviousStepOutput, any>
    ? Modifier<PreviousStepOutput>
    : never;

export function storeOutput<PreviousStep extends PipelineStep<any, any, any>>(
  previousStep: PreviousStep,
  key: string
): StoreOutputConnector<PreviousStep> {
  return ((input: unknown, metadataHelper: MetadataHelper) => {
    metadataHelper.add(key, input);
    return input;
  }) as StoreOutputConnector<typeof previousStep>;
}
