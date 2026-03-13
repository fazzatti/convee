import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import { createRunContext } from "@/context/index.ts";
import { ConveeError } from "@/error/index.ts";
import type { PluginThis } from "@/context/index.ts";
import { plugin } from "@/plugin/index.ts";
import { step, type Step, type StepFn } from "@/step/index.ts";

describe("Step", () => {
  describe("creation", () => {
    it("creates a callable step with an explicit id", async () => {
      const sumStep = step((a: number, b: number) => a + b, {
        id: "sum-step",
      } as const);

      assertEquals(sumStep.id, "sum-step");
      assertEquals(sumStep.isSync, false);
      assertEquals(await sumStep(2, 3), 5);
    });

    it("creates a step with a generated id", async () => {
      const generatedStep = step((value: number) => value * 2);

      assert(generatedStep.id.length > 0);
      assertEquals(await generatedStep(2), 4);
    });
  });

  describe("methods", () => {
    it("uses and removes plugins by plugin id", async () => {
      const plusOneInput = plugin.for<[value: number], number>()(
        {
          input: (value: number) => value + 1,
        },
        {
          id: "plus-one-input",
        } as const,
      );

      const valueStep = step((value: number) => value * 2);

      valueStep.use(plusOneInput);
      assertEquals(await valueStep(2), 6);

      valueStep.remove(plusOneInput.id);
      assertEquals(await valueStep(2), 4);
    });

    it("rejects mutation of proxied public properties", () => {
      const immutableStep = step((value: number) => value * 2, {
        id: "immutable-step",
      } as const);

      assertThrows(() => {
        (immutableStep as { id: string }).id = "changed";
      }, TypeError);

      assertEquals(immutableStep.id, "immutable-step");
    });

    it("exposes runtime members through the proxy", () => {
      const proxiedStep = step((value: number) => value * 2, {
        id: "proxied-step",
      } as const);

      assertEquals("id" in proxiedStep, true);
      assertEquals("plugins" in proxiedStep, true);
      assertEquals("run" in proxiedStep, true);
      assertEquals("runWith" in proxiedStep, true);
      assertEquals("use" in proxiedStep, true);
      assertEquals("remove" in proxiedStep, true);
      assertEquals(proxiedStep.plugins, []);
    });
  });

  describe("execution", () => {
    it("runs plugins around the wrapped function", async () => {
      const sumStep = step((a: number, b: number) => a + b, {
        id: "sum-step",
        plugins: [
          plugin.for<[a: number, b: number], number>()(
            {
              input: (a: number, b: number): [number, number] => [a * 2, b * 2],
            },
            {
              id: "double-input",
            },
          ),
          plugin.for<[a: number, b: number], number>()(
            {
              output: (output: number) => output + 1,
            },
            {
              id: "plus-one-output",
            },
          ),
        ],
      });

      assertEquals(await sumStep(2, 3), 11);
    });

    it("lets run() match direct invocation", async () => {
      const sumStep = step((a: number, b: number) => a + b);

      assertEquals(await sumStep(2, 3), 5);
      assertEquals(await sumStep.run(2, 3), 5);
    });

    it("creates context for direct invocation without runWith()", async () => {
      let observedRunId = "";
      let observedRootRunId = "";
      let observedInput: readonly unknown[] | undefined;

      const contextualStep = step.withContext<{ invocationCount?: number }>()(
        function (value: number) {
          const context = this.context();

          observedRunId = context.runId;
          observedRootRunId = context.rootRunId;
          observedInput = context.step.current().input;
          context.state.set("invocationCount", value);

          return value * 2;
        },
        {
          id: "contextual-step",
        } as const,
      );

      assertEquals(await contextualStep(2), 4);
      assert(observedRunId.length > 0);
      assertEquals(observedRunId, observedRootRunId);
      assertEquals(observedInput, [2]);
    });

    it("applies single-use plugins through runWith()", async () => {
      const sumStep = step((a: number, b: number) => a + b, {
        plugins: [
          plugin.for<[a: number, b: number], number>()(
            { output: (output: number) => output + 1 },
            { id: "persistent-output" },
          ),
        ],
      });

      const result = await sumStep.runWith(
        {
          plugins: [
            plugin.for<[a: number, b: number], number>()(
              {
                input: (a: number, b: number): [number, number] => [
                  a * 2,
                  b * 2,
                ],
              },
              { id: "single-use-input" },
            ),
          ],
        },
        2,
        3,
      );

      assertEquals(result, 11);
      assertEquals(await sumStep(2, 3), 6);
    });

    it("shares seeded context across step and plugin lifecycles", async () => {
      const executionContext = createRunContext<{
        requestId: string;
        requestSeen?: string;
      }>({
        seed: {
          requestId: "req-1",
        },
        capture: "all",
      });

      const contextualPlugin = plugin
        .withContext<{
          requestId: string;
          requestSeen?: string;
        }>()
        .for<[value: number], number>()(
        {
          input: function (
            this: PluginThis<{ requestId: string; requestSeen?: string }>,
            value: number,
          ) {
            const context = this.context();

            assertEquals(context.state.get("requestId"), "req-1");
            context.state.set("requestSeen", context.state.get("requestId"));
            context.plugin.current().state.set("inputSeen", true);

            return value + 1;
          },
          output: function (
            this: PluginThis<{ requestId: string; requestSeen?: string }>,
            output: number,
          ) {
            const context = this.context();

            assertEquals(context.plugin.current().state.get("inputSeen"), true);
            assertEquals(context.step.current().state.get("tripled"), 9);
            assertEquals(context.step.current().output, 6);

            return output + Number(context.step.current().state.get("tripled"));
          },
        },
        {
          id: "context-plugin",
        } as const,
      );

      const contextualStep = step.withContext<{
        requestId: string;
        requestSeen?: string;
      }>()<[value: number], number>(
        function (value: number) {
          const context = this.context();

          assertEquals(context.state.get("requestId"), "req-1");
          assertEquals(context.step.current().input, [3]);
          context.step.current().state.set("tripled", value * 3);

          return value * 2;
        },
        {
          id: "context-step",
          plugins: [contextualPlugin],
        } as const,
      );

      const result = await contextualStep.runWith(
        {
          context: {
            parent: executionContext,
          },
        },
        2,
      );

      assertEquals(result, 15);
      assertEquals(executionContext.state.get("requestSeen"), "req-1");
      assertEquals(executionContext.step.get("context-step")?.output, 15);
      assertEquals(
        executionContext.step.get("context-step")?.state.get("tripled"),
        9,
      );
      assertEquals(
        executionContext.plugin.get("context-plugin")?.state.get("inputSeen"),
        true,
      );
    });

    it("reuses parent context across nested step runs", async () => {
      const innerStep = step.withContext<{ trace: string[] }>()(
        function (value: number) {
          const trace = [...(this.context().state.get("trace") ?? [])];

          trace.push("inner");
          this.context().state.set("trace", trace);

          return value + 1;
        },
        {
          id: "inner-step",
        } as const,
      );

      const outerStep = step.withContext<{ trace: string[] }>()(
        async function (value: number) {
          const trace = [...(this.context().state.get("trace") ?? [])];

          trace.push("outer");
          this.context().state.set("trace", trace);

          return await innerStep.runWith(
            {
              context: {
                parent: this.context(),
              },
            },
            value,
          );
        },
        {
          id: "outer-step",
        } as const,
      );

      const executionContext = createRunContext<{ trace: string[] }>({
        seed: {
          trace: [],
        },
        capture: "all",
      });

      assertEquals(
        await outerStep.runWith(
          {
            context: {
              parent: executionContext,
            },
          },
          2,
        ),
        3,
      );
      assertEquals(executionContext.state.get("trace"), ["outer", "inner"]);
      assertEquals(executionContext.step.get("outer-step")?.output, 3);
      assertEquals(executionContext.step.get("inner-step")?.output, 3);
    });

    it("applies targeted single-use plugins through runWith()", async () => {
      const sumStep = step((a: number, b: number) => a + b, {
        id: "sum-step",
      } as const);

      const result = await sumStep.runWith(
        {
          plugins: [
            plugin.for<[a: number, b: number], number>()(
              { output: (output: number) => output + 10 },
              { id: "targeted-once", target: "sum-step" } as const,
            ),
            plugin.for<[a: number, b: number], number>()(
              { output: (output: number) => output + 100 },
              { id: "other-once", target: "other-step" } as const,
            ),
          ],
        },
        2,
        3,
      );

      assertEquals(result, 15);
    });

    it("normalizes bare returns from single-input plugins", async () => {
      const valueStep = step((value: number) => value * 2, {
        plugins: [
          plugin.for<[value: number], number>()(
            {
              input: (value: number) => value + 1,
            },
            {
              id: "plus-one-input",
            },
          ),
        ],
      });

      assertEquals(await valueStep(2), 6);
    });

    it("rejects bare returns from multi-input plugins", async () => {
      const invalidStep = step((a: number, b: number) => a + b, {
        plugins: [
          plugin.for<[a: number, b: number], number>()(
            {
              input: ((a: number, b: number) => a + b) as never,
            },
            {
              id: "invalid-input",
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

    it("applies only plugins targeted to the current step id", async () => {
      const sumStep = step((a: number, b: number) => a + b, {
        id: "sum-step",
        plugins: [
          plugin.for<[a: number, b: number], number>()(
            {
              output: (output: number) => output + 10,
            },
            {
              id: "targeted-plugin",
              target: "sum-step",
            } as const,
          ),
          plugin.for<[a: number, b: number], number>()(
            {
              output: (output: number) => output + 100,
            },
            {
              id: "other-plugin",
              target: "other-step",
            } as const,
          ),
        ],
      });

      assertEquals(await sumStep(2, 3), 15);
    });

    it("can recover from errors through plugins", async () => {
      const safeStep = step(
        (value: number) => {
          if (value < 0) throw new Error("negative");
          return value * 2;
        },
        {
          plugins: [
            plugin.for<[value: number], number>()(
              {
                error: (error, input) => {
                  if (error.message === "negative") {
                    return Math.abs(input[0]) * 10;
                  }

                  return error;
                },
              },
              {
                id: "fallback",
              },
            ),
          ],
        },
      );

      assertEquals(await safeStep(-2), 20);
    });

    it("skips non-error plugins during error handling", async () => {
      const safeStep = step(
        (value: number) => {
          if (value < 0) throw new Error("negative");
          return value * 2;
        },
        {
          plugins: [
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 1,
              },
              {
                id: "output-only-plugin",
              },
            ),
            plugin.for<[value: number], number>()(
              {
                error: (error, input) => {
                  if (error.message === "negative") {
                    return Math.abs(input[0]) * 10;
                  }

                  return error;
                },
              },
              {
                id: "fallback",
              },
            ),
          ],
        },
      );

      assertEquals(await safeStep(-2), 21);
    });

    it("throws when only non-error plugins are active during error handling", async () => {
      const failingStep = step(
        (value: number) => {
          if (value < 0) throw new Error("negative");
          return value * 2;
        },
        {
          plugins: [
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 1,
              },
              {
                id: "output-only-plugin",
              },
            ),
          ],
        },
      );

      await assertRejects(() => failingStep(-2), Error, "negative");
    });

    it("throws when no plugins are active during error handling", async () => {
      const failingStep = step((value: number) => {
        if (value < 0) throw new Error("negative");
        return value * 2;
      });

      await assertRejects(() => failingStep(-2), Error, "negative");
    });

    it("continues the error flow when an error plugin returns another error", async () => {
      const failingStep = step(
        (): number => {
          throw new Error("first");
        },
        {
          plugins: [
            plugin.for<[], number>()(
              {
                error: (error: Error) => new Error(`${error.message}-second`),
              },
              {
                id: "first-error-plugin",
              },
            ),
          ],
        },
      );

      await assertRejects(() => failingStep(), Error, "first-second");
    });

    it("normalizes thrown strings into errors", async () => {
      const stringThrowingStep = step(
        (): number => {
          throw "boom";
        },
        {
          plugins: [
            plugin.for<[], number>()(
              {
                error: (error: Error) => {
                  if (error.message === "boom") {
                    return 42;
                  }

                  return error;
                },
              },
              {
                id: "string-error-plugin",
              },
            ),
          ],
        },
      );

      assertEquals(await stringThrowingStep(), 42);
    });

    it("normalizes unknown thrown values into a default error message", async () => {
      const unknownThrowingStep = step(
        (): number => {
          throw { reason: "boom" };
        },
        {
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
    });
  });

  describe("typing", () => {
    it("enforces plugin types", async () => {
      const typedStep = step((value: number) => value * 2);

      if (false) {
        const compactUnaryStep: Step<number, number> = typedStep;
        const compactNullaryStep: Step<void, number> = step(() => 1);
        const tupleStep: Step<[number, number], number> = step(
          (left: number, right: number) => left + right,
        );

        void compactUnaryStep;
        void compactNullaryStep;
        void tupleStep;

        typedStep.runWith(
          {
            plugins: [
              // @ts-expect-error single-use plugins must match the step input tuple
              plugin.for<[value: string], number>()({
                input: (value: string) => [value],
              }),
            ],
          },
          2,
        );

        typedStep.use(
          // @ts-expect-error plugin input must match the step input tuple
          plugin.for<[value: string], number>()({
            input: (value: string) => [value],
          }),
        );

        typedStep.use(
          // @ts-expect-error plugin output must match the step output type
          plugin.for<[value: number], string>()({
            output: (output: string) => output,
          }),
        );

        typedStep.use(
          plugin.for<[value: number], number>()({
            // @ts-expect-error input hooks must accept the typed step input arguments
            input: (value: string) => value,
          }),
        );

        const contextualStep = step.withContext<{
          requestId: string;
          total?: number;
        }>()(function (value: number) {
          const requestId = this.context().state.get("requestId");

          this.context().state.set("total", value);

          // @ts-expect-error context keys are checked
          this.context().state.get("missing");
          // @ts-expect-error context values are checked
          this.context().state.set("total", "wrong");

          return Number(requestId ?? 0) + value;
        });

        contextualStep.use(
          plugin
            .withContext<{ requestId: string; total?: number }>()
            .for<[value: number], number>()({
            output: function (
              this: PluginThis<{ requestId: string; total?: number }>,
              output: number,
            ) {
              return output + Number(this.context().state.get("total") ?? 0);
            },
          }),
        );
      }

      typedStep.use(
        plugin.for<[value: number], number>()(
          {
            input: (value: number) => value + 1,
            output: (output: number) => output * 2,
          },
          {
            id: "valid-plugin",
          },
        ),
      );

      assertEquals(await typedStep(2), 12);
    });
  });

  describe("sync", () => {
    describe("creation", () => {
      it("creates a synchronous step with an explicit id", () => {
        const sumStep = step.sync((a: number, b: number) => a + b, {
          id: "sync-sum-step",
        } as const);

        const result: number = sumStep(2, 3);

        assertEquals(sumStep.id, "sync-sum-step");
        assertEquals(sumStep.isSync, true);
        assertEquals(result, 5);
      });

      it("creates a synchronous step with a generated id", () => {
        const generatedStep = step.sync((value: number) => value * 2);

        assert(generatedStep.id.length > 0);
        assertEquals(generatedStep(2), 4);
      });
    });

    describe("methods", () => {
      it("uses and removes sync plugins by plugin id", () => {
        const plusOneInput = plugin.sync.for<[value: number], number>()(
          {
            input: (value: number) => value + 1,
          },
          {
            id: "sync-plus-one-input",
          } as const,
        );

        const valueStep = step.sync((value: number) => value * 2);

        valueStep.use(plusOneInput);
        assertEquals(valueStep(2), 6);

        valueStep.remove(plusOneInput.id);
        assertEquals(valueStep(2), 4);
      });

      it("exposes synchronous runtime members through the proxy", () => {
        const proxiedStep = step.sync((value: number) => value * 2, {
          id: "sync-proxied-step",
        } as const);

        assertEquals("id" in proxiedStep, true);
        assertEquals("plugins" in proxiedStep, true);
        assertEquals("run" in proxiedStep, true);
        assertEquals("runWith" in proxiedStep, true);
        assertEquals("use" in proxiedStep, true);
        assertEquals("remove" in proxiedStep, true);
        assertEquals(proxiedStep.plugins, []);
      });
    });

    describe("execution", () => {
      it("runs sync plugins around the wrapped function", () => {
        const sumStep = step.sync((a: number, b: number) => a + b, {
          id: "sync-sum-step",
          plugins: [
            plugin.sync.for<[a: number, b: number], number>()(
              {
                input: (a: number, b: number): [number, number] => [
                  a * 2,
                  b * 2,
                ],
              },
              {
                id: "sync-double-input",
              },
            ),
            plugin.sync.for<[a: number, b: number], number>()(
              {
                output: (output: number) => output + 1,
              },
              {
                id: "sync-plus-one-output",
              },
            ),
          ],
        });

        assertEquals(sumStep(2, 3), 11);
      });

      it("lets run() match direct invocation for sync steps", () => {
        const sumStep = step.sync((a: number, b: number) => a + b);

        assertEquals(sumStep(2, 3), 5);
        assertEquals(sumStep.run(2, 3), 5);
      });

      it("shares context in synchronous steps and plugins", () => {
        const executionContext = createRunContext<{ count: number }>({
          seed: {
            count: 1,
          },
          capture: "all",
        });

        const syncContextPlugin = plugin.sync
          .withContext<{ count: number }>()
          .for<[value: number], number>()(
          {
            input: function (
              this: PluginThis<{ count: number }>,
              value: number,
            ) {
              this.context().plugin.current().state.set("seen", true);
              return value + 1;
            },
            output: function (
              this: PluginThis<{ count: number }>,
              output: number,
            ) {
              assertEquals(
                this.context().plugin.current().state.get("seen"),
                true,
              );
              return output + Number(this.context().state.get("count") ?? 0);
            },
          },
          {
            id: "sync-context-plugin",
          } as const,
        );

        const syncContextStep = step.sync.withContext<{ count: number }>()(
          function (value: number) {
            assertEquals(this.context().step.current().input, [2]);
            return value * 2;
          },
          {
            id: "sync-context-step",
            plugins: [syncContextPlugin],
          } as const,
        );

        assertEquals(
          syncContextStep.runWith(
            {
              context: {
                parent: executionContext,
              },
            },
            1,
          ),
          5,
        );
        assertEquals(executionContext.step.get("sync-context-step")?.output, 5);
      });

      it("applies single-use sync plugins through runWith()", () => {
        const sumStep = step.sync((a: number, b: number) => a + b, {
          plugins: [
            plugin.sync.for<[a: number, b: number], number>()(
              { output: (output: number) => output + 1 },
              { id: "sync-persistent-output" },
            ),
          ],
        });

        const result = sumStep.runWith(
          {
            plugins: [
              plugin.sync.for<[a: number, b: number], number>()(
                {
                  input: (a: number, b: number): [number, number] => [
                    a * 2,
                    b * 2,
                  ],
                },
                { id: "sync-single-use-input" },
              ),
            ],
          },
          2,
          3,
        );

        assertEquals(result, 11);
        assertEquals(sumStep(2, 3), 6);
      });

      it("applies targeted single-use sync plugins through runWith()", () => {
        const sumStep = step.sync((a: number, b: number) => a + b, {
          id: "sync-sum-step",
        } as const);

        const result = sumStep.runWith(
          {
            plugins: [
              plugin.sync.for<[a: number, b: number], number>()(
                { output: (output: number) => output + 10 },
                { id: "sync-targeted-once", target: "sync-sum-step" } as const,
              ),
              plugin.sync.for<[a: number, b: number], number>()(
                { output: (output: number) => output + 100 },
                { id: "sync-other-once", target: "other-step" } as const,
              ),
            ],
          },
          2,
          3,
        );

        assertEquals(result, 15);
      });

      it("normalizes bare returns from single-input sync plugins", () => {
        const valueStep = step.sync((value: number) => value * 2, {
          plugins: [
            plugin.sync.for<[value: number], number>()(
              {
                input: (value: number) => value + 1,
              },
              {
                id: "sync-plus-one-input",
              },
            ),
          ],
        });

        assertEquals(valueStep(2), 6);
      });

      it("rejects bare returns from multi-input sync plugins", () => {
        const invalidStep = step.sync((a: number, b: number) => a + b, {
          plugins: [
            plugin.sync.for<[a: number, b: number], number>()(
              {
                input: ((a: number, b: number) => a + b) as never,
              },
              {
                id: "sync-invalid-input",
              },
            ),
          ],
        });

        assertThrows(
          () => invalidStep(1, 2),
          ConveeError,
          "Input plugins for multi-input steps must return the full input tuple.",
        );
      });

      it("applies only sync plugins targeted to the current step id", () => {
        const sumStep = step.sync((a: number, b: number) => a + b, {
          id: "sync-sum-step",
          plugins: [
            plugin.sync.for<[a: number, b: number], number>()(
              {
                output: (output: number) => output + 10,
              },
              {
                id: "sync-targeted-plugin",
                target: "sync-sum-step",
              } as const,
            ),
            plugin.sync.for<[a: number, b: number], number>()(
              {
                output: (output: number) => output + 100,
              },
              {
                id: "sync-other-plugin",
                target: "other-step",
              } as const,
            ),
          ],
        });

        assertEquals(sumStep(2, 3), 15);
      });

      it("can recover from errors through sync plugins", () => {
        const safeStep = step.sync(
          (value: number) => {
            if (value < 0) throw new Error("negative");
            return value * 2;
          },
          {
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  error: (error, input) => {
                    if (error.message === "negative") {
                      return Math.abs(input[0]) * 10;
                    }

                    return error;
                  },
                },
                {
                  id: "sync-fallback",
                },
              ),
            ],
          },
        );

        assertEquals(safeStep(-2), 20);
      });

      it("skips non-error sync plugins during error handling", () => {
        const safeStep = step.sync(
          (value: number) => {
            if (value < 0) throw new Error("negative");
            return value * 2;
          },
          {
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  output: (output: number) => output + 1,
                },
                {
                  id: "sync-output-only-plugin",
                },
              ),
              plugin.sync.for<[value: number], number>()(
                {
                  error: (error, input) => {
                    if (error.message === "negative") {
                      return Math.abs(input[0]) * 10;
                    }

                    return error;
                  },
                },
                {
                  id: "sync-fallback",
                },
              ),
            ],
          },
        );

        assertEquals(safeStep(-2), 21);
      });

      it("throws when only non-error sync plugins are active during error handling", () => {
        const failingStep = step.sync(
          (value: number) => {
            if (value < 0) throw new Error("negative");
            return value * 2;
          },
          {
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  output: (output: number) => output + 1,
                },
                {
                  id: "sync-output-only-plugin",
                },
              ),
            ],
          },
        );

        assertThrows(() => failingStep(-2), Error, "negative");
      });

      it("continues the sync error flow when an error plugin returns another error", () => {
        const failingStep = step.sync(
          (): number => {
            throw new Error("first");
          },
          {
            plugins: [
              plugin.sync.for<[], number>()(
                {
                  error: (error: Error) => new Error(`${error.message}-second`),
                },
                {
                  id: "sync-first-error-plugin",
                },
              ),
            ],
          },
        );

        assertThrows(() => failingStep(), Error, "first-second");
      });

      it("normalizes thrown strings into errors for sync steps", () => {
        const stringThrowingStep = step.sync(
          (): number => {
            throw "boom";
          },
          {
            plugins: [
              plugin.sync.for<[], number>()(
                {
                  error: (error: Error) => {
                    if (error.message === "boom") {
                      return 42;
                    }

                    return error;
                  },
                },
                {
                  id: "sync-string-error-plugin",
                },
              ),
            ],
          },
        );

        assertEquals(stringThrowingStep(), 42);
      });

      it("normalizes unknown thrown values into a default error message for sync steps", () => {
        const unknownThrowingStep = step.sync(
          (): number => {
            throw { reason: "boom" };
          },
          {
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
      });
    });

    describe("typing", () => {
      it("enforces sync step typing", () => {
        const typedSyncStep = step.sync((value: number) => value * 2);

        if (false) {
          // @ts-expect-error sync steps cannot wrap async functions
          step.sync(async (value: number) => value * 2);

          typedSyncStep.runWith(
            {
              plugins: [
                // @ts-expect-error sync single-use plugins reject async-capable plugins
                plugin.for<[value: number], number>()({
                  output: async (output: number) => output,
                }),
              ],
            },
            2,
          );

          typedSyncStep.use(
            // @ts-expect-error sync steps reject async-capable plugins
            plugin.for<[value: number], number>()({
              output: async (output: number) => output,
            }),
          );

          typedSyncStep.use(
            plugin.sync.for<[value: number], number>()({
              // @ts-expect-error sync input hooks must accept the typed step input arguments
              input: (value: string) => value,
            }),
          );
        }

        typedSyncStep.use(
          plugin.sync.for<[value: number], number>()(
            {
              input: (value: number) => value + 1,
              output: (output: number) => output * 2,
            },
            {
              id: "valid-sync-plugin-2",
            },
          ),
        );

        assertEquals(typedSyncStep(2), 12);
      });
    });
  });
});
