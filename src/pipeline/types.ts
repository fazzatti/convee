// deno-lint-ignore-file no-explicit-any
import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType } from "../core/types.ts";
import {
  ModifierAsync,
  ModifierSync,
  TransformerAsync,
  TransformerSync,
} from "../index.ts";
import { RunOptions } from "../process-engine/types.ts";
import {
  ProcessEngine as IProcessEngine,
  ProcessEngine,
} from "../process-engine/types.ts";
import { Unwrap } from "../utils/types/unwrap.ts";

export type Pipeline<
  I, // Input
  O, // Output
  E extends Error, // Error type
  S extends readonly PipelineStep<any, any, any>[], // Steps
  N extends IProcessEngine<I, O, E>["name"] // Name
> = {
  name: N;
  id: IProcessEngine<I, O, E>["id"];
  run: IProcessEngine<I, O, E>["run"];
  type: CoreProcessType.PIPELINE;
  steps: S;
  pluggableSteps: PluggableNames<S> | N;
  addPlugin: (
    plugin: PipelineStepPlugin<S> | PipelinePlugin<I, O, E>,
    target: N | PluggableNames<S>[number]
  ) => void;
  removePlugin: (
    target: N | PluggableNames<S>[number],
    pluginName: string
  ) => void;
  runCustom: (
    input: I,
    customSteps: S,
    options?: RunOptions<I, O, E>
  ) => Promise<O>;
};

export type PipelineOptions = {
  name: string;
  id?: string;
};

type IsStringLiteral<S> = string extends S ? never : S;

// Only include steps with literal name strings
type NamedNamesTuple<Arr extends readonly any[]> = Arr extends [
  infer Head,
  ...infer Tail
]
  ? Head extends { name: infer N extends string }
    ? IsStringLiteral<N> extends never
      ? NamedNamesTuple<Tail> // Skip if name is a general string type
      : [N, ...NamedNamesTuple<Tail>] // Include if name is a literal
    : NamedNamesTuple<Tail> // Skip steps without a name
  : [];

export type PluggableNames<S extends readonly PipelineStep<any, any, any>[]> =
  NamedNamesTuple<S>;

//========================================================
// ====== Plugin Belt inference types and utilities ======
//========================================================

export type PipelineStepPlugin<Steps extends readonly unknown[]> =
  InnerPluginsUnion<Steps>;

// Per-step plugin type (same as you already have)
export type PluginForStep<S> = S extends PipelineStep<infer I, infer O, infer E>
  ? BeltPlugin<Unwrap<I>, Unwrap<O>, E extends Error ? E : Error>
  : never;

// Union of plugins for every step (Plugin1 | Plugin2 | Plugin3)
export type InnerPluginsUnion<Steps extends readonly unknown[]> = PluginForStep<
  Steps[number]
>;

export type PipelinePlugin<I, O, E extends Error> = BeltPlugin<I, O, E>;

//
//========================================================
// === Pipeline chaining inference types and utilities ===
//========================================================
type StepError<T> = T extends ProcessEngine<any, any, infer E> ? E : never;

export type PipelineErrors<Steps extends readonly any[]> = Exclude<
  { [K in keyof Steps]: StepError<Steps[K]> }[number],
  never
>;

export type DefaultErrorT<Steps extends readonly any[]> =
  PipelineErrors<Steps> extends never ? Error : PipelineErrors<Steps>;

// A PipelineStep is either a Modifier, a Transformer, or a ProcessEngine.
export type PipelineStep<Input, Output, ErrorT extends Error> =
  | ModifierSync<Input & Output>
  | ModifierAsync<Input & Output>
  | TransformerSync<Input, Output>
  | TransformerAsync<Input, Output>
  | ProcessEngine<Input, Output, ErrorT>;

// StepIO extracts the input/output pair from a PipelineStep.
export type StepIO<T> = T extends ModifierSync<infer U>
  ? [U, U]
  : T extends ModifierAsync<infer U>
  ? [U, U]
  : T extends TransformerSync<infer I, infer O>
  ? [I, O]
  : T extends TransformerAsync<infer I, infer O>
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
        ? [Unwrap<Out>] extends [In2]
          ? CheckChain<readonly [Second, ...Rest]>
          : never
        : never
      : never
    : Steps;

export type IsValidChain<Steps extends readonly unknown[]> =
  CheckChain<Steps> extends never ? never : Steps;

export type FirstInput<Steps extends readonly PipelineStep<any, any, any>[]> =
  Steps extends readonly [PipelineStep<infer I, any, any>, ...unknown[]]
    ? Unwrap<I>
    : never;

export type LastOutput<Steps extends readonly PipelineStep<any, any, any>[]> =
  Steps extends readonly [...unknown[], PipelineStep<any, infer O, any>]
    ? Unwrap<O>
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
