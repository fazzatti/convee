import { assertEquals, assert } from "jsr:@std/assert";
import { Pipeline, Plugin } from "../../../index.ts";
import { applyDiscountPEfactory } from "../../utils/examples/process-engine/applyDiscount.ts";
import { addTaxPEFactory } from "../../utils/examples/process-engine/addTax.ts";
import { roundNumberPE } from "../../utils/examples/process-engine/roundNumber.ts";
import { doubleNumberInputPlugin } from "../../utils/examples/plugin/input-belt/double-number.ts";

Deno.test(
  "Given a Product Price Pipeline with 2% discount and 10% tax",
  async (t: Deno.TestContext) => {
    const pricePipeline = Pipeline.create(
      [applyDiscountPEfactory(0.02), addTaxPEFactory(0.1)],
      {
        name: "ProductPricePipeline",
      }
    );

    await t.step(
      "When a user processes a product that costs 500 ",
      async (t: Deno.TestContext) => {
        const price = 500;

        await t.step(
          "Then it should return the processed price by default",
          async () => {
            // Run: 500 - 500 * 0.02 + 500 * 0.1 = 539
            const result = await pricePipeline.run(price);
            assertEquals(result, 539);
          }
        );

        await t.step(
          "Then it should return the processed with another discount if a pipeline coupom is applied first",
          async () => {
            const plugin = Plugin.create({
              name: "DiscountPlugin",
              processInput: async (n: number) => n - n * 0.5, // apply 50% discount
            });
            // Run: 500 - 500 * 0.5 = 250 - 250 * 0.02 = 245 + 245 * 0.1 = 269.5
            const result = await pricePipeline.run(price, {
              singleUsePlugins: [plugin],
            });
            assertEquals(result, 269.5);
          }
        );
      }
    );

    await t.step(
      "When a user processes a product that costs 500 while customizing the steps",
      async (t: Deno.TestContext) => {
        const price = 500;

        await t.step(
          "Then it should return the processed price with higher discount if the step is modified",
          async () => {
            const customSteps = [...pricePipeline.steps];

            customSteps[0] = applyDiscountPEfactory(0.5);

            // Run: 500 - 500 * 0.5 = 250 + 250 * 0.1 = 275
            const result = await pricePipeline.runCustom(
              price,
              customSteps as typeof pricePipeline.steps
            );
            assertEquals(result, 275);
          }
        );
      }
    );
  }
);
