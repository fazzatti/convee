import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";

import { createRunContext, pipe, plugin, step } from "@convee";

describe("Integration: Multi Pipe", () => {
  describe("case-by-case scenarios", () => {
    const plusFourInnerPlugin = (target: string) =>
      plugin.for<[value: number], number>()(
        { output: (output: number) => output + 4 },
        { id: `nested-${target}-plus-four`, target },
      ) as never;
    const minusFiveOutputPlugin = () =>
      plugin().onOutput((output: number) => output - 5);
    const timesTwoOutputPlugin = () =>
      plugin().onOutput((output: number) => output * 2);

    function createNestedPipe(options?: {
      rawPreOuter?: boolean;
      rawInnerA?: boolean;
      rawInnerB?: boolean;
      rawFinalize?: boolean;
      preMode?: "identity" | "plus-two";
      middleMode?: "double" | "triple";
      id?: string;
    }) {
      const pre = options?.preMode ?? "identity";
      const middle = options?.middleMode ?? "double";
      const preOuter = options?.rawPreOuter
        ? (input: number) => (pre === "plus-two" ? input + 2 : input)
        : step((input: number) => (pre === "plus-two" ? input + 2 : input), {
            id: `${options?.id ?? "nested"}-outer-pre`,
          } as const);
      const innerA = options?.rawInnerA
        ? (input: number) => input + 1
        : step((input: number) => input + 1, {
            id: `${options?.id ?? "nested"}-inner-a`,
          } as const);
      const innerB = options?.rawInnerB
        ? (input: number) => (middle === "triple" ? input * 3 : input * 2)
        : step(
            (input: number) => (middle === "triple" ? input * 3 : input * 2),
            { id: `${options?.id ?? "nested"}-inner-b` } as const,
          );
      const innerPipe = pipe([innerA, innerB], {
        id: `${options?.id ?? "nested"}-inner-pipe`,
      } as const);
      const finalize = options?.rawFinalize
        ? (input: number) => input - 3
        : step((input: number) => input - 3, {
            id: `${options?.id ?? "nested"}-finalize`,
          } as const);

      const outerPipe = pipe([preOuter, innerPipe, finalize], {
        id: `${options?.id ?? "nested"}-outer-pipe`,
      } as const);

      return { outerPipe, innerPipe };
    }

    it("runs a fully explicit nested pipe", async () => {
      const { outerPipe, innerPipe } = createNestedPipe({
        id: "explicit-nested",
      });

      assertEquals(await outerPipe(4), 7);
      assertEquals(outerPipe.steps.length, 3);
      assertEquals(innerPipe.steps.length, 2);
    });

    it("runs a fully raw nested pipe", async () => {
      const { outerPipe, innerPipe } = createNestedPipe({
        rawPreOuter: true,
        rawInnerA: true,
        rawInnerB: true,
        rawFinalize: true,
        id: "raw-nested",
      });

      assertEquals(await outerPipe(4), 7);
      assertExists(outerPipe.steps[1]?.id);
      assertExists(innerPipe.steps[0]?.id);
    });

    it("supports a raw outer pre-step with explicit inner and final steps", async () => {
      const { outerPipe } = createNestedPipe({
        rawPreOuter: true,
        preMode: "plus-two",
        id: "raw-pre-nested",
      });

      assertEquals(await outerPipe(4), 11);
    });

    it("supports a raw first inner step", async () => {
      const { outerPipe } = createNestedPipe({
        rawInnerA: true,
        id: "raw-inner-a-nested",
      });

      assertEquals(await outerPipe(4), 7);
    });

    it("supports a raw second inner step with triple middle behavior", async () => {
      const { outerPipe } = createNestedPipe({
        rawInnerB: true,
        middleMode: "triple",
        id: "raw-inner-b-nested",
      });

      assertEquals(await outerPipe(4), 12);
    });

    it("supports a raw finalize step", async () => {
      const { outerPipe } = createNestedPipe({
        rawFinalize: true,
        id: "raw-finalize-nested",
      });

      assertEquals(await outerPipe(4), 7);
    });

    it("targets the first inner step with a plus-four output plugin", async () => {
      const { outerPipe, innerPipe } = createNestedPipe({
        id: "targeted-inner-nested",
      });
      const innerTarget = innerPipe.steps[0]?.id;
      assertExists(innerTarget);
      innerPipe.use(plusFourInnerPlugin(innerTarget));

      assertEquals(await outerPipe(4), 15);
    });

    it("applies a minus-five outer output plugin", async () => {
      const { outerPipe } = createNestedPipe({ id: "minus-five-nested" });
      outerPipe.use(minusFiveOutputPlugin());

      assertEquals(await outerPipe(4), 2);
    });

    it("applies a times-two outer output plugin", async () => {
      const { outerPipe } = createNestedPipe({ id: "times-two-nested" });
      outerPipe.use(timesTwoOutputPlugin());

      assertEquals(await outerPipe(4), 14);
    });

    it("supports combined pre, inner target, and outer output behavior", async () => {
      const { outerPipe, innerPipe } = createNestedPipe({
        rawPreOuter: true,
        rawInnerA: true,
        middleMode: "triple",
        preMode: "plus-two",
        id: "combined-nested",
      });
      const innerTarget = innerPipe.steps[0]?.id;
      assertExists(innerTarget);
      innerPipe.use(plusFourInnerPlugin(innerTarget));
      outerPipe.use(timesTwoOutputPlugin());

      assertEquals(await outerPipe(4), 60);
    });

    it("shares context across nested pipes of pipes", async () => {
      type Shared = {
        trace: string[];
      };

      const innerPipe = pipe.withContext<Shared>()(
        [
          step.withContext<Shared>()(function (value: number) {
            this.context().state.set("trace", [
              ...(this.context().state.get("trace") ?? []),
              "inner-a",
            ]);
            return value + 1;
          }),
          step.withContext<Shared>()(function (value: number) {
            this.context().state.set("trace", [
              ...(this.context().state.get("trace") ?? []),
              "inner-b",
            ]);
            return value * 2;
          }),
        ],
        { id: "inner-pipe" } as const,
      );

      const middlePipe = pipe.withContext<Shared>()(
        [
          step.withContext<Shared>()(function (value: number) {
            this.context().state.set("trace", [
              ...(this.context().state.get("trace") ?? []),
              "middle-a",
            ]);
            return value;
          }),
          innerPipe,
        ],
        { id: "middle-pipe" } as const,
      );

      const outerPipe = pipe.withContext<Shared>()(
        [
          step.withContext<Shared>()(function (value: number) {
            this.context().state.set("trace", [
              ...(this.context().state.get("trace") ?? []),
              "outer-a",
            ]);
            return value + 2;
          }),
          middlePipe,
          step.withContext<Shared>()(function (value: number) {
            this.context().state.set("trace", [
              ...(this.context().state.get("trace") ?? []),
              "outer-b",
            ]);
            return value - 3;
          }),
        ],
        { id: "outer-pipe" } as const,
      );

      const executionContext = createRunContext<Shared>({
        capture: "all",
        seed: {
          trace: [],
        },
      });

      const result = await outerPipe.runWith(
        {
          context: {
            parent: executionContext,
          },
        },
        2,
      );

      assertEquals(result, 7);
      assertEquals(executionContext.state.get("trace"), [
        "outer-a",
        "middle-a",
        "inner-a",
        "inner-b",
        "outer-b",
      ]);
      assertEquals(executionContext.step.get("inner-pipe")?.output, 10);
      assertEquals(executionContext.step.get("middle-pipe")?.output, 10);
      assertEquals(executionContext.step.get("outer-pipe")?.output, 7);
    });

    it("supports connector-style nested object pipelines inspired by workflow repos", async () => {
      const inputPipe = pipe([
        (input: { orderId: string; amount: number; shipping: number }) => ({
          ...input,
          subtotal: input.amount + input.shipping,
        }),
      ]);

      const pricingPipe = pipe([
        (input: {
          orderId: string;
          amount: number;
          shipping: number;
          subtotal: number;
        }) => ({
          ...input,
          taxed: input.subtotal * 1.1,
        }),
        (input: { orderId: string; taxed: number }) => ({
          orderId: input.orderId,
          total: input.taxed - 5,
        }),
      ]);

      const outerPipe = pipe([
        inputPipe,
        pricingPipe,
        (input: { orderId: string; total: number }) =>
          `receipt:${input.orderId}:${input.total}`,
      ]);

      assertEquals(
        await outerPipe({ orderId: "o-9", amount: 100, shipping: 10 }),
        "receipt:o-9:116.00000000000001",
      );
    });
  });
});
