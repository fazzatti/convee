import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { ContextValues } from "@/context/index.ts";
import {
  hasError,
  hasInput,
  hasOutput,
  plugin,
  PluginEngine,
  type Plugin,
  type PluginBuilder,
} from "@/plugin/index.ts";
import { step } from "@/step/index.ts";

describe("Plugin", () => {
  describe("creation", () => {
    it("creates a plugin with an explicit id", async () => {
      const valuePlugin = plugin.for<[value: number], number>()(
        {
          input: (value: number): number => value + 1,
          output: (output: number) => output * 2,
        },
        {
          id: "value-plugin",
          target: "sum-step",
        } as const,
      );

      assertEquals(valuePlugin.id, "value-plugin");
      assertEquals(valuePlugin.target, "sum-step");
      assertEquals(valuePlugin.supports("input"), true);
      assertEquals(valuePlugin.supports("output"), true);
      assertEquals(valuePlugin.supports("error"), false);
      assertEquals(valuePlugin.targets("sum-step"), true);
      assertEquals(valuePlugin.targets("other-step"), false);

      const exactId: "value-plugin" = valuePlugin.id;
      const exactTarget: "sum-step" = valuePlugin.target;

      assertEquals(exactId, "value-plugin");
      assertEquals(exactTarget, "sum-step");

      assert(hasInput(valuePlugin));
      assert(hasOutput(valuePlugin));
      assertEquals(await valuePlugin.input(1), 2);
      assertEquals(await valuePlugin.output(3), 6);
    });

    it("creates a plugin through the fluent builder with metadata", async () => {
      const conveniencePlugin = plugin({
        id: "convenience-plugin",
        target: "formatter-step",
      }).onOutput((output: unknown) => output);

      assertEquals(conveniencePlugin.id, "convenience-plugin");
      assertEquals(conveniencePlugin.target, "formatter-step");
      assertEquals(conveniencePlugin.supports("input"), false);
      assertEquals(conveniencePlugin.supports("output"), true);
      assertEquals(conveniencePlugin.supports("error"), false);
      assertEquals(await conveniencePlugin.output("ok"), "ok");
    });

    it("creates a plugin through the fluent builder", async () => {
      const fluentPlugin = plugin({ id: "fluent-plugin", target: "sum-step" })
        .onInput((value: number) => value + 1)
        .onOutput((output: number) => output + 2);

      assertEquals(fluentPlugin.id, "fluent-plugin");
      assertEquals(fluentPlugin.target, "sum-step");
      assertEquals(fluentPlugin.supports("input"), true);
      assertEquals(fluentPlugin.supports("output"), true);
      assertEquals(await fluentPlugin.input(2), 3);
      assertEquals(await fluentPlugin.output(4), 6);
    });

    it("supports fluent hook chaining in any order", async () => {
      const outputThenInput = plugin()
        .onOutput((output: number) => output + 3)
        .onInput((value: number) => value + 1);

      const compatibleStep = step((value: number) => value * 2, {
        plugins: [outputThenInput],
      });

      assertEquals(outputThenInput.supports("input"), true);
      assertEquals(outputThenInput.supports("output"), true);
      assertEquals(await compatibleStep(2), 9);
    });

    it("lets fluent output-only plugins constrain only the output type", async () => {
      const outputOnlyPlugin = plugin().onOutput(
        (output: number) => output + 1,
      );

      const unaryStep = step((value: number) => value * 2, {
        plugins: [outputOnlyPlugin],
      });
      const tupleStep = step((a: number, b: number) => a + b, {
        plugins: [outputOnlyPlugin],
      });

      assertEquals(await unaryStep(2), 5);
      assertEquals(await tupleStep(2, 3), 6);
    });

    it("infers plugin contracts from fluent hook definitions", async () => {
      const inferredInputPlugin = plugin().onInput(
        (value: number) => value + 1,
      );
      const inferredOutputPlugin = plugin().onOutput(
        (output: number) => output + 3,
      );
      const inferredErrorPlugin = plugin().onError(
        (error: Error, input: [number]) => {
          if (error.message === "recover") {
            return input[0] * 10;
          }

          return error;
        },
      );

      const compatibleStep = step((value: number) => value * 2, {
        plugins: [
          inferredInputPlugin,
          inferredOutputPlugin,
          inferredErrorPlugin,
        ],
      });

      assertEquals(await inferredInputPlugin.input(2), 3);
      assertEquals(await inferredOutputPlugin.output(4), 7);
      assertEquals(
        await inferredErrorPlugin.error(new Error("recover"), [3]),
        30,
      );
      assertEquals(await compatibleStep(2), 9);
    });

    it("creates a plugin directly from PluginEngine", async () => {
      const outputPlugin = PluginEngine.create<
        [value: number],
        number,
        Error,
        ContextValues,
        {
          output: (output: number) => number;
        },
        "engine-plugin",
        "engine-step"
      >(
        {
          output: (output: number) => output + 2,
        },
        {
          id: "engine-plugin",
          target: "engine-step",
        },
      );

      assertEquals(outputPlugin.id, "engine-plugin");
      assertEquals(outputPlugin.target, "engine-step");
      assertEquals(await outputPlugin.output(5), 7);
    });

    it("creates a plugin with a generated id", () => {
      const generatedPlugin = plugin.for<[value: number], number>()({
        output: (output: number) => output,
      });

      if (false) {
        // @ts-expect-error output-only plugins should not expose input directly
        generatedPlugin.input;
      }

      assert(generatedPlugin.id.length > 0);
      assertEquals(generatedPlugin.target, undefined);

      const generatedId: string = generatedPlugin.id;
      const generatedTarget: undefined = generatedPlugin.target;

      assert(generatedId.length > 0);
      assertEquals(generatedTarget, undefined);

      assertEquals(generatedPlugin.supports("input"), false);
      assertEquals(generatedPlugin.supports("output"), true);
      assertEquals(generatedPlugin.supports("error"), false);
      assertEquals(generatedPlugin.targets("any-step"), true);
    });

    it("creates a synchronous plugin", () => {
      const syncValuePlugin = plugin.sync.for<[value: number], number>()(
        {
          input: (value: number) => value + 1,
          output: (output: number) => output * 2,
        },
        {
          id: "sync-value-plugin",
          target: "sync-step",
        } as const,
      );

      assertEquals(syncValuePlugin.id, "sync-value-plugin");
      assertEquals(syncValuePlugin.target, "sync-step");
      assertEquals(syncValuePlugin.input(1), 2);
      assertEquals(syncValuePlugin.output(3), 6);
    });

    it("creates a synchronous plugin through the fluent builder with metadata", () => {
      const syncConveniencePlugin = plugin
        .sync({
          id: "sync-convenience-plugin",
          target: "sync-formatter-step",
        })
        .onOutput((output: number) => Number(output) + 1);

      assertEquals(syncConveniencePlugin.id, "sync-convenience-plugin");
      assertEquals(syncConveniencePlugin.target, "sync-formatter-step");
      assertEquals(syncConveniencePlugin.supports("input"), false);
      assertEquals(syncConveniencePlugin.supports("output"), true);
      assertEquals(syncConveniencePlugin.supports("error"), false);
      assertEquals(syncConveniencePlugin.output(3), 4);
    });

    it("creates a context-aware plugin factory", () => {
      const contextualPlugin = plugin
        .withContext<{ requestId: string }>()
        .for<[value: number], number>()(
        {
          output: (output: number) => output,
        },
        {
          id: "contextual-plugin",
        } as const,
      );

      assertEquals(contextualPlugin.id, "contextual-plugin");
      assertEquals(contextualPlugin.supports("output"), true);
    });

    it("creates a context-aware synchronous plugin factory", () => {
      const contextualSyncFactory = plugin.sync.withContext<{
        requestId: string;
      }>();
      const contextualSyncPlugin = contextualSyncFactory.for<
        [value: number],
        number
      >()(
        {
          output: (output: number) => output,
        },
        {
          id: "contextual-sync-plugin",
        } as const,
      );

      assertEquals(typeof contextualSyncFactory, "function");
      assertEquals(contextualSyncPlugin.id, "contextual-sync-plugin");
      assertEquals(contextualSyncPlugin.supports("output"), true);
    });

    it("returns a direct sync factory from plugin.sync.withContext()", () => {
      const contextualSyncFactory = Reflect.apply(
        plugin.sync.withContext<{ requestId: string }>,
        plugin.sync,
        [],
      );

      assertEquals(typeof contextualSyncFactory, "function");
      assertEquals("for" in contextualSyncFactory, true);
    });

    it("creates a context-aware sync plugin through the fluent builder", () => {
      const contextualSyncFactory = plugin.sync.withContext<{
        requestId: string;
      }>();
      const contextualSyncPlugin = contextualSyncFactory({
        id: "contextual-sync-convenience-plugin",
        target: "sync-step",
      }).onOutput((output: number) => output + 1);

      assertEquals(
        contextualSyncPlugin.id,
        "contextual-sync-convenience-plugin",
      );
      assertEquals(contextualSyncPlugin.target, "sync-step");
      assertEquals(contextualSyncPlugin.output(3), 4);
    });

    it("creates a context-aware sync plugin through the fluent builder", () => {
      const contextualSyncFactory = plugin.sync.withContext<{
        requestId: string;
      }>();
      const contextualSyncPlugin = contextualSyncFactory({
        id: "contextual-sync-fluent-plugin",
      }).onOutput((output: number) => output + 2);

      assertEquals(contextualSyncPlugin.id, "contextual-sync-fluent-plugin");
      assertEquals(contextualSyncPlugin.output(3), 5);
    });

    it("exposes fluent builder hook presence before a plugin is materialized", () => {
      const builder = plugin({ id: "builder-plugin" });

      assertEquals("onInput" in builder, true);
      assertEquals("onOutput" in builder, true);
      assertEquals("onError" in builder, true);
      assertEquals("id" in builder, false);
      assertEquals((builder as { id?: string }).id, undefined);
    });

    it("exposes plugin members through a partially materialized fluent builder", () => {
      const partialBuilder = plugin({ id: "partial-builder-plugin" }).onInput(
        (value: number) => value + 1,
      );

      assertEquals("id" in partialBuilder, true);
      assertEquals(partialBuilder.id, "partial-builder-plugin");
      assertEquals("onOutput" in partialBuilder, true);
    });

    it("rejects invalid fluent hook registration arguments", () => {
      assertThrows(
        () =>
          (plugin() as { onInput: (...args: unknown[]) => unknown }).onInput(),
        TypeError,
        'Plugin hook "input" is not defined yet.',
      );
    });
  });

  describe("guards and support", () => {
    it("detects input, output and error hooks through helpers", () => {
      const inputPlugin = plugin.for<[value: number], number>()({
        input: (value: number): number => value + 1,
      });
      const outputPlugin = plugin.for<[value: number], number>()({
        output: (output: number) => output + 1,
      });
      const errorPlugin = plugin.for<[value: number], number>()({
        error: (error: Error) => error,
      });

      assert(hasInput(inputPlugin));
      assertEquals(hasOutput(inputPlugin), false);
      assertEquals(hasError(inputPlugin), false);

      assertEquals(hasInput(outputPlugin), false);
      assert(hasOutput(outputPlugin));
      assertEquals(hasError(outputPlugin), false);

      assertEquals(hasInput(errorPlugin), false);
      assertEquals(hasOutput(errorPlugin), false);
      assert(hasError(errorPlugin));
    });

    it("reports supported hooks through supports()", async () => {
      const recoveryPlugin = plugin.for<[value: number], number>()({
        error: (error: Error, input: [value: number]) => {
          if (error.message === "negative") {
            return Math.abs(input[0]) * 10;
          }

          return error;
        },
      });

      assert(hasError(recoveryPlugin));
      assertEquals(recoveryPlugin.supports("input"), false);
      assertEquals(recoveryPlugin.supports("output"), false);
      assertEquals(recoveryPlugin.supports("error"), true);
      assertEquals(await recoveryPlugin.error(new Error("negative"), [-2]), 20);
    });

    it("supports guard checks for support-style plain objects and raw hooks", () => {
      const supportObject = {
        supports(capability: string) {
          return capability === "input" || capability === "error";
        },
      };

      assertEquals(hasInput(supportObject as unknown as never), true);
      assertEquals(hasOutput(supportObject as unknown as never), false);
      assertEquals(hasError(supportObject as unknown as never), true);

      assertEquals(
        hasInput({ input: (value: number) => value + 1 } as unknown as never),
        true,
      );
      assertEquals(
        hasOutput({
          output: (output: number) => output + 1,
        } as unknown as never),
        true,
      );
      assertEquals(
        hasError({ error: (error: Error) => error } as unknown as never),
        true,
      );

      assertEquals(hasInput(null as unknown as never), false);
      assertEquals(hasOutput("nope" as unknown as never), false);
      assertEquals(hasError(42 as unknown as never), false);
    });
  });

  describe("methods", () => {
    it("matches target filtering rules", () => {
      const targetedPlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output,
        },
        {
          target: "sum-step",
        } as const,
      );

      const untargetedPlugin = plugin.for<[value: number], number>()({
        output: (output: number) => output,
      });

      assertEquals(targetedPlugin.targets("sum-step"), true);
      assertEquals(targetedPlugin.targets("other-step"), false);
      assertEquals(untargetedPlugin.targets("sum-step"), true);
    });

    it("exposes definition hooks and engine methods through the proxy", () => {
      const proxiedPlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output,
        },
        {
          id: "proxied-plugin",
        } as const,
      );

      assertEquals("output" in proxiedPlugin, true);
      assertEquals("supports" in proxiedPlugin, true);
      assertEquals("targets" in proxiedPlugin, true);
      assertEquals(proxiedPlugin.supports("output"), true);
    });

    it("rejects mutation of proxied public properties", () => {
      const immutablePlugin = plugin.for<[value: number], number>()(
        {
          output: (output: number) => output,
        },
        {
          id: "immutable-plugin",
        } as const,
      );

      assertThrows(() => {
        (immutablePlugin as { id: string }).id = "changed";
      }, Error);
      assertEquals(immutablePlugin.id, "immutable-plugin");
    });

    it("rejects mutation of fluent builder proxies", () => {
      const builder = plugin();

      assertThrows(() => {
        (builder as unknown as { anything: string }).anything = "changed";
      }, TypeError);
    });
  });

  describe("execution", () => {
    it("runs input hooks", async () => {
      const inputPlugin = plugin.for<[value: number, offset: number], number>()(
        {
          input: (value: number, offset: number): [number, number] => [
            value + offset,
            offset,
          ],
        },
      );

      assertEquals(await inputPlugin.input(2, 3), [5, 3]);
    });

    it("returns the full input tuple from multi-input hooks", async () => {
      const inputPlugin = plugin.for<
        [valueA: number, valueB: number],
        number
      >()({
        input: (valueA: number, valueB: number): [number, number] => [
          valueA + 1,
          valueB + 1,
        ],
      });

      const result = await inputPlugin.input(1, 2);

      assertEquals(result, [2, 3]);
    });

    it("lets single-input hooks return the bare value", async () => {
      const inputPlugin = plugin.for<[value: number], number>()({
        input: (value: number): number => value + 1,
      });

      assertEquals(await inputPlugin.input(2), 3);
    });

    it("runs output hooks with the produced output", async () => {
      const outputPlugin = plugin.for<[value: number], number>()({
        output: (output: number) => output + 6,
      });

      assertEquals(await outputPlugin.output(4), 10);
    });

    it("runs error hooks and can recover", async () => {
      const errorPlugin = plugin.for<[value: number], number>()({
        error: (error: Error, input: [number]) => {
          if (error.message === "recover") {
            return input[0] * 2;
          }

          return error;
        },
      });

      assertEquals(await errorPlugin.error(new Error("recover"), [7]), 14);
    });

    it("runs synchronous hooks without promises", () => {
      const syncPlugin = plugin.sync.for<[value: number], number>()({
        input: (value: number) => value + 1,
        output: (output: number) => output + 6,
        error: (error: Error, input: [number]) => {
          if (error.message === "recover") {
            return input[0] * 2;
          }

          return error;
        },
      });

      assertEquals(syncPlugin.input(2), 3);
      assertEquals(syncPlugin.output(4), 10);
      assertEquals(syncPlugin.error(new Error("recover"), [7]), 14);
    });
  });

  describe("typing", () => {
    it("enforces plugin hook typing", () => {
      if (false) {
        // @ts-expect-error a plugin needs at least one lifecycle hook
        plugin.for<[value: number], number>()({});

        plugin()
          .onInput((value: number) => value + 1)
          // @ts-expect-error fluent builders should not allow duplicate input hooks
          .onInput((value: number) => value + 2);

        const compactUnaryPlugin: PluginBuilder<number, never, never> =
          plugin().onInput((value: number) => value + 1);

        const compactNullaryPlugin: PluginBuilder<void, never, never> =
          plugin().onInput((): [] => []);

        const tuplePlugin: PluginBuilder<[number, number], never, never> =
          plugin().onInput((left: number, right: number) => [left, right]);

        void compactUnaryPlugin;
        void compactNullaryPlugin;
        void tuplePlugin;

        const inferredInputPlugin = plugin().onInput(
          (value: number) => value + 1,
        );

        step((value: number) => value * 2, {
          plugins: [inferredInputPlugin],
        });

        step((value: string) => value.toUpperCase(), {
          // @ts-expect-error inferred convenience plugins must reject incompatible step inputs
          plugins: [inferredInputPlugin],
        });

        const inferredOutputPlugin = plugin().onOutput(
          (output: number) => output + 1,
        );

        step((value: number) => value * 2, {
          plugins: [inferredOutputPlugin],
        });

        const inferredErrorPlugin = plugin().onError(
          (error: Error, input: [value: number]) => input[0] ?? error,
        );

        const inferredOutputThenErrorPlugin: Plugin<
          never,
          number,
          Error,
          { output: true; error: true },
          ContextValues,
          undefined
        > = plugin()
          .onOutput((output: number) => output + 1)
          .onError((error: Error) => error);

        step((value: number) => value * 2, {
          plugins: [inferredErrorPlugin],
        });

        step((value: number) => value * 2, {
          plugins: [inferredOutputThenErrorPlugin],
        });

        step((value: string) => value.toUpperCase(), {
          // @ts-expect-error inferred convenience plugins must reject incompatible error input tuples
          plugins: [inferredErrorPlugin],
        });

        plugin.for<[value: number], number>()({
          // @ts-expect-error input hooks must accept the typed input arguments
          input: (value: string) => value,
        });

        plugin.for<[value: number, offset: number], number>()({
          // @ts-expect-error multi-input hooks must return the full typed input tuple
          input: (value: number, offset: number) => value + offset,
        });

        plugin.for<[value: number], number>()({
          // @ts-expect-error output hooks must accept the step output type
          output: (output: string) => output,
        });

        plugin.for<[value: number], number>()({
          // @ts-expect-error error hooks must accept the typed input tuple
          error: (_error: Error, input: [string]) => input[0],
        });

        plugin.sync.for<[value: number], number>()({
          // @ts-expect-error sync plugins cannot return promises from input hooks
          input: async (value: number) => value + 1,
        });

        plugin.sync.for<[value: number], number>()({
          // @ts-expect-error sync plugins cannot return promises from output hooks
          output: async (output: number) => output,
        });

        plugin.sync.for<[value: number], number>()({
          // @ts-expect-error sync plugins cannot return promises from error hooks
          error: async (error: Error) => error,
        });
      }
    });
  });
});
