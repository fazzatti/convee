import { ConveeError } from "../../../error/index.ts";
import { sumProcessor } from "../../utils/examples/process-engine/sum.ts";
import { invertSignInputPlugin } from "../../utils/examples/plugin/input-belt/invert-sign.ts";
import { assertEquals, assert } from "jsr:@std/assert";

Deno.test("Given a Sum Process Engine", async (t: Deno.TestContext) => {
  await t.step(
    "When a user executes a sum with no plugins",
    async (t: Deno.TestContext) => {
      await t.step("Then it should return the sum of the input", async () => {
        const result = await sumProcessor.run({ a: 1, b: 2 });
        assertEquals(result, 3);
      });

      await t.step(
        "Then it should throw a convee error if the input is not a number",
        async () => {
          try {
            await sumProcessor.run({ a: 1, b: "2" as unknown as number });
          } catch (error: unknown) {
            const convError = error as ConveeError<Error>;
            assertEquals(
              convError.message,
              "The inputs a and b must be numbers."
            );
            assert(
              convError.engineStack !== undefined,
              "Expected engineStack to be defined"
            );
          }
        }
      );
    }
  );

  await t.step(
    "When a user executes a sum with plugin(s)",
    async (t: Deno.TestContext) => {
      await t.step("And the plugin is an InvertSign", async () => {
        sumProcessor.addPlugin(invertSignInputPlugin);

        const result = await sumProcessor.run({ a: 1, b: 2 });
        assertEquals(result, -3);
      });
    }
  );
});
