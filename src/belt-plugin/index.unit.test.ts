import { assertEquals, assertExists } from "@std/assert";
import { ProcessEngine } from "../process-engine/index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { ConveeError } from "../error/index.ts";
import { BeltPluginInput, BeltPluginOutput, BeltPluginError } from "./types.ts";

Deno.test(
  "BeltPlugin - input plugin receives and can set metadata",
  async () => {
    const inputPlugin: BeltPluginInput<number> = {
      name: "inputMetadataPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataHelper.add("inputReceived", input);
        metadataHelper.add("pluginName", "inputMetadataPlugin");
        return input * 2;
      },
    };

    let capturedMetadata: MetadataHelper | undefined;

    const process = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        capturedMetadata = metadata;
        return n + 1;
      },
      {
        name: "testProcess",
        plugins: [inputPlugin],
      }
    );

    const result = await process.run(5);

    assertEquals(result, 11); // (5 * 2) + 1
    assertExists(capturedMetadata);
    assertEquals(capturedMetadata?.get("inputReceived"), 5);
    assertEquals(capturedMetadata?.get("pluginName"), "inputMetadataPlugin");
  }
);

Deno.test(
  "BeltPlugin - output plugin receives metadata set by process",
  async () => {
    let outputMetadataValue: unknown;

    const outputPlugin: BeltPluginOutput<number> = {
      name: "outputMetadataPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        outputMetadataValue = metadataHelper.get("processSetValue");
        return output;
      },
    };

    const process = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("processSetValue", n * 10);
        return n + 1;
      },
      {
        name: "testProcess",
        plugins: [outputPlugin],
      }
    );

    const result = await process.run(5);

    assertEquals(result, 6);
    assertEquals(outputMetadataValue, 50);
  }
);

Deno.test(
  "BeltPlugin - metadata flows from input plugin through process to output plugin",
  async () => {
    const inputPlugin: BeltPluginInput<number> = {
      name: "inputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataHelper.add("inputTimestamp", Date.now());
        metadataHelper.add("originalInput", input);
        return input;
      },
    };

    let outputReceivedOriginalInput: unknown;

    const outputPlugin: BeltPluginOutput<number> = {
      name: "outputPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        outputReceivedOriginalInput = metadataHelper.get("originalInput");
        metadataHelper.add("finalOutput", output);
        return output;
      },
    };

    let processReceivedOriginalInput: unknown;

    const process = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        processReceivedOriginalInput = metadata?.get("originalInput");
        metadata?.add("processedAt", "middle");
        return n * 3;
      },
      {
        name: "flowTestProcess",
        plugins: [inputPlugin, outputPlugin],
      }
    );

    const result = await process.run(7);

    assertEquals(result, 21);
    assertEquals(processReceivedOriginalInput, 7);
    assertEquals(outputReceivedOriginalInput, 7);
  }
);

Deno.test(
  "BeltPlugin - error plugin receives metadata and can access it",
  async () => {
    let errorPluginMetadataValue: unknown;

    const inputPlugin: BeltPluginInput<number> = {
      name: "inputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataHelper.add("beforeError", "wasSetBeforeError");
        return input;
      },
    };

    const errorPlugin: BeltPluginError<number, Error> = {
      name: "errorPlugin",
      processError: (
        _error: ConveeError<Error>,
        metadataHelper: MetadataHelper
      ) => {
        errorPluginMetadataValue = metadataHelper.get("beforeError");
        metadataHelper.add("errorHandled", true);
        return 42; // Return a fallback value instead of re-throwing
      },
    };

    const process = ProcessEngine.create(
      (_n: number, _metadata?: MetadataHelper): number => {
        throw new Error("Intentional error");
      },
      {
        name: "errorTestProcess",
        plugins: [inputPlugin, errorPlugin],
      }
    );

    const result = await process.run(5);

    assertEquals(result, 42);
    assertEquals(errorPluginMetadataValue, "wasSetBeforeError");
  }
);

Deno.test("BeltPlugin - single-use plugins receive metadata", async () => {
  let singleUsePluginMetadata: unknown;

  const singleUseInputPlugin: BeltPluginInput<number> = {
    name: "singleUseInputPlugin",
    processInput: (input: number, metadataHelper: MetadataHelper) => {
      metadataHelper.add("singleUseWasHere", true);
      return input;
    },
  };

  const singleUseOutputPlugin: BeltPluginOutput<number> = {
    name: "singleUseOutputPlugin",
    processOutput: (output: number, metadataHelper: MetadataHelper) => {
      singleUsePluginMetadata = metadataHelper.get("singleUseWasHere");
      return output;
    },
  };

  const process = ProcessEngine.create((n: number) => n + 1, {
    name: "singleUseTest",
  });

  const result = await process.run(10, {
    singleUsePlugins: [singleUseInputPlugin, singleUseOutputPlugin],
  });

  assertEquals(result, 11);
  assertEquals(singleUsePluginMetadata, true);
});

