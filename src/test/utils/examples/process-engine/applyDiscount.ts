import { MetadataHelper } from "../../../../metadata/collector/index.ts";
import { ProcessEngine } from "../../../../process-engine/index.ts";

export const applyDiscountPEfactory = (discount: number) =>
  ProcessEngine.create(
    async (price: number, metadataHelper?: MetadataHelper) => {
      if (metadataHelper) {
        metadataHelper.add(
          "ApplyDiscountProcessor",
          `Applying discount of ${discount * 100}% to price: ${price}`
        );
      }

      return price - price * discount;
    },
    {
      name: "ApplyDiscountProcessor",
    }
  );
