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
import { ProcessEngineOptions } from "../process-engine/types.ts";

function createPipeline<
  Steps extends [PipelineStep<any, any, any>, ...PipelineStep<any, any, any>[]],
  ErrorT extends Error = DefaultErrorT<Steps>
>(
  steps: Steps & PipelineSteps<FirstInput<Steps>, LastOutput<Steps>, Steps>,
  options?: PipelineOptions<FirstInput<Steps>, LastOutput<Steps>, ErrorT>
): IPipeline<FirstInput<Steps>, LastOutput<Steps>, ErrorT> {
  return {
    ...ProcessEngine.create(executePipeline, {
      ...options,

      plugins: options?.plugins as BeltPlugin<
        FirstInput<Steps>,
        Promise<LastOutput<Steps>>,
        ErrorT
      >[],
    }),
    type: CoreProcessType.PIPELINE,
    steps,
  };

  async function executePipeline(
    input: FirstInput<Steps>
  ): Promise<LastOutput<Steps>> {
    let result: any = input;
    for (const step of steps) {
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
    return await result; //as LastOutput<Steps>;
  }
}

export const Pipeline = {
  create: createPipeline,
};