Deno.test(
  "BeltPlugin - combined registered and single-use plugins share metadata",
  async () => {
    const registeredInputPlugin: BeltPluginInput<number> = {
      name: "registeredInput",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataHelper.add("registeredPluginSet", "hello");
        return input;
      },
    };

    let singleUseReceivedRegisteredValue: unknown;

    const singleUseOutputPlugin: BeltPluginOutput<number> = {
      name: "singleUseOutput",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        singleUseReceivedRegisteredValue = metadataHelper.get(
          "registeredPluginSet"
        );
        return output;
      },
    };

    const process = ProcessEngine.create((n: number) => n * 2, {
      name: "combinedPluginsTest",
      plugins: [registeredInputPlugin],
    });

    const result = await process.run(5, {
      singleUsePlugins: [singleUseOutputPlugin],
    });

    assertEquals(result, 10);
    assertEquals(singleUseReceivedRegisteredValue, "hello");
  }
);

Deno.test(
  "BeltPlugin - multiple input plugins execute in order and share metadata",
  async () => {
    const order: string[] = [];

    const firstInputPlugin: BeltPluginInput<number> = {
      name: "firstInput",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        order.push("first");
        metadataHelper.add("step1", input);
        return input + 1;
      },
    };

    const secondInputPlugin: BeltPluginInput<number> = {
      name: "secondInput",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        order.push("second");
        const step1Value = metadataHelper.get("step1");
        metadataHelper.add("step2", { previous: step1Value, current: input });
        return input + 1;
      },
    };

    let finalMetadata: MetadataHelper | undefined;

    const process = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        finalMetadata = metadata;
        return n;
      },
      {
        name: "multipleInputsTest",
        plugins: [firstInputPlugin, secondInputPlugin],
      }
    );

    const result = await process.run(10);

    assertEquals(result, 12); // 10 + 1 + 1
    assertEquals(order, ["first", "second"]);
    assertEquals(finalMetadata?.get("step1"), 10);
    assertEquals(finalMetadata?.get("step2"), { previous: 10, current: 11 });
  }
);

Deno.test(
  "BeltPlugin - addPlugin dynamically adds plugin that receives metadata",
  async () => {
    let dynamicPluginMetadata: unknown;

    const dynamicPlugin: BeltPluginOutput<number> = {
      name: "dynamicPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        dynamicPluginMetadata = metadataHelper.get("fromProcess");
        return output;
      },
    };

    const process = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("fromProcess", "dynamicTest");
        return n;
      },
      { name: "dynamicPluginTest" }
    );

    // Add plugin after creation
    process.addPlugin(dynamicPlugin);

    const result = await process.run(5);

    assertEquals(result, 5);
    assertEquals(dynamicPluginMetadata, "dynamicTest");
  }
);

Deno.test(
  "BeltPlugin - removePlugin prevents plugin from receiving metadata calls",
  async () => {
    let pluginWasCalled = false;

    const removablePlugin: BeltPluginOutput<number> = {
      name: "removablePlugin",
      processOutput: (output: number, _metadataHelper: MetadataHelper) => {
        pluginWasCalled = true;
        return output;
      },
    };

    const process = ProcessEngine.create((n: number) => n, {
      name: "removePluginTest",
      plugins: [removablePlugin],
    });

    // Remove the plugin before running
    process.removePlugin("removablePlugin");

    await process.run(5);

    assertEquals(pluginWasCalled, false);
  }
);

Deno.test(
  "BeltPlugin - error plugin can transform error and continue with metadata",
  async () => {
    let errorPluginReceivedMetadata: unknown;
    let outputPluginReceivedMetadata: unknown;

    const inputPlugin: BeltPluginInput<number> = {
      name: "inputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataHelper.add("inputValue", input);
        return input;
      },
    };

    const errorPlugin: BeltPluginError<number, Error> = {
      name: "errorPlugin",
      processError: (
        _error: ConveeError<Error>,
        metadataHelper: MetadataHelper
      ) => {
        errorPluginReceivedMetadata = metadataHelper.get("inputValue");
        metadataHelper.add("recoveredFromError", true);
        return 100; // Return recovery value
      },
    };

    const outputPlugin: BeltPluginOutput<number> = {
      name: "outputPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        outputPluginReceivedMetadata =
          metadataHelper.get("recoveredFromError");
        return output;
      },
    };

    const process = ProcessEngine.create(
      (_n: number, _metadata?: MetadataHelper): number => {
        throw new Error("Process failed");
      },
      {
        name: "errorRecoveryTest",
        plugins: [inputPlugin, errorPlugin, outputPlugin],
      }
    );

    const result = await process.run(25);

    assertEquals(result, 100);
    assertEquals(errorPluginReceivedMetadata, 25);
    assertEquals(outputPluginReceivedMetadata, true);
  }
);

