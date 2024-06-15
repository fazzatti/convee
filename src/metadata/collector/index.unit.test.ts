import { MetadataHelper } from "./index.ts";

describe("metadata/collector", () => {
  describe("MetadataHelper", () => {
    describe("constructor", () => {
      it("should create a new instance of MetadataHelper", () => {
        const itemId = "1234";

        const metadataHelper = new MetadataHelper(itemId);

        expect(metadataHelper).toBeDefined();
        expect(metadataHelper.itemId).toBe(itemId);
      });

      it("should create an empty metadata object", () => {
        const itemId = "1234";

        const metadataHelper = new MetadataHelper(itemId);

        expect(metadataHelper.getAll()).toEqual({});
      });
    });

    describe("add", () => {
      it("should add a key-value pair to the metadata object", () => {
        const itemId = "1234";
        const key = "key";
        const value = "value";

        const metadataHelper = new MetadataHelper(itemId);
        metadataHelper.add(key, value);

        expect(metadataHelper.get(key)).toBe(value);
      });

      it("should add a key-value pairs of different types to the metadata object", () => {
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

        expect(metadataHelper.get(key1)).toBe(value1);
        expect(metadataHelper.get(key2)).toBe(value2);
        expect(metadataHelper.get(key3)).toBe(value3);
      });
    });

    describe("get", () => {
      it("should get a value from the metadata object", () => {
        const itemId = "1234";
        const key = "key";
        const value = "value";

        const metadataHelper = new MetadataHelper(itemId);
        metadataHelper.add(key, value);

        expect(metadataHelper.get(key)).toBe(value);
      });

      it("should get a value of different keys from the metadata object", () => {
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

        expect(metadataHelper.get(key1)).toBe(value1);
        expect(metadataHelper.get(key2)).toBe(value2);
        expect(metadataHelper.get(key3)).toBe(value3);
      });
    });

    describe("getAll", () => {
      it("should get all key-value pairs from the metadata object", () => {
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

        expect(metadataHelper.getAll()).toEqual({
          key1: value1,
          key2: value2,
          key3: value3,
        });
      });
    });
  });
});
