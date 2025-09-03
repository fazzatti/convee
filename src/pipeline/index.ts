// deno-lint-ignore-file no-explicit-any
import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType } from "../core/types.ts";
import {
  DefaultErrorT,
  FirstInput,
  Pipeline as IPipeline,
  LastOutput,
  PipelineOptions,
  PipelineStep,
  PipelineSteps,
} from "./types.ts";
import { ProcessEngine } from "../process-engine/index.ts";
import { RunOptions, TransformerAsync } from "../index.ts";
import { Unwrap } from "../utils/types/unwrap.ts";

function createPipeline<
  Steps extends [PipelineStep<any, any, any>, ...PipelineStep<any, any, any>[]],
  ErrorT extends Error = DefaultErrorT<Steps>
>(
  steps: Steps & PipelineSteps<FirstInput<Steps>, LastOutput<Steps>, Steps>,
  options?: PipelineOptions<FirstInput<Steps>, LastOutput<Steps>, ErrorT>
): IPipeline<FirstInput<Steps>, LastOutput<Steps>, ErrorT, Steps> {
  let customizedSteps: typeof steps | undefined = undefined;

  const pipeline = {
    ...ProcessEngine.create(
      executePipeline as TransformerAsync<FirstInput<Steps>, LastOutput<Steps>>,
      {
        ...options,

        plugins:
          (options?.plugins as BeltPlugin<
            FirstInput<Steps>,
            LastOutput<Steps>,
            ErrorT
          >[]) ||
          ([] as BeltPlugin<FirstInput<Steps>, LastOutput<Steps>, ErrorT>[]),
      }
    ),
    type: CoreProcessType.PIPELINE,
    steps,
    runCustom: undefined as any,
  };

  pipeline.runCustom = wrapRunWithCustomSteps();
  return pipeline as IPipeline<
    FirstInput<Steps>,
    LastOutput<Steps>,
    ErrorT,
    Steps
  >;

  async function executePipeline(
    input: FirstInput<Steps>
  ): Promise<LastOutput<Steps>> {
    const currentSteps = customizedSteps ? customizedSteps : steps;

    let result: unknown = input;
    for (const step of currentSteps) {
      if (typeof step === "function") {
        // For simple functions (modifier or transformer), simply call the function.
        result = await step(result);
      } else if (typeof step === "object" && "run" in step) {
        // Process engine step.
        if (
          step.type === CoreProcessType.PROCESS_ENGINE ||
          step.type === CoreProcessType.PIPELINE
        ) {
          result = await step.run(result);
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
