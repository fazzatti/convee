import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { admittedOccupancy } from "@/core/capacity.ts";
import { firstEligible } from "@/core/eligibility.ts";
import { copyArguments, singleArgument } from "@/core/sequences.ts";
import { retain } from "@/core/selection.ts";
import { diagnosticValue } from "@/error/serialize.ts";
import { hexByte } from "@/wasm/digest.ts";
import { freshName, insertSource } from "@/workers/source-edit.ts";

describe("JavaScript boundaries of production contracts", () => {
  it("shares the 1,000-object diagnostic budget across siblings and saturates it", () => {
    const branches = Array.from(
      { length: 12 },
      () => Array.from({ length: 100 }, () => ({})),
    );
    const projected = diagnosticValue(branches) as (unknown[] | string)[];
    assertEquals(projected[0], branches[0]);
    // Root, nine arrays and their 900 children use 910 visits. The next array
    // uses visit 911. Exactly 89 of its 100 children can still be projected.
    assertEquals(projected[9], [
      ...Array.from({ length: 89 }, () => ({})),
      ...Array(11).fill("[Truncated]"),
    ]);
    assertEquals(projected.slice(10), ["[Truncated]", "[Truncated]"]);
  });
  it("agrees with exact integer admission at the maximum safe limit", () => {
    const max = Number.MAX_SAFE_INTEGER;
    for (const used of [0, 1, max - 1, max]) {
      for (const request of [0, 1, 2, max - 1, max]) {
        const sum = BigInt(used) + BigInt(request);
        assertEquals(
          admittedOccupancy(used, request, max),
          sum > BigInt(max) ? -1 : Number(sum),
        );
      }
    }
  });
  it("copies tuple containers while preserving reference and undefined arguments", () => {
    const item = {};
    const input = [item, item, undefined];
    const copy = copyArguments(input);
    assertNotStrictEquals(copy, input);
    assertStrictEquals(copy[0], item);
    assertStrictEquals(copy[1], item);
    copy.pop();
    assertEquals(input.length, 3);
    assertEquals(singleArgument(undefined), [undefined]);
  });
  it("stops an eligibility search at its first match and retains the original registration span", () => {
    const seen: number[] = [];
    const registrations = [0, 1, 1, 2];
    assertEquals(
      firstEligible(registrations, 1, (value) => {
        seen.push(value);
        return value === 1;
      }),
      1,
    );
    assertEquals(seen, [1]);
    const calls: number[] = [];
    assertEquals(
      retain(registrations, (value) => {
        calls.push(value);
        registrations.push(3);
        return value === 1;
      }),
      [1, 1],
    );
    assertEquals(calls, [0, 1, 1, 2]);
  });
  it("uses native UTF-16 offsets and generates collision-free worker bindings", () => {
    const source = "A😀\ud800B";
    for (let i = 0; i <= source.length; i++) {
      const edited = insertSource(source, i, "!");
      assertEquals(edited.slice(0, i) + edited.slice(i + 1), source);
      assertEquals(edited.charAt(i), "!");
    }
    const names = new Set(["😀", "😀_", "😀__"]);
    assertEquals(freshName("😀", names), "😀___");
    assertEquals(names.size, 3);
  });
  it("matches native lowercase hexadecimal for every digest byte", () => {
    for (let byte = 0; byte <= 255; byte++) {
      assertEquals(hexByte(byte), byte.toString(16).padStart(2, "0"));
    }
  });
});
