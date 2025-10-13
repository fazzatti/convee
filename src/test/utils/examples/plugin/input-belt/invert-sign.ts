import { Plugin } from "../../../../../belt-plugin/index.ts";
import { BeltPluginInput } from "../../../../../belt-plugin/types.ts";
import { MetadataHelper } from "../../../../../metadata/collector/index.ts";

export const invertSignInputPlugin: BeltPluginInput<{ a: number; b: number }> =
  Plugin.create({
    processInput: (
      item: { a: number; b: number },
      metadataHelper?: MetadataHelper
    ): { a: number; b: number } => {
      if (metadataHelper) {
        metadataHelper.add(
          "InvertSignInputPlugin",
          `Inverting the signes of ${item.a} and ${item.b}`
        );
      }

      return { a: -item.a, b: -item.b };
    },
  });
