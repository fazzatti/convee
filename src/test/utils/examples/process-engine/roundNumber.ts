import { MetadataHelper } from "../../../../metadata/collector/index.ts";
import { ProcessEngine } from "../../../../process-engine/index.ts";

export const roundNumberPE = ProcessEngine.create(
  async (n: number, metadataHelper?: MetadataHelper) => {
    if (metadataHelper) {
      metadataHelper.add("RoundNumberProcessor", `Rounding number: ${n}`);
    }

    return Math.round(n);
  },
  {
    name: "RoundNumberProcessor",
  }
);
