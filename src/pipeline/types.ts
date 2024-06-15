import { Modifier, Transformer } from "../core/types";
import {
  IProcessEngine,
  IProcessEngineConstructor,
} from "../process-engine/types";

export type PipelineStep<Input, Output> =
  | Modifier<Input & Output>
  | Transformer<Input, Output>
  | IProcessEngine<Input, Output, any>;

const modifNumber = (async (item: number) => item + 1) as Modifier<number>; // Modifier<number>
const mmodifNumberPlugin = modifNumber as PipelineStep<number, number>;

const transNumberString = (async (item: number) =>
  item.toString()) as Transformer<number, string>; // Transformer<number, string>
const transNumberStringPlugin = transNumberString as PipelineStep<
  number,
  string
>;

const transStringToNumber = (async (item: string) =>
  Number(item)) as Transformer<string, number>; // Transformer<string, number>

const processStringString = {
  name: "exampleEngine",
  id: "1",
  execute: async (item: string) => item + "!",
} as IProcessEngine<string, string, any>;
const processStringStringPlugin = processStringString as PipelineStep<
  string,
  string
>;

// export interface IPipelineConstructor<Input, Output, ErrorT extends Error>
//   extends IProcessEngineConstructor<Input, Output, ErrorT> {
//   steps: PipelinePlugin<any, any>[];
// }

// type NextStep<Input, LastStep> =
//   | (LastStep extends PipelinePlugin<infer Input, infer Output>
//       ? PipelinePlugin<Output, any>
//       : never)
//   | (LastStep extends null ? PipelinePlugin<Input, any> : never);

// // type AddStep = (
// //   nextStep: NextStep<Input, StepsArray>
// // ) => void;

// type LastStep<Input, Step> = Step extends null
//   ? PipelinePlugin<Input, any>
//   : Step extends PipelinePlugin<infer Input, infer Output>
//   ? PipelinePlugin<Output, any>
//   : never;

// const steps: PipelinePlugin<any, any>[] = [];
// let lastStep;
// const addStep = (
//   nextStep: NextStep<number, LastStep<number, typeof lastStep>>
// ): void => {
//   steps.push(nextStep);
//   lastStep = nextStep;
// };

// addStep(modifNumber);
// // addStep(transStringToNumber);

// // function asSinglePlugin<Input, Output>(
// //   plugins: PluginsSingle<Input, Output>
// // ): PluginsSingle<Input, Output> {
// //   return plugins;
// // }
// type PluginsSingle<Input, Output> = readonly [PipelinePlugin<Input, Output>];

// type PluginsPair<Input, Output, FirstItem> = FirstItem extends PipelinePlugin<
//   Input,
//   infer InnerOutput
// >
//   ? readonly [
//       PipelinePlugin<Input, InnerOutput>,
//       PipelinePlugin<InnerOutput, Output>
//     ]
//   : never;

// type MultiPlugin<Input, Output, FirstItem> = FirstItem extends PipelinePlugin<
//   Input,
//   infer InnerOutput
//   >
//   ? readonly [
//       PipelinePlugin<Input, InnerOutput>,
//       ...MultiPlugin<InnerOutput, Output, any>
//     ]

// const single:PluginsPair<number,string, typeof modifNumber> = [modifNumber, transNumberString];

// //asSinglePlugin([modifNumber, modifNumber]);
// const other = single as Plugins<number, number>;

// // type PluginsPair<Input, Output, Array> = Array extends readonly [
// //   PipelinePlugin<Input, infer InnerOutput>,
// //   infer Second
// // ]
// //   ? Second extends PipelinePlugin<InnerOutput, Output>
// //     ? readonly [
// //         PipelinePlugin<Input, InnerOutput>,
// //         PipelinePlugin<InnerOutput, Output>
// //       ]
// //     : never
// //   : never;

// type PluginsSeveral<Input, Output, Array> = Array extends readonly [
//   PipelinePlugin<Input, infer InnerOutput>,
//   ...infer Rest
// ]
//   ? Rest extends PluginsSeveral<InnerOutput, Output, Rest>
//     ? PluginsSeveral<Input, Output, Array>
//     : never
//   : never;

// type PluginsArray<Input, Output, Array> =
//   | PluginsPair<Input, Output, Array>
//   | PluginsSeveral<Input, Output, Array>
//   | PluginsSingle<Input, Output>;

