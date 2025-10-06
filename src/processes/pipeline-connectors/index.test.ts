import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import {
  Modifier,
  CoreProcessType,
  Transformer,
  ModifierSync,
} from "../../core/types.ts";
import { Pipeline } from "../../pipeline/index.ts";
import { ProcessEngine } from "../../process-engine/index.ts";
import { MetadataHelper } from "../../metadata/collector/index.ts";
import { storeOutput } from "./store-output.ts";

const stringToNumberPlusOneTransformer: Transformer<string, number> = async (
  item: string
) => {
  return Number(item) + 1;
};

const doubleNumberModifier: Modifier<number> = async (item: number) => {
  return Promise.resolve(item * 2);
};

const numberToStringEngine = ProcessEngine.create((n: number) => n.toString(), {
  name: "numberToStringEngine",
});

Deno.test("Pipeline store output connector", async () => {
  let metadataHelper: MetadataHelper | undefined;

  const extractedMetadataHelperStep = <T>(
    input: T,
    metadata?: MetadataHelper
  ): T => {
    metadataHelper = metadata;
    return input;
  };

  const pipeline = Pipeline.create(
    [
      doubleNumberModifier,
      storeOutput("doubleNumberModifier"),
      numberToStringEngine,
      storeOutput("numberToStringEngine"),
      stringToNumberPlusOneTransformer,
      storeOutput("stringToNumberPlusOneTransformer"),
      extractedMetadataHelperStep,
    ],
    {
      name: "TestPipeline",
      id: "test123",
      plugins: [],
    }
  );

  const firstResult = await pipeline.run(10);

  assertEquals(firstResult, 21);
  assertExists(metadataHelper);
  if (metadataHelper) {
    assertEquals(metadataHelper.get("doubleNumberModifier"), 20);
    assertEquals(metadataHelper.get("numberToStringEngine"), "20");
    assertEquals(metadataHelper.get("stringToNumberPlusOneTransformer"), 21);
  }

  const secondResult = await pipeline.run(5);

  assertEquals(secondResult, 11);
  assertExists(metadataHelper);
  if (metadataHelper) {
    assertEquals(metadataHelper.get("doubleNumberModifier"), 10);
    assertEquals(metadataHelper.get("numberToStringEngine"), "10");
    assertEquals(metadataHelper.get("stringToNumberPlusOneTransformer"), 11);
  }
});
