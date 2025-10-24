// deno-lint-ignore-file no-explicit-any
import { Modifier, Transformer, TransformerSync } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { ModifierAsync, ModifierSync } from "../index.ts";
import { RequireAtLeastOne } from "../utils/types/require-at-least-one.ts";
import { Unwrap } from "../utils/types/unwrap.ts";
import {
  BeltPlugin,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
  PluginBase,
} from "./types.ts";

type Empty = Record<PropertyKey, never>;
type NotEmptyObject<T extends object> = keyof T extends never ? never : T;

// type ComposeBeltPlugin<I, O, E extends Error, M> = PluginBase &
//   (M extends { processInput: Modifier<I> }
//     ? { processInput: Modifier<I> }
//     : Empty) &
//   (M extends { processOutput: Modifier<O> }
//     ? { processOutput: Modifier<O> }
//     : Empty) &
//   (M extends { processError: Transformer<ConveeError<E>, ConveeError<E> | O> }
//     ? { processError: Transformer<ConveeError<E>, ConveeError<E> | O> }
//     : Empty);

// type ExtractInput<M> = M extends { processInput: ModifierSync<infer I> }
//   ? I
//   : M extends { processInput: ModifierAsync<infer I> }
//   ? I
//   : never;
// type ExtractOutput<M> = M extends { processOutput: ModifierSync<infer O> }
//   ? O
//   : M extends { processOutput: ModifierAsync<infer O> }
//   ? O
//   : never;

// type ExtractError<M> = M extends {
//   processError: TransformerSync<ConveeError<infer E>, any>;
// }
//   ? E
//   : M extends {
//       processError: Transformer<ConveeError<infer E>, any>;
//     }
//   ? E
//   : Error;

// function create<
//   M extends NotEmptyObject<{
//     processInput?: Modifier<any>;
//     processOutput?: Modifier<any>;
//     processError?: Transformer<ConveeError<any>, any>;
//   }>
// >(
//   modifiers: M,
//   options?: { name: string }
// ): ComposeBeltPlugin<ExtractInput<M>, ExtractOutput<M>, ExtractError<M>, M> {
//   return {
//     name: options?.name || "BeltPlugin",
//     ...modifiers,
//   } as ComposeBeltPlugin<ExtractInput<M>, ExtractOutput<M>, ExtractError<M>, M>;
// }

// Overload for a pure input plugin:

// Input only
function create<I>(methods: {
  name: string;
  processInput: Modifier<I>;
}): BeltPluginInput<Unwrap<I>>;

// Output only
function create<O>(methods: {
  name: string;
  processOutput: Modifier<O>;
}): BeltPluginOutput<Unwrap<O>>;

// Error only
function create<O, E extends Error>(methods: {
  name: string;
  processError: Transformer<ConveeError<E>, ConveeError<E> | O>;
}): BeltPluginError<Unwrap<O>, E>;

// All three (or any combination)
function create<I, O, E extends Error>(methods: {
  name: string;
  processInput?: Modifier<I>;
  processOutput?: Modifier<O>;
  processError?: Transformer<ConveeError<E>, ConveeError<E> | O>;
}): BeltPlugin<Unwrap<I>, Unwrap<O>, E>;

// Implementation
function create(methods: any): any {
  return methods;
}

export const Plugin = { create };
