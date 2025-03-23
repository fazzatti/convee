import { MetadataHelper } from "../../../../metadata/collector/index.ts";
import { ProcessEngine } from "../../../../process-engine/index.ts";

export const addTaxPEFactory = (tax: number) =>
  ProcessEngine.create(
    async (price: number, metadataHelper?: MetadataHelper) => {
      if (metadataHelper) {
        metadataHelper.add(
          "AddTaxProcessor",
          `Adding tax of ${tax * 100}% to price: ${price}`
        );
      }

      return price + price * tax;
    },
    {
      name: "AddTaxProcessor",
    }
  );
