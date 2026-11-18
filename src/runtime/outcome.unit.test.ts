import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { afterPhase } from "@/runtime/outcome.ts";

describe("Lifecycle transition table", () => {
  it("advances every possible phase on success and failure", () => {
    for (
      const [phase, success, failed] of [
        ["input", "run", "finally"],
        ["run", "output", "error"],
        ["error", "output", "finally"],
        ["output", "finally", "finally"],
      ] as const
    ) {
      assertEquals(afterPhase(phase, false), success);
      assertEquals(afterPhase(phase, true), failed);
    }
  });
});
