import { Modifier, Transformer } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { RequireAtLeastOne } from "../utils/types/require-at-least-one.ts";
import {
  BeltPlugin,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
  PluginBase,
} from "./types.ts";

type Empty = Record<PropertyKey, never>;
type NotEmptyObject<T extends object> = keyof T extends never ? never : T;

type ComposeBeltPlugin<I, O, E extends Error, M> = PluginBase &
  (M extends { processInput: Modifier<I> }
    ? { processInput: Modifier<I> }
    : Empty) &
  (M extends { processOutput: Modifier<O> }
    ? { processOutput: Modifier<O> }
    : Empty) &
  (M extends { processError: Transformer<ConveeError<E>, ConveeError<E> | O> }
    ? { processError: Transformer<ConveeError<E>, ConveeError<E> | O> }
    : Empty);

type ExtractInput<M> = M extends { processInput: Modifier<infer I> }
  ? I
  : never;
type ExtractOutput<M> = M extends { processOutput: Modifier<infer O> }
  ? O
  : never;
type ExtractError<M> = M extends {
  processError: Transformer<ConveeError<infer E>, ConveeError<infer E> | any>;
}
  ? E
  : Error;

function create<
  M extends NotEmptyObject<{
    processInput?: Modifier<any>;
    processOutput?: Modifier<any>;
    processError?: Transformer<ConveeError<any>, any>;
  }>
>(
  modifiers: M,
  options?: { name: string }
): ComposeBeltPlugin<ExtractInput<M>, ExtractOutput<M>, ExtractError<M>, M> {
  return {
    name: options?.name || "BeltPlugin",
    ...modifiers,
  } as ComposeBeltPlugin<ExtractInput<M>, ExtractOutput<M>, ExtractError<M>, M>;
}
// Overload for a pure input plugin:
// function create<I, E extends Error = Error>(
//   modifiers: {
//     processInput: Modifier<I>;
//     processOutput?: never;
//     processError?: never;
//   },
//   options?: { name: string }
// ): BeltPluginInput<I>;
// // Overload for a pure output plugin:
// function create<I, O, E extends Error = Error>(
//   modifiers: {
//     processOutput: Modifier<O>;
//     processInput?: never;
//     processError?: never;
//   },
//   options?: { name: string }
// ): BeltPluginOutput<O>;
// // Overload for a pure error plugin:
// function create<I, O, E extends Error = Error>(
//   modifiers: {
//     processError: Transformer<ConveeError<E>, ConveeError<E> | O>;
//     processInput?: never;
//     processOutput?: never;
//   },
//   options?: { name: string }
// ): BeltPluginError<O, E>;
// // General overload:
// function create<I, O, E extends Error = Error>(
//   modifiers: RequireAtLeastOne<{
//     processInput?: Modifier<I>;
//     processOutput?: Modifier<O>;
//     processError?: Transformer<ConveeError<E>, ConveeError<E> | O>;
//   }>,
//   options?: { name: string }
// ): BeltPlugin<I, O, E> {
//   return {
//     name: options?.name || "BeltPlugin",
//     ...modifiers,
//   };
// }

export const Plugin = { create };
