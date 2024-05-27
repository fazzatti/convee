import { IBeltPlugin } from "../../../../belt-plugin/types";
import { MetadataHelper } from "../../../../metadata/collector";
import { ProcessEngine } from "../../../../process-engine";

export class SumProcessor extends ProcessEngine<
  { a: number; b: number },
  number,
  Error
> {
  public readonly name: string = "SumProcessor";

  constructor(args?: {
    id?: string;
    plugins?: IBeltPlugin<{ a: number; b: number }, number, Error>[];
  }) {
    super(args);
  }

  protected async process(
    item: {
      a: number;
      b: number;
    },
    metadataHelper: MetadataHelper
  ): Promise<number> {
    metadataHelper.add("SumProcessor", `Summing ${item.a} and ${item.b}`);

    if (typeof item.a !== "number" || typeof item.b !== "number") {
      throw new Error("The inputs a and b must be numbers.");
    }

    return item.a + item.b;
  }
}
