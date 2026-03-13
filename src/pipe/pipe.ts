import { createRunContext, RunContextController } from "@/context/index.ts";
import type { ContextValues, RunContext, StepThis } from "@/context/types.ts";
import { hasError, hasInput, hasOutput } from "@/plugin/guards.ts";
import type { PluginInputResult } from "@/plugin/types.ts";
import { PIP_ERRORS } from "@/pipe/error.ts";
import type { PipeError as ConveePipeError } from "@/pipe/error.ts";
import type {
  AnyPipeStep,
  AnySyncPipeStep,
  Pipe,
  PipeAttachablePlugin,
  PipeArgs,
  PipeIdentity,
  PipeOptions,
  PipePlugin,
  PipeResult,
  PipeRunOptions,
  SyncPipe,
  SyncPipeAttachablePlugin,
  SyncPipeOptions,
  SyncPipePlugin,
  SyncPipeRunOptions,
} from "@/pipe/types.ts";

const createExecutionThis = <Shared extends ContextValues>(
  context: RunContext<Shared>,
): StepThis<Shared> => ({
  context: () => context,
});

const toError = (error: unknown, pipeId: string): Error => {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return PIP_ERRORS.UNKNOWN_THROWN({ cause: error, pipeId });
};

const normalizeInputResult = <I extends PipeArgs>(
  previousInput: I,
  result: PluginInputResult<I>,
  args: {
    pipeId: string;
    pluginId: string;
  },
): I => {
  if (Array.isArray(result)) {
    return result as I;
  }

  if (previousInput.length === 1) {
    return [result] as I;
  }

  throw PIP_ERRORS.INVALID_INPUT_PLUGIN_RESULT({
    inputArity: previousInput.length,
    received: result,
    pipeId: args.pipeId,
    pluginId: args.pluginId,
  });
};

const normalizeStepArgs = (value: unknown): unknown[] =>
  Array.isArray(value) ? [...value] : [value];

const createPipeProxy = <Callable, Instance extends object>(
  callable: Callable,
  instance: Instance,
): Callable => {
  return new Proxy(callable as object, {
    get(_target, prop) {
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },

    has(_target, prop) {
      return prop in instance;
    },

    set() {
      return false;
    },
  }) as Callable;
};

const getActivePlugins = <Plugin extends { targets(stepId: string): boolean }>(
  plugins: readonly Plugin[],
  executionPlugins: readonly Plugin[],
  pipelineId: string,
): Plugin[] =>
  [...plugins, ...executionPlugins].filter((plugin) =>
    plugin.targets(pipelineId),
  );

const createUnknownPluginTargetError = (
  pluginId: string,
  target: string,
  pipelineId: string,
  steps: readonly { id: string }[],
): ConveePipeError =>
  PIP_ERRORS.UNKNOWN_PLUGIN_TARGET({
    pipeId: pipelineId,
    pluginId,
    target,
    allowedTargets: [pipelineId, ...steps.map((step) => step.id)],
  });

const resolvePluginTarget = <Step extends { id: string }>(
  pipelineId: string,
  steps: readonly Step[],
  plugin: { id: string; target?: string },
):
  | { kind: "pipeline" }
  | { kind: "step"; step: Step }
  | { kind: "invalid"; target: string } => {
  if (plugin.target === undefined || plugin.target === pipelineId) {
    return { kind: "pipeline" };
  }

  const step = steps.find((candidate) => candidate.id === plugin.target);

  if (!step) {
    return { kind: "invalid", target: plugin.target };
  }

  return { kind: "step", step };
};

export class PipeEngine<
  Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