// // type PluginsSeveral<Input, Output, Array> = Array extends [
// //   PipelinePlugin<Input, infer InnerOutput>,
// //   ...infer Rest
// // ]
// //   ? Rest extends PluginsSeveral<InnerOutput, Output, Rest>
// //     ? true
// //     : Array extends PluginsPair<Input, Output, Array>
// //     ? true
// //     : never
// //   : Array extends PluginsSingle<Input, Output>
// //   ? true
// //   : never;

// // type A<Input, Output, arrayP> = arrayP extends [infer First, ...infer Rest]
// //   ? First extends PipelinePlugin<Input, infer InnerOutput>
// //     ? Rest extends A<InnerOutput, Output, Rest>
// //       ? true
// //       : never
// //     : never
// //   : arrayP extends [infer First, infer Second]
// //   ? First extends PipelinePlugin<Input, infer InnerOutput>
// //     ? Second extends PipelinePlugin<InnerOutput, Output>
// //       ? true
// //       : never
// //     : arrayP extends [PipelinePlugin<Input, Output>]
// //     ? true
// //     : never
// //   : never;

// const arrayP = [
//   // modifNumber,
//   transNumberString,
//   // processStringString,
//   // modifNumber,
// ];

// const a = arrayP as PluginsArray<number, number, typeof arrayP>;

// // type input = number;
// // type output = string;

// // const modifNumber = (async (item: number) => item + 1) as Modifier<number>; // Modifier<number>
// // const mmodifNumberPlugin = modifNumber as Plugin<number, number>;

// // const transNumberString = (async (item: number) =>
// //   item.toString()) as Transformer<number, string>; // Transformer<number, string>
// // const transNumberStringPlugin = transNumberString as Plugin<number, string>;

// // const transStringToNumber = (async (item: string) =>
// //   Number(item)) as Transformer<string, number>; // Transformer<string, number>

// // const processStringString = {
// //   name: "exampleEngine",
// //   id: "1",
// //   execute: async (item: string) => item + "!",
// // } as IProcessEngine<string, string, any>;
// // const processStringStringPlugin = processStringString as Plugin<string, string>;

// // type Pair<Input, Output, T> = T extends [
// //     Plugin<Input, infer Next>,
// //     Plugin< Next, Output>
// // ] | [Plugin<Input,Output>]

// // type PluginsPair<A extends readonly any[], Input, Output> =

// // type PluginsSingle<Input, Output> = [Plugin<Input, Output>];

// // // type PluginsPair<Input, Output> = Plugin<Input, Output>[] extends PluginsSingle<Input, Output>
// // //   ? true
// // //   : Plugin<Input, Output>[] extends [
// // //       Plugin<Input, infer NextInput>,
// // //       infer NextPlugin
// // //     ]
// // //   ? NextPlugin extends Plugin<NextInput, Output>
// // //     ? true
// // //     : never
// // //   : never;

// // // type pipeType<Input, Output> = {
// // //   a: input;
// // //   b: output;
// // // };

// // //Não da pra usar o extends. Ele depende de um array existir

// // // type PluginsPair<Input, Output, FirstPlugin> = FirstPlugin extends Plugin<
// // //   Input,
// // //   infer InnerInput
// // // >
// // //   ? [FirstPlugin, Plugin<InnerInput, Output>]
// // //   : never;

// // type Plugins<Input, Output, PluginsArray> = PluginsArray extends PluginsSingle<
// //     Input,
// //     Output
// // >
// //     ? PluginsSingle<Input, Output>
// //     : PluginsArray extends [
// //         Plugin<Input, infer InnerInput>,
// //         ...infer OtherPlugins
// //     ]
// //     ? OtherPlugins extends Plugins<InnerInput, Output, OtherPlugins>
// //     ? true
// //     : never

// // // type joined<Input, Output> = PluginsPair<Input, Output, [Pl]>;

// // const bundleArray = <Input, Output>(
// //   plugins: unknown[]
// // ): Plugins<Input, Output, typeof plugins> => {
// //   return plugins as Plugins<Input, Output, typeof plugins>;
// // };

// // const duoArray = bundleArray<number, number>([
// //   modifNumber,
// //   //   modifNumber,
// //   //   transNumberString,
// //   //   transNumberString,
// //   //   processStringString,
// //   //   transStringToNumber,
// //   //   modifNumber,
// // ]);

// // const B = duoArray as Plugins<number, number, typeof duoArray>;

// // // type Plugins<Input, Output> = Plugin<Input, Output>[] extends PluginsPair<
// // //   Input,
// // //   Output
// // // >
// // //   ? true
// // //   : Plugin<Input, Output>[] extends [
// // //       PluginsPair<Input, infer NextInput>,
// // //       ...infer NextPlugins
// // //     ]
// // //   ? NextPlugins extends PluginsPair<NextInput, Output>
// // //     ? true
// // //     : never
// // //   : never;

