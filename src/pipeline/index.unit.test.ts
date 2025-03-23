// tests/pipeline_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { Pipeline } from "./index.ts";
import { Modifier, Transformer, CoreProcessType } from "../core/types.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { ProcessEngine } from "../process-engine/index.ts";

const stringToNumberPlusOneTransformer: Transformer<string, number> = async (
  item: string
) => {
  return Number(item) + 1;
};

const doubleNumberModifier: Modifier<number> = async (item: number) => {
  return item * 2;
};

const numberToStringEngine = ProcessEngine.create((n: number) => n.toString(), {
  name: "numberToStringEngine",
});

Deno.test("Pipeline creation with valid inner chain", () => {
  const pipeline = Pipeline.create([doubleNumberModifier], {
    name: "TestPipeline",
    id: "test123",
    plugins: [],
  });
  assert(pipeline, "Expected pipeline to be defined");
  assertEquals(pipeline.name, "TestPipeline");
  assertEquals(pipeline.id, "test123");
  assertEquals(pipeline.type, CoreProcessType.PIPELINE);
});

Deno.test("Pipeline exposes inner chain", () => {
  const pipeline = Pipeline.create(
    [doubleNumberModifier, numberToStringEngine],
    {
      name: "TestPipeline",
      id: "test123",
      plugins: [],
    }
  );
  assertEquals(pipeline.steps, [doubleNumberModifier, numberToStringEngine]);
});

Deno.test("Pipeline execution with valid inner chain", async () => {
  const pipeline = Pipeline.create(
    [
      stringToNumberPlusOneTransformer,
      doubleNumberModifier,
      numberToStringEngine,
    ],
    {
      name: "TestPipeline",
      id: "test123",
      plugins: [],
    }
  );
  // Expected execution:
  // stringToNumberPlusOneTransformer: "10" => Number("10") + 1 = 11
  // doubleNumberModifier: 11 * 2 = 22
  // numberToStringEngine: 22 => "22"
  const result = await pipeline.run("10");
  assertEquals(result, "22");
});

// Test 3: Pipeline execution error handling.
Deno.test("Pipeline execution error handling", async () => {
  // Create an error modifier that always throws.
  const errorModifier: Modifier<number> = async (item: number) => {
    throw new Error("inner error");
  };

  // Chain: stringToNumberPlusOneTransformer then errorModifier then numberToStringEngine.
  const pipeline = Pipeline.create(
    [stringToNumberPlusOneTransformer, errorModifier, numberToStringEngine],
    {
      name: "ErrorPipeline",
      id: "err123",
      plugins: [],
    }
  );

  let errorCaught = false;
  try {
    await pipeline.run("10");
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
    processInput: async (item: number) => item + 5,
  };

  const subtractThreePlugin = {
    name: "subtractThree",
    processOutput: async (item: number) => item - 3,
  };

  // Create a pipeline with a single modifier.
  const pipeline = Pipeline.create(
    [doubleNumberModifier], // Modifier<number>: multiplies by 2.
    {
      name: "PluginPipeline",
      id: "plugin1",
      plugins: [addFivePlugin, subtractThreePlugin],
    }
  );

  // Expected flow:
  // Outer input belt: addFivePlugin adds 5 to input 10 => 15.
  // Inner chain: doubleNumberModifier multiplies 15 by 2 => 30.
  // Outer output belt: subtractThreePlugin subtracts 3 => 27.
  const result = await pipeline.run(10);
  assertEquals(result, 27);
});

Deno.test("Pipeline execution with single-use plugin", async () => {
  // Single-use input plugin: adds 10 to the input.
  const singleUseInputPlugin = {
    name: "singleInput",
    processInput: async (item: number) => item + 10,
  };

  // Build a simple pipeline: a modifier that multiplies by 2.
  const pipeline = Pipeline.create(
    [doubleNumberModifier], // Modifier<number>: multiplies input by 2.
    { name: "SingleUseTest", id: "su1", plugins: [] }
  );

  // Execute without a single-use plugin.
  const resultWithout = await pipeline.run(5);
  // Without plugin: 5 * 2 = 10.
  assertEquals(resultWithout, 10);

  // Execute with a single-use plugin.
  const resultWith = await pipeline.run(5, {
    singleUsePlugins: [singleUseInputPlugin],
  });
  // With single-use plugin:
  //  1. Input plugin adds 10 → 5 + 10 = 15.
  //  2. Then doubleNumberModifier multiplies: 15 * 2 = 30.
  assertEquals(resultWith, 30);
});

Deno.test("Pipeline custom execution with modified steps", async () => {
  // Single-use input plugin: adds 10 to the input.
  const addTenPlugin = {
    name: "addTen",
    processInput: async (item: number) => item + 10,
  };

  // Build a simple pipeline: a modifier that multiplies by 2.
  const pipeline = Pipeline.create(
    [
      doubleNumberModifier,
      numberToStringEngine,
      stringToNumberPlusOneTransformer,
    ], // Modifier<number>: multiplies input by 2.
    { name: "doubleAndAddTen", id: "pipe1", plugins: [addTenPlugin] }
  );

  // Execute without a single-use plugin.
  const resultWithoutCustom = await pipeline.run(5);
  // Run default: 5 + 10(plugin) * 2(modifier) + 0(engine conversion) + 1(transformer) = 31.
  assertEquals(resultWithoutCustom, 31);

  const customSteps = [...pipeline.steps] as const;

  customSteps[1].addPlugin(addTenPlugin);
  customSteps[1].addPlugin(addTenPlugin);

  // Run with custom steps: 5 + 10(plugin) * 2(modifier) + 20(engine conversion with two plugins) + 1(transformer)  = 51
  const resultWithCustom = await pipeline.runCustom(5, [...customSteps]);

  assertEquals(resultWithCustom, 51);
});