> {
  private readonly _id: Id | string;
  private readonly _steps: Steps;
  private _plugins: PipeAttachablePlugin<Steps, E, Shared, Id>[];
  private _pipelinePlugins: PipePlugin<Steps, E, Shared>[];
  private readonly _stepPlugins = new Map<
    string,
    PipeAttachablePlugin<Steps, E, Shared, Id>[]
  >();

  private constructor(
    steps: Steps,
    options?: PipeOptions<
      Steps,
      E,
      Shared,
      Id,
      readonly { readonly id: string }[]
    > & { id?: Id },
  ) {
    this._id = (options?.id ?? crypto.randomUUID()) as Id | string;
    this._steps = steps;
    this._plugins = [];
    this._pipelinePlugins = [];

    for (const plugin of options?.plugins ?? []) {
      this.attachPlugin(plugin);
    }
  }

  static create<
    Steps extends readonly [AnyPipeStep, ...AnyPipeStep[]],
    E extends Error = Error,
    Shared extends ContextValues = ContextValues,
    Id extends string = string,
    Plugins extends readonly { readonly id: string }[] = readonly [],
  >(
    steps: Steps,
    options?: PipeOptions<Steps, E, Shared, Id, Plugins> & { id?: Id },
  ): Pipe<Steps, E, Shared, Id, Plugins> {
    const instance = new PipeEngine<Steps, E, Shared, Id>(steps, options);
    const callable = (...args: Parameters<Pipe<Steps, E, Shared, Id>>) =>
      PipeEngine.prototype.run.apply(instance, args);

    return createPipeProxy(
      callable as Pipe<Steps, E, Shared, Id, Plugins>,
      instance,
    );
  }

  get id(): PipeIdentity<Id>["id"] {
    return this._id as PipeIdentity<Id>["id"];
  }

  get isSync(): false {
    return false;
  }

  get steps(): Steps {
    return this._steps;
  }

  get plugins(): readonly PipeAttachablePlugin<Steps, E, Shared, Id>[] {
    return this._plugins;
  }

  use(plugin: PipeAttachablePlugin<Steps, E, Shared, Id>): this {
    this.attachPlugin(plugin);
    return this;
  }

  remove(pluginId: string): this {
    this._plugins = this._plugins.filter((plugin) => plugin.id !== pluginId);
    this._pipelinePlugins = this._pipelinePlugins.filter(
      (plugin) => plugin.id !== pluginId,
    );

    for (const [stepId, plugins] of this._stepPlugins.entries()) {
      const nextPlugins = plugins.filter((plugin) => plugin.id !== pluginId);

      if (nextPlugins.length === 0) {
        this._stepPlugins.delete(stepId);
        continue;
      }

      this._stepPlugins.set(stepId, nextPlugins);
    }

    return this;
  }

  run(
    ...args: Parameters<Pipe<Steps, E, Shared, Id>>
  ): Promise<PipeResult<Steps>> {
    return this.runWith({}, ...args);
  }

  async runWith(
    options: PipeRunOptions<Steps, E, Shared, Id>,
    ...args: Parameters<Pipe<Steps, E, Shared, Id>>
  ): Promise<PipeResult<Steps>> {
    const context = createRunContext(options.context);
    const controller = RunContextController.from(context);
    const { pipelinePlugins, stepPlugins } = this.splitExecutionPlugins(
      options.plugins ?? [],
    );
    controller.enterStep(this._id, args);

    try {
      const input = await this.runInputPlugins(
        args,
        pipelinePlugins,
        controller,
        context,
      );
      controller.updateCurrentStepInput(input);

      try {
        const output = await this.runSteps(input, context, stepPlugins);
        controller.updateCurrentStepOutput(output);

        return await this.runOutputPlugins(
          output,
          input,
          pipelinePlugins,
          controller,
          context,
        );
      } catch (error) {
        const normalizedError = toError(error, this._id) as E;
        controller.updateCurrentStepError(normalizedError);

        const recoveredOutput = await this.runErrorPlugins(
          normalizedError,
          input,
          pipelinePlugins,
          controller,
          context,
        );
        controller.updateCurrentStepOutput(recoveredOutput);

        return await this.runOutputPlugins(
          recoveredOutput,
          input,
          pipelinePlugins,
          controller,
          context,
        );
      }
    } finally {
      controller.leaveStep();
    }
  }

  private async runSteps(
    input: PipeArgs,
    context: RunContext<Shared>,
    stepPlugins: ReadonlyMap<string, readonly unknown[]>,
  ): Promise<PipeResult<Steps>> {
    let currentArgs: unknown[] = input;
    let currentResult: unknown;

    for (const step of this._steps) {
      const persistentPlugins = this._stepPlugins.get(step.id) ?? [];
      const executionPlugins = stepPlugins.get(step.id) ?? [];
      const plugins = [...persistentPlugins, ...executionPlugins];

      currentResult = await Reflect.apply(step.runWith, step, [
        {
          context: {
            parent: context,
          },
          ...(plugins.length > 0 ? { plugins } : {}),
        },
        ...currentArgs,
      ]);

      currentArgs = normalizeStepArgs(currentResult);
    }

    return currentResult as PipeResult<Steps>;
  }

  private async runInputPlugins(
    input: PipeArgs,
    executionPlugins: readonly PipePlugin<Steps, E, Shared>[],
    controller: RunContextController<Shared>,
    context: RunContext<Shared>,
  ): Promise<PipeArgs> {
    let currentInput = input;

    for (const plugin of getActivePlugins(
      this._pipelinePlugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasInput(plugin)) continue;
      controller.enterPlugin(plugin.id, plugin.target);

      try {
        currentInput = normalizeInputResult(
          currentInput,
          (await Reflect.apply(
            plugin.input as (...args: PipeArgs) => PluginInputResult<PipeArgs>,
            createExecutionThis(context),
            currentInput,
          )) as PluginInputResult<PipeArgs>,
          {
            pipeId: this._id,
            pluginId: plugin.id,
          },
        ) as PipeArgs;
        controller.updateCurrentStepInput(currentInput);
      } finally {
        controller.leavePlugin();
      }
    }

    return currentInput;
  }

  private async runOutputPlugins(
    output: PipeResult<Steps>,
    _input: PipeArgs,
    executionPlugins: readonly PipePlugin<Steps, E, Shared>[],
    controller: RunContextController<Shared>,
    context: RunContext<Shared>,
  ): Promise<PipeResult<Steps>> {
    let currentOutput = output;

    for (const plugin of getActivePlugins(
      this._pipelinePlugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasOutput(plugin)) continue;
      controller.enterPlugin(plugin.id, plugin.target);

      try {
        currentOutput = (await Reflect.apply(
          plugin.output,
          createExecutionThis(context),
          [currentOutput],
        )) as PipeResult<Steps>;
        controller.updateCurrentStepOutput(currentOutput);
      } finally {
        controller.leavePlugin();
      }
    }

    return currentOutput;
  }

  private async runErrorPlugins(
    error: E,
    input: PipeArgs,
    executionPlugins: readonly PipePlugin<Steps, E, Shared>[],
    controller: RunContextController<Shared>,
    context: RunContext<Shared>,
  ): Promise<PipeResult<Steps>> {
    let currentError = error;

    for (const plugin of getActivePlugins(
      this._pipelinePlugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasError(plugin)) continue;
      controller.enterPlugin(plugin.id, plugin.target);

      const result = await (async () => {
        try {
          return await Reflect.apply(
            plugin.error,
            createExecutionThis(context),
            [currentError, input],
          );
        } finally {
          controller.leavePlugin();
        }
      })();

      if (result instanceof Error) {
        currentError = result as E;
        controller.updateCurrentStepError(currentError);
        continue;
      }

      return result as PipeResult<Steps>;
    }

    throw currentError;
  }

  private attachPlugin(
    plugin: PipeAttachablePlugin<Steps, E, Shared, Id>,
  ): void {
    const resolution = resolvePluginTarget(this._id, this._steps, plugin);

    if (resolution.kind === "invalid") {
      throw createUnknownPluginTargetError(
        plugin.id,
        resolution.target,
        this._id,
        this._steps,
      );
    }

    this._plugins.push(plugin);

    if (resolution.kind === "pipeline") {
      this._pipelinePlugins.push(plugin as PipePlugin<Steps, E, Shared>);
      return;
    }

    const currentPlugins = this._stepPlugins.get(resolution.step.id) ?? [];
    this._stepPlugins.set(resolution.step.id, [...currentPlugins, plugin]);
  }

  private splitExecutionPlugins(
    plugins: readonly PipeAttachablePlugin<Steps, E, Shared, Id>[],
  ): {
    pipelinePlugins: PipePlugin<Steps, E, Shared>[];
    stepPlugins: ReadonlyMap<string, readonly unknown[]>;
  } {
    const pipelinePlugins: PipePlugin<Steps, E, Shared>[] = [];
    const stepPlugins = new Map<string, readonly unknown[]>();

    for (const plugin of plugins) {
      const resolution = resolvePluginTarget(this._id, this._steps, plugin);

      if (resolution.kind === "invalid") {
        throw createUnknownPluginTargetError(
          plugin.id,
          resolution.target,
          this._id,
          this._steps,
        );
      }

      if (resolution.kind === "pipeline") {
        pipelinePlugins.push(plugin as PipePlugin<Steps, E, Shared>);
        continue;
      }

      const currentPlugins = stepPlugins.get(resolution.step.id) ?? [];
      stepPlugins.set(resolution.step.id, [...currentPlugins, plugin]);
    }

    return {
      pipelinePlugins,
      stepPlugins,
    };
  }
}

