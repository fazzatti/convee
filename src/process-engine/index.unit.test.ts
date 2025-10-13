import {
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "../belt-plugin/types.ts";
import { ConveeError } from "../error/index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { assert, assertEquals } from "jsr:@std/assert";
import { ProcessEngine } from "./index.ts";
import { Plugin } from "../index.ts";

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
      const mockPlugin = { name: "mockPlugin" } as BeltPluginError<
        string,
        Error
      >;
      const engine = ProcessEngine.create((n: number) => n.toString(), {
        name: "MyProcess",
        plugins: [mockPlugin],
      });
      assertEquals(engine.plugins, [mockPlugin]);
    });

    await t.step(
      "should initialize with the provided multi-type plugins",
      () => {
        const mockPluginInputOutput = Plugin.create(
          {
            processOutput: async (item: string) => item,
            processInput: async (item: number) => item,
          },
          {
            name: "mockPlugin",
          }
        );
        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [mockPluginInputOutput],
        });
        assertEquals(engine.plugins, [mockPluginInputOutput]);
      }
    );

    await t.step(
      "should initialize with sync plugins only",
      async (t: Deno.TestContext) => {
        await t.step("with single input and output plugins", () => {
          const syncInputPlugin = Plugin.create(
            {
              processInput: (item: number) => item * 2,
            },
            {
              name: "syncInputPlugin",
            }
          );
          const syncOutputPlugin = Plugin.create(
            {
              processOutput: (item: string) => item.toUpperCase(),
            },
            {
              name: "syncOutputPlugin",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncInputPlugin, syncOutputPlugin],
          });
          assertEquals(engine.plugins, [syncInputPlugin, syncOutputPlugin]);
        });

        await t.step("with multiple input plugins", () => {
          const syncInputPlugin1 = Plugin.create(
            {
              processInput: (item: number) => item * 2,
            },
            {
              name: "syncInputPlugin1",
            }
          );
          const syncInputPlugin2 = Plugin.create(
            {
              processInput: (item: number) => item + 10,
            },
            {
              name: "syncInputPlugin2",
            }
          );
          const syncInputPlugin3 = Plugin.create(
            {
              processInput: (item: number) => item - 1,
            },
            {
              name: "syncInputPlugin3",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncInputPlugin1, syncInputPlugin2, syncInputPlugin3],
          });
          assertEquals(engine.plugins, [
            syncInputPlugin1,
            syncInputPlugin2,
            syncInputPlugin3,
          ]);
        });

        await t.step("with multiple output plugins", () => {
          const syncOutputPlugin1 = Plugin.create(
            {
              processOutput: (item: string) => item.toUpperCase(),
            },
            {
              name: "syncOutputPlugin1",
            }
          );
          const syncOutputPlugin2 = Plugin.create(
            {
              processOutput: (item: string) => item.trim(),
            },
            {
              name: "syncOutputPlugin2",
            }
          );
          const syncOutputPlugin3 = Plugin.create(
            {
              processOutput: (item: string) => `[${item}]`,
            },
            {
              name: "syncOutputPlugin3",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncOutputPlugin1, syncOutputPlugin2, syncOutputPlugin3],
          });
          assertEquals(engine.plugins, [
            syncOutputPlugin1,
            syncOutputPlugin2,
            syncOutputPlugin3,
          ]);
        });

        await t.step("with mixed multiple input and output plugins", () => {
          const syncInputPlugin1 = Plugin.create(
            {
              processInput: (item: number) => item * 2,
            },
            {
              name: "syncInputPlugin1",
            }
          );
          const syncInputPlugin2 = Plugin.create(
            {
              processInput: (item: number) => item + 5,
            },
            {
              name: "syncInputPlugin2",
            }
          );
          const syncOutputPlugin1 = Plugin.create(
            {
              processOutput: (item: string) => item.toUpperCase(),
            },
            {
              name: "syncOutputPlugin1",
            }
          );
          const syncOutputPlugin2 = Plugin.create(
            {
              processOutput: (item: string) => `Result: ${item}`,
            },
            {
              name: "syncOutputPlugin2",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [
              syncInputPlugin1,
              syncOutputPlugin1,
              syncInputPlugin2,
              syncOutputPlugin2,
            ],
          });
          assertEquals(engine.plugins, [
            syncInputPlugin1,
            syncOutputPlugin1,
            syncInputPlugin2,
            syncOutputPlugin2,
          ]);
        });

        await t.step("with multiple error plugins", () => {
          const syncErrorPlugin1 = {
            name: "syncErrorPlugin1",
            processError: (error: Error) =>
              new Error(`Wrapped1: ${error.message}`),
          } as BeltPluginError<any, Error>;
          const syncErrorPlugin2 = {
            name: "syncErrorPlugin2",
            processError: (error: Error) =>
              new Error(`Wrapped2: ${error.message}`),
          } as BeltPluginError<any, Error>;
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncErrorPlugin1, syncErrorPlugin2],
          });
          assertEquals(engine.plugins, [syncErrorPlugin1, syncErrorPlugin2]);
        });
      }
    );

    await t.step(
      "should initialize with async plugins only",
      async (t: Deno.TestContext) => {
        await t.step("with single input and output plugins", () => {
          const asyncInputPlugin = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item * 2),
            },
            {
              name: "asyncInputPlugin",
            }
          );
          const asyncOutputPlugin = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(item.toUpperCase()),
            },
            {
              name: "asyncOutputPlugin",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [asyncInputPlugin, asyncOutputPlugin],
          });
          assertEquals(engine.plugins, [asyncInputPlugin, asyncOutputPlugin]);
        });

        await t.step("with multiple input plugins", () => {
          const asyncInputPlugin1 = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item * 3),
            },
            {
              name: "asyncInputPlugin1",
            }
          );
          const asyncInputPlugin2 = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item + 20),
            },
            {
              name: "asyncInputPlugin2",
            }
          );
          const asyncInputPlugin3 = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item - 5),
            },
            {
              name: "asyncInputPlugin3",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [asyncInputPlugin1, asyncInputPlugin2, asyncInputPlugin3],
          });
          assertEquals(engine.plugins, [
            asyncInputPlugin1,
            asyncInputPlugin2,
            asyncInputPlugin3,
          ]);
        });

        await t.step("with multiple output plugins", () => {
          const asyncOutputPlugin1 = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(item.toLowerCase()),
            },
            {
              name: "asyncOutputPlugin1",
            }
          );
          const asyncOutputPlugin2 = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(item.padStart(10, "0")),
            },
            {
              name: "asyncOutputPlugin2",
            }
          );
          const asyncOutputPlugin3 = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(`<${item}>`),
            },
            {
              name: "asyncOutputPlugin3",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [
              asyncOutputPlugin1,
              asyncOutputPlugin2,
              asyncOutputPlugin3,
            ],
          });
          assertEquals(engine.plugins, [
            asyncOutputPlugin1,
            asyncOutputPlugin2,
            asyncOutputPlugin3,
          ]);
        });

        await t.step("with mixed multiple input and output plugins", () => {
          const asyncInputPlugin1 = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item * 4),
            },
            {
              name: "asyncInputPlugin1",
            }
          );
          const asyncInputPlugin2 = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item + 15),
            },
            {
              name: "asyncInputPlugin2",
            }
          );
          const asyncOutputPlugin1 = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(item.toLowerCase()),
            },
            {
              name: "asyncOutputPlugin1",
            }
          );
          const asyncOutputPlugin2 = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(`Async: ${item}`),
            },
            {
              name: "asyncOutputPlugin2",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [
              asyncInputPlugin1,
              asyncOutputPlugin1,
              asyncInputPlugin2,
              asyncOutputPlugin2,
            ],
          });
          assertEquals(engine.plugins, [
            asyncInputPlugin1,
            asyncOutputPlugin1,
            asyncInputPlugin2,
            asyncOutputPlugin2,
          ]);
        });

        await t.step("with multiple error plugins", () => {
          const asyncErrorPlugin1 = {
            name: "asyncErrorPlugin1",
            processError: async (error: Error) =>
              Promise.resolve(new Error(`AsyncWrapped1: ${error.message}`)),
          } as BeltPluginError<any, Error>;
          const asyncErrorPlugin2 = {
            name: "asyncErrorPlugin2",
            processError: async (error: Error) =>
              Promise.resolve(new Error(`AsyncWrapped2: ${error.message}`)),
          } as BeltPluginError<any, Error>;
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [asyncErrorPlugin1, asyncErrorPlugin2],
          });
          assertEquals(engine.plugins, [asyncErrorPlugin1, asyncErrorPlugin2]);
        });
      }
    );

    await t.step(
      "should initialize with mixed sync and async plugins",
      async (t: Deno.TestContext) => {
        await t.step("with sync input and async output", () => {
          const syncPlugin = Plugin.create(
            {
              processInput: (item: number) => item * 2,
            },
            {
              name: "syncPlugin",
            }
          );
          const asyncPlugin = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(item.toUpperCase()),
            },
            {
              name: "asyncPlugin",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncPlugin, asyncPlugin],
          });
          assertEquals(engine.plugins, [syncPlugin, asyncPlugin]);
        });

        await t.step("with async input and sync output", () => {
          const asyncInputPlugin = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item / 2),
            },
            {
              name: "asyncInputPlugin",
            }
          );
          const syncOutputPlugin = Plugin.create(
            {
              processOutput: (item: string) => item.toLowerCase(),
            },
            {
              name: "syncOutputPlugin",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [asyncInputPlugin, syncOutputPlugin],
          });
          assertEquals(engine.plugins, [asyncInputPlugin, syncOutputPlugin]);
        });

        await t.step("with multiple mixed input plugins", () => {
          const syncInputPlugin1 = Plugin.create(
            {
              processInput: (item: number) => item * 3,
            },
            {
              name: "syncInputPlugin1",
            }
          );
          const asyncInputPlugin1 = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item + 7),
            },
            {
              name: "asyncInputPlugin1",
            }
          );
          const syncInputPlugin2 = Plugin.create(
            {
              processInput: (item: number) => item - 2,
            },
            {
              name: "syncInputPlugin2",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncInputPlugin1, asyncInputPlugin1, syncInputPlugin2],
          });
          assertEquals(engine.plugins, [
            syncInputPlugin1,
            asyncInputPlugin1,
            syncInputPlugin2,
          ]);
        });

        await t.step("with multiple mixed output plugins", () => {
          const syncOutputPlugin1 = Plugin.create(
            {
              processOutput: (item: string) => item.toUpperCase(),
            },
            {
              name: "syncOutputPlugin1",
            }
          );
          const asyncOutputPlugin1 = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(item.replace(/\d/g, "X")),
            },
            {
              name: "asyncOutputPlugin1",
            }
          );
          const syncOutputPlugin2 = Plugin.create(
            {
              processOutput: (item: string) => `Final: ${item}`,
            },
            {
              name: "syncOutputPlugin2",
            }
          );
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncOutputPlugin1, asyncOutputPlugin1, syncOutputPlugin2],
          });
          assertEquals(engine.plugins, [
            syncOutputPlugin1,
            asyncOutputPlugin1,
            syncOutputPlugin2,
          ]);
        });

        await t.step("with mixed error plugins", () => {
          const syncErrorPlugin = {
            name: "syncErrorPlugin",
            processError: (error: Error) => new Error(`Sync: ${error.message}`),
          } as BeltPluginError<any, Error>;
          const asyncErrorPlugin = {
            name: "asyncErrorPlugin",
            processError: async (error: Error) =>
              Promise.resolve(new Error(`Async: ${error.message}`)),
          } as BeltPluginError<any, Error>;
          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [syncErrorPlugin, asyncErrorPlugin],
          });
          assertEquals(engine.plugins, [syncErrorPlugin, asyncErrorPlugin]);
        });

        await t.step("with comprehensive mixed plugins", () => {
          const syncInputPlugin = Plugin.create(
            {
              processInput: (item: number) => item * 2,
            },
            {
              name: "syncInputPlugin",
            }
          );
          const asyncInputPlugin = Plugin.create(
            {
              processInput: async (item: number) => Promise.resolve(item + 10),
            },
            {
              name: "asyncInputPlugin",
            }
          );
          const syncOutputPlugin = Plugin.create(
            {
              processOutput: (item: string) => item.toUpperCase(),
            },
            {
              name: "syncOutputPlugin",
            }
          );
          const asyncOutputPlugin = Plugin.create(
            {
              processOutput: async (item: string) =>
                Promise.resolve(`Result: ${item}`),
            },
            {
              name: "asyncOutputPlugin",
            }
          );
          const syncErrorPlugin = {
            name: "syncErrorPlugin",
            processError: (error: Error) => new Error(`Sync: ${error.message}`),
          } as BeltPluginError<any, Error>;
          const asyncErrorPlugin = {
            name: "asyncErrorPlugin",
            processError: async (error: Error) =>
              Promise.resolve(new Error(`Async: ${error.message}`)),
          } as BeltPluginError<any, Error>;

          const engine = ProcessEngine.create((n: number) => n.toString(), {
            name: "MyProcess",
            plugins: [
              syncInputPlugin,
              asyncInputPlugin,
              syncOutputPlugin,
              asyncOutputPlugin,
              syncErrorPlugin,
              asyncErrorPlugin,
            ],
          });
          assertEquals(engine.plugins, [
            syncInputPlugin,
            asyncInputPlugin,
            syncOutputPlugin,
            asyncOutputPlugin,
            syncErrorPlugin,
            asyncErrorPlugin,
          ]);
        });
      }
    );

    await t.step("should initialize with mixed multi-plugins", () => {
      const syncMultiPlugin = Plugin.create(
        {
          processInput: (item: number) => item * 2,
          processOutput: (item: string) => item.toUpperCase(),
          processError: (error: Error) => new Error(`Sync: ${error.message}`),
        },
        {
          name: "syncMultiPlugin",
        }
      );
      const asyncMultiPlugin = Plugin.create(
        {
          processInput: async (item: number) => Promise.resolve(item + 1),
          processOutput: async (item: string) =>
            Promise.resolve(item.toLowerCase()),
          processError: async (error: Error) =>
            Promise.resolve(new Error(`Async: ${error.message}`)),
        },
        {
          name: "asyncMultiPlugin",
        }
      );
      const mixedMultiPlugin = Plugin.create(
        {
          processInput: (item: number) => item / 2,
          processOutput: async (item: string) => Promise.resolve(item.trim()),
        },
        {
          name: "mixedMultiPlugin",
        }
      );
      const engine = ProcessEngine.create((n: number) => n.toString(), {
        name: "MyProcess",
        plugins: [syncMultiPlugin, asyncMultiPlugin, mixedMultiPlugin],
      });
      assertEquals(engine.plugins, [
        syncMultiPlugin,
        asyncMultiPlugin,
        mixedMultiPlugin,
      ]);
    });

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
        } as BeltPluginError<any, Error>;
        const mockPluginInputOutput = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginOutput<string>;
        const mockPluginInputError = {
          name: "mockPlugin",
        } as BeltPluginInput<number> & BeltPluginError<any, Error>;
        const mockPluginOutputError = {
          name: "mockPlugin",
        } as BeltPluginOutput<number> & BeltPluginError<any, Error>;
        const mockPluginInputOutputError = {
          name: "mockPlugin",
        } as BeltPluginInput<number> &
          BeltPluginOutput<string> &
          BeltPluginError<any, Error>;
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
      } as BeltPluginError<any, Error>;

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

  await t.step("during mixed plugin execution", async (t: Deno.TestContext) => {
    await t.step(
      "should execute multiple sync input plugins in sequence",
      async () => {
        const syncInputPlugin1 = Plugin.create(
          {
            processInput: (item: number) => item * 2, // 5 -> 10
          },
          {
            name: "syncInputPlugin1",
          }
        );
        const syncInputPlugin2 = Plugin.create(
          {
            processInput: (item: number) => item + 5, // 10 -> 15
          },
          {
            name: "syncInputPlugin2",
          }
        );
        const syncInputPlugin3 = Plugin.create(
          {
            processInput: (item: number) => item - 3, // 15 -> 12
          },
          {
            name: "syncInputPlugin3",
          }
        );

        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [syncInputPlugin1, syncInputPlugin2, syncInputPlugin3],
        });

        const result = await engine.run(5);
        assertEquals(result, "12"); // 5 * 2 + 5 - 3 = 12
      }
    );

    await t.step(
      "should execute multiple async input plugins in sequence",
      async () => {
        const asyncInputPlugin1 = Plugin.create(
          {
            processInput: async (item: number) => Promise.resolve(item * 3), // 4 -> 12
          },
          {
            name: "asyncInputPlugin1",
          }
        );
        const asyncInputPlugin2 = Plugin.create(
          {
            processInput: async (item: number) => Promise.resolve(item + 8), // 12 -> 20
          },
          {
            name: "asyncInputPlugin2",
          }
        );
        const asyncInputPlugin3 = Plugin.create(
          {
            processInput: async (item: number) => Promise.resolve(item / 2), // 20 -> 10
          },
          {
            name: "asyncInputPlugin3",
          }
        );

        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [asyncInputPlugin1, asyncInputPlugin2, asyncInputPlugin3],
        });

        const result = await engine.run(4);
        assertEquals(result, "10"); // 4 * 3 + 8 / 2 = 10
      }
    );

    await t.step(
      "should execute multiple sync output plugins in sequence",
      async () => {
        const syncOutputPlugin1 = Plugin.create(
          {
            processOutput: (item: string) => item.toUpperCase(), // "hello" -> "HELLO"
          },
          {
            name: "syncOutputPlugin1",
          }
        );
        const syncOutputPlugin2 = Plugin.create(
          {
            processOutput: (item: string) => `[${item}]`, // "HELLO" -> "[HELLO]"
          },
          {
            name: "syncOutputPlugin2",
          }
        );
        const syncOutputPlugin3 = Plugin.create(
          {
            processOutput: (item: string) => `Result: ${item}`, // "[HELLO]" -> "Result: [HELLO]"
          },
          {
            name: "syncOutputPlugin3",
          }
        );

        const engine = ProcessEngine.create((n: number) => "hello", {
          name: "MyProcess",
          plugins: [syncOutputPlugin1, syncOutputPlugin2, syncOutputPlugin3],
        });

        const result = await engine.run(1);
        assertEquals(result, "Result: [HELLO]");
      }
    );

    await t.step(
      "should execute multiple async output plugins in sequence",
      async () => {
        const asyncOutputPlugin1 = Plugin.create(
          {
            processOutput: async (item: string) =>
              Promise.resolve(item.toLowerCase()), // "WORLD" -> "world"
          },
          {
            name: "asyncOutputPlugin1",
          }
        );
        const asyncOutputPlugin2 = Plugin.create(
          {
            processOutput: async (item: string) =>
              Promise.resolve(item.padStart(10, "0")), // "world" -> "00000world"
          },
          {
            name: "asyncOutputPlugin2",
          }
        );
        const asyncOutputPlugin3 = Plugin.create(
          {
            processOutput: async (item: string) => Promise.resolve(`<${item}>`), // "00000world" -> "<00000world>"
          },
          {
            name: "asyncOutputPlugin3",
          }
        );

        const engine = ProcessEngine.create((n: number) => "WORLD", {
          name: "MyProcess",
          plugins: [asyncOutputPlugin1, asyncOutputPlugin2, asyncOutputPlugin3],
        });

        const result = await engine.run(1);
        assertEquals(result, "<00000world>");
      }
    );

    await t.step(
      "should execute mixed sync and async input plugins in sequence",
      async () => {
        const syncInputPlugin1 = Plugin.create(
          {
            processInput: (item: number) => item * 2, // 6 -> 12
          },
          {
            name: "syncInputPlugin1",
          }
        );
        const asyncInputPlugin1 = Plugin.create(
          {
            processInput: async (item: number) => Promise.resolve(item + 3), // 12 -> 15
          },
          {
            name: "asyncInputPlugin1",
          }
        );
        const syncInputPlugin2 = Plugin.create(
          {
            processInput: (item: number) => item / 3, // 15 -> 5
          },
          {
            name: "syncInputPlugin2",
          }
        );

        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [syncInputPlugin1, asyncInputPlugin1, syncInputPlugin2],
        });

        const result = await engine.run(6);
        assertEquals(result, "5"); // 6 * 2 + 3 / 3 = 5
      }
    );

    await t.step(
      "should execute mixed sync and async output plugins in sequence",
      async () => {
        const syncOutputPlugin1 = Plugin.create(
          {
            processOutput: (item: string) => item.toUpperCase(), // "test" -> "TEST"
          },
          {
            name: "syncOutputPlugin1",
          }
        );
        const asyncOutputPlugin1 = Plugin.create(
          {
            processOutput: async (item: string) =>
              Promise.resolve(item.replace(/T/g, "X")), // "TEST" -> "XESX"
          },
          {
            name: "asyncOutputPlugin1",
          }
        );
        const syncOutputPlugin2 = Plugin.create(
          {
            processOutput: (item: string) => `Final: ${item}`, // "XESX" -> "Final: XESX"
          },
          {
            name: "syncOutputPlugin2",
          }
        );

        const engine = ProcessEngine.create((n: number) => "test", {
          name: "MyProcess",
          plugins: [syncOutputPlugin1, asyncOutputPlugin1, syncOutputPlugin2],
        });

        const result = await engine.run(1);
        assertEquals(result, "Final: XESX");
      }
    );

    await t.step(
      "should execute comprehensive mixed plugins together",
      async () => {
        const syncInputPlugin = Plugin.create(
          {
            processInput: (item: number) => item * 2, // 3 -> 6
          },
          {
            name: "syncInputPlugin",
          }
        );
        const asyncInputPlugin = Plugin.create(
          {
            processInput: async (item: number) => Promise.resolve(item + 4), // 6 -> 10
          },
          {
            name: "asyncInputPlugin",
          }
        );
        const syncOutputPlugin = Plugin.create(
          {
            processOutput: (item: string) => item.toUpperCase(), // "10" -> "10" (no letters to uppercase)
          },
          {
            name: "syncOutputPlugin",
          }
        );
        const asyncOutputPlugin = Plugin.create(
          {
            processOutput: async (item: string) =>
              Promise.resolve(`Value: ${item}`), // "10" -> "Value: 10"
          },
          {
            name: "asyncOutputPlugin",
          }
        );

        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [
            syncInputPlugin,
            asyncInputPlugin,
            syncOutputPlugin,
            asyncOutputPlugin,
          ],
        });

        const result = await engine.run(3);
        assertEquals(result, "Value: 10"); // 3 * 2 + 4 = 10 -> "10" -> "Value: 10"
      }
    );

    await t.step(
      "should execute mixed multi-plugins with different sync/async combinations",
      async () => {
        const syncMultiPlugin = Plugin.create(
          {
            processInput: (item: number) => item * 2, // 5 -> 10
            processOutput: (item: string) => item.toUpperCase(), // "10" -> "10"
          },
          {
            name: "syncMultiPlugin",
          }
        );
        const asyncMultiPlugin = Plugin.create(
          {
            processInput: async (item: number) => Promise.resolve(item + 5), // 10 -> 15
            processOutput: async (item: string) =>
              Promise.resolve(`Result: ${item}`), // "10" -> "Result: 10"
          },
          {
            name: "asyncMultiPlugin",
          }
        );
        const mixedMultiPlugin = Plugin.create(
          {
            processInput: (item: number) => item - 3, // 15 -> 12
            processOutput: async (item: string) => Promise.resolve(`[${item}]`), // "Result: 10" -> "[Result: 10]"
          },
          {
            name: "mixedMultiPlugin",
          }
        );

        const engine = ProcessEngine.create((n: number) => n.toString(), {
          name: "MyProcess",
          plugins: [syncMultiPlugin, asyncMultiPlugin, mixedMultiPlugin],
        });

        const result = await engine.run(5);
        assertEquals(result, "[Result: 12]"); // 5 * 2 + 5 - 3 = 12 -> "12" -> "Result: 12" -> "[Result: 12]"
      }
    );
  });
});
