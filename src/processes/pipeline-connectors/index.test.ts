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
import { storeOutput, StoreOutputConnector } from "./store-output.ts";

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

  const numberToObject = (item: number) => {
    return { n: item, tag: "custom" };
  };

  const objToNumber = (input: { n: number; tag: string }): number => {
    return input.n;
  };

  const pipeline = Pipeline.create(
    [
      doubleNumberModifier,
      storeOutput(doubleNumberModifier, "first"),
      numberToObject,
      storeOutput(numberToObject, "second"),
      objToNumber,
      storeOutput(objToNumber, "third"),
      numberToStringEngine,
      storeOutput(numberToStringEngine, "fourth"),
      stringToNumberPlusOneTransformer,
      storeOutput(stringToNumberPlusOneTransformer, "fifth"),
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
    assertEquals(metadataHelper.get("first"), 20);
    assertEquals(metadataHelper.get("second"), { n: 20, tag: "custom" });
    assertEquals(metadataHelper.get("third"), 20);
    assertEquals(metadataHelper.get("fourth"), "20");
    assertEquals(metadataHelper.get("fifth"), 21);
  }

  const secondResult = await pipeline.run(5);

  assertEquals(secondResult, 11);
  assertExists(metadataHelper);
  if (metadataHelper) {
    assertEquals(metadataHelper.get("first"), 10);
    assertEquals(metadataHelper.get("second"), { n: 10, tag: "custom" });
    assertEquals(metadataHelper.get("third"), 10);
    assertEquals(metadataHelper.get("fourth"), "10");
    assertEquals(metadataHelper.get("fifth"), 11);
  }
});
