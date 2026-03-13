import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";

import { pipe, plugin, step } from "@convee";

describe("Integration: Pipe Matrix", () => {
  describe("case-by-case scenarios", () => {
    const plusOneInputPlugin = () =>
      plugin().onInput((value: number) => value + 1);
    const doubleInputPlugin = () =>
      plugin().onInput((value: number) => value * 2);
    const plusFiveOutputPlugin = () =>
      plugin().onOutput((output: number) => output + 5);
    const negateOutputPlugin = () =>
      plugin().onOutput((output: number) => -output);
    const plusSevenOutputPlugin = () =>
      plugin().onOutput((output: number) => output + 7);
    const tripleOutputPlugin = () =>
      plugin().onOutput((output: number) => output * 3);
    const plusElevenInnerPlugin = (target: string) =>
      plugin.for<[value: number], number>()(
        { output: (output: number) => output + 11 },
        { id: `inner-${target}-plus-eleven`, target },
      ) as never;
    const doubleInnerPlugin = (target: string) =>
      plugin.for<[value: number], number>()(
        { output: (output: number) => output * 2 },
        { id: `inner-${target}-double`, target },
      ) as never;

    function createNumberPipe(options?: {
      rawFirst?: boolean;
      rawSecond?: boolean;
      rawThird?: boolean;
      id?: string;
    }) {
      const firstStep = options?.rawFirst
        ? (input: number) => input + 1
        : step((input: number) => input + 1, {
            id: `${options?.id ?? "pipe"}-first`,
          } as const);
      const secondStep = options?.rawSecond
        ? (input: number) => input * 2
        : step((input: number) => input * 2, {
            id: `${options?.id ?? "pipe"}-second`,
          } as const);
      const thirdStep = options?.rawThird
        ? (input: number) => input - 3
        : step((input: number) => input - 3, {
            id: `${options?.id ?? "pipe"}-third`,
          } as const);

      return pipe([firstStep, secondStep, thirdStep], {
        id: options?.id ?? "number-pipe",
      } as const);
    }

    it("runs a fully explicit numeric pipe", async () => {
      const numberPipe = createNumberPipe({ id: "explicit-pipe" });

      assertEquals(await numberPipe(4), 7);
      assertEquals(numberPipe.steps.length, 3);
    });

    it("runs a fully raw numeric pipe", async () => {
      const numberPipe = createNumberPipe({
        rawFirst: true,
        rawSecond: true,
        rawThird: true,
        id: "raw-pipe",
      });

      assertEquals(await numberPipe(4), 7);
      assertExists(numberPipe.steps[0]?.id);
      assertExists(numberPipe.steps[1]?.id);
      assertExists(numberPipe.steps[2]?.id);
    });

    it("supports a mixed raw and explicit pipe", async () => {
      const numberPipe = createNumberPipe({
        rawFirst: true,
        rawThird: true,
        id: "mixed-pipe",
      });

      assertEquals(await numberPipe(6), 11);
      assertEquals(numberPipe.steps.length, 3);
    });

    it("applies a persistent input plugin before the first step", async () => {
      const numberPipe = createNumberPipe({ id: "input-pipe" });
      numberPipe.use(plusOneInputPlugin());

      assertEquals(await numberPipe(4), 9);
    });

    it("applies a doubling input plugin before the first step", async () => {
      const numberPipe = createNumberPipe({ id: "double-input-pipe" });
      numberPipe.use(doubleInputPlugin());

      assertEquals(await numberPipe(4), 15);
    });

    it("targets the second step with a plus-eleven output plugin", async () => {
      const numberPipe = createNumberPipe({ id: "inner-plus-eleven-pipe" });
      const innerTarget = numberPipe.steps[1]?.id;
      assertExists(innerTarget);

      numberPipe.use(plusElevenInnerPlugin(innerTarget));

      assertEquals(await numberPipe(4), 18);
    });

    it("targets the second step with a doubling output plugin", async () => {
      const numberPipe = createNumberPipe({ id: "inner-double-pipe" });
      const innerTarget = numberPipe.steps[1]?.id;
      assertExists(innerTarget);

      numberPipe.use(doubleInnerPlugin(innerTarget));

      assertEquals(await numberPipe(4), 17);
    });

    it("applies a persistent output plugin at the pipeline level", async () => {
      const numberPipe = createNumberPipe({ id: "output-pipe" });
      numberPipe.use(plusFiveOutputPlugin());

      assertEquals(await numberPipe(4), 12);
    });

    it("applies a single-use output plugin without persisting it", async () => {
      const numberPipe = createNumberPipe({ id: "single-use-output-pipe" });

      assertEquals(
        await numberPipe.runWith({ plugins: [plusSevenOutputPlugin()] }, 4),
        14,
      );
      assertEquals(await numberPipe(4), 7);
    });

    it("can negate the final result with an output plugin", async () => {
      const numberPipe = createNumberPipe({ id: "negate-pipe" });
      numberPipe.use(negateOutputPlugin());

      assertEquals(await numberPipe(4), -7);
    });

    it("supports combined input, inner-step, persistent output, and single-use output plugins", async () => {
      const numberPipe = createNumberPipe({
        rawFirst: true,
        rawSecond: true,
        id: "combined-pipe",
      });
      numberPipe.use(plusOneInputPlugin());
      const innerTarget = numberPipe.steps[1]?.id;
      assertExists(innerTarget);
      numberPipe.use(plusElevenInnerPlugin(innerTarget));
      numberPipe.use(plusFiveOutputPlugin());

      const actual = await numberPipe.runWith(
        { plugins: [tripleOutputPlugin()] },
        4,
      );
      assertEquals(actual, 75);
    });

    it("supports negative inputs through mixed raw and explicit steps", async () => {
      const numberPipe = createNumberPipe({
        rawSecond: true,
        id: "negative-pipe",
      });
      numberPipe.use(plusFiveOutputPlugin());

      assertEquals(await numberPipe(-2), 0);
    });

    it("supports connector-style object pipelines inspired by workflow repos", async () => {
      const enrichOrder = step(
        (input: { orderId: string; amount: number; fee: number }) => ({
          ...input,
          subtotal: input.amount + input.fee,
        }),
      );
      const applyDiscount = (input: {
        orderId: string;
        amount: number;
        fee: number;
        subtotal: number;
      }) => ({
        ...input,
        total: input.subtotal * 0.9,
      });
      const summarize = step(
        (input: { orderId: string; total: number }) =>
          `order:${input.orderId}:total:${input.total}`,
      );

      const orderPipe = pipe([enrichOrder, applyDiscount, summarize]);

      assertEquals(
        await orderPipe({ orderId: "o-1", amount: 100, fee: 10 }),
        "order:o-1:total:99",
      );
    });
  });
});
