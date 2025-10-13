// tests/pipeline_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { Pipeline } from "./index.ts";
import { Modifier, Transformer, CoreProcessType } from "../core/types.ts";
import { ProcessEngine } from "../process-engine/index.ts";

const stringToNumberPlusOneTransformer: Transformer<string, number> = async (
  item: string
) => {
  return Number(item) + 1;
};

const doubleNumberModifier: Modifier<number> = async (item: number) => {
  return Promise.resolve(item * 2);
};

Deno.test("Pipeline creation with valid inner chain", () => {
  const pipeline = Pipeline.create([doubleNumberModifier], {
    name: "TestPipeline",
    id: "test123",
  });
  assert(pipeline, "Expected pipeline to be defined");
  assertEquals(pipeline.name, "TestPipeline");
  assertEquals(pipeline.id, "test123");
  assertEquals(pipeline.type, CoreProcessType.PIPELINE);
});

Deno.test("Pipeline exposes inner chain", () => {
  const numberToStringEngine = ProcessEngine.create(
    (n: number) => n.toString(),
    {
      name: "numberToStringEngine",
    }
  );

  const pipeline = Pipeline.create(
    [doubleNumberModifier, numberToStringEngine],
    {
      name: "TestPipeline",
      id: "test123",
    }
  );
  assertEquals(pipeline.steps, [doubleNumberModifier, numberToStringEngine]);
});

Deno.test("Pipeline execution with valid inner chain", async () => {
  const numberToStringEngine = ProcessEngine.create(
    (n: number) => n.toString(),
    {
      name: "numberToStringEngine",
    }
  );

  const pipeline = Pipeline.create(
    [
      stringToNumberPlusOneTransformer,
      doubleNumberModifier,
      numberToStringEngine,
    ],
    {
      name: "TestPipeline",
      id: "test123",
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

  const numberToStringEngine = ProcessEngine.create(
    (n: number) => n.toString(),
    {
      name: "numberToStringEngine",
    }
  );

  // Chain: stringToNumberPlusOneTransformer then errorModifier then numberToStringEngine.
  const pipeline = Pipeline.create(
    [stringToNumberPlusOneTransformer, errorModifier, numberToStringEngine],
    {
      name: "ErrorPipeline",
      id: "err123",
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

Deno.test("Pipeline execution with single-use plugin", async () => {
  // Single-use input plugin: adds 10 to the input.
  const singleUseInputPlugin = {
    name: "singleInput",
    processInput: async (item: number) => item + 10,
  };

  // Build a simple pipeline: a modifier that multiplies by 2.
  const pipeline = Pipeline.create(
    [doubleNumberModifier], // Modifier<number>: multiplies input by 2.
    { name: "SingleUseTest", id: "su1" }
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

  const numberToStringEngine = ProcessEngine.create(
    (n: number) => n.toString(),
    {
      name: "numberToStringEngine",
    }
  );

  // Build a simple pipeline: a modifier that multiplies by 2.
  const pipeline = Pipeline.create(
    [
      doubleNumberModifier,
      numberToStringEngine,
      stringToNumberPlusOneTransformer,
    ],
    { name: "double", id: "pipe1" }
  );

  // Execute without a single-use plugin.
  const resultWithoutCustom = await pipeline.run(5);
  assertEquals(resultWithoutCustom, 11);

  const customSteps = [...pipeline.steps] as const;

  customSteps[1].addPlugin(addTenPlugin);
  customSteps[1].addPlugin(addTenPlugin);

  const resultWithCustom = await pipeline.runCustom(5, [...customSteps]);

  assertEquals(resultWithCustom, 31);
});

Deno.test("Pipeline execution with belt plugins", async () => {
  // Define dummy belt plugins for pre- and post-processing.
  const addFivePlugin = {
    name: "addFive",
    processInput: (item: number) => item + 5,
  };

  const numberToStringEngine = ProcessEngine.create(
    (n: number) => n.toString(),
    {
      name: "numberToStringEngine",
    }
  );

  // Create a pipeline with a single modifier.
  const pipeline = Pipeline.create(
    [
      stringToNumberPlusOneTransformer,
      doubleNumberModifier,
      numberToStringEngine,
    ],
    {
      name: "PluginPipeline",
      id: "plugin1",
    }
  );

  pipeline.addPlugin(addFivePlugin, "numberToStringEngine");

  // Expected flow:
  // Inner chain:
  // stringToNumberPlusOneTransformer: "10" => Number("10") + 1 = 11
  // doubleNumberModifier: 11 * 2 = 22.
  // numberToStringEngine with addFivePlugin: 22 + 5 = 27 => "27".
  const result = await pipeline.run("10");
  assertEquals(result, "27");
});

Deno.test("Pipeline execution with multiple belt operations", async () => {
  const addFivePlugin = {
    name: "addFive",
    processInput: (item: number) => item + 5,
  };

  const timesTwoPlugin = {
    name: "timesTwo",
    processOutput: (item: number) => Number(item) * 2,
  };

  const numberToStringEngine = ProcessEngine.create(
    (n: number) => n.toString(),
    {
      name: "N2S",
    }
  );

  const stringToNumberEngine = ProcessEngine.create((n: string) => Number(n), {
    name: "S2N",
  });

  const plusOneEngine = ProcessEngine.create((n: number) => n + 1, {
    name: "PlusOne",
  });

  const timesFiveEngine = ProcessEngine.create((n: number) => n * 5, {
    name: "TimesFive",
  });
  const minusOneEngine = ProcessEngine.create((n: number) => n - 1, {
    name: "MinusOne",
  });

  // Create a pipeline with a single modifier.
  const pipeline = Pipeline.create(
    [
      stringToNumberEngine,
      plusOneEngine,
      timesFiveEngine,
      minusOneEngine,
      numberToStringEngine,
    ],
    {
      name: "PluginPipeline",
      id: "plugin1",
    }
  );

  pipeline.pluggableSteps;

  assertEquals(await pipeline.run("1"), "9");
  pipeline.addPlugin(addFivePlugin, "TimesFive");
  assertEquals(await pipeline.run("1"), "34");
  pipeline.removePlugin("TimesFive", "addFive");
  assertEquals(await pipeline.run("1"), "9");
  pipeline.addPlugin(addFivePlugin, "TimesFive");
  assertEquals(await pipeline.run("1"), "34");
  pipeline.addPlugin(timesTwoPlugin, "TimesFive");
  assertEquals(await pipeline.run("1"), "69");
  pipeline.removePlugin("TimesFive", "timesTwo");
  assertEquals(await pipeline.run("1"), "34");
  pipeline.removePlugin("TimesFive", "addFive");
  assertEquals(await pipeline.run("1"), "9");
  pipeline.addPlugin(timesTwoPlugin, "MinusOne");
  assertEquals(await pipeline.run("1"), "18");
});
