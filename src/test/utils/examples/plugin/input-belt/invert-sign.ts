import { IBeltPluginInput } from "../../../../../belt-plugin/types";
import { MetadataHelper } from "../../../../../metadata/collector";

export class InvertSignInputPlugin
  implements IBeltPluginInput<{ a: number; b: number }>
{
  public name = "InvertSignInputPlugin";
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
