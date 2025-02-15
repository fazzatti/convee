import { Modifier, Transformer } from "../core/types.ts";
import { ProcessEngine } from "../process-engine/index.ts";
import {
  ProcessEngine as IProcessEngine,
  ProcessEngineConstructor,
} from "../process-engine/types.ts";

export type Pipeline<Input, Output, ErrorT extends Error> = IProcessEngine<
  Input,
  Output,
  ErrorT
>;

export type InnerPipelineConstructor<
  Input,
  Output,
  ErrorT extends Error
> = ProcessEngineConstructor<Input, Output, ErrorT> & {
  readonly name?: string;
};

type StepError<T> = T extends ProcessEngine<any, any, infer E> ? E : never;

export type PipelineErrors<Steps extends readonly any[]> = Exclude<
  { [K in keyof Steps]: StepError<Steps[K]> }[number],
  never
>;

export type DefaultErrorT<Steps extends readonly any[]> =
  PipelineErrors<Steps> extends never ? Error : PipelineErrors<Steps>;

// A PipelineStep is either a Modifier, a Transformer, or a ProcessEngine.
export type PipelineStep<Input, Output, ErrorT extends Error> =
  | Modifier<Input>
  | Transformer<Input, Output>
  | ProcessEngine<Input, Output, ErrorT>;

// StepIO extracts the input/output pair from a PipelineStep.
type StepIO<T> = T extends Modifier<infer U>
  ? [U, U]
  : T extends Transformer<infer I, infer O>
  ? [I, O]
  : T extends ProcessEngine<infer I, infer O, infer E>
  ? [I, O]
  : never;

// CheckChain recursively ensures that each adjacent pair is chainable.
// If there's more than one element, we check that the output of one is assignable to the input of the next.
// If there is only one element, we simply return the tuple.
export type CheckChain<Steps extends readonly unknown[]> =
  Steps extends readonly [infer First, infer Second, ...infer Rest]
    ? StepIO<First> extends [infer _I, infer Out]
      ? StepIO<Second> extends [infer In2, infer _O2]
        ? [Out] extends [In2]
          ? CheckChain<readonly [Second, ...Rest]>
          : never
        : never
      : never
    : Steps;

export type IsValidChain<Steps extends readonly unknown[]> =
  CheckChain<Steps> extends never ? never : Steps;

export type FirstInput<Steps extends readonly PipelineStep<any, any, any>[]> =
  Steps extends readonly [PipelineStep<infer I, any, any>, ...unknown[]]
    ? I
    : never;

export type LastOutput<Steps extends readonly PipelineStep<any, any, any>[]> =
  Steps extends readonly [...unknown[], PipelineStep<any, infer O, any>]
    ? O
    : never;

export type PipelineSteps<
  Input,
  Output,
  Steps extends readonly [
    PipelineStep<any, any, any>,
    ...PipelineStep<any, any, any>[]
  ]
> = [FirstInput<Steps>, LastOutput<Steps>] extends [Input, Output]
  ? IsValidChain<Steps>
  : never;
