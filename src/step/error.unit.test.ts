import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ConveeError, isConveeErrorOf } from "@/error/index.ts";
import { plugin } from "@/plugin/index.ts";
import { STP_ERRORS, isStepError, type StepErrorOf } from "@/step/error.ts";
import { step } from "@/step/index.ts";

describe("StepError", () => {
  describe("factories", () => {
    it("creates unknown thrown errors", () => {
      const error = STP_ERRORS.UNKNOWN_THROWN({
        cause: { reason: "boom" },
        stepId: "sum-step",
      });

      assertEquals(error.domain, "step");
      assertEquals(error.source, "convee/step");
      assertEquals(error.code, STP_ERRORS.UNKNOWN_THROWN.code);
      assertEquals(error.message, "Unknown step error");
      assertEquals(error.meta, { stepId: "sum-step" });
      assertEquals(error.cause, { reason: "boom" });
    });

    it("creates unknown thrown errors with plugin metadata", () => {
      const error = STP_ERRORS.UNKNOWN_THROWN({
        cause: { reason: "boom" },
        stepId: "sum-step",
        pluginId: "error-plugin",
      });

      assertEquals(error.meta, {
        stepId: "sum-step",
        pluginId: "error-plugin",
      });
    });

    it("creates invalid input plugin result errors", () => {
      const error = STP_ERRORS.INVALID_INPUT_PLUGIN_RESULT({
        stepId: "sum-step",
        pluginId: "input-plugin",
        inputArity: 2,
        received: 1,
      });

      assertEquals(error.code, STP_ERRORS.INVALID_INPUT_PLUGIN_RESULT.code);
      assertEquals(
        error.message,
        "Input plugins for multi-input steps must return the full input tuple.",
      );
      assertEquals(error.meta, {
        inputArity: 2,
        received: 1,
        stepId: "sum-step",
        pluginId: "input-plugin",
      });
    });

    it("narrows meta by code", () => {
      if (false) {
        const error = null as unknown as StepErrorOf<
          typeof STP_ERRORS.INVALID_INPUT_PLUGIN_RESULT.code
        >;

        const stepId: string = error.meta.stepId;
        const pluginId: string = error.meta.pluginId;
        const inputArity: number = error.meta.inputArity;
        const received: unknown = error.meta.received;

        void stepId;
        void pluginId;
        void inputArity;
        void received;
      }
    });
  });

  describe("runtime", () => {
    it("detects step errors through the module guard", () => {
      assertEquals(
        isStepError(
          STP_ERRORS.UNKNOWN_THROWN({
            cause: { reason: "boom" },
            stepId: "guard-step",
          }),
        ),
        true,
      );
      assertEquals(
        isStepError(
          new ConveeError({
            domain: "pipe",
            code: "PIP_999",
            message: "Not a step error",
            source: "convee/pipe",
          }),
        ),
        false,
      );
    });

    it("normalizes unknown thrown values into StepError for async steps", async () => {
      const unknownThrowingStep = step(
        (): number => {
          throw { reason: "boom" };
        },
        {
          id: "async-step",
          plugins: [
            plugin.for<[], number>()(
              {
                error: (error: Error) => error,
              },
              {
                id: "unknown-error-plugin",
              },
            ),
          ],
        },
      );

      await assertRejects(
        () => unknownThrowingStep(),
        ConveeError,
        "Unknown step error",
      );

      try {
        await unknownThrowingStep();
      } catch (error) {
        if (!isConveeErrorOf(error, STP_ERRORS.UNKNOWN_THROWN)) {
          throw error;
        }

        const stepError = error;
        assertEquals(stepError.code, STP_ERRORS.UNKNOWN_THROWN.code);
        assertEquals(stepError.meta, { stepId: "async-step" });
      }
    });

    it("normalizes unknown thrown values into StepError for sync steps", () => {
      const unknownThrowingStep = step.sync(
        (): number => {
          throw { reason: "boom" };
        },
        {
          id: "sync-step",
          plugins: [
            plugin.sync.for<[], number>()(
              {
                error: (error: Error) => error,
              },
              {
                id: "sync-unknown-error-plugin",
              },
            ),
          ],
        },
      );

      assertThrows(
        () => unknownThrowingStep(),
        ConveeError,
        "Unknown step error",
      );

      try {
        unknownThrowingStep();
      } catch (error) {
        if (!isConveeErrorOf(error, STP_ERRORS.UNKNOWN_THROWN)) {
          throw error;
        }

        const stepError = error;
        assertEquals(stepError.code, STP_ERRORS.UNKNOWN_THROWN.code);
        assertEquals(stepError.meta, { stepId: "sync-step" });
      }
    });

    it("throws StepError when multi-input plugins return a bare value", async () => {
      const invalidStep = step((a: number, b: number) => a + b, {
        id: "tuple-step",
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
      });

      await assertRejects(
        () => invalidStep(1, 2),
        ConveeError,
        "Input plugins for multi-input steps must return the full input tuple.",
      );
    });
  });
});
