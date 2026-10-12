import { assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { abiEqual } from "@test/wasm/abi-cases.ts";

describe("Portable ABI assertion oracle", () => {
  it("detects wrong signs, widths, order, fields, discriminants and buffer values", () => {
    const incorrect: [unknown, unknown][] = [
      [0, -0],
      [NaN, 0],
      [1n, 1],
      [127, -128],
      [[1, 2], [2, 1]],
      [[1], [1, 2]],
      [new Array(2), []],
      [new Int8Array([1]), new Uint8Array([1])],
      [new Uint8Array([1]), new Uint8Array([2])],
      [{ x: 1 }, { y: 1 }],
      [{ tag: "none" }, { tag: "some", val: undefined }],
      [{ x: { y: "a" } }, { x: { y: "b" } }],
      [null, {}],
    ];
    for (const [actual, expected] of incorrect) {
      assertThrows(() => abiEqual(actual, expected));
    }
    for (
      const value of [NaN, -0, 1n, undefined, {
        data: new Float64Array([NaN, -0]),
      }]
    ) {
      abiEqual(value, structuredClone(value));
    }
  });
});
