import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType, EngineMetadata } from "../core/types.ts";

export type ProcessEngine<Input, Output, ErrorT extends Error> = {
  name: string;
  id: string;
  execute: (
    item: Input,
    options?: ExecuteOptions<Input, Output, ErrorT>
  ) => Promise<Output>;
  getType: () => CoreProcessType;
};

export type ProcessEngineConstructor<Input, Output, ErrorT extends Error> = {
  // name?: string;
  plugins?: BeltPlugin<Input, Output, ErrorT>[];
  id?: string;
};

export type ProcessCore<Input, Output> = (item: Input) => Promise<Output>;

export interface ProcessEngineMetadata extends EngineMetadata {
  source: string;
  itemId: string;
  type: CoreProcessType;
}

export interface ExecuteOptions<Input, Output, ErrorT extends Error> {
  existingItemId?: string;
  singleUsePlugins?: BeltPlugin<Input, Output, ErrorT>[];
}
