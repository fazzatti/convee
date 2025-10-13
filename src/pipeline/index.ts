// deno-lint-ignore-file no-explicit-any
import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType } from "../core/types.ts";
import {
  PluggableNames,
  DefaultErrorT,
  FirstInput,
  Pipeline as IPipeline,
  LastOutput,
  PipelineOptions,
  PipelinePlugin,
  PipelineStep,
  PipelineSteps,
} from "./types.ts";
import { ProcessEngine } from "../process-engine/index.ts";
import { MetadataHelper, RunOptions, TransformerAsync } from "../index.ts";
import { Unwrap } from "../utils/types/unwrap.ts";
import { isProcessEngine } from "../utils/types/is-process-engine.ts";
import { reducePipelineStepsToNames } from "../utils/reduce-pipeline-steps-to-names.ts";
import { ProcessEngine as IProcessEngine } from "../process-engine/types.ts";

function createPipeline<
  Steps extends [PipelineStep<any, any, any>, ...PipelineStep<any, any, any>[]],
  ErrorT extends Error = DefaultErrorT<Steps>
>(
  steps: [...Steps] &
    PipelineSteps<FirstInput<Steps>, LastOutput<Steps>, Steps>,
  options?: PipelineOptions
): IPipeline<FirstInput<Steps>, LastOutput<Steps>, ErrorT, Steps> {
  let customizedSteps: typeof steps | undefined = undefined;

  const _processEngine = ProcessEngine.create(
    executePipeline as TransformerAsync<FirstInput<Steps>, LastOutput<Steps>>,
    options
  );

  const pluggableSteps = reducePipelineStepsToNames(
    steps
  ) as PluggableNames<Steps>;

  const pipeline = {
    ..._processEngine,
    addPlugin,
    removePlugin,
    type: CoreProcessType.PIPELINE,
    steps,
    runCustom: undefined as any,
    pluggableSteps,
  };

  pipeline.runCustom = wrapRunWithCustomSteps();

  return pipeline as IPipeline<
    FirstInput<Steps>,
    LastOutput<Steps>,
    ErrorT,
    Steps
  >;

  function addPlugin(
    plugin: PipelinePlugin<Steps>,
    target: PluggableNames<Steps>[number]
  ): void {
    const step = steps.find((step) => {
      return "name" in step && step.name === target;
    });

    if (isProcessEngine(step)) {
      if (!step || step.name !== target) {
        throw new Error(`Step with name ${target} not found`);
      }

      step.addPlugin(plugin);
    }

    return;
  }

  function removePlugin(
    target: PluggableNames<Steps>[number],
    pluginName: string
  ) {
    const step = steps.find((step) => {
      return "name" in step && step.name === target;
    });

    if (!step) {
      throw new Error(`Step with name ${target} not found`);
    }

    if (isProcessEngine(step)) {
      step.removePlugin(pluginName);
      return;
    }
  }

  async function executePipeline(
    input: FirstInput<Steps>,
    metadata: MetadataHelper
  ): Promise<LastOutput<Steps>> {
    const currentSteps = customizedSteps ? customizedSteps : steps;

    let result: unknown = input;
    for (const step of currentSteps) {
      if (typeof step === "function") {
        // For simple functions (modifier or transformer), simply call the function.
        result = await step(result, metadata);
      } else if (isProcessEngine(step)) {
        // Process engine step.
        if (
          step.type === CoreProcessType.PROCESS_ENGINE ||
          step.type === CoreProcessType.PIPELINE
        ) {
          result = await step.run(result, { metadataHelper: metadata });
        } else {
          throw new Error("Invalid process engine type");
        }
      } else {
        throw new Error("Invalid pipeline step");
      }
    }
    return result as LastOutput<Steps>;
  }

  function wrapRunWithCustomSteps() {
    return async function (
      this: typeof pipeline,
      input: FirstInput<Steps>,
      customSteps: typeof steps,
      options?: RunOptions<FirstInput<Steps>, Unwrap<LastOutput<Steps>>, ErrorT>
    ): Promise<LastOutput<Steps>> {
      customizedSteps = customSteps;
      const result = await this.run
        .call(this, input, options)
        .catch((error: Error) => {
          customizedSteps = undefined;
          throw error;
        });
      customizedSteps = undefined;
      return result as LastOutput<Steps>;
    };
  }
}

export const Pipeline = {
  create: createPipeline,
};
