import { IBeltPlugin } from "../belt-plugin/types.ts";
import { EngineMetadata } from "../core/types.ts";

export interface IProcessEngine<Input, Output, ErrorT> {
  name: string;
  id: string;
  execute: (item: Input) => Promise<Output>;
}

export interface IProcessEngineConstructor<
  Input,
  Output,
  ErrorT extends Error
> {
  // name?: string;
  plugins?: IBeltPlugin<Input, Output, ErrorT>[];
  id?: string;
}

export type IProcessCore<Input, Output> = (item: Input) => Promise<Output>;

export enum ProcessEngineType {
  PROCESS_ENGINE = "PROCESS_ENGINE",
}

export interface ProcessEngineMetadata extends EngineMetadata {
  source: string;
  itemId: string;
  type: ProcessEngineType;
}

export interface ExecuteOptions<Input, Output, ErrorT extends Error> {
  existingItemId?: string;
  singleUsePlugins?: IBeltPlugin<Input, Output, ErrorT>[];
}