// // // //   type Plugins<T>  =T extends PluginsMultiple

// // // const soloArray: PluginsPair<number, string> = [transNumberString];

// // // // const duoArray: PluginsPair<number, number> = [modifNumber, modifNumber];

// // // const array: Plugins<input, output> = [
// // //   modifNumber,
// // //   transNumberString,
// // //   processStringString,
// // // ];

// // // console.log(array);

// type TupleToArgs<T extends any[]> =
//   Extract<[[], ...{ [I in keyof T]: [arg: T[I]] }], Record<keyof T, any>>;
// type TupleToChain<T extends any[]> =
//   { [I in keyof T]: (...args: Extract<TupleToArgs<T>[I], any[]>) => T[I] };
// type Last<T extends any[]> =
//   T extends [...infer _, infer L] ? L : never;

// function callChain<T extends any[]>(fns: [...TupleToChain<T>]): Last<T>
// function callChain(funcs: ((...args: any) => any)[]) {
//   const [f0, ...fs] = funcs;
//   return fs.reduce((a, f) => f(a), f0());
// }

// const abc = [modifNumber, modifNumber, transNumberString, transNumberString]

// const result = callChain(abc);

const testObj = {
  1: modifNumber,
  2: modifNumber,
  3: transNumberString,
  4: transNumberString,
};

type Single<Input, Output> = [PipelineStep<Input, Output>];
type Double<Input, Output, Mid> = [
  PipelineStep<Input, Mid>,
  PipelineStep<Mid, Output>
];
// type Triple<Input, Output, Mid1, Mid2> = readonly [PipelineStep<Input, Mid1>, PipelineStep<Mid1, Mid2>, PipelineStep<Mid2, Output>];
type AnySizeChained<Input, Output> = readonly [
  PipelineStep<Input, any>,
  ...PipelineStep<any, any>[],
  PipelineStep<any, Output>
];

type ReducedArray<
  Input,
  Output,
  Array extends readonly [any]
> = Array extends Single<Input, Output>
  ? Single<Input, Output>
  : Array extends Double<Input, Output, infer Mid>
  ? Double<Input, Output, Mid>
  : Array extends readonly [
      PipelineStep<Input, infer Next>,
      ...infer Rest extends readonly [any]
    ]
  ? Rest extends ReducedArray<Next, Output, Rest>
    ? AnySizeChained<Input, Output>
    : never
  : never;

type Steps<Input, Output> = Single<Input, Output>;

// const arr: readonly [any] = [ transNumberString] ;
// const abc: ReducedArray<number, number, typeof arr> = arr;

const getFirstStep = <A extends any[]>(array: A) => {
  return array[0];
};

const getLasStep = (array: PipelineStep<any, any>[]) => {
  return array[array.length - 1];
};

const getNthStep = (array: PipelineStep<any, any>[], n: number) => {
  return array[n];
};

type FirstStep = ReturnType<typeof getFirstStep> extends PipelineStep<
  infer Input,
  infer Output
>
  ? PipelineStep<Input, Output>
  : never;

const firstStep = getFirstStep<typeof abc>(abc) as FirstStep;

type StepsObject<Input, Output, Object> = Object extends {
  [key: string]: PipelineStep<infer InnerInput, infer InnerOutput>;
}
  ? Objec
  : never;

const test = testObj as StepsObject<number, string, typeof testObj>;

type TestArray<Input, Output, Array> = Array extends [
  PipelineStep<Input, infer MidInput>,
  ...infer Mid,
  PipelineStep<infer MidOutput, Output>
]
  ? Mid extends TestArray<MidInput, MidOutput, Mid>
    ? TestArray<Input, Output, Array>
    : Array extends Double<Input, Output, infer Mid>
    ? TestArray<Input, Output, Array>
    : Array extends Single<Input, Output>
    ? TestArray<Input, Output, Array>
    : never
  : Array extends Double<Input, Output, infer Mid>
  ? TestArray<Input, Output, Array>
  : Array extends Single<Input, Output>
  ? TestArray<Input, Output, Array>
  : never;

const arr = [
  mmodifNumberPlugin,
  // mmodifNumberPlugin,
  // mmodifNumberPlugin,
  // mmodifNumberPlugin,
  // modifNumber,
  // transNumberString,
];
const abc: TestArray<number, string, typeof arr> = arr;
