import { ProcessEngine } from "../process-engine";
import { IProcessEngineConstructor } from "../process-engine/types";
import { PipelineStep } from "./types";

export class Pipeline<
  Input,
  Output,
  ErrorT extends Error
> extends ProcessEngine<Input, Output, ErrorT> {
  private pipelineSteps: PipelineStep<any, any>[] = [];

  constructor(
    args?: IProcessEngineConstructor<Input, Output, ErrorT>,
    test: PipelineStep<any, any>[]
  ) {
    super(args);

    const steps = test;

    for (const step of steps) {
      this.addStep(step);
    }
  }

  private addStep(step: PipelineStep<any, any>): void {
    if (this.pipelineSteps.length === 0) {
    }
  }

  private addFirstStep = (step: PipelineStep<Input, any>): void => {
    if (this.pipelineSteps.length > 0) {
      throw new Error("First step already added");
    }

    this.pipelineSteps.push(step);
  };

  private addLastStep = (step: PipelineStep<any, Output>): void => {
    if (this.pipelineSteps.length === 0) {
      throw new Error("First step not added");
    }

    const lastStep = this.pipelineSteps[this.pipelineSteps.length - 1];
  };
}
