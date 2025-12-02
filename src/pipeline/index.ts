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
  PipelineStepPlugin,
  PipelineStep,
  PipelineSteps,
  PipelinePlugin,
} from "./types.ts";
import { ProcessEngine } from "../process-engine/index.ts";
import { MetadataHelper, RunOptions, TransformerAsync } from "../index.ts";
import { Unwrap } from "../utils/types/unwrap.ts";
import { isProcessEngine } from "../utils/types/is-process-engine.ts";
import { reducePipelineStepsToNames } from "../utils/reduce-pipeline-steps-to-names.ts";
import { ProcessEngine as IProcessEngine } from "../process-engine/types.ts";

/**
 * Creates a new Pipeline that chains multiple processing steps together.
 *
 * A Pipeline:
 * - Executes steps in sequence, passing output of each step to the next
 * - Supports both ProcessEngine instances and simple functions as steps
 * - Shares a single MetadataHelper across all steps
 * - Supports plugins at both pipeline-level and individual step-level
 * - Provides type-safe chaining with compile-time validation
 *
 * @template Steps - Tuple type of the pipeline steps
 * @template ErrorT - Union of all error types from the steps
 * @template PipelineName - Literal type of the pipeline name
 *
 * @param steps - Array of processing steps (ProcessEngines or functions)
 * @param options - Pipeline configuration
 * @param options.name - Name for the pipeline (required, used for plugin targeting)
 * @param options.id - Optional custom ID
 *
 * @returns A Pipeline instance with run, runCustom, addPlugin, and removePlugin methods
 *
 * @example
 * ```typescript
 * // Pipeline with ProcessEngine steps
 * const pricePipeline = Pipeline.create(
 *   [applyDiscount, addTax, roundPrice],
 *   { name: "PricePipeline" }
 * );
 * await pricePipeline.run(100); // Processed price
 *
 * // Pipeline with simple functions
 * const mathPipeline = Pipeline.create(
 *   [
 *     (n: number) => n * 2,
 *     (n: number) => n + 10,
 *   ],
 *   { name: "MathPipeline" }
 * );
 * await mathPipeline.run(5); // 20
 *
 * // Adding plugins
 * pipeline.addPlugin(loggerPlugin, "PricePipeline"); // Pipeline-level
 * pipeline.addPlugin(validatorPlugin, "applyDiscount"); // Step-level
 * ```
 */
function createPipeline<
  Steps extends [PipelineStep<any, any, any>, ...PipelineStep<any, any, any>[]],
  ErrorT extends Error = DefaultErrorT<Steps>,
  PipelineName extends string = string
>(
  steps: [...Steps] &
    PipelineSteps<FirstInput<Steps>, LastOutput<Steps>, Steps>,
  options: PipelineOptions & { name: PipelineName }
): IPipeline<
  FirstInput<Steps>,
  LastOutput<Steps>,
  ErrorT,
  Steps,
  PipelineName
> {
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
    Steps,
    PipelineName
  >;

  /**
   *
   *  Adds a plugin to a specific step or to the entire pipeline
   *  based on the target name. The plugin type must match the target step type
   *  or the pipeline type.
   *
   * @param plugin : The plugin to be added.
   * @param target : The target step or pipeline to add the plugin to.
   * @returns void
   */
  function addPlugin(
    plugin:
      | PipelineStepPlugin<Steps>
      | PipelinePlugin<FirstInput<Steps>, Unwrap<LastOutput<Steps>>, ErrorT>,
    target: PipelineName | PluggableNames<Steps>[number]
  ): void {
    // Add to pipeline-level plugins
    if (pipeline.name === target) {
      pipeline.plugins.push(plugin);
      return;
    }

    // Add to step-level plugins
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
    target: PipelineName | PluggableNames<Steps>[number],
    pluginName: string
  ) {
    // Remove from pipeline-level plugins
    if (pipeline.name === target) {
      pipeline.plugins = pipeline.plugins.filter(
        (plugin) => plugin.name !== pluginName
      );
      return;
    }

    // Remove from step-level plugins
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

/**
 * Factory for creating Pipeline instances.
 *
 * @example
 * ```typescript
 * import { Pipeline, ProcessEngine } from "@fifo/convee";
 *
 * const step1 = ProcessEngine.create((n: number) => n * 2, { name: "Double" });
 * const step2 = ProcessEngine.create((n: number) => n + 10, { name: "AddTen" });
 *
 * const myPipeline = Pipeline.create(
 *   [step1, step2],
 *   { name: "MyPipeline" }
 * );
 *
 * const result = await myPipeline.run(5); // 20
 * ```
 */
export const Pipeline = {
  create: createPipeline,
};
