import { PluginModifier, PluginTransformer } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { RequireAtLeastOne } from "../utils/types/require-at-least-one.ts";

// Base plugin interface
export type PluginBase = {
  readonly name: string;
};

// Pre-process plugin interface
export type BeltPluginInput<Input> = PluginBase & {
  processInput: PluginModifier<Input>;
};

// Post-process plugin interface
export type BeltPluginOutput<Output> = PluginBase & {
  processOutput: PluginModifier<Output>;
};

// Error-process plugin interface
export type BeltPluginError<Output, ErrorT extends Error> = PluginBase & {
  processError: PluginTransformer<
    ConveeError<ErrorT>,
    ConveeError<ErrorT> | Output
  >;
};

// Combined interface that includes all plugin types
export interface BeltPluginPartial<Input, Output, ErrorT extends Error>
  extends Partial<BeltPluginInput<Input>>,
    Partial<BeltPluginOutput<Output>>,
    Partial<BeltPluginError<Output, ErrorT>> {}

// Union type for any plugin type
export type BeltPlugin<Input, Output, ErrorT extends Error> = (PluginBase &
  BeltPluginPartial<Input, Output, ErrorT>) &
  (
    | BeltPluginInput<Input>
    | BeltPluginOutput<Output>
    | BeltPluginError<Output, ErrorT>
    | RequireAtLeastOne<{
        processInput?: PluginModifier<Input>;
        processOutput?: PluginModifier<Output>;
        processError?: PluginTransformer<
          ConveeError<ErrorT>,
          ConveeError<ErrorT> | Output
        >;
      }>
  );
