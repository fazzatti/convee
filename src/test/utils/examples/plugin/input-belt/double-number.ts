import { Plugin } from "../../../../../belt-plugin/index.ts";
import { BeltPluginInput } from "../../../../../belt-plugin/types.ts";
import { MetadataHelper } from "../../../../../metadata/collector/index.ts";

export const doubleNumberInputPlugin: BeltPluginInput<number> = Plugin.create({
  processInput: async (
    n: number,
    metadataHelper?: MetadataHelper
  ): Promise<number> => {
    if (metadataHelper) {
      metadataHelper.add(
        "doubleNumberInputPlugin",
        `Doubling the number: ${n}`
      );
    }

    return n * 2;
  },
});