Deno.test(
  "BeltPlugin - getAll returns all metadata set by plugins",
  async () => {
    let allMetadata: Record<string, unknown> | undefined;

    const inputPlugin: BeltPluginInput<number> = {
      name: "inputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataHelper.add("pluginKey1", "value1");
        metadataHelper.add("pluginKey2", "value2");
        return input;
      },
    };

    const process = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("processKey", "processValue");
        allMetadata = metadata?.getAll();
        return n;
      },
      {
        name: "getAllMetadataTest",
        plugins: [inputPlugin],
      }
    );

    await process.run(5);

    assertExists(allMetadata);
    assertEquals(allMetadata?.pluginKey1, "value1");
    assertEquals(allMetadata?.pluginKey2, "value2");
    assertEquals(allMetadata?.processKey, "processValue");
  }
);

// ============================================================
// =================== Pipeline Tests =========================
// ============================================================

import { Pipeline } from "../pipeline/index.ts";

Deno.test(
  "BeltPlugin with Pipeline - plugin added to inner step receives metadata",
  async () => {
    let step1PluginMetadata: unknown;
    let step2PluginMetadata: unknown;

    // Create step 1 with a plugin
    const step1 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("step1Ran", true);
        metadata?.add("step1Input", n);
        return n * 2;
      },
      { name: "step1" as const }
    );

    // Create step 2 with a plugin
    const step2 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("step2Ran", true);
        return n + 10;
      },
      { name: "step2" as const }
    );

    // Add plugins to inner steps
    const step1OutputPlugin: BeltPluginOutput<number> = {
      name: "step1OutputPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        step1PluginMetadata = metadataHelper.get("step1Ran");
        return output;
      },
    };

    const step2InputPlugin: BeltPluginInput<number> = {
      name: "step2InputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        step2PluginMetadata = metadataHelper.get("step1Input");
        return input;
      },
    };

    step1.addPlugin(step1OutputPlugin);
    step2.addPlugin(step2InputPlugin);

    const pipeline = Pipeline.create([step1, step2], {
      name: "innerStepPluginTest" as const,
    });

    const result = await pipeline.run(5);

    assertEquals(result, 20); // (5 * 2) + 10
    assertEquals(step1PluginMetadata, true);
    assertEquals(step2PluginMetadata, 5);
  }
);

Deno.test(
  "BeltPlugin with Pipeline - plugin added to main pipeline structure receives metadata",
  async () => {
    let pipelineInputPluginCalled = false;
    let pipelineOutputPluginMetadata: unknown;

    const step1 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("processedByStep1", true);
        return n * 3;
      },
      { name: "multiplyStep" as const }
    );

    const step2 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("processedByStep2", true);
        return n + 5;
      },
      { name: "addStep" as const }
    );

    const pipeline = Pipeline.create([step1, step2], {
      name: "mainPipelinePluginTest" as const,
    });

    // Add plugins to the main pipeline structure
    const pipelineInputPlugin: BeltPluginInput<number> = {
      name: "pipelineInputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        pipelineInputPluginCalled = true;
        metadataHelper.add("pipelineInputReceived", input);
        return input;
      },
    };

    const pipelineOutputPlugin: BeltPluginOutput<number> = {
      name: "pipelineOutputPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        pipelineOutputPluginMetadata = {
          pipelineInputReceived: metadataHelper.get("pipelineInputReceived"),
          processedByStep1: metadataHelper.get("processedByStep1"),
          processedByStep2: metadataHelper.get("processedByStep2"),
        };
        return output;
      },
    };

    pipeline.addPlugin(pipelineInputPlugin, "mainPipelinePluginTest");
    pipeline.addPlugin(pipelineOutputPlugin, "mainPipelinePluginTest");

    const result = await pipeline.run(4);

    assertEquals(result, 17); // (4 * 3) + 5
    assertEquals(pipelineInputPluginCalled, true);
    assertEquals(pipelineOutputPluginMetadata, {
      pipelineInputReceived: 4,
      processedByStep1: true,
      processedByStep2: true,
    });
  }
);

