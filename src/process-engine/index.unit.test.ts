import { ProcessEngine } from "./index.ts";
import {
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "../belt-plugin/types.ts";
import { ConveeError } from "../error/index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { assert, assertEquals } from "jsr:@std/assert";

const processFunctionNotImplementedError = "process function not implemented";

class MyProcessN2S extends ProcessEngine<number, string, Error> {
  public readonly name = "MyProcess";

  protected async process(item: number): Promise<string> {
    return item.toString();
  }
}
class MyProcessN2N extends ProcessEngine<number, number, Error> {
  public readonly name = "MyProcess";

  protected async process(item: number): Promise<number> {
    return item;
  }
}

const setupEngine = (): ProcessEngine<number, number, Error> => {
  class MyNewProcess extends MyProcessN2N {}
  const engine = new MyNewProcess();
  return engine;
};

const setupErrorEngine = (): ProcessEngine<number, number, Error> => {
  class MyNewProcess extends MyProcessN2N {
    override process = async () => {
      throw new Error("mocked error");
    };
  }
  const engine = new MyNewProcess();
  return engine;
};

Deno.test("process-engine", async (t: Deno.TestContext) => {
  await t.step("during initialization", async (t: Deno.TestContext) => {
    await t.step("should initialize with no arguments", () => {
      const processEngine = new MyProcessN2S();
      assert(processEngine, "Expected processEngine to be defined");
    });

    await t.step("should initialize with a new id if none is provided", () => {
      const processEngine = new MyProcessN2S();
      assert(processEngine.id, "Expected processEngine.id to be defined");
    });

    await t.step("should initialize with the provided id", () => {
      const processEngine = new MyProcessN2S({ id: "test" });
      assertEquals(processEngine.id, "test");
    });

    await t.step(
      "should initialize with no plugins if none is provided",
      () => {
        const processEngine = new MyProcessN2S();
        const plugins = (processEngine as any).plugins;
        assertEquals(plugins, []);
      }
    );

    await t.step("should initialize with the provided input plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as BeltPluginInput<number>;
      const processEngine = new MyProcessN2S({
        plugins: [mockPlugin],
      });
      const plugins = (processEngine as any).plugins;
      assertEquals(plugins, [mockPlugin]);
    });

    await t.step("should initialize with the provided output plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as BeltPluginOutput<string>;
      const processEngine = new MyProcessN2S({
        plugins: [mockPlugin],
      });
      const plugins = (processEngine as any).plugins;
      assertEquals(plugins, [mockPlugin]);
    });

    await t.step("should initialize with the provided error plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as BeltPluginError<Error>;
      const processEngine = new MyProcessN2S({
        plugins: [mockPlugin],
      });
      const plugins = (processEngine as any).plugins;
      assertEquals(plugins, [mockPlugin]);
    });

    await t.step(
      "should initialize with the provided multi-type plugins",
      () => {
        const mockPluginInputOutput = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginOutput<string>;
        const processEngine = new MyProcessN2S({
          plugins: [mockPluginInputOutput],
        });
        const plugins = (processEngine as any).plugins;
        assertEquals(plugins, [mockPluginInputOutput]);
      }
    );

    await t.step(
      "should initialize with the provided plugins of different types",
      () => {
        const mockPluginInput = {
          name: "mockPlugin",
        } as BeltPluginInput<number>;
        const mockPluginOutput = {
          name: "mockPlugin",
        } as BeltPluginOutput<string>;
        const mockPluginError = {
          name: "mockPlugin",
        } as BeltPluginError<Error>;
        const mockPluginInputOutput = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginOutput<string>;
        const mockPluginInputError = {
          name: "mockPlugin",
        } as BeltPluginInput<string> & BeltPluginError<Error>;
        const mockPluginOutputError = {
          name: "mockPlugin",
        } as BeltPluginOutput<number> & BeltPluginError<Error>;
        const mockPluginInputOutputError = {
          name: "mockPlugin",
        } as BeltPluginInput<number> &
          BeltPluginOutput<string> &
          BeltPluginError<Error>;
        const processEngine = new MyProcessN2S({
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
        const plugins = (processEngine as any).plugins;
        assertEquals(plugins, [
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
    // Create a new engine instance for direct execution tests
    const processEngine = new MyProcessN2S();

    await t.step("should execute the process function", async () => {
      // Instead of jest.spyOn, we override the process method manually.
      let processCalled = false;
      (processEngine as any).process = async (item: any) => {
        processCalled = true;
        return "1";
      };

      await processEngine.execute(1);
      assert(processCalled, "Expected process() to be called");
    });

    await t.step(
      "during general extended execution",
      async (t: Deno.TestContext) => {
        let processEngine: ProcessEngine<number, number, Error>;

        await t.step("should run single use plugins", async () => {
          processEngine = setupEngine();
          const sum1Plugin = {
            name: "sum1Plugin",
            processInput: async (item: number) => item + 1,
          } as BeltPluginInput<number>;
          const subtract1Plugin = {
            name: "subtract1Plugin",
            processOutput: async (item: number) => item - 1,
          } as BeltPluginOutput<number>;

          const pureExecutionResult = await processEngine.execute(1, {});
          const singleUseSum1Result = await processEngine.execute(1, {
            singleUsePlugins: [sum1Plugin],
          });
          const singleUseSubtract1Result = await processEngine.execute(1, {
            singleUsePlugins: [subtract1Plugin],
          });

          assertEquals(pureExecutionResult, 1);
          assertEquals(singleUseSum1Result, 2);
          assertEquals(singleUseSubtract1Result, 0);
        });
      }
    );

    await t.step("during input belt execution", async (t: Deno.TestContext) => {
      let processEngine: ProcessEngine<number, number, Error>;

      await t.step("should run the input belt function", async () => {
        processEngine = setupEngine();
        let runInputBeltCalled = false;
        (processEngine as any).runInputBelt = async () => {
          runInputBeltCalled = true;
          return 1;
        };

        await processEngine.execute(1);
        assert(runInputBeltCalled, "Expected runInputBelt() to be called");
      });

      await t.step(
        "should execute the input belt with the provided item and id",
        async () => {
          processEngine = setupEngine();
          // Here we override runInputBelt to return a number from the metadata.
          (processEngine as any).runInputBelt = async (
            _item: any,
            metadataHelper: MetadataHelper
          ) => {
            return Number(metadataHelper.itemId);
          };

          // Also set a plugin that might trigger runInputBelt indirectly.
          const mockedPlugin = {
            name: "mockedPlugin",
            processInput: async (
              item: number,
              metadataHelper: MetadataHelper
            ) => {
              return Number(metadataHelper.itemId);
            },
          } as BeltPluginInput<number>;
          (processEngine as any).plugins = [mockedPlugin];

          const output = await processEngine.execute(1, {
            existingItemId: "25",
          });
          assertEquals(output, 25);
        }
      );

      await t.step(
        "should return the result of the input belt as input to process",
        async () => {
          processEngine = setupEngine();
          (processEngine as any).runInputBelt = async () => 2;
          let processCalled = false;
          (processEngine as any).process = (item: any) => {
            processCalled = true;
            return item as number;
          };

          const result = await processEngine.execute(1);
          assertEquals(result, 2);
          assert(processCalled, "Expected process() to be called");
        }
      );

      await t.step("should run the input belt plugins", async () => {
        processEngine = setupEngine();
        let pluginCalled = false;
        const mockedPlugin = {
          name: "mockedPlugin",
          processInput: async (item: number) => {
            pluginCalled = true;
            return item;
          },
        } as BeltPluginInput<number>;
        (processEngine as any).plugins = [mockedPlugin];

        await processEngine.execute(1);
        assert(pluginCalled, "Expected input plugin to be called");
      });
    });

    await t.step(
      "during output belt execution",
      async (t: Deno.TestContext) => {
        let processEngine: ProcessEngine<number, number, Error>;

        await t.step("should run the output belt function", async () => {
          processEngine = setupEngine();
          let runOutputBeltCalled = false;
          (processEngine as any).runOutputBelt = async () => {
            runOutputBeltCalled = true;
            return 1;
          };

          await processEngine.execute(1);
          assert(runOutputBeltCalled, "Expected runOutputBelt() to be called");
        });

        await t.step(
          "should return the result of the output belt as the final output",
          async () => {
            processEngine = setupEngine();
            (processEngine as any).runOutputBelt = async () => 2;
            const result = await processEngine.execute(1, {
              existingItemId: "mocked-id",
            });
            assertEquals(result, 2);
          }
        );

        await t.step("should run the output belt plugins", async () => {
          processEngine = setupEngine();
          let pluginCalled = false;
          const mockedPlugin = {
            name: "mockedPlugin",
            processOutput: async (item: number) => {
              pluginCalled = true;
              return item;
            },
          } as BeltPluginOutput<number>;
          (processEngine as any).plugins = [mockedPlugin];

          await processEngine.execute(1);
          assert(pluginCalled, "Expected output plugin to be called");
        });
      }
    );

    await t.step("during error belt execution", async (t: Deno.TestContext) => {
      let processEngine: ProcessEngine<number, number, Error>;

      await t.step("should run the error belt function", async () => {
        processEngine = setupErrorEngine();
        let runErrorBeltCalled = false;
        (processEngine as any).runErrorBelt = async () => {
          runErrorBeltCalled = true;
        };

        await processEngine.execute(1).catch(() => {});

        assert(runErrorBeltCalled, "Expected runErrorBelt() to be called");
      });

      await t.step("should run the error belt plugins", async () => {
        processEngine = setupErrorEngine();

        let pluginCalled = false;
        const mockedPlugin = {
          name: "mockedPlugin",
          processError: async (error: Error) => {
            pluginCalled = true;
            return new ConveeError({ message: "mocked modified error", error });
          },
        } as BeltPluginError<Error>;
        (processEngine as any).plugins = [mockedPlugin];

        await processEngine
          .execute(1, { existingItemId: "mocked-id" })
          .catch(() => {});

        assert(pluginCalled, "Expected error plugin to be called");
      });

      await t.step("should enrich a thrown convee error", async () => {
        processEngine = setupEngine();
        (processEngine as any).process = () => {
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
        };

        await processEngine
          .execute(1, { existingItemId: "mocked-id" })
          .catch((error: any) => {
            assertEquals(
              error.engineStack.length,
              2,
              "Expected engineStack to have 2 entries"
            );
          });
      });
    });
  });
});
