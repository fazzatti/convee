import {
  ExecuteOptions,
  IProcessEngine,
  IProcessEngineConstructor,
  ProcessEngineMetadata,
  ProcessEngineType,
} from "./types.ts";
import {
  IBeltPlugin,
  IBeltPluginError,
  IBeltPluginInput,
  IBeltPluginOutput,
} from "../belt-plugin/types.ts";
import { ConveeError } from "../error/index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";
import { isConveeError, wrapConveeError } from "../error/util.ts";

export class ProcessEngine<Input, Output, ErrorT extends Error>
  implements IProcessEngine<Input, Output, ErrorT>
{
  public readonly id: string;
  public readonly name: string;
  public readonly type = ProcessEngineType.PROCESS_ENGINE;

  protected plugins: IBeltPlugin<Input, Output, ErrorT>[];

  constructor(args?: IProcessEngineConstructor<Input, Output, ErrorT>) {
    const { name, id, plugins } = args || {};
    this.id = id || (crypto.randomUUID() as string);
    this.plugins = plugins || [];
    this.name = name || this.type;
  }

  public async execute(
    item: Input,
    options?: ExecuteOptions<Input, Output, ErrorT>
  ): Promise<Output> {
    const { existingItemId, singleUsePlugins } = options || {};
    const itemId = existingItemId || (crypto.randomUUID() as string);

    const inputBeltMetadataHelper = new MetadataHelper(itemId);
    const outputBeltMetadataHelper = new MetadataHelper(itemId);
    const errorBeltMetadataHelper = new MetadataHelper(itemId);
    const processMetadataHelper = new MetadataHelper(itemId);

    const preProcessedItem = await this.runInputBelt(
      item,
      inputBeltMetadataHelper,
      singleUsePlugins || []
    );
    let processedItem: Output;
    try {
      processedItem = (await this.process(
        preProcessedItem,
        processMetadataHelper
      )) as Output;
    } catch (e) {
      const error = !isConveeError(e as ErrorT)
        ? wrapConveeError(e as ErrorT)
        : (e as ConveeError<ErrorT>);

      const processedError = await this.runErrorBelt(
        error,
        errorBeltMetadataHelper,
        singleUsePlugins || []
      );
      error.enrichConveeStack(
        this.getMeta({
          itemId,
          inputBeltMeta: inputBeltMetadataHelper.getAll(),
          outputBeltMeta: outputBeltMetadataHelper.getAll(),
          errortBeltMeta: errorBeltMetadataHelper.getAll(),
          processMeta: processMetadataHelper.getAll(),
        })
      );
      throw processedError;
    }
    const postProcessedItem = await this.runOutputBelt(
      processedItem,
      outputBeltMetadataHelper,
      singleUsePlugins || []
    );

    return postProcessedItem as Output;
  }

  private async runInputBelt(
    item: Input,
    metadataHelper: MetadataHelper,
    executionPlugins: IBeltPlugin<Input, Output, ErrorT>[]
  ): Promise<Input> {
    let preProcessedItem = item as Input;

    const combinedPlugins = [...this.plugins, ...executionPlugins];

    const inputPlugins = combinedPlugins.filter(
      (plugin): plugin is IBeltPluginInput<Input> => "processInput" in plugin
    );

    for (const plugin of inputPlugins) {
      preProcessedItem = (await plugin.processInput(
        preProcessedItem,
        metadataHelper
      )) as Input;
    }

    return preProcessedItem;
  }

  private async runOutputBelt(
    item: Output,
    metadataHelper: MetadataHelper,
    executionPlugins: IBeltPlugin<Input, Output, ErrorT>[]
  ): Promise<Output> {
    let postProcessedItem = item as Output;

    const combinedPlugins = [...this.plugins, ...executionPlugins];

    const outputPlugins = combinedPlugins.filter(
      (plugin): plugin is IBeltPluginOutput<Output> => "processOutput" in plugin
    );

    for (const plugin of outputPlugins) {
      postProcessedItem = (await plugin.processOutput(
        postProcessedItem,
        metadataHelper
      )) as Output;
    }

    return postProcessedItem;
  }

  private async runErrorBelt(
    item: ConveeError<ErrorT>,
    metadataHelper: MetadataHelper,
    executionPlugins: IBeltPlugin<Input, Output, ErrorT>[]
  ): Promise<ConveeError<ErrorT>> {
    let postProcessedError = item as ConveeError<ErrorT>;

    const combinedPlugins = [...this.plugins, ...executionPlugins];

    const errorPlugins = combinedPlugins.filter(
      (plugin): plugin is IBeltPluginError<ErrorT> => "processError" in plugin
    );

    for (const plugin of errorPlugins) {
      postProcessedError = (await plugin.processError(
        postProcessedError,
        metadataHelper
      )) as ConveeError<ErrorT>;
    }

    return postProcessedError;
  }

  // deno-lint-ignore require-await
  protected async process(
    _item: Input,
    _metadataHelper: MetadataHelper
  ): Promise<Output> {
    throw new Error("process function not implemented");
  }

  protected getMeta(args: {
    itemId: string;
    inputBeltMeta?: MetadataCollected;
    outputBeltMeta?: MetadataCollected;
    errortBeltMeta?: MetadataCollected;
    processMeta?: MetadataCollected;
  }): ProcessEngineMetadata {
    return {
      itemId: args.itemId,
      source: this.id,
      type: this.type,
      inputBeltMeta: args.inputBeltMeta,
      outputBeltMeta: args.outputBeltMeta,
      errortBeltMeta: args.errortBeltMeta,
      processMeta: args.processMeta,
    };
  }
}
