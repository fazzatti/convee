import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import { pipe, Pipe, plugin, step } from "@convee";

const sortInput = step(function (unparsed: string, targetProp: string) {
  this.context().state.set("targetProp", targetProp);
  return unparsed;
});

const parse = step(
  (input: string): Record<string, unknown> => JSON.parse(input),
  { id: "PARSE_STEP" },
);

const joinParsedWithTargetProp = step(function (
  parsed: Record<string, unknown>,
) {
  const targetProp = this.context().state.get("targetProp") as string;
  return [parsed, targetProp] as const;
});

const objHasProp = step(
  (obj: Record<string, unknown>, prop: string) =>
    Object.prototype.hasOwnProperty.call(obj, prop),
  {
    id: "OBJ-HAS-PROP",
  },
);

describe("Integration: Parse Pipe", () => {
  describe("Assemble Pipeline from Steps", () => {
    it("creates a pipe from steps that parse a string into an object", async () => {
      const parsePipe = pipe([parse]);

      const input = `{"name": "Alice", "age": 30}`;
      const output = await parsePipe(input);

      assertEquals(output, { name: "Alice", age: 30 });
    });

    it("creates a pipe from steps that parse a string and verifies if it has a specific property", async () => {
      const pipeline = pipe([
        sortInput,
        parse,
        joinParsedWithTargetProp,
        objHasProp,
      ]);

      const input = `{"name": "Alice", "age": 30}`;

      assertEquals(await pipeline(input, "name"), true);
      assertEquals(await pipeline(input, "age"), true);
      assertEquals(await pipeline(input, "email"), false);
    });

    it("handles errors thrown during parsing and provides a default object", async () => {
      const errorPlg = plugin({
        id: "ErrorHandlerPlugin",
        target: "PARSE_STEP",
      }).onError((error) => {
        assertExists(error);
        return { error: "Invalid JSON" };
      });

      const pipeline = pipe([
        sortInput,
        parse,
        joinParsedWithTargetProp,
        objHasProp,
      ]);

      pipeline.use(errorPlg);

      const validInput = `{"name": "Alice", "age": 30}`;
      const invalidInput = `{"name": "Alice", "age": 30`; // Missing closing brace
      assertEquals(await pipeline(validInput, "name"), true);
      assertEquals(await pipeline(validInput, "age"), true);

      assertEquals(await pipeline(invalidInput, "name"), false);
      assertEquals(await pipeline(invalidInput, "error"), true);
    });
  });
});
