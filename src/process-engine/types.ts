import { BeltPlugin } from "../belt-plugin/types.ts";
import { CoreProcessType, EngineMetadata } from "../core/types.ts";

export type ProcessEngine<Input, Output, ErrorT extends Error> = {
  name: string;
  id: string;
  type: CoreProcessType;
  plugins: BeltPlugin<Input, Output, ErrorT>[];
  run: (
    item: Input,
    options?: RunOptions<Input, Output, ErrorT>
  ) => Promise<Output>;
  addPlugin: (plugin: BeltPlugin<Input, Output, ErrorT>) => void;
  removePlugin: (pluginName: string) => void;
};

export type ProcessEngineOptions<I, O, E extends Error> = {
  name?: string;
  id?: string;
  plugins?: BeltPlugin<I, O, E>[];
};

export interface ProcessEngineMetadata extends EngineMetadata {
  source: string;
  itemId: string;
  type: CoreProcessType;
}

export interface RunOptions<Input, Output, ErrorT extends Error> {
  existingItemId?: string;
  singleUsePlugins?: BeltPlugin<Input, Output, ErrorT>[];
}
