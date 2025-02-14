import { MetadataHelper } from "./index.ts";
import { assertEquals, assert } from "jsr:@std/assert";

Deno.test(
  "metadata/collector - MetadataHelper",
  async (t: Deno.TestContext) => {
    await t.step("constructor", async (t: Deno.TestContext) => {
      await t.step("should create a new instance of MetadataHelper", () => {
        const itemId = "1234";
        const metadataHelper = new MetadataHelper(itemId);
        assert(metadataHelper, "Expected metadataHelper to be defined");
        assertEquals(metadataHelper.itemId, itemId);
      });

      await t.step("should create an empty metadata object", () => {
        const itemId = "1234";
        const metadataHelper = new MetadataHelper(itemId);
        assertEquals(metadataHelper.getAll(), {});
      });
    });

    await t.step("add", async (t: Deno.TestContext) => {
      await t.step("should add a key-value pair to the metadata object", () => {
        const itemId = "1234";
        const key = "key";
        const value = "value";

        const metadataHelper = new MetadataHelper(itemId);
        metadataHelper.add(key, value);

        assertEquals(metadataHelper.get(key), value);
      });

      await t.step(
        "should add key-value pairs of different types to the metadata object",
        () => {
          const itemId = "1234";
          const key1 = "key1";
          const value1 = "value1";
          const key2 = "key2";
          const value2 = 1234;
          const key3 = "key3";
          const value3 = { key: "value" };

          const metadataHelper = new MetadataHelper(itemId);
          metadataHelper.add(key1, value1);
          metadataHelper.add(key2, value2);
          metadataHelper.add(key3, value3);

          assertEquals(metadataHelper.get(key1), value1);
          assertEquals(metadataHelper.get(key2), value2);
          assertEquals(metadataHelper.get(key3), value3);
        }
      );
    });

    await t.step("get", async (t: Deno.TestContext) => {
      await t.step("should get a value from the metadata object", () => {
        const itemId = "1234";
        const key = "key";
        const value = "value";

        const metadataHelper = new MetadataHelper(itemId);
        metadataHelper.add(key, value);

        assertEquals(metadataHelper.get(key), value);
      });

      await t.step(
        "should get values of different keys from the metadata object",
        () => {
          const itemId = "1234";
          const key1 = "key1";
          const value1 = "value1";
          const key2 = "key2";
          const value2 = "value2";
          const key3 = "key3";
          const value3 = "value3";

          const metadataHelper = new MetadataHelper(itemId);
          metadataHelper.add(key1, value1);
          metadataHelper.add(key2, value2);
          metadataHelper.add(key3, value3);

          assertEquals(metadataHelper.get(key1), value1);
          assertEquals(metadataHelper.get(key2), value2);
          assertEquals(metadataHelper.get(key3), value3);
        }
      );
    });

    await t.step("getAll", async (t: Deno.TestContext) => {
      await t.step(
        "should get all key-value pairs from the metadata object",
        () => {
          const itemId = "1234";
          const key1 = "key1";
          const value1 = "value1";
          const key2 = "key2";
          const value2 = "value2";
          const key3 = "key3";
          const value3 = "value3";

          const metadataHelper = new MetadataHelper(itemId);
          metadataHelper.add(key1, value1);
          metadataHelper.add(key2, value2);
          metadataHelper.add(key3, value3);

          assertEquals(metadataHelper.getAll(), {
            key1: value1,
            key2: value2,
            key3: value3,
          });
        }
      );
    });
  }
);