export class SyncPipeEngine<
  Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
  E extends Error = Error,
  Shared extends ContextValues = ContextValues,
  Id extends string = string,
> {
  private readonly _id: Id | string;
  private readonly _steps: Steps;
  private _plugins: SyncPipeAttachablePlugin<Steps, E, Shared, Id>[];
  private _pipelinePlugins: SyncPipePlugin<Steps, E, Shared>[];
  private readonly _stepPlugins = new Map<
    string,
    SyncPipeAttachablePlugin<Steps, E, Shared, Id>[]
  >();

  private constructor(
    steps: Steps,
    options?: SyncPipeOptions<
      Steps,
      E,
      Shared,
      Id,
      readonly { readonly id: string }[]
    > & { id?: Id },
  ) {
    this._id = (options?.id ?? crypto.randomUUID()) as Id | string;

    if (steps.some((step) => step.isSync !== true)) {
      throw PIP_ERRORS.NON_SYNC_STEP({
        pipeId: this._id,
        stepIds: steps.map((step) => step.id),
      });
    }

    this._steps = steps;
    this._plugins = [];
    this._pipelinePlugins = [];

    for (const plugin of options?.plugins ?? []) {
      this.attachPlugin(plugin);
    }
  }

  static create<
    Steps extends readonly [AnySyncPipeStep, ...AnySyncPipeStep[]],
    E extends Error = Error,
    Shared extends ContextValues = ContextValues,
    Id extends string = string,
    Plugins extends readonly { readonly id: string }[] = readonly [],
  >(
    steps: Steps,
    options?: SyncPipeOptions<Steps, E, Shared, Id, Plugins> & { id?: Id },
  ): SyncPipe<Steps, E, Shared, Id, Plugins> {
    const instance = new SyncPipeEngine<Steps, E, Shared, Id>(steps, options);
    const callable = (...args: Parameters<SyncPipe<Steps, E, Shared, Id>>) =>
      SyncPipeEngine.prototype.run.apply(instance, args);

    return createPipeProxy(
      callable as SyncPipe<Steps, E, Shared, Id, Plugins>,
      instance,
    );
  }

  get id(): PipeIdentity<Id>["id"] {
    return this._id as PipeIdentity<Id>["id"];
  }

  get isSync(): true {
    return true;
  }

  get steps(): Steps {
    return this._steps;
  }

  get plugins(): readonly SyncPipeAttachablePlugin<Steps, E, Shared, Id>[] {
    return this._plugins;
  }

  use(plugin: SyncPipeAttachablePlugin<Steps, E, Shared, Id>): this {
    this.attachPlugin(plugin);
    return this;
  }

  remove(pluginId: string): this {
    this._plugins = this._plugins.filter((plugin) => plugin.id !== pluginId);
    this._pipelinePlugins = this._pipelinePlugins.filter(
      (plugin) => plugin.id !== pluginId,
    );

    for (const [stepId, plugins] of this._stepPlugins.entries()) {
      const nextPlugins = plugins.filter((plugin) => plugin.id !== pluginId);

      if (nextPlugins.length === 0) {
        this._stepPlugins.delete(stepId);
        continue;
      }

      this._stepPlugins.set(stepId, nextPlugins);
    }

    return this;
  }

  run(...args: Parameters<SyncPipe<Steps, E, Shared, Id>>): PipeResult<Steps> {
    return this.runWith({}, ...args);
  }

  runWith(
    options: SyncPipeRunOptions<Steps, E, Shared, Id>,
    ...args: Parameters<SyncPipe<Steps, E, Shared, Id>>
  ): PipeResult<Steps> {
    const context = createRunContext(options.context);
    const controller = RunContextController.from(context);
    const { pipelinePlugins, stepPlugins } = this.splitExecutionPlugins(
      options.plugins ?? [],
    );
    controller.enterStep(this._id, args);

    try {
      const input = this.runInputPlugins(
        args,
        pipelinePlugins,
        controller,
        context,
      );
      controller.updateCurrentStepInput(input);

      try {
        const output = this.runSteps(input, context, stepPlugins);
        controller.updateCurrentStepOutput(output);

        return this.runOutputPlugins(
          output,
          input,
          pipelinePlugins,
          controller,
          context,
        );
      } catch (error) {
        const normalizedError = toError(error, this._id) as E;
        controller.updateCurrentStepError(normalizedError);

        const recoveredOutput = this.runErrorPlugins(
          normalizedError,
          input,
          pipelinePlugins,
          controller,
          context,
        );
        controller.updateCurrentStepOutput(recoveredOutput);

        return this.runOutputPlugins(
          recoveredOutput,
          input,
          pipelinePlugins,
          controller,
          context,
        );
      }
    } finally {
      controller.leaveStep();
    }
  }

  private runSteps(
    input: PipeArgs,
    context: RunContext<Shared>,
    stepPlugins: ReadonlyMap<string, readonly unknown[]>,
  ): PipeResult<Steps> {
    let currentArgs: unknown[] = input;
    let currentResult: unknown;

    for (const step of this._steps) {
      const persistentPlugins = this._stepPlugins.get(step.id) ?? [];
      const executionPlugins = stepPlugins.get(step.id) ?? [];
      const plugins = [...persistentPlugins, ...executionPlugins];

      currentResult = Reflect.apply(step.runWith, step, [
        {
          context: {
            parent: context,
          },
          ...(plugins.length > 0 ? { plugins } : {}),
        },
        ...currentArgs,
      ]);

      currentArgs = normalizeStepArgs(currentResult);
    }

    return currentResult as PipeResult<Steps>;
  }

  private runInputPlugins(
    input: PipeArgs,
    executionPlugins: readonly SyncPipePlugin<Steps, E, Shared>[],
    controller: RunContextController<Shared>,
    context: RunContext<Shared>,
  ): PipeArgs {
    let currentInput = input;

    for (const plugin of getActivePlugins(
      this._pipelinePlugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasInput(plugin)) continue;
      controller.enterPlugin(plugin.id, plugin.target);

      try {
        currentInput = normalizeInputResult(
          currentInput,
          Reflect.apply(
            plugin.input as (...args: PipeArgs) => PluginInputResult<PipeArgs>,
            createExecutionThis(context),
            currentInput,
          ) as PluginInputResult<PipeArgs>,
          {
            pipeId: this._id,
            pluginId: plugin.id,
          },
        ) as PipeArgs;
        controller.updateCurrentStepInput(currentInput);
      } finally {
        controller.leavePlugin();
      }
    }

    return currentInput;
  }

  private runOutputPlugins(
    output: PipeResult<Steps>,
    _input: PipeArgs,
    executionPlugins: readonly SyncPipePlugin<Steps, E, Shared>[],
    controller: RunContextController<Shared>,
    context: RunContext<Shared>,
  ): PipeResult<Steps> {
    let currentOutput = output;

    for (const plugin of getActivePlugins(
      this._pipelinePlugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasOutput(plugin)) continue;
      controller.enterPlugin(plugin.id, plugin.target);

      try {
        currentOutput = Reflect.apply(
          plugin.output,
          createExecutionThis(context),
          [currentOutput],
        ) as PipeResult<Steps>;
        controller.updateCurrentStepOutput(currentOutput);
      } finally {
        controller.leavePlugin();
      }
    }

    return currentOutput;
  }

  private runErrorPlugins(
    error: E,
    input: PipeArgs,
    executionPlugins: readonly SyncPipePlugin<Steps, E, Shared>[],
    controller: RunContextController<Shared>,
    context: RunContext<Shared>,
  ): PipeResult<Steps> {
    let currentError = error;

    for (const plugin of getActivePlugins(
      this._pipelinePlugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasError(plugin)) continue;
      controller.enterPlugin(plugin.id, plugin.target);

      const result = (() => {
        try {
          return Reflect.apply(plugin.error, createExecutionThis(context), [
            currentError,
            input,
          ]);
        } finally {
          controller.leavePlugin();
        }
      })();

      if (result instanceof Error) {
        currentError = result as E;
        controller.updateCurrentStepError(currentError);
        continue;
      }

      return result as PipeResult<Steps>;
    }

    throw currentError;
  }

  private attachPlugin(
    plugin: SyncPipeAttachablePlugin<Steps, E, Shared, Id>,
  ): void {
    const resolution = resolvePluginTarget(this._id, this._steps, plugin);

    if (resolution.kind === "invalid") {
      throw createUnknownPluginTargetError(
        plugin.id,
        resolution.target,
        this._id,
        this._steps,
      );
    }

    this._plugins.push(plugin);

    if (resolution.kind === "pipeline") {
      this._pipelinePlugins.push(plugin as SyncPipePlugin<Steps, E, Shared>);
      return;
    }

    const currentPlugins = this._stepPlugins.get(resolution.step.id) ?? [];
    this._stepPlugins.set(resolution.step.id, [...currentPlugins, plugin]);
  }

  private splitExecutionPlugins(
    plugins: readonly SyncPipeAttachablePlugin<Steps, E, Shared, Id>[],
  ): {
    pipelinePlugins: SyncPipePlugin<Steps, E, Shared>[];
    stepPlugins: ReadonlyMap<string, readonly unknown[]>;
  } {
    const pipelinePlugins: SyncPipePlugin<Steps, E, Shared>[] = [];
    const stepPlugins = new Map<string, readonly unknown[]>();

    for (const plugin of plugins) {
      const resolution = resolvePluginTarget(this._id, this._steps, plugin);

      if (resolution.kind === "invalid") {
        throw createUnknownPluginTargetError(
          plugin.id,
          resolution.target,
          this._id,
          this._steps,
        );
      }

      if (resolution.kind === "pipeline") {
        pipelinePlugins.push(plugin as SyncPipePlugin<Steps, E, Shared>);
        continue;
      }

      const currentPlugins = stepPlugins.get(resolution.step.id) ?? [];
      stepPlugins.set(resolution.step.id, [...currentPlugins, plugin]);
    }

    return {
      pipelinePlugins,
      stepPlugins,
    };
  }
}
