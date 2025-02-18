import {
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "../belt-plugin/types.ts";
import { ConveeError } from "../error/index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { assert, assertEquals } from "jsr:@std/assert";
import { ProcessEngine } from "./index.ts";

Deno.test("process-engine", async (t: Deno.TestContext) => {
  await t.step("during initialization", async (t: Deno.TestContext) => {
    await t.step("should initialize with no arguments", () => {
      const engine = ProcessEngine.create((n: number) => n, {
        name: "MyProcess",
      });
      assert(engine, "Expected engine to be defined");
    });

    await t.step("should initialize with a new id if none is provided", () => {
      const engine = ProcessEngine.create((n: number) => n, {
        name: "MyProcess",
      });
      assert(engine.id, "Expected engine.id to be defined");
    });

    await t.step("should initialize with the provided id", () => {
      const engine = ProcessEngine.create((n: number) => n, {
        name: "MyProcess",
        id: "test",
      });
      assertEquals(engine.id, "test");
    });

    await t.step(
      "should initialize with no plugins if none is provided",
      () => {
        const engine = ProcessEngine.create((n: number) => n, {
          name: "MyProcess",
        });
        // @ts-ignore accessing internal plugins for testing
        assertEquals(engine.plugins, []);
      }
    );

    await t.step("should initialize with the provided input plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as BeltPluginInput<number>;
      const engine = ProcessEngine.create((n: number) => n.toString(), {
        name: "MyProcess",
        plugins: [mockPlugin],
      });
      assertEquals(engine.plugins, [mockPlugin]);
    });

    await t.step("should initialize with the provided output plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as BeltPluginOutput<string>;
      const engine = ProcessEngine.create((n: number) => n.toString(), {
        name: "MyProcess",
        plugins: [mockPlugin],
      });
      assertEquals(engine.plugins, [mockPlugin]);
    });

    await t.step("should initialize with the provided error plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as BeltPluginError<Error>;
      const engine = ProcessEngine.create((n: number) => n.toString(), {
        name: "MyProcess",
        plugins: [mockPlugin],
      });
      assertEquals(engine.plugins, [mockPlugin]);
    });

    await t.step(
      "should initialize with the provided multi-type plugins",
      () => {
        const mockPluginInputOutput = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginOutput<string>;
        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [mockPluginInputOutput],
        });
        assertEquals(engine.plugins, [mockPluginInputOutput]);
      }
    );

    await t.step(
      "should initialize with the provided plugins of different types",
      () => {
        const mockPluginInput = {
          name: "mockPlugin",
        } as BeltPluginInput<number>;
        } as BeltPluginInput<number>;
        const mockPluginOutput = {
          name: "mockPlugin",
        } as BeltPluginOutput<string>;
        } as BeltPluginOutput<string>;
        const mockPluginError = {
          name: "mockPlugin",
        } as BeltPluginError<Error>;
        } as BeltPluginError<Error>;
        const mockPluginInputOutput = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginOutput<string>;
        } as BeltPluginInput<number> & BeltPluginOutput<string>;
        const mockPluginInputError = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginError<Error>;
        const mockPluginOutputError = {
          name: "mockPlugin",
        } as BeltPluginOutput<number> & BeltPluginError<Error>;
        } as BeltPluginOutput<number> & BeltPluginError<Error>;
        const mockPluginInputOutputError = {
          name: "mockPlugin",
        } as BeltPluginInput<number> &
          BeltPluginOutput<string> &
          BeltPluginError<Error>;
        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [
            mockPluginInput,
            mockPluginOutput,
            mockPluginError,
            mockPluginInputOutput,
            mockPluginInputError,
            mockPluginOutputError,
            mockPluginInputOutputError,
          ],
        });
        assertEquals(engine.plugins, [
          mockPluginInput,
          mockPluginOutput,
          mockPluginError,
          mockPluginInputOutput,
          mockPluginInputError,
          mockPluginOutputError,
          mockPluginInputOutputError,
        ]);
      }
    );
  });

  await t.step("during direct execution", async (t: Deno.TestContext) => {
    await t.step("should execute the process function", async () => {
      let processCalled = false;
      // Create an engine whose process function sets a flag.
      const engine = ProcessEngine.create(
        (n: number) => {
          processCalled = true;
          return n.toString();
        },
        { name: "MyProcess" }
      );
      await engine.run(1);
      assert(processCalled, "Expected process() to be called");
    });

    await t.step("should run single use plugins", async () => {
      const engine = ProcessEngine.create((n: number) => n, {
        name: "MyProcess",
      });
      const sum1Plugin = {
        name: "sum1Plugin",
        processInput: async (item: number) => item + 1,
      } as BeltPluginInput<number>;
      const subtract1Plugin = {
        name: "subtract1Plugin",
        processOutput: async (item: number) => item - 1,
      } as BeltPluginOutput<number>;

      const pureExecutionResult = await engine.run(1, {}); // no single-use plugins
      const singleUseSum1Result = await engine.run(1, {
        singleUsePlugins: [sum1Plugin],
      });
      const singleUseSubtract1Result = await engine.run(1, {
        singleUsePlugins: [subtract1Plugin],
      });

      assertEquals(pureExecutionResult, 1);
      assertEquals(singleUseSum1Result, 2);
      assertEquals(singleUseSubtract1Result, 0);
    });
  });

  await t.step("during input belt execution", async (t: Deno.TestContext) => {
    await t.step(
      "should execute input plugins and pass their result to the process function",
      async () => {
        // Create an engine whose process function returns its input.
        // Use an input plugin that returns Number(metadataHelper.itemId).
        const inputPlugin = {
          name: "inputPlugin",
          processInput: async (
            item: number,
            metadataHelper: MetadataHelper
          ) => {
            return Number(metadataHelper.itemId);
          },
        } as BeltPluginInput<number>;
        const engine = ProcessEngine.create((n: number) => n, {
          name: "MyProcess",
          plugins: [inputPlugin],
        });
        const output = await engine.run(1, { existingItemId: "25" });
        assertEquals(output, 25);
      }
    );
  });

  await t.step("during output belt execution", async (t: Deno.TestContext) => {
    await t.step(
      "should apply output plugins to modify the final output",
      async () => {
        // Create an engine whose process function returns its input.
        // Use an output plugin that adds 1.
        const outputPlugin = {
          name: "outputPlugin",
          processOutput: async (item: number) => item + 1,
        } as BeltPluginOutput<number>;
        const engine = ProcessEngine.create((n: number) => n, {
          name: "MyProcess",
          plugins: [outputPlugin],
        });
        const result = await engine.run(1);
        assertEquals(result, 2);
      }
    );
  });

  await t.step("during error belt execution", async (t: Deno.TestContext) => {
    await t.step("should run the error belt plugins", async () => {
      const errorPlugin = {
        name: "errorPlugin",
        processError: async (error: Error) => {
          return new ConveeError({ message: "modified error", error });
        },
      } as BeltPluginError<Error>;

      const engine = ProcessEngine.create(
        (n: number) => {
          throw new Error("mocked error");
        },
        { name: "MyProcess", plugins: [errorPlugin] }
      );

      let caughtError: any;
      try {
        await engine.run(1, { existingItemId: "mocked-id" });
      } catch (e) {
        caughtError = e;
      }
      // Verify that the error has been processed by the error plugin.
      assert(caughtError instanceof ConveeError);
      assertEquals(caughtError.message, "modified error");
    });

    await t.step("should enrich a thrown convee error", async () => {
      const engine = ProcessEngine.create(
        (n: number) => {
          const error = new ConveeError<Error>({
            message: "mocked error",
            error: new Error("mocked error"),
          });
          error.enrichConveeStack({
            source: "mocked",
            type: "mocked",
            itemId: "mocked",
          });
          throw error;
        },
        { name: "MyProcess", id: "mocked-id" }
      );
      let caughtError: any;
      try {
        await engine.run(1, { existingItemId: "mocked-id" });
      } catch (e) {
        caughtError = e;
      }
      // Verify that the error's engineStack has two entries.
      assertEquals(caughtError.engineStack.length, 2);
    });
  });
});
