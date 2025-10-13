import { MetadataHelper } from "../../../../metadata/collector/index.ts";
import { ProcessEngine } from "../../../../process-engine/index.ts";

export const sumProcessor = ProcessEngine.create(
  async (item: { a: number; b: number }, metadataHelper?: MetadataHelper) => {
    if (metadataHelper) {
      metadataHelper.add("SumProcessor", `Summing ${item.a} and ${item.b}`);
    }
    if (typeof item.a !== "number" || typeof item.b !== "number") {
      throw new Error("The inputs a and b must be numbers.");
    }

    return item.a + item.b;
  },
  {
    name: "SumProcessor",
  }
);
