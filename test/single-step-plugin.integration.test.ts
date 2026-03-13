import { assertEquals, assertRejects } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";

import type { PluginThis } from "@convee";
import { plugin, step } from "@convee";

const doubleNumberFn = (num: number) => num * 2;

const sumTwoFn = (a: number, b: number) => a + b;

const makeSumTwoStep = () =>
  step(sumTwoFn, {
    id: "SUM-TWO",
  });

describe("Integration: Single Step Plugins", () => {
  describe("input and output plugins", () => {
    it("makeSumTwoStep returns isolated step instances", async () => {
      const firstSumTwo = makeSumTwoStep();
      const secondSumTwo = makeSumTwoStep();

      const outputPlg = plugin().onOutput(doubleNumberFn);

      firstSumTwo.use(outputPlg);

      assertEquals(firstSumTwo.plugins.length, 1);
      assertEquals(secondSumTwo.plugins.length, 0);
      assertEquals(await firstSumTwo(2, 3), 10);
      assertEquals(await secondSumTwo(2, 3), 5);
    });

    it("supports a single input plugin", async () => {
      const sumTwo = makeSumTwoStep();

      const inputPlg = plugin().onInput(
        (a: number, b: number): [number, number] => [a * 2, b * 2],
      );

      assertEquals(await sumTwo(2, 3), 5);
      sumTwo.use(inputPlg);
      assertEquals(await sumTwo(2, 3), 10);
      sumTwo.remove(inputPlg.id);
      assertEquals(await sumTwo(2, 3), 5);
    });

    it("supports multiple input plugins in sequence", async () => {
      const sumTwo = makeSumTwoStep();

      const doubleInputPlg = plugin().onInput(
        (a: number, b: number): [number, number] => [a * 2, b * 2],
      );
      const addOneInputPlg = plugin().onInput(
        (a: number, b: number): [number, number] => [a + 1, b + 1],
      );

      sumTwo.use(doubleInputPlg);
      sumTwo.use(addOneInputPlg);

      assertEquals(await sumTwo(2, 3), 12);
    });

    it("supports a single output plugin", async () => {
      const sumTwo = makeSumTwoStep();

      const outputPlg = plugin().onOutput(doubleNumberFn);

      sumTwo.use(outputPlg);
      assertEquals(await sumTwo(2, 3), 10);
    });

    it("supports multiple output plugins in sequence", async () => {
      const sumTwo = makeSumTwoStep();

      const doubleOutputPlg = plugin().onOutput((output: number) => output * 2);

      const addThreeOutputPlg = plugin().onOutput(
        (output: number) => output + 3,
      );

      sumTwo.use(doubleOutputPlg);
      sumTwo.use(addThreeOutputPlg);

      assertEquals(await sumTwo(2, 3), 13);
    });

    it("supports combined input and output plugins", async () => {
      const sumTwo = makeSumTwoStep();

      const inputFn = (a: number, b: number): [number, number] => [
        a * 2,
        b * 2,
      ];

      const plg = plugin().onInput(inputFn).onOutput(doubleNumberFn);

      sumTwo.use(plg);
      assertEquals(await sumTwo(2, 3), 20);
    });

    it("supports mixed persistent and single-use plugins", async () => {
      const sumTwo = makeSumTwoStep();

      const persistentInput = plugin().onInput(
        (a: number, b: number): [number, number] => [a + 1, b + 1],
      );
      const singleUseOutput = plugin().onOutput(doubleNumberFn);

      sumTwo.use(persistentInput);

      assertEquals(await sumTwo(2, 3), 7);
      assertEquals(
        await sumTwo.runWith({ plugins: [singleUseOutput] }, 2, 3),
        14,
      );
      assertEquals(await sumTwo(2, 3), 7);
      assertEquals(sumTwo.plugins.length, 1);
    });

    it("supports single-use plugins through runWith() without persisting them", async () => {
      const sumTwo = makeSumTwoStep();
      const outputPlg = plugin().onOutput(doubleNumberFn);

      assertEquals(sumTwo.plugins.length, 0);
      assertEquals(await sumTwo.runWith({ plugins: [outputPlg] }, 2, 3), 10);
      assertEquals(sumTwo.plugins.length, 0);
      assertEquals(await sumTwo(2, 3), 5);
    });
  });

  describe("error plugins", () => {
    const makeRiskyStep = () =>
      step((value: number) => {
        if (value < 0) {
          throw new RangeError("negative");
        }

        if (value === 0) {
          throw new TypeError("zero");
        }

        if (value === 99) {
          throw new Error("unknown");
        }

        return value * 2;
      });

    it("supports a single error recovery plugin", async () => {
      const riskyStep = makeRiskyStep();
      const recoveryPlg = plugin.for<[value: number], number>()({
        error: (error: Error, input: [number]) => {
          if (error instanceof RangeError) {
            return Math.abs(input[0]) * 10;
          }

          return error;
        },
      });

      riskyStep.use(recoveryPlg);

      assertEquals(await riskyStep(-2), 20);
      assertEquals(await riskyStep(3), 6);
    });

    it("rejects when no error plugin handles the error", async () => {
      const riskyStep = makeRiskyStep();

      await assertRejects(() => riskyStep(-2), RangeError, "negative");
    });

    it("lets multiple error plugins cooperate until one handles the error", async () => {
      const riskyStep = makeRiskyStep();
      const enrichPlg = plugin.for<[value: number], number>()({
        error: (error: Error) => new Error(`${error.message}:seen`),
      });
      const recoverPlg = plugin.for<[value: number], number>()({
        error: (error: Error, input: [number]) => {
          if (error.message === "negative:seen") {
            return Math.abs(input[0]) * 100;
          }

          return error;
        },
      });

      riskyStep.use(enrichPlg);
      riskyStep.use(recoverPlg);

      assertEquals(await riskyStep(-2), 200);
    });

    it("keeps enriching the error when multiple plugins rethrow", async () => {
      const riskyStep = makeRiskyStep();
      const firstPlg = plugin.for<[value: number], number>()({
        error: (error: Error) => new Error(`${error.message}:first`),
      });
      const secondPlg = plugin.for<[value: number], number>()({
        error: (error: Error) => new Error(`${error.message}:second`),
      });

      riskyStep.use(firstPlg);
      riskyStep.use(secondPlg);

      await assertRejects(() => riskyStep(-2), Error, "negative:first:second");
    });

    it("lets different plugins handle different errors", async () => {
      const riskyStep = makeRiskyStep();
      const rangeRecovery = plugin.for<[value: number], number>()({
        error: (error: Error, input: [number]) => {
          if (error instanceof RangeError) {
            return Math.abs(input[0]) * 10;
          }

          return error;
        },
      });
      const zeroRecovery = plugin.for<[value: number], number>()({
        error: (error: Error) => {
          if (error instanceof TypeError) {
            return 42;
          }

          return error;
        },
      });

      riskyStep.use(rangeRecovery);
      riskyStep.use(zeroRecovery);

      assertEquals(await riskyStep(-3), 30);
      assertEquals(await riskyStep(0), 42);
    });

    it("runs output plugins after an error plugin recovers", async () => {
      const riskyStep = makeRiskyStep();
      const recoveryPlg = plugin.for<[value: number], number>()({
        error: (error: Error, input: [number]) => {
          if (error instanceof RangeError) {
            return Math.abs(input[0]) * 10;
          }

          return error;
        },
      });
      const outputPlg = plugin().onOutput((output: number) => output + 1);

      riskyStep.use(recoveryPlg);
      riskyStep.use(outputPlg);

      assertEquals(await riskyStep(-2), 21);
    });

    it("supports single-use error plugins through runWith()", async () => {
      const riskyStep = makeRiskyStep();
      const recoveryPlg = plugin.for<[value: number], number>()({
        error: (error: Error, input: [number]) => {
          if (error instanceof RangeError) {
            return Math.abs(input[0]) * 10;
          }

          return error;
        },
      });

      assertEquals(await riskyStep.runWith({ plugins: [recoveryPlg] }, -2), 20);
      await assertRejects(() => riskyStep(-2), RangeError, "negative");
    });
  });

  describe("context-aware plugin scenarios", () => {
    it("supports context-aware steps and plugins", async () => {
      const contextualStep = step.withContext<{
        requestId: string;
        total?: number;
      }>()(function (value: number) {
        this.context().state.set("total", value);
        return Number(this.context().state.get("requestId")) + value;
      });

      const contextualPlugin = plugin
        .withContext<{ requestId: string; total?: number }>()()
        .onOutput(function (
          this: PluginThis<{ requestId: string; total?: number }>,
          output: number,
        ) {
          return output + Number(this.context().state.get("total") ?? 0);
        });

      const result = await contextualStep.runWith(
        {
          context: {
            seed: {
              requestId: "5",
            },
          },
          plugins: [contextualPlugin],
        },
        2,
      );

      assertEquals(result, 9);
    });
  });

  describe("typing", () => {
    it("rejects incompatible plugins at the type level", async () => {
      const sumTwo = makeSumTwoStep();
      void sumTwo;

      if (false) {
        sumTwo.use(
          // @ts-expect-error input plugin tuple must match the step input tuple
          plugin.for<[value: string], number>()({
            input: (value: string) => [value],
          }),
        );

        sumTwo.use(
          // @ts-expect-error output plugin output type must match the step output type
          plugin.for<[value: number, other: number], string>()({
            output: (output: string) => output,
          }),
        );

        await sumTwo.runWith(
          {
            plugins: [
              // @ts-expect-error single-use plugins must match the step input tuple
              plugin.for<[value: number], number>()({
                input: (value: number) => value + 1,
              }),
            ],
          },
          2,
          3,
        );

        sumTwo.use(
          plugin.for<[value: number, other: number], number>()({
            // @ts-expect-error error plugin input tuple must match the step input tuple
            error: (_error: Error, input: [string]) => Number(input[0]),
          }),
        );
      }
    });
  });
});