Deno.test(
  "BeltPlugin with Pipeline - metadata flows through pipeline with plugins on both levels",
  async () => {
    const metadataLog: string[] = [];

    const step1 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadataLog.push("step1-process");
        metadata?.add("step1Value", n * 2);
        return n * 2;
      },
      { name: "doubleStep" as const }
    );

    const step2 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadataLog.push("step2-process");
        metadata?.add("step2Value", n + 100);
        return n + 100;
      },
      { name: "add100Step" as const }
    );

    // Add plugins to inner steps
    step1.addPlugin({
      name: "step1InputPlugin",
      processInput: (input: number, metadataHelper: MetadataHelper) => {
        metadataLog.push("step1-input-plugin");
        metadataHelper.add("step1InputPluginRan", true);
        return input;
      },
    } as BeltPluginInput<number>);

    step2.addPlugin({
      name: "step2OutputPlugin",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        metadataLog.push("step2-output-plugin");
        metadataHelper.add("step2OutputPluginRan", true);
        return output;
      },
    } as BeltPluginOutput<number>);

    const pipeline = Pipeline.create([step1, step2], {
      name: "multiLevelPluginTest" as const,
    });

    // Add plugins to pipeline level
    pipeline.addPlugin(
      {
        name: "pipelineInputPlugin",
        processInput: (input: number, metadataHelper: MetadataHelper) => {
          metadataLog.push("pipeline-input-plugin");
          metadataHelper.add("pipelineStarted", true);
          return input;
        },
      } as BeltPluginInput<number>,
      "multiLevelPluginTest"
    );

    let finalMetadata: Record<string, unknown> | undefined;

    pipeline.addPlugin(
      {
        name: "pipelineOutputPlugin",
        processOutput: (output: number, metadataHelper: MetadataHelper) => {
          metadataLog.push("pipeline-output-plugin");
          finalMetadata = metadataHelper.getAll();
          return output;
        },
      } as BeltPluginOutput<number>,
      "multiLevelPluginTest"
    );

    const result = await pipeline.run(10);

    assertEquals(result, 120); // (10 * 2) + 100

    // Verify execution order
    assertEquals(metadataLog, [
      "pipeline-input-plugin",
      "step1-input-plugin",
      "step1-process",
      "step2-process",
      "step2-output-plugin",
      "pipeline-output-plugin",
    ]);

    // Verify all metadata was collected
    assertExists(finalMetadata);
    assertEquals(finalMetadata?.pipelineStarted, true);
    assertEquals(finalMetadata?.step1InputPluginRan, true);
    assertEquals(finalMetadata?.step1Value, 20);
    assertEquals(finalMetadata?.step2Value, 120);
    assertEquals(finalMetadata?.step2OutputPluginRan, true);
  }
);

Deno.test(
  "BeltPlugin with Pipeline - addPlugin to specific step by name",
  async () => {
    let targetStepPluginCalled = false;

    const step1 = ProcessEngine.create((n: number) => n * 2, {
      name: "multiplyBy2" as const,
    });

    const step2 = ProcessEngine.create((n: number) => n + 50, {
      name: "add50" as const,
    });

    const pipeline = Pipeline.create([step1, step2], {
      name: "targetStepTest" as const,
    });

    // Add plugin to a specific step using pipeline.addPlugin
    pipeline.addPlugin(
      {
        name: "step2Plugin",
        processInput: (input: number, _metadataHelper: MetadataHelper) => {
          targetStepPluginCalled = true;
          return input;
        },
      } as BeltPluginInput<number>,
      "add50" // Target the specific step by name
    );

    const result = await pipeline.run(5);

    assertEquals(result, 60); // (5 * 2) + 50
    assertEquals(targetStepPluginCalled, true);
  }
);

