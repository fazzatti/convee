import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";

import { pipe, plugin, step } from "@convee";

describe("Integration: Single Pipe", () => {
  describe("creation and setup", () => {
    it("creates a minimal callable pipe from raw functions", async () => {
      const numberPipe = pipe([
        (value: number) => value + 1,
        (value: number) => value * 2,
      ]);

      assertExists(numberPipe.id);
      assertEquals(await numberPipe(2), 6);

      if (false) {
        const result: number = await numberPipe(2);
        void result;

        // @ts-expect-error raw-function pipes keep the inferred input type
        await numberPipe("2");
      }
    });

    it("supports mixed explicit steps and raw functions", async () => {
      const mixedPipe = pipe([
        step((value: number) => value + 1, { id: "add-step" } as const),
        (value: number) => `${value}!`,
      ]);

      assertEquals(await mixedPipe(2), "3!");
    });
  });

  describe("using plugins to customize behavior", () => {
    it("wraps raw functions into visible inner steps that can be targeted", async () => {
      const numberPipe = pipe([
        (value: number) => value + 1,
        (value: number) => value * 2,
      ]);

      const firstStepId = numberPipe.steps[0]?.id;
      assertExists(firstStepId);

      numberPipe.use(
        plugin.for<[value: number], number>()(
          {
            output: (output: number) => output + 3,
          },
          {
            id: "wrapped-step-plugin",
            target: firstStepId,
          },
        ) as never,
      );

      assertEquals(await numberPipe(2), 12);
    });

    it("supports synchronous raw-function pipes too", () => {
      const syncPipe = pipe.sync([
        (value: number) => value + 1,
        (value: number) => value * 2,
      ]);

      assertEquals(syncPipe(2), 6);

      const firstStepId = syncPipe.steps[0]?.id;
      assertExists(firstStepId);

      syncPipe.use(
        plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output + 3,
          },
          {
            id: "wrapped-sync-step-plugin",
            target: firstStepId,
          },
        ) as never,
      );

      assertEquals(syncPipe(2), 12);
    });
  });
});
