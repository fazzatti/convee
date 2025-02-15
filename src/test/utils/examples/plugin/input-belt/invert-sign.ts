import { BeltPluginInput } from "../../../../../belt-plugin/types.ts";
import { MetadataHelper } from "../../../../../metadata/collector/index.ts";

export class InvertSignInputPlugin
  implements BeltPluginInput<{ a: number; b: number }>
{
  public name = "InvertSignInputPlugin";
  // deno-lint-ignore require-await
  public async processInput(
    item: { a: number; b: number },
    metadataHelper: MetadataHelper
  ): Promise<{ a: number; b: number }> {
    metadataHelper.add(
      "InvertSignInputPlugin",
      `Inverting the signes of ${item.a} and ${item.b}`
    );

    return { a: -item.a, b: -item.b };
  }
}
