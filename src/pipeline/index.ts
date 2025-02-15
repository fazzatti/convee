import { MetadataHelper } from "../metadata/collector/index.ts";
import {
  DefaultErrorT,
  FirstInput,
  InnerPipelineConstructor,
  Pipeline as IPipeline,
  LastOutput,
  PipelineStep,
  PipelineSteps,
} from "./types.ts";
import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType, Modifier } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { ProcessEngine } from "../process-engine/index.ts";
import { ProcessEngineConstructor } from "../process-engine/types.ts";

// ─────────────────────────────────────────────────────────────
// Extended Pipeline class that extends ProcessEngine
// ─────────────────────────────────────────────────────────────

export class Pipeline<
    Input,
    Output,
    Steps extends readonly [
      PipelineStep<any, any, ErrorT>,
      ...PipelineStep<any, any, ErrorT>[]
    ],
    ErrorT extends Error
  >
  extends ProcessEngine<Input, Output, ErrorT>
  implements IPipeline<Input, Output, ErrorT>
{
  // The validated chain of inner steps.
  public readonly steps: PipelineSteps<Input, Output, Steps>;
  // Default belt plugins for the outer boundaries.
  public readonly name: string;

  // Private constructor forces creation via the static factory.
  // We call the base ProcessEngine constructor (if needed) with the id and plugins.
  private constructor(
    args: InnerPipelineConstructor<Input, Output, ErrorT>,
    steps: PipelineSteps<Input, Output, Steps>
  ) {
    // Call the base ProcessEngine constructor if it expects any arguments.
    super({ id: args.id, plugins: args.plugins } as ProcessEngineConstructor<
      Input,
      Output,
      ErrorT
    >);
    this.steps = steps;
    this.name = args.name || "Pipeline";
  }

  public override getType(): CoreProcessType {
    return CoreProcessType.PIPELINE;
  }

  // Static factory method that validates the chain of inner steps.
  public static create<
    Steps extends [
      PipelineStep<any, any, any>,
      ...PipelineStep<any, any, any>[]
    ],
    ErrorT extends Error = DefaultErrorT<Steps>
  >(
    config: InnerPipelineConstructor<
      FirstInput<Steps>,
      LastOutput<Steps>,
      ErrorT
    >,
    steps: Steps & PipelineSteps<FirstInput<Steps>, LastOutput<Steps>, Steps>
  ): IPipeline<FirstInput<Steps>, LastOutput<Steps>, ErrorT> {
    return new Pipeline<FirstInput<Steps>, LastOutput<Steps>, Steps, ErrorT>(
      config,
      steps as PipelineSteps<FirstInput<Steps>, LastOutput<Steps>, Steps>
    );
  }

  // Override the abstract process() method from ProcessEngine.
  // This method simply iterates over the fixed inner chain.
  protected async process(
    item: Input,
    metadataHelper: MetadataHelper
  ): Promise<Output> {
    let result: any = item;
    for (const step of this.steps) {
      if (typeof step === "function") {
        // For simple functions (modifier or transformer), simply call the function.
        result = await step(result, metadataHelper);
      } else if (typeof step === "object" && "execute" in step) {
        // Process engine step.
        const engine = step;
        if (engine.getType() === CoreProcessType.PROCESS_ENGINE) {
          result = await engine.execute(result);
        } else {
          throw new Error("Invalid process engine type");
        }
      } else {
        throw new Error("Invalid pipeline step");
      }
    }
    return result as Output;
  }
}
