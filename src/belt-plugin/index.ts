import { Modifier, Transformer } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { RequireAtLeastOne } from "../utils/types/require-at-least-one.ts";
import {
  BeltPlugin,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "./types.ts";

// Overload for a pure input plugin:
function create<I, E extends Error = Error>(
  modifiers: { processInput: Modifier<I> },
  options?: { name: string }
): BeltPluginInput<I>;
// Overload for a pure output plugin:
function create<I, O, E extends Error = Error>(
  modifiers: { processOutput: Modifier<O> },
  options?: { name: string }
): BeltPluginOutput<O>;
// Overload for a pure error plugin:
function create<I, O, E extends Error = Error>(
  modifiers: { processError: Transformer<ConveeError<E>, ConveeError<E> | O> },
  options?: { name: string }
): BeltPluginError<O, E>;
// General overload:
function create<I, O, E extends Error = Error>(
  modifiers: RequireAtLeastOne<{
    processInput?: Modifier<I>;
    processOutput?: Modifier<O>;
    processError?: Transformer<ConveeError<E>, ConveeError<E> | O>;
  }>,
  options?: { name: string }
): BeltPlugin<I, O, E> {
  return {
    name: options?.name || "BeltPlugin",
    ...modifiers,
  };
}

export const Plugin = { create };
