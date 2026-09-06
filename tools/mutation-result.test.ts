import { assertEquals } from "@std/assert";
import { mutationStatus } from "./mutation-result.ts";

const failed = "FAILED | 423 passed (275 steps) | 5 failed (893ms)";
for (const colored of [false, true]) {
  Deno.test(`mutation parser recognizes ${colored ? "colored CI" : "plain local"} test summaries`, () => {
    const output = colored
      ? `\u001b[0m\u001b[31mFAILED\u001b[0m | \u001b[32m423 passed\u001b[0m (275 steps) | \u001b[31m5 failed\u001b[0m (893ms)`
      : failed;
    assertEquals(
      mutationStatus({ passed: false, timedOut: false, output }),
      "killed",
    );
  });
}
for (
  const output of [
    "error: Module not found",
    "error: PermissionDenied",
    "FAILED | 0 passed | 0 failed",
    "dependency reports 1 failed operation",
  ]
) {
  Deno.test(
    "mutation parser rejects infrastructure evidence: " + output,
    () => {
      assertEquals(
        mutationStatus({ passed: false, timedOut: false, output }),
        "invalid",
      );
    },
  );
}
Deno.test("mutation timeout takes priority over a partial test failure", () => {
  assertEquals(
    mutationStatus({ passed: false, timedOut: true, output: failed }),
    "timeout",
  );
});
Deno.test("passing mutant remains a survivor even if logs mention a failure", () => {
  assertEquals(
    mutationStatus({ passed: true, timedOut: false, output: failed }),
    "survived",
  );
});
