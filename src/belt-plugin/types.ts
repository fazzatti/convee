import { IModifier } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";

// Base plugin interface
interface IPluginBase {
  readonly name: string;
}

// Pre-process plugin interface
export interface IBeltPluginInput<Input> extends IPluginBase {
  processInput: IModifier<Input>;
}

// Post-process plugin interface
export interface IBeltPluginOutput<Output> extends IPluginBase {
  processOutput: IModifier<Output>;
}

// Error-process plugin interface
export interface IBeltPluginError<ErrorT extends Error> extends IPluginBase {
  processError: IModifier<ConveeError<ErrorT>>;
}

// Combined interface that includes all plugin types
export interface IBeltPluginPartial<Input, Output, ErrorT extends Error>
  extends Partial<IBeltPluginInput<Input>>,
    Partial<IBeltPluginOutput<Output>>,
    Partial<IBeltPluginError<ErrorT>> {}

// Union type for any plugin type
export type IBeltPlugin<Input, Output, ErrorT extends Error> =
  | IBeltPluginInput<Input>
  | IBeltPluginOutput<Output>
  | IBeltPluginError<ErrorT>
  | IBeltPluginPartial<Input, Output, ErrorT>;
