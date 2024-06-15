import { ConveeError } from "../../../error/index.ts";
import { InvertSignInputPlugin } from "../../utils/examples/plugin/input-belt/invert-sign.ts";
import { SumProcessor } from "../../utils/examples/process-engine/sum.ts";

describe("Given a Sum Process Engine", () => {
  describe("When a user excutes a sum with no plugins", () => {
    it("Then it should return the sum of the input", async () => {
      const sumProcessor = new SumProcessor();

      const result = await sumProcessor.execute({ a: 1, b: 2 });

      expect(result).toBe(3);
    });

    it("Then it should throw a convee error if the input is not a number", async () => {
      const sumProcessor = new SumProcessor();

      try {
        await sumProcessor.execute({ a: 1, b: "2" as unknown as number });
      } catch (error) {
        expect((error as ConveeError<Error>).message).toBe(
          "The inputs a and b must be numbers."
        );
        expect((error as ConveeError<Error>).engineStack).toBeDefined();
      }
    });
  });

  describe("When a user excutes a sum with plugin(s)", () => {
    describe("And the plugin is a InverSign", () => {
      it("Then it should return the sum of the input with the sign inverted", async () => {
        const sumProcessor = new SumProcessor({
          plugins: [new InvertSignInputPlugin()],
        });

        const result = await sumProcessor.execute({ a: 1, b: 2 });

        expect(result).toBe(-3);
      });
    });
  });
});
