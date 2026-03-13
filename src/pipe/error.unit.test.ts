import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ConveeError, isConveeErrorOf } from "@/error/index.ts";
import { pipe } from "@/pipe/index.ts";
import { PIP_ERRORS, isPipeError, type PipeErrorOf } from "@/pipe/error.ts";
import type { AnyPipeStep } from "@/pipe/types.ts";
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

    it("creates unpluggable target errors", () => {
      const error = PIP_ERRORS.UNPLUGGABLE_TARGET({
        pipeId: "number-pipe",
        stepId: "plain-step",
        pluginId: "inner-plugin",
        target: "plain-step",
      });

      assertEquals(error.code, PIP_ERRORS.UNPLUGGABLE_TARGET.code);
      assertEquals(
        error.message,
        'Plugin "inner-plugin" targets "plain-step", but that inner step does not accept plugins.',
      );
    });

    it("narrows meta by code", () => {
      if (false) {
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
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output,
              },
              {
                id: "unknown-target-plugin",
                target: "missing-step",
              } as const,
            ) as never,
          ),
        ConveeError,
        'Plugin "unknown-target-plugin" targets "missing-step"',
      );
    });

    it("throws PipeError for unpluggable async inner targets", () => {
      const plainStep = {
        id: "plain-step",
        isSync: false,
        runWith: (_options: object, value: number) =>
          Promise.resolve(value + 1),
      } as const satisfies AnyPipeStep;
      const numberPipe = pipe([plainStep], { id: "number-pipe" } as const);

      const innerPlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output + 10,
        },
        {
          id: "plain-step-plugin",
          target: "plain-step",
        } as const,
      );

      assertThrows(
        () => numberPipe.use(innerPlugin),
        ConveeError,
        'Plugin "plain-step-plugin" targets "plain-step", but that inner step does not accept plugins.',
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
        assertEquals(error.meta.pipeId, "outer-pipe");
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
                input: ((a: number) => a + 1) as never,
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
      const asyncStep = step((value: number) => value + 1, {
        id: "async-step",
      } as const);

      assertThrows(
        () => pipe.sync([asyncStep as never], { id: "sync-pipe" } as const),
        ConveeError,
        "Sync pipelines can only contain sync steps.",
      );
    });
  });
});