Deno.test(
  "BeltPlugin with Pipeline - error plugin on inner step handles errors with metadata",
  async () => {
    let errorPluginMetadata: unknown;

    const step1 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("step1Executed", true);
        return n * 2;
      },
      { name: "step1" as const }
    );

    const step2 = ProcessEngine.create(
      (_n: number, metadata?: MetadataHelper): number => {
        metadata?.add("step2Started", true);
        throw new Error("Step 2 failed intentionally");
      },
      { name: "step2" as const }
    );

    // Add error plugin to step2
    step2.addPlugin({
      name: "step2ErrorPlugin",
      processError: (
        _error: ConveeError<Error>,
        metadataHelper: MetadataHelper
      ) => {
        errorPluginMetadata = {
          step1Executed: metadataHelper.get("step1Executed"),
          step2Started: metadataHelper.get("step2Started"),
        };
        return 999; // Recovery value
      },
    } as BeltPluginError<number, Error>);

    const pipeline = Pipeline.create([step1, step2], {
      name: "innerStepErrorTest" as const,
    });

    const result = await pipeline.run(5);

    assertEquals(result, 999);
    assertEquals(errorPluginMetadata, {
      step1Executed: true,
      step2Started: true,
    });
  }
);

Deno.test(
  "BeltPlugin with Pipeline - error plugin on pipeline level handles errors with metadata",
  async () => {
    let pipelineErrorPluginMetadata: unknown;

    const step1 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("step1Done", true);
        return n * 2;
      },
      { name: "step1" as const }
    );

    const failingStep = ProcessEngine.create(
      (_n: number, _metadata?: MetadataHelper): number => {
        throw new Error("Pipeline step failed");
      },
      { name: "failingStep" as const }
    );

    const pipeline = Pipeline.create([step1, failingStep], {
      name: "pipelineErrorTest" as const,
    });

    // Add error plugin at pipeline level
    pipeline.addPlugin(
      {
        name: "pipelineErrorPlugin",
        processError: (
          _error: ConveeError<Error>,
          metadataHelper: MetadataHelper
        ) => {
          pipelineErrorPluginMetadata = {
            step1Done: metadataHelper.get("step1Done"),
          };
          return 888; // Recovery value
        },
      } as BeltPluginError<number, Error>,
      "pipelineErrorTest"
    );

    const result = await pipeline.run(7);

    assertEquals(result, 888);
    assertEquals(pipelineErrorPluginMetadata, {
      step1Done: true,
    });
  }
);

Deno.test(
  "BeltPlugin with Pipeline - removePlugin from inner step",
  async () => {
    let pluginWasCalled = false;

    const step1 = ProcessEngine.create((n: number) => n * 2, {
      name: "step1" as const,
    });

    step1.addPlugin({
      name: "removablePlugin",
      processOutput: (output: number, _metadataHelper: MetadataHelper) => {
        pluginWasCalled = true;
        return output;
      },
    } as BeltPluginOutput<number>);

    const pipeline = Pipeline.create([step1], {
      name: "removeInnerPluginTest" as const,
    });

    // Remove plugin from inner step using pipeline.removePlugin
    pipeline.removePlugin("step1", "removablePlugin");

    await pipeline.run(5);

    assertEquals(pluginWasCalled, false);
  }
);

Deno.test(
  "BeltPlugin with Pipeline - removePlugin from main pipeline",
  async () => {
    let pipelinePluginCalled = false;

    const step1 = ProcessEngine.create((n: number) => n * 2, {
      name: "step1" as const,
    });

    const pipeline = Pipeline.create([step1], {
      name: "removePipelinePluginTest" as const,
    });

    pipeline.addPlugin(
      {
        name: "removablePipelinePlugin",
        processOutput: (output: number, _metadataHelper: MetadataHelper) => {
          pipelinePluginCalled = true;
          return output;
        },
      } as BeltPluginOutput<number>,
      "removePipelinePluginTest"
    );

    // Remove plugin from pipeline level
    pipeline.removePlugin("removePipelinePluginTest", "removablePipelinePlugin");

    await pipeline.run(5);

    assertEquals(pipelinePluginCalled, false);
  }
);

Deno.test(
  "BeltPlugin with Pipeline - single-use plugins work at pipeline level",
  async () => {
    let singleUsePluginMetadata: unknown;

    const step1 = ProcessEngine.create(
      (n: number, metadata?: MetadataHelper) => {
        metadata?.add("step1Processed", n);
        return n * 3;
      },
      { name: "tripleStep" as const }
    );

    const pipeline = Pipeline.create([step1], {
      name: "singleUsePipelineTest" as const,
    });

    const singleUseOutputPlugin: BeltPluginOutput<number> = {
      name: "singleUseOutput",
      processOutput: (output: number, metadataHelper: MetadataHelper) => {
        singleUsePluginMetadata = metadataHelper.get("step1Processed");
        return output;
      },
    };

    const result = await pipeline.run(8, {
      singleUsePlugins: [singleUseOutputPlugin],
    });

    assertEquals(result, 24); // 8 * 3
    assertEquals(singleUsePluginMetadata, 8);
  }
);
