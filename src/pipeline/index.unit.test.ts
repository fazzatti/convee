// tests/pipeline_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { Pipeline } from "./index.ts";
import { Modifier, Transformer, CoreProcessType } from "../core/types.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { ProcessEngine } from "../process-engine/index.ts";

// Dummy transformer: converts a string to a number by parsing and adding 1.
const transformerStep: Transformer<string, number> = async (
  item: string,
  helper: MetadataHelper
) => {
  return Number(item) + 1;
};

// Dummy modifier: multiplies the number by 2.
const modifierStep: Modifier<number> = async (
  item: number,
  helper: MetadataHelper
) => {
  return item * 2;
};

// Dummy process engine step: converts a number to a string.
class DummyProcess extends ProcessEngine<number, string, Error> {
  public readonly name = "dummyProcessEngine";
  public async process(item: number, helper: MetadataHelper): Promise<string> {
    return item.toString();
  }
}
const dummyProcessEngine = new DummyProcess();

// Test 1: Pipeline creation with valid inner chain (single-element).
Deno.test("Pipeline creation with valid inner chain", () => {
  const pipeline = Pipeline.create(
    {
      name: "TestPipeline",
      id: "test123",
      plugins: [],
    },
    [modifierStep] // Modifier<number> expected: number -> number.
  );
  assert(pipeline, "Expected pipeline to be defined");
  assertEquals(pipeline.name, "TestPipeline");
  assertEquals(pipeline.id, "test123");
  // Check that the pipeline's type (via getType) returns the correct value.
  assertEquals(pipeline.getType(), CoreProcessType.PIPELINE);
});

// Test 2: Pipeline execution with a multi-element chain.
Deno.test("Pipeline execution with valid inner chain", async () => {
  // Chain: transformerStep: string -> number, modifierStep: number -> number, dummyProcessEngine: number -> string.
  const pipeline = Pipeline.create(
    {
      name: "TestPipeline",
      id: "test123",
      plugins: [],
    },
    [transformerStep, modifierStep, dummyProcessEngine]
  );
  // Expected execution:
  // transformerStep: "10" => Number("10") + 1 = 11
  // modifierStep: 11 * 2 = 22
  // dummyProcessEngine: 22 => "22"
  const result = await pipeline.execute("10");
  assertEquals(result, "22");
});

// Test 3: Pipeline execution error handling.
Deno.test("Pipeline execution error handling", async () => {
  // Create an error modifier that always throws.
  const errorModifier: Modifier<number> = async (
    item: number,
    helper: MetadataHelper
  ) => {
    throw new Error("inner error");
  };

  // Chain: transformerStep then errorModifier then dummyProcessEngine.
  const pipeline = Pipeline.create(
    {
      name: "ErrorPipeline",
      id: "err123",
      plugins: [],
    },
    [transformerStep, errorModifier, dummyProcessEngine]
  );

  let errorCaught = false;
  try {
    await pipeline.execute("10");
  } catch (e) {
    errorCaught = true;
    // Check that the error message is correct.
    assertEquals((e as Error).message, "inner error");
  }
  assert(errorCaught, "Expected error to be thrown");
});

// Test 4: Pipeline execution with outer belt plugins.
Deno.test("Pipeline execution with outer belt plugins", async () => {
  // Define dummy belt plugins for pre- and post-processing.
  const addFivePlugin = {
    name: "addFive",
    processInput: async (item: number, helper: MetadataHelper) => item + 5,
  };
  const subtractThreePlugin = {
    name: "subtractThree",
    processOutput: async (item: number, helper: MetadataHelper) => item - 3,
  };

  // Create a pipeline with a single modifier.
  const pipeline = Pipeline.create(
    {
      name: "PluginPipeline",
      id: "plugin1",
      plugins: [addFivePlugin, subtractThreePlugin],
    },
    [modifierStep] // Modifier<number>: multiplies by 2.
  );
  // Expected flow:
  // Outer input belt: addFivePlugin adds 5 to input 10 => 15.
  // Inner chain: modifierStep multiplies 15 by 2 => 30.
  // Outer output belt: subtractThreePlugin subtracts 3 => 27.
  const result = await pipeline.execute(10);
  assertEquals(result, 27);
});

Deno.test("Pipeline execution with single-use plugin", async () => {
  // Single-use input plugin: adds 10 to the input.
  const singleUseInputPlugin = {
    name: "singleInput",
    processInput: async (item: number, helper: MetadataHelper) => item + 10,
  };

  // Build a simple pipeline: a modifier that multiplies by 2.
  const pipeline = Pipeline.create(
    { name: "SingleUseTest", id: "su1", plugins: [] },
    [modifierStep] // Modifier<number>: multiplies input by 2.
  );

  // Execute without a single-use plugin.
  const resultWithout = await pipeline.execute(5);
  // Without plugin: 5 * 2 = 10.
  assertEquals(resultWithout, 10);

  // Execute with a single-use plugin.
  const resultWith = await pipeline.execute(5, {
    singleUsePlugins: [singleUseInputPlugin],
  });
  // With single-use plugin:
  //  1. Input plugin adds 10 → 5 + 10 = 15.
  //  2. Then modifierStep multiplies: 15 * 2 = 30.
  assertEquals(resultWith, 30);
});
