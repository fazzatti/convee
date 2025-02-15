import { Modifier } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";

// Base plugin interface
type PluginBase = {
  readonly name: string;
};

// Pre-process plugin interface
export type BeltPluginInput<Input> = PluginBase & {
  processInput: Modifier<Input>;
};

// Post-process plugin interface
export type BeltPluginOutput<Output> = PluginBase & {
  processOutput: Modifier<Output>;
};

// Error-process plugin interface
export type BeltPluginError<ErrorT extends Error> = PluginBase & {
  processError: Modifier<ConveeError<ErrorT>>;
};

// Combined interface that includes all plugin types
export interface BeltPluginPartial<Input, Output, ErrorT extends Error>
  extends Partial<BeltPluginInput<Input>>,
    Partial<BeltPluginOutput<Output>>,
    Partial<BeltPluginError<ErrorT>> {}

// Union type for any plugin type
export type BeltPlugin<Input, Output, ErrorT extends Error> =
  | BeltPluginInput<Input>
  | BeltPluginOutput<Output>
  | BeltPluginError<ErrorT>
  | BeltPluginPartial<Input, Output, ErrorT>;
