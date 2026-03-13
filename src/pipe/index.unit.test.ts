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
import { pipe } from "@/pipe/index.ts";
import type { AnyPipeStep, AnySyncPipeStep } from "@/pipe/types.ts";
import { plugin } from "@/plugin/index.ts";
import { step } from "@/step/index.ts";

describe("Pipe", () => {
  describe("creation", () => {
    it("creates a callable pipeline with an explicit id", async () => {
      const add = step((value: number) => value + 1, {
        id: "add-step",
      } as const);
      const double = step((value: number) => value * 2, {
        id: "double-step",
      } as const);
      const numberPipe = pipe([add, double], { id: "number-pipe" } as const);

      assertEquals(numberPipe.id, "number-pipe");
      assertEquals(numberPipe.isSync, false);
      assertEquals(await numberPipe(2), 6);
    });

    it("creates a pipeline with a generated id", async () => {
      const generatedPipe = pipe([
        step((value: number) => value + 1),
        step((value: number) => value * 2),
      ]);

      assert(generatedPipe.id.length > 0);
      assertEquals(await generatedPipe(2), 6);
    });

    it("wraps raw functions into targetable inner steps", async () => {
      const generatedPipe = pipe([
        (value: number) => value + 1,
        (value: number) => value * 2,
      ]);

      assertEquals(generatedPipe.steps.length, 2);
      assertEquals(typeof generatedPipe.steps[0]?.id, "string");
      assertEquals(typeof generatedPipe.steps[1]?.id, "string");
      assertEquals(await generatedPipe(2), 6);

      const firstStepId = generatedPipe.steps[0]!.id;
      generatedPipe.use(
        plugin.for<[value: number], number>()(
          {
            output: (output: number) => output + 3,
          },
          {
            id: "wrapped-inner-step-plugin",
            target: firstStepId,
          },
        ) as never,
      );

      assertEquals(await generatedPipe(2), 12);
    });
  });

  describe("methods", () => {
    it("uses and removes pipeline plugins by id", async () => {
      const add = step((value: number) => value + 1, {
        id: "add-step",
      } as const);
      const double = step((value: number) => value * 2, {
        id: "double-step",
      } as const);
      const plusOne = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output + 1,
        },
        {
          id: "plus-one-plugin",
        } as const,
      );
      const numberPipe = pipe([add, double]);

      numberPipe.use(plusOne);
      assertEquals(await numberPipe(2), 7);

      numberPipe.remove(plusOne.id);
      assertEquals(await numberPipe(2), 6);
    });

    it("adds plugins targeted to inner steps through the pipeline", async () => {
      const add = step((value: number) => value + 1, {
        id: "add-step",
      } as const);
      const double = step((value: number) => value * 2, {
        id: "double-step",
      } as const);
      const innerPlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output + 3,
        },
        {
          id: "inner-step-plugin",
          target: "add-step",
        } as const,
      );
      const numberPipe = pipe([add, double], { id: "number-pipe" } as const);

      const extendedPipe = numberPipe.use(innerPlugin);

      assertEquals(extendedPipe.plugins, [innerPlugin]);
      assertEquals(await numberPipe(2), 12);

      numberPipe.remove(innerPlugin.id);
      assertEquals(await numberPipe(2), 6);
    });

    it("rejects plugins with unknown targets", () => {
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

    it("rejects plugins targeted to inner steps that do not accept plugins", () => {
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

      numberPipe.remove("plain-step-plugin");
    });

    it("rejects mutation of proxied pipeline properties", () => {
      const immutablePipe = pipe(
        [
          step((value: number) => value + 1),
          step((value: number) => value * 2),
        ],
        {
          id: "immutable-pipe",
        } as const,
      );

      assertThrows(() => {
        (immutablePipe as { id: string }).id = "changed";
      }, TypeError);

      assertEquals(immutablePipe.id, "immutable-pipe");
    });

    it("exposes runtime members and steps through the proxy", () => {
      const add = step((value: number) => value + 1, {
        id: "add-step",
      } as const);
      const double = step((value: number) => value * 2, {
        id: "double-step",
      } as const);
      const proxiedPipe = pipe([add, double], { id: "proxied-pipe" } as const);

      assertEquals("id" in proxiedPipe, true);
      assertEquals("steps" in proxiedPipe, true);
      assertEquals("plugins" in proxiedPipe, true);
      assertEquals("run" in proxiedPipe, true);
      assertEquals("runWith" in proxiedPipe, true);
      assertEquals("use" in proxiedPipe, true);
      assertEquals("remove" in proxiedPipe, true);
      assertEquals(proxiedPipe.steps, [add, double]);
      assertEquals(proxiedPipe.plugins, []);
    });
  });

  describe("execution", () => {
    it("runs steps in order", async () => {
      const numberPipe = pipe([
        step((value: number) => value + 1),
        step((value: number) => value * 2),
        step((value: number) => `${value}!`),
      ]);

      assertEquals(await numberPipe(2), "6!");
    });

    it("supports tuple outputs chaining into multi-argument steps", async () => {
      const tuplePipe = pipe([
        step((a: number, b: number) => [a + b, a * b] as [number, number]),
        step((sum: number, product: number) => sum + product),
      ]);

      assertEquals(await tuplePipe(2, 3), 11);
    });

    it("lets run() match direct invocation", async () => {
      const numberPipe = pipe([
        step((value: number) => value + 1),
        step((value: number) => value * 2),
      ]);

      assertEquals(await numberPipe(2), 6);
      assertEquals(await numberPipe.run(2), 6);
    });

    it("runs pipeline-level plugins around the full chain", async () => {
      const numberPipe = pipe(
        [
          step((value: number) => value + 1),
          step((value: number) => value * 2),
        ],
        {
          id: "number-pipe",
          plugins: [
            plugin.for<[value: number], number>()(
              {
                input: (value: number) => value + 1,
              },
              {
                id: "pipe-input",
              },
            ),
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 1,
              },
              {
                id: "pipe-output",
              },
            ),
          ],
        } as const,
      );

      assertEquals(await numberPipe(2), 9);
    });

    it("applies single-use pipeline plugins through runWith()", async () => {
      const numberPipe = pipe([
        step((value: number) => value + 1),
        step((value: number) => value * 2),
      ]);

      const result = await numberPipe.runWith(
        {
          plugins: [
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 5,
              },
              {
                id: "single-use-output",
              },
            ),
          ],
        },
        2,
      );

      assertEquals(result, 11);
      assertEquals(await numberPipe(2), 6);
    });

    it("applies untargeted plugins and plugins targeted to the current pipeline id", async () => {
      const numberPipe = pipe(
        [
          step((value: number) => value + 1),
          step((value: number) => value * 2),
        ],
        {
          id: "number-pipe",
          plugins: [
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 10,
              },
              {
                id: "targeted-plugin",
                target: "number-pipe",
              } as const,
            ),
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 100,
              },
              {
                id: "other-plugin",
              },
            ),
          ],
        } as const,
      );

      assertEquals(await numberPipe(2), 116);
    });

    it("applies single-use plugins targeted to inner steps through runWith()", async () => {
      const numberPipe = pipe(
        [
          step((value: number) => value + 1, { id: "add-step" } as const),
          step((value: number) => value * 2, { id: "double-step" } as const),
        ],
        {
          id: "number-pipe",
        } as const,
      );

      const result = await numberPipe.runWith(
        {
          plugins: [
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 3,
              },
              {
                id: "single-use-inner-step-plugin",
                target: "add-step",
              } as const,
            ),
          ],
        },
        2,
      );

      assertEquals(result, 12);
      assertEquals(await numberPipe(2), 6);
    });

    it("rejects single-use plugins with unknown targets", async () => {
      const numberPipe = pipe(
        [
          step((value: number) => value + 1, { id: "add-step" } as const),
          step((value: number) => value * 2, { id: "double-step" } as const),
        ],
        {
          id: "number-pipe",
        } as const,
      );

      const invalidPlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output + 10,
        },
        {
          id: "invalid-single-use-plugin",
          target: "missing-step",
        } as const,
      );

      await assertRejects(
        () => numberPipe.runWith({ plugins: [invalidPlugin as never] }, 2),
        ConveeError,
        'Plugin "invalid-single-use-plugin" targets "missing-step", but only "number-pipe" or one of [number-pipe, add-step, double-step] can be used.',
      );
    });

    it("shares context across chained steps", async () => {
      const executionContext = createRunContext<{
        trace: string[];
        requestId: string;
      }>({
        seed: {
          trace: [],
          requestId: "req-1",
        },
        capture: "all",
      });

      const first = step.withContext<{ trace: string[]; requestId: string }>()(
        function (value: number) {
          assertEquals(this.context().state.get("requestId"), "req-1");
          this.context().state.set("trace", ["first"]);
          return value + 1;
        },
        {
          id: "first-step",
        } as const,
      );
      const second = step.withContext<{ trace: string[]; requestId: string }>()(
        function (value: number) {
          const trace = [...(this.context().state.get("trace") ?? [])];
          trace.push("second");
          this.context().state.set("trace", trace);
          assertEquals(this.context().step.get("first-step")?.output, 3);
          return value * 2;
        },
        {
          id: "second-step",
        } as const,
      );
      const contextualPipe = pipe.withContext<{
        trace: string[];
        requestId: string;
      }>()([first, second], {
        id: "context-pipe",
      } as const);

      assertEquals(
        await contextualPipe.runWith(
          {
            context: {
              parent: executionContext,
            },
          },
          2,
        ),
        6,
      );
      assertEquals(executionContext.state.get("trace"), ["first", "second"]);
      assertEquals(executionContext.step.get("context-pipe")?.output, 6);
      assertEquals(executionContext.step.get("first-step")?.output, 3);
      assertEquals(executionContext.step.get("second-step")?.output, 6);
    });

    it("binds execution context into pipeline plugins", async () => {
      const contextualPipe = pipe.withContext<{ requestId: string }>()(
        [
          step.withContext<{ requestId: string }>()(function (value: number) {
            return (
              value + Number(this.context().state.get("requestId") === "req-2")
            );
          }),
        ],
        {
          plugins: [
            plugin
              .withContext<{ requestId: string }>()
              .for<[value: number], number>()(
              {
                output: function (
                  this: PluginThis<{ requestId: string }>,
                  output: number,
                ) {
                  assertEquals(this.context().state.get("requestId"), "req-2");
                  return output + 1;
                },
              },
              {
                id: "context-aware-output-plugin",
              },
            ),
          ],
        },
      );

      assertEquals(
        await contextualPipe.runWith(
          {
            context: {
              seed: {
                requestId: "req-2",
              },
            },
          },
          1,
        ),
        3,
      );
    });

    it("allows nested pipelines to reuse the parent context", async () => {
      const innerPipe = pipe.withContext<{ trace: string[] }>()(
        [
          step.withContext<{ trace: string[] }>()(
            function (value: number) {
              const trace = [...(this.context().state.get("trace") ?? [])];
              trace.push("inner-a");
              this.context().state.set("trace", trace);
              return value + 1;
            },
            { id: "inner-a" } as const,
          ),
          step.withContext<{ trace: string[] }>()(
            function (value: number) {
              const trace = [...(this.context().state.get("trace") ?? [])];
              trace.push("inner-b");
              this.context().state.set("trace", trace);
              return value * 2;
            },
            { id: "inner-b" } as const,
          ),
        ],
        {
          id: "inner-pipe",
        } as const,
      );

      const outerPipe = pipe.withContext<{ trace: string[] }>()(
        [
          step.withContext<{ trace: string[] }>()(
            function (value: number) {
              const trace = [...(this.context().state.get("trace") ?? [])];
              trace.push("outer-a");
              this.context().state.set("trace", trace);
              return value;
            },
            { id: "outer-a" } as const,
          ),
          innerPipe,
          step.withContext<{ trace: string[] }>()(
            function (value: number) {
              const trace = [...(this.context().state.get("trace") ?? [])];
              trace.push("outer-b");
              this.context().state.set("trace", trace);
              return value - 1;
            },
            { id: "outer-b" } as const,
          ),
        ],
        {
          id: "outer-pipe",
        } as const,
      );

      const executionContext = createRunContext<{ trace: string[] }>({
        seed: {
          trace: [],
        },
        capture: "all",
      });

      assertEquals(
        await outerPipe.runWith(
          {
            context: {
              parent: executionContext,
            },
          },
          2,
        ),
        5,
      );
      assertEquals(executionContext.state.get("trace"), [
        "outer-a",
        "inner-a",
        "inner-b",
        "outer-b",
      ]);
      assertEquals(executionContext.step.get("inner-pipe")?.output, 6);
      assertEquals(executionContext.step.get("outer-pipe")?.output, 5);
    });

    it("can recover from pipeline errors through plugins", async () => {
      const safePipe = pipe(
        [
          step((value: number) => value + 1),
          step((value: number) => {
            if (value < 0) throw new Error("negative");
            return value * 2;
          }),
        ],
        {
          plugins: [
            plugin.for<[value: number], number>()(
              {
                output: (output: number) => output + 1,
              },
              {
                id: "output-plugin",
              },
            ),
            plugin.for<[value: number], number>()(
              {
                error: (error: Error, input: [number]) => {
                  if (error.message === "negative") {
                    return Math.abs(input[0]) * 10;
                  }

                  return error;
                },
              },
              {
                id: "fallback-plugin",
              },
            ),
          ],
        },
      );

      assertEquals(await safePipe(-2), 21);
    });

    it("continues the pipeline error flow when an error plugin returns another error", async () => {
      const failingPipe = pipe(
        [
          step((): number => {
            throw new Error("first");
          }),
        ],
        {
          plugins: [
            plugin.for<[], number>()(
              {
                error: (error: Error) => new Error(`${error.message}-second`),
              },
              {
                id: "error-plugin",
              },
            ),
          ],
        },
      );

      await assertRejects(() => failingPipe(), Error, "first-second");
    });

    it("normalizes thrown strings into pipeline errors", async () => {
      const failingInnerPipe = pipe([step((value: number) => value * 2)], {
        plugins: [
          plugin.for<[value: number], number>()(
            {
              input: () => {
                throw "boom";
              },
            },
            {
              id: "inner-string-error",
            },
          ),
        ],
      });
      const recoverablePipe = pipe([failingInnerPipe], {
        plugins: [
          plugin.for<[value: number], number>()(
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
      });

      assertEquals(await recoverablePipe(1), 42);
    });

    it("normalizes unknown thrown values into a default pipeline error message", async () => {
      const failingInnerPipe = pipe([step((value: number) => value * 2)], {
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
    });

    it("normalizes bare returns from single-input pipeline plugins", async () => {
      const numberPipe = pipe([step((value: number) => value + 1)], {
        plugins: [
          plugin.for<[value: number], number>()(
            {
              input: (value: number) => value + 1,
            },
            {
              id: "input-plugin",
            },
          ),
        ],
      });

      assertEquals(await numberPipe(2), 4);
    });

    it("accepts full tuples returned from pipeline input plugins", async () => {
      const tuplePipe = pipe([step((a: number, b: number) => a + b)], {
        plugins: [
          plugin.for<[a: number, b: number], number>()(
            {
              input: (a: number, b: number) => [a + 1, b + 1],
            },
            {
              id: "tuple-input-plugin",
            },
          ),
        ],
      });

      assertEquals(await tuplePipe(1, 2), 5);
    });

    it("rejects bare returns from multi-input pipeline plugins", async () => {
      const invalidPipe = pipe([step((a: number, b: number) => a + b)], {
        plugins: [
          plugin.for<[a: number, b: number], number>()(
            {
              input: ((a: number, b: number) => a + b) as never,
            },
            {
              id: "invalid-input-plugin",
            },
          ),
        ],
      });

      await assertRejects(
        () => invalidPipe(1, 2),
        ConveeError,
        "Input plugins for multi-input pipelines must return the full input tuple.",
      );
    });
  });

  describe("typing", () => {
    it("enforces step chaining and plugin types", async () => {
      const validPipe = pipe(
        [
          step((value: number) => value + 1, { id: "step-a" } as const),
          step((value: number) => String(value), { id: "step-b" } as const),
        ],
        { id: "typed-pipe" } as const,
      );
      const namedPlugin = plugin.for<[value: number], string>()(
        {
          output: (output: string) => output,
        },
        {
          id: "typed-pipe-plugin",
          target: "typed-pipe",
        } as const,
      );
      const innerStepPlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output + 1,
        },
        {
          id: "typed-inner-step-plugin",
          target: "step-a",
        } as const,
      );
      const configuredPipe = pipe(
        [
          step((value: number) => value + 1, { id: "step-a" } as const),
          step((value: number) => String(value), { id: "step-b" } as const),
        ],
        {
          id: "typed-pipe",
          plugins: [namedPlugin, innerStepPlugin],
        } as const,
      );
      const extendedPipe = validPipe.use(namedPlugin).use(innerStepPlugin);

      configuredPipe.remove(namedPlugin.id);
      configuredPipe.remove(innerStepPlugin.id);
      extendedPipe.remove(namedPlugin.id);
      extendedPipe.remove(innerStepPlugin.id);

      if (false) {
        // @ts-expect-error chained step input must match the previous step output
        pipe([
          step((value: number) => String(value)),
          step((value: boolean) => value),
        ]);

        validPipe.use(
          // @ts-expect-error pipeline plugins must match the pipeline output type
          plugin.for<[value: number], number>()({
            output: (output: number) => output,
          }),
        );

        validPipe.use(
          // @ts-expect-error plugin targets must be the pipeline id or one of its direct inner step ids
          plugin.for<[value: number], string>()(
            {
              output: (output: string) => output,
            },
            {
              id: "wrong-target-plugin",
              target: "missing-step",
            } as const,
          ),
        );

        validPipe.use(
          // @ts-expect-error inner-step plugins must match the targeted step contract
          plugin.for<[value: number], string>()(
            {
              output: (output: string) => output,
            },
            {
              id: "wrong-step-plugin-shape",
              target: "step-a",
            } as const,
          ),
        );

        // @ts-expect-error remove only accepts known configured pipeline plugin ids
        configuredPipe.remove("missing-pipe-plugin");

        // @ts-expect-error remove only accepts known used pipeline plugin ids on the returned pipe type
        extendedPipe.remove("missing-pipe-plugin");
      }

      assertEquals(await validPipe(2), "3");
    });
  });

  describe("sync", () => {
    describe("creation", () => {
      it("creates a synchronous pipeline with an explicit id", () => {
        const numberPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1),
            step.sync((value: number) => value * 2),
          ],
          {
            id: "sync-number-pipe",
          } as const,
        );

        assertEquals(numberPipe.id, "sync-number-pipe");
        assertEquals(numberPipe.isSync, true);
        assertEquals(numberPipe(2), 6);
      });

      it("creates a synchronous pipeline with a generated id", () => {
        const generatedPipe = pipe.sync([
          step.sync((value: number) => value + 1),
        ]);

        assert(generatedPipe.id.length > 0);
        assertEquals(generatedPipe(2), 3);
      });

      it("wraps raw functions into targetable synchronous inner steps", () => {
        const generatedPipe = pipe.sync([
          (value: number) => value + 1,
          (value: number) => value * 2,
        ]);

        assertEquals(generatedPipe.steps.length, 2);
        assertEquals(typeof generatedPipe.steps[0]?.id, "string");
        assertEquals(typeof generatedPipe.steps[1]?.id, "string");
        assertEquals(generatedPipe(2), 6);

        const firstStepId = generatedPipe.steps[0]!.id;
        generatedPipe.use(
          plugin.sync.for<[value: number], number>()(
            {
              output: (output: number) => output + 3,
            },
            {
              id: "wrapped-sync-inner-step-plugin",
              target: firstStepId,
            },
          ) as never,
        );

        assertEquals(generatedPipe(2), 12);
      });

      it("rejects non-sync steps at runtime when type checks are bypassed", () => {
        assertThrows(
          () => pipe.sync([step((value: number) => value + 1) as never]),
          ConveeError,
          "Sync pipelines can only contain sync steps.",
        );
      });

      it("exposes synchronous runtime members and manages sync plugins", () => {
        const increment = step.sync((value: number) => value + 1, {
          id: "sync-step",
        } as const);
        const syncPipe = pipe.sync([increment], { id: "sync-pipe" } as const);
        const syncPlugin = plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output + 1,
          },
          {
            id: "sync-plugin",
          } as const,
        );

        assertEquals("steps" in syncPipe, true);
        assertEquals("plugins" in syncPipe, true);
        assertEquals(syncPipe.id, "sync-pipe");
        assertEquals(syncPipe.steps, [increment]);
        assertEquals(syncPipe.plugins, []);

        const extendedSyncPipe = syncPipe.use(syncPlugin);
        assertEquals(extendedSyncPipe.plugins, [syncPlugin]);
        assertEquals(syncPipe(1), 3);

        syncPipe.remove(syncPlugin.id);
        assertEquals(syncPipe.plugins, []);
        assertEquals(syncPipe(1), 2);
      });

      it("adds sync plugins targeted to inner steps through the pipeline", () => {
        const increment = step.sync((value: number) => value + 1, {
          id: "sync-add-step",
        } as const);
        const double = step.sync((value: number) => value * 2, {
          id: "sync-double-step",
        } as const);
        const syncPipe = pipe.sync([increment, double], {
          id: "sync-pipe",
        } as const);
        const innerPlugin = plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output + 3,
          },
          {
            id: "sync-inner-step-plugin",
            target: "sync-add-step",
          } as const,
        );

        const extendedSyncPipe = syncPipe.use(innerPlugin);

        assertEquals(extendedSyncPipe.plugins, [innerPlugin]);
        assertEquals(syncPipe(2), 12);

        syncPipe.remove(innerPlugin.id);
        assertEquals(syncPipe(2), 6);
      });

      it("rejects sync plugins targeted to inner steps that do not accept plugins", () => {
        const plainStep = {
          id: "plain-sync-step",
          isSync: true,
          runWith: (_options: object, value: number) => value + 1,
        } as const satisfies AnySyncPipeStep;
        const syncPipe = pipe.sync([plainStep], {
          id: "sync-number-pipe",
        } as const);

        const innerPlugin = plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output + 10,
          },
          {
            id: "plain-sync-step-plugin",
            target: "plain-sync-step",
          } as const,
        );

        assertThrows(
          () => syncPipe.use(innerPlugin),
          ConveeError,
          'Plugin "plain-sync-step-plugin" targets "plain-sync-step", but that inner step does not accept plugins.',
        );

        syncPipe.remove("plain-sync-step-plugin");
      });

      it("rejects sync plugins with unknown targets", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1, {
              id: "sync-add-step",
            } as const),
          ],
          { id: "sync-pipe" } as const,
        );

        assertThrows(
          () =>
            syncPipe.use(
              plugin.sync.for<[value: number], number>()(
                {
                  output: (output: number) => output,
                },
                {
                  id: "sync-unknown-target-plugin",
                  target: "missing-step",
                } as const,
              ) as never,
            ),
          ConveeError,
          'Plugin "sync-unknown-target-plugin" targets "missing-step"',
        );
      });
    });

    describe("execution", () => {
      it("runs synchronous pipelines and plugins", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1),
            step.sync((value: number) => value * 2),
          ],
          {
            id: "sync-pipe",
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  output: (output: number) => output + 1,
                },
                {
                  id: "sync-output-plugin",
                },
              ),
            ],
          } as const,
        );

        assertEquals(syncPipe(2), 7);
        assertEquals(syncPipe.run(2), 7);
      });

      it("runs synchronous input plugins and binds plugin context", () => {
        const syncPipe = pipe.sync.withContext<{ increment: number }>()(
          [step.sync((value: number) => value + 1)],
          {
            plugins: [
              plugin.sync
                .withContext<{ increment: number }>()
                .for<[value: number], number>()(
                {
                  input: function (
                    this: PluginThis<{ increment: number }>,
                    value: number,
                  ) {
                    assertEquals(this.context().state.get("increment"), 2);
                    return (
                      value + Number(this.context().state.get("increment") ?? 0)
                    );
                  },
                },
                {
                  id: "sync-input-plugin",
                },
              ),
            ],
          },
        );

        assertEquals(
          syncPipe.runWith(
            {
              context: {
                seed: {
                  increment: 2,
                },
              },
            },
            1,
          ),
          4,
        );
      });

      it("rejects bare returns from multi-input sync pipeline plugins", () => {
        const invalidPipe = pipe.sync(
          [step.sync((a: number, b: number) => a + b)],
          {
            plugins: [
              plugin.sync.for<[a: number, b: number], number>()(
                {
                  input: ((a: number, b: number) => a + b) as never,
                },
                {
                  id: "invalid-sync-input-plugin",
                },
              ),
            ],
          },
        );

        assertThrows(
          () => invalidPipe(1, 2),
          ConveeError,
          "Input plugins for multi-input pipelines must return the full input tuple.",
        );
      });

      it("applies single-use sync plugins targeted to inner steps through runWith()", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1, {
              id: "sync-add-step",
            } as const),
            step.sync((value: number) => value * 2, {
              id: "sync-double-step",
            } as const),
          ],
          {
            id: "sync-pipe",
          } as const,
        );

        const result = syncPipe.runWith(
          {
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  output: (output: number) => output + 3,
                },
                {
                  id: "single-use-sync-inner-step-plugin",
                  target: "sync-add-step",
                } as const,
              ),
            ],
          },
          2,
        );

        assertEquals(result, 12);
        assertEquals(syncPipe(2), 6);
      });

      it("applies single-use sync pipeline plugins through runWith()", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1, {
              id: "sync-add-step",
            } as const),
            step.sync((value: number) => value * 2, {
              id: "sync-double-step",
            } as const),
          ],
          {
            id: "sync-pipe",
          } as const,
        );

        const result = syncPipe.runWith(
          {
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  output: (output: number) => output + 10,
                },
                {
                  id: "single-use-sync-pipe-plugin",
                  target: "sync-pipe",
                } as const,
              ),
            ],
          },
          2,
        );

        assertEquals(result, 16);
        assertEquals(syncPipe(2), 6);
      });

      it("rejects single-use sync plugins with unknown targets", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1, {
              id: "sync-add-step",
            } as const),
            step.sync((value: number) => value * 2, {
              id: "sync-double-step",
            } as const),
          ],
          {
            id: "sync-pipe",
          } as const,
        );

        const invalidPlugin = plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output + 10,
          },
          {
            id: "invalid-single-use-sync-plugin",
            target: "missing-step",
          } as const,
        );

        assertThrows(
          () => syncPipe.runWith({ plugins: [invalidPlugin as never] }, 2),
          ConveeError,
          'Plugin "invalid-single-use-sync-plugin" targets "missing-step", but only "sync-pipe" or one of [sync-pipe, sync-add-step, sync-double-step] can be used.',
        );
      });

      it("shares context across synchronous pipeline steps", () => {
        const executionContext = createRunContext<{ count: number }>({
          seed: {
            count: 1,
          },
          capture: "all",
        });
        const syncPipe = pipe.sync.withContext<{ count: number }>()(
          [
            step.sync.withContext<{ count: number }>()(
              function (value: number) {
                return value + Number(this.context().state.get("count") ?? 0);
              },
              { id: "sync-a" } as const,
            ),
            step.sync.withContext<{ count: number }>()(
              function (value: number) {
                assertEquals(this.context().step.get("sync-a")?.output, 2);
                return value * 2;
              },
              { id: "sync-b" } as const,
            ),
          ],
          {
            id: "sync-context-pipe",
          } as const,
        );

        assertEquals(
          syncPipe.runWith(
            {
              context: {
                parent: executionContext,
              },
            },
            1,
          ),
          4,
        );
        assertEquals(executionContext.step.get("sync-context-pipe")?.output, 4);
      });

      it("recovers from synchronous pipeline errors through plugins", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => {
              if (value < 0) throw new Error("negative");
              return value * 2;
            }),
          ],
          {
            plugins: [
              plugin.sync.for<[value: number], number>()(
                {
                  error: (error: Error, input: [number]) => {
                    if (error.message === "negative") {
                      return Math.abs(input[0]) * 10;
                    }

                    return error;
                  },
                },
                {
                  id: "sync-error-plugin",
                },
              ),
            ],
          },
        );

        assertEquals(syncPipe(-2), 20);
      });

      it("continues the synchronous pipeline error flow when an error plugin returns another error", () => {
        const failingPipe = pipe.sync(
          [
            step.sync((): number => {
              throw new Error("first");
            }),
          ],
          {
            plugins: [
              plugin.sync.for<[], number>()(
                {
                  output: (output: number) => output,
                },
                {
                  id: "sync-non-error-plugin",
                },
              ),
              plugin.sync.for<[], number>()(
                {
                  error: (error: Error) => new Error(`${error.message}-second`),
                },
                {
                  id: "sync-error-plugin",
                },
              ),
            ],
          },
        );

        assertThrows(() => failingPipe(), Error, "first-second");
      });
    });

    describe("typing", () => {
      it("enforces synchronous pipeline typing", () => {
        const syncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1, {
              id: "sync-step-a",
            } as const),
            step.sync((value: number) => value * 2, {
              id: "sync-step-b",
            } as const),
          ],
          { id: "typed-sync-pipe" } as const,
        );
        const syncNamedPlugin = plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output,
          },
          {
            id: "typed-sync-pipe-plugin",
            target: "typed-sync-pipe",
          } as const,
        );
        const innerSyncStepPlugin = plugin.sync.for<[value: number], number>()(
          {
            output: (output: number) => output + 1,
          },
          {
            id: "typed-sync-inner-step-plugin",
            target: "sync-step-a",
          } as const,
        );
        const configuredSyncPipe = pipe.sync(
          [
            step.sync((value: number) => value + 1, {
              id: "sync-step-a",
            } as const),
          ],
          {
            id: "typed-sync-pipe",
            plugins: [syncNamedPlugin, innerSyncStepPlugin],
          } as const,
        );
        const extendedSyncPipe = syncPipe
          .use(syncNamedPlugin)
          .use(innerSyncStepPlugin);

        configuredSyncPipe.remove(syncNamedPlugin.id);
        configuredSyncPipe.remove(innerSyncStepPlugin.id);
        extendedSyncPipe.remove(syncNamedPlugin.id);
        extendedSyncPipe.remove(innerSyncStepPlugin.id);

        if (false) {
          // @ts-expect-error sync pipelines reject async steps
          pipe.sync([
            step.sync((value: number) => value + 1),
            step((value: number) => value),
          ]);

          syncPipe.use(
            // @ts-expect-error sync pipelines reject async-capable plugins
            plugin.for<[value: number], number>()({
              output: async (output: number) => output,
            }),
          );

          syncPipe.use(
            // @ts-expect-error sync plugin targets must be the pipeline id or one of its direct inner step ids
            plugin.sync.for<[value: number], number>()(
              {
                output: (output: number) => output,
              },
              {
                id: "wrong-sync-target-plugin",
                target: "missing-step",
              } as const,
            ),
          );

          syncPipe.use(
            // @ts-expect-error inner-step sync plugins must match the targeted step contract
            plugin.sync.for<[value: number], string>()(
              {
                output: (output: string) => output,
              },
              {
                id: "wrong-sync-step-plugin-shape",
                target: "sync-step-a",
              } as const,
            ),
          );

          // @ts-expect-error remove only accepts known configured sync pipeline plugin ids
          configuredSyncPipe.remove("missing-sync-pipe-plugin");

          // @ts-expect-error remove only accepts known used sync pipeline plugin ids on the returned pipe type
          extendedSyncPipe.remove("missing-sync-pipe-plugin");
        }

        assertEquals(syncPipe(2), 6);
      });
    });
  });
});
