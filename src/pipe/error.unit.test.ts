import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ConveeError, isConveeErrorOf } from "@/error/index.ts";
import { pipe } from "@/pipe/index.ts";
import { isPipeError, PIP_ERRORS, type PipeErrorOf } from "@/pipe/error.ts";
import { plugin } from "@/plugin/index.ts";
import { step } from "@/step/index.ts";

describe("PipeError", () => {
  describe("factories", () => {
    it("creates invalid target errors", () => {
      const error = PIP_ERRORS.UNKNOWN_PLUGIN_TARGET({
        pipeId: "main-pipe",
        pluginId: "logger",
        target: "missing-step",
        allowedTargets: ["main-pipe", "add-step"],
      });

      assertEquals(error.domain, "pipe");
      assertEquals(error.source, "convee/pipe");
      assertEquals(error.code, PIP_ERRORS.UNKNOWN_PLUGIN_TARGET.code);
      assertEquals(
        error.message,
        'Plugin "logger" targets "missing-step", but only "main-pipe" or one of [main-pipe, add-step] can be used.',
      );
    });

    it("narrows meta by code", () => {
      {
        const verifyTypes = () => {
          const error = null as unknown as PipeErrorOf<
            typeof PIP_ERRORS.UNKNOWN_PLUGIN_TARGET.code
          >;

          const pipeId: string = error.meta.pipeId;
          const pluginId: string = error.meta.pluginId;
          const target: string = error.meta.target;
          const allowedTargets: readonly string[] = error.meta.allowedTargets;

          void pipeId;
          void pluginId;
          void target;
          void allowedTargets;
        };
        void verifyTypes;
      }
    });

    it("detects pipe errors through the module guard", () => {
      assertEquals(
        isPipeError(
          PIP_ERRORS.UNKNOWN_THROWN({
            cause: { reason: "boom" },
            pipeId: "guard-pipe",
          }),
        ),
        true,
      );
      assertEquals(
        isPipeError(
          new ConveeError({
            domain: "plugin",
            code: "PLG_999",
            message: "Not a pipe error",
            source: "convee/plugin",
          }),
        ),
        false,
      );
    });
  });

  describe("runtime", () => {
    it("throws PipeError for unknown async plugin targets", () => {
      const numberPipe = pipe(
        [step((value: number) => value + 1, { id: "add-step" } as const)],
        { id: "number-pipe" } as const,
      );

      assertThrows(
        () =>
          numberPipe.use(
            // @ts-expect-error deliberately invalid input exercises the runtime guard
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output,
              },
              {
                id: "unknown-target-plugin",
                target: "missing-step",
              } as const,
            ),
          ),
        ConveeError,
        'Plugin "unknown-target-plugin" targets "missing-step"',
      );
    });

    it("normalizes unknown thrown values into PipeError", async () => {
      const failingInnerPipe = pipe([step((value: number) => value * 2)], {
        id: "inner-pipe",
        plugins: [
          plugin.for<[value: number], number>()(
            {
              input: () => {
                throw { reason: "boom" };
              },
            },
            {
              id: "inner-unknown-error",
            },
          ),
        ],
      });
      const failingPipe = pipe([failingInnerPipe], {
        id: "outer-pipe",
        plugins: [
          plugin.for<[value: number], number>()(
            {
              error: (error: Error) => error,
            },
            {
              id: "unknown-error-plugin",
            },
          ),
        ],
      });

      await assertRejects(
        () => failingPipe(1),
        ConveeError,
        "Unknown pipe error",
      );

      try {
        await failingPipe(1);
      } catch (error) {
        if (!isConveeErrorOf(error, PIP_ERRORS.UNKNOWN_THROWN)) {
          throw error;
        }

        assertEquals(error.code, PIP_ERRORS.UNKNOWN_THROWN.code);
        assertEquals(error.meta.pipeId, "inner-pipe");
      }
    });

    it("throws PipeError when multi-input plugins return a bare value", async () => {
      const tuplePipe = pipe(
        [step((a: number, b: number) => a + b, { id: "sum-step" } as const)],
        {
          id: "tuple-pipe",
          plugins: [
            plugin.for<[a: number, b: number], number>()(
              {
                // @ts-expect-error deliberately invalid input exercises the runtime guard
                input: (a: number) => a + 1,
              },
              {
                id: "tuple-plugin",
              },
            ),
          ],
        },
      );

      await assertRejects(
        () => tuplePipe(1, 2),
        ConveeError,
        "Input plugins for multi-input pipelines must return the full input tuple.",
      );
    });

    it("throws PipeError when sync pipelines contain async steps", () => {
      const asyncStep = step(
        (value: number) => value + 1,
        {
          id: "async-step",
        } as const,
      );

      assertThrows(
        // @ts-expect-error deliberately invalid input exercises the runtime guard
        () => pipe.sync([asyncStep], { id: "sync-pipe" } as const),
        ConveeError,
        "Sync pipelines can only contain sync steps.",
      );
    });
  });
});
