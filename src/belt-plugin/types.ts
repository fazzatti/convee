import { Modifier, Transformer } from "../core/types.ts";
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
export type BeltPluginError<Output, ErrorT extends Error> = PluginBase & {
  processError: Transformer<ConveeError<ErrorT>, ConveeError<ErrorT> | Output>;
};

// Combined interface that includes all plugin types
export interface BeltPluginPartial<Input, Output, ErrorT extends Error>
  extends Partial<BeltPluginInput<Input>>,
    Partial<BeltPluginOutput<Output>>,
    Partial<BeltPluginError<Output, ErrorT>> {}

// Union type for any plugin type
export type BeltPlugin<Input, Output, ErrorT extends Error> =
  | BeltPluginInput<Input>
  | BeltPluginOutput<Output>
  | BeltPluginError<Output, ErrorT>
  | BeltPluginPartial<Input, Output, ErrorT>;
