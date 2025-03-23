// deno-lint-ignore-file no-explicit-any
import {
  BeltPlugin,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "../belt-plugin/types.ts";
import { CoreProcessType } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { isConveeError, isError, wrapConveeError } from "../error/util.ts";
import { ProcessEngineMetadata, ProcessEngineOptions } from "../index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";
import { Unwrap } from "../utils/types/unwrap.ts";
import { RunOptions, ProcessEngine as IProcessEngine } from "./types.ts";

function CreateProcess<I, O, E extends Error>(
  process: (args: I, metadataHelper?: MetadataHelper) => O,
  options?: ProcessEngineOptions<I, O, E>
): IProcessEngine<I, Unwrap<O>, E> {
  const processType = CoreProcessType.PROCESS_ENGINE;
  const processId = options?.id || (crypto.randomUUID() as string);

  // Create an engine object whose methods use `this` to refer to the current plugins.
  const engine: IProcessEngine<I, O, E> =
    // {
    // name: string;
    // id: string;
    // type: CoreProcessType;
    // plugins: BeltPlugin<I, O, E>[];
    // run: (input: I, options?: RunOptions<I, O, E>) => Promise<O>;
    // }
    {
      name: options?.name || "Process",
      id: processId,
      type: processType,
      plugins: options?.plugins || ([] as BeltPlugin<I, O, E>[]),
      run: undefined as any,
      addPlugin(plugin: BeltPlugin<I, O, E>) {
        this.plugins.push(plugin);
      },
      removePlugin(pluginName: string) {
        this.plugins = this.plugins.filter(
          (plugin) => plugin.name !== pluginName
        );
      },
    };

  // Assign process using our wrapper function
  engine.run = wrapProcessFn(process);

  function wrapProcessFn(
    process: (input: I, metadataHelper?: MetadataHelper) => O
  ): (input: I, options?: RunOptions<I, O, E>) => Promise<O> {
    return async function (
      this: typeof engine,
      input: I,
      options?: RunOptions<I, O, E>
    ): Promise<O> {
      const { existingItemId, singleUsePlugins } = options || {};
      const itemId = existingItemId || (crypto.randomUUID() as string);

      const inputBeltMetadataHelper = new MetadataHelper(itemId);
      const outputBeltMetadataHelper = new MetadataHelper(itemId);
      const errorBeltMetadataHelper = new MetadataHelper(itemId);
      const processMetadataHelper = new MetadataHelper(itemId);

      const preProcessedItem = await runInputBelt.call(
        this,
        input,
        inputBeltMetadataHelper,
        singleUsePlugins || []
      );
      let processedItem: O;
      try {
        processedItem = (await process(
          preProcessedItem,
          processMetadataHelper
        )) as O;
      } catch (e) {
        const error = !isConveeError(e as E)
          ? wrapConveeError(e as E)
          : (e as ConveeError<E>);

        const processedError = await runErrorBelt.call(
          this,
          error,
          errorBeltMetadataHelper,
          singleUsePlugins || []
        );

        // if a plugin has handled the error graciouslly, return the output
        if (!isError(processedError)) {
          return processedError;
        }

        processedError.enrichConveeStack(
          getMeta({
            itemId,
            inputBeltMeta: inputBeltMetadataHelper.getAll(),
            outputBeltMeta: outputBeltMetadataHelper.getAll(),
            errortBeltMeta: errorBeltMetadataHelper.getAll(),
            processMeta: processMetadataHelper.getAll(),
          })
        );
        throw processedError;
      }
      const postProcessedItem = await runOutputBelt.call(
        this,
        processedItem,
        outputBeltMetadataHelper,
        singleUsePlugins || []
      );

      return postProcessedItem as O;
    };
  }

  async function runInputBelt(
    this: typeof engine,
    item: I,
    metadataHelper: MetadataHelper,
    executionPlugins: BeltPlugin<I, O, E>[]
  ): Promise<I> {
    let preProcessedItem = item as I;

    const combinedPlugins = [...this.plugins, ...executionPlugins];

    const inputPlugins = combinedPlugins.filter(
      (plugin): plugin is BeltPluginInput<I> => "processInput" in plugin
    );

    for (const plugin of inputPlugins) {
      preProcessedItem = (await plugin.processInput(
        preProcessedItem,
        metadataHelper
      )) as I;
    }

    return preProcessedItem;
  }

  async function runOutputBelt(
    this: typeof engine,
    item: O,
    metadataHelper: MetadataHelper,
    executionPlugins: BeltPlugin<I, O, E>[]
  ): Promise<O> {
    let postProcessedItem = item as O;

    const combinedPlugins = [...this.plugins, ...executionPlugins];

    const outputPlugins = combinedPlugins.filter(
      (plugin): plugin is BeltPluginOutput<O> => "processOutput" in plugin
    );

    for (const plugin of outputPlugins) {
      postProcessedItem = (await plugin.processOutput(
        postProcessedItem,
        metadataHelper
      )) as O;
    }

    return postProcessedItem;
  }

  async function runErrorBelt(
    this: typeof engine,
    item: ConveeError<E>,
    metadataHelper: MetadataHelper,
    executionPlugins: BeltPlugin<I, O, E>[]
  ): Promise<ConveeError<E> | O> {
    let postProcessedError = item as ConveeError<E>;

    const combinedPlugins = [...this.plugins, ...executionPlugins];

    const errorPlugins = combinedPlugins.filter(
      (plugin): plugin is BeltPluginError<O, E> => "processError" in plugin
    );

    let handledOutput: O | undefined;

    for (const plugin of errorPlugins) {
      const pluginOutput = await plugin.processError(
        postProcessedError,
        metadataHelper
      );

      if (isError(pluginOutput)) {
        postProcessedError = pluginOutput;
      } else {
        handledOutput = pluginOutput;
        break;
      }
    }

    if (handledOutput) {
      return handledOutput as O;
    }

    return postProcessedError as ConveeError<E>;
  }

  function getMeta(args: {
    itemId: string;
    inputBeltMeta?: MetadataCollected;
    outputBeltMeta?: MetadataCollected;
    errortBeltMeta?: MetadataCollected;
    processMeta?: MetadataCollected;
  }): ProcessEngineMetadata {
    return {
      itemId: args.itemId,
      source: processId,
      type: processType,
      inputBeltMeta: args.inputBeltMeta,
      outputBeltMeta: args.outputBeltMeta,
      errortBeltMeta: args.errortBeltMeta,
      processMeta: args.processMeta,
    };
  }

  return engine as IProcessEngine<I, Unwrap<O>, E>;
}

export const ProcessEngine = {
  create: CreateProcess,
};
