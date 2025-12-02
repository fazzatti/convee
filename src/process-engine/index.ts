// deno-lint-ignore-file no-explicit-any
import {
  BeltPlugin,
  BeltPluginError,
  BeltPluginInput,
  BeltPluginOutput,
} from "../belt-plugin/types.ts";
import { CoreProcessType, Transformer } from "../core/types.ts";
import { ConveeError } from "../error/index.ts";
import { isConveeCapable, isError, makeConveeCapable } from "../error/util.ts";
import {
  Modifier,
  ProcessEngineMetadata,
  ProcessEngineOptions,
} from "../index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";
import { MetadataCollected } from "../metadata/collector/types.ts";
import { Unwrap } from "../utils/types/unwrap.ts";
import { RunOptions, ProcessEngine as IProcessEngine } from "./types.ts";

function CreateProcess<
  I,
  O,
  E extends Error,
  Name extends string = string,
  Id extends string = string
>(
  process: Modifier<I | O> | Transformer<I, O>, //(args: I, metadataHelper?: MetadataHelper) => O,
  options?: ProcessEngineOptions<I, O, E> & { name?: Name; id?: Id }
): IProcessEngine<I, Unwrap<O>, E> & { name?: Name; id?: Id } {
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
      name: (options?.name || "UnnamedProcess") as Name,
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
    process: Modifier<I | O> | Transformer<I, O> //(input: I, metadataHelper?: MetadataHelper) => O
  ): (input: I, options?: RunOptions<I, O, E>) => Promise<O> {
    return async function (
      this: typeof engine,
      input: I,
      options?: RunOptions<I, O, E>
    ): Promise<O> {
      const { existingItemId, singleUsePlugins, metadataHelper } =
        options || {};
      const itemId =
        metadataHelper?.itemId ||
        existingItemId ||
        (crypto.randomUUID() as string);

      const processMetadataHelper =
        metadataHelper || new MetadataHelper(itemId);

      // const inputBeltMetadataHelper = new MetadataHelper(itemId);
      // const outputBeltMetadataHelper = new MetadataHelper(itemId);
      // const errorBeltMetadataHelper = new MetadataHelper(itemId);
      // const processMetadataHelper = new MetadataHelper(itemId);

      const preProcessedItem = await runInputBelt.call(
        this,
        input,
        processMetadataHelper,
        singleUsePlugins || []
      );
      let processedItem: O;
      try {
        processedItem = (await process(
          preProcessedItem,
          processMetadataHelper
        )) as O;
      } catch (e) {
        const error = !isConveeCapable(e as E)
          ? makeConveeCapable(e as E)
          : (e as ConveeError<E>);

        const processedError = await runErrorBelt.call(
          this,
          error,
          processMetadataHelper,
          singleUsePlugins || []
        );

        // if a plugin has not handled the error graciously, throw it enriched with metadata
        if (isError(processedError)) {
          processedError.enrichConveeStack(
            getMeta({
              itemId,
              processMeta: processMetadataHelper.getAll(),
            })
          );
          throw processedError;
        }

        // if the error has been handled and transformed into an output, continue the normal flow
        processedItem = processedError as O;
      }
      const postProcessedItem = await runOutputBelt.call(
        this,
        processedItem,
        processMetadataHelper,
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
    processMeta?: MetadataCollected;
  }): ProcessEngineMetadata {
    return {
      itemId: args.itemId,
      source: processId,
      type: processType,
      processMeta: args.processMeta,
    };
  }

  return engine as IProcessEngine<I, Unwrap<O>, E> & { name: Name; id: Id };
}

export const ProcessEngine = {
  create: CreateProcess,
};
