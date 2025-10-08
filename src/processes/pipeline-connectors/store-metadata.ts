// deno-lint-ignore-file no-explicit-any
import { Modifier, ModifierAsync, ModifierSync } from "../../core/types.ts";
import { MetadataHelper } from "../../metadata/collector/index.ts";
import { PipelineStep } from "../../pipeline/types.ts";

export type StoreMetadataConnector<T> = T extends PipelineStep<
  any,
  infer PreviousStepOutput,
  any
>
  ? Modifier<PreviousStepOutput>
  : Modifier<T>;

export function storeMetadata<PreviousStep extends PipelineStep<any, any, any>>(
  key: string,
  previousStep: PreviousStep
): StoreMetadataConnector<PreviousStep>;

export function storeMetadata<InputType = never>(
  key: string
): InputType extends never
  ? "Error: Explicit type required for this overload of storeMetadata"
  : Modifier<InputType>;

export function storeMetadata<T extends unknown>(
  key: string,
  _previousStep?: T
): Modifier<unknown> {
  return ((input: unknown, metadataHelper: MetadataHelper) => {
    metadataHelper.add(key, input);
    return input;
  }) as Modifier<unknown>;
}
