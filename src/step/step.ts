import { createRunContext, RunContextController } from "@/context/index.ts";
import type { ContextValues, RunContext, StepThis } from "@/context/types.ts";
import { hasError, hasInput, hasOutput } from "@/plugin/guards.ts";
import type { PluginInputResult } from "@/plugin/types.ts";
import { STP_ERRORS } from "@/step/error.ts";
import type {
  AnySyncStepFn,
  AnyStepFn,
  ExtractStepContext,
  StepRuntime,
  StepArgs,
  StepIdentity,
  StepInstance,
  StepOptions,
  StepPlugin,
  StepRunOptions,
  SyncStepRuntime,
  SyncStepInstance,
  SyncStepOptions,
  SyncStepRunOptions,
  SyncStepPlugin,
} from "@/step/types.ts";

const createExecutionThis = <Shared extends ContextValues>(
  context: RunContext<Shared>,
): StepThis<Shared> => ({
  context: () => context,
});

const toError = (error: unknown, stepId: string): Error => {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return STP_ERRORS.UNKNOWN_THROWN({ cause: error, stepId });
};

const normalizeInputResult = <I extends StepArgs>(
  previousInput: I,
  result: PluginInputResult<I>,
  args: {
    stepId: string;
    pluginId: string;
  },
): I => {
  if (Array.isArray(result)) {
    return result as I;
  }

  if (previousInput.length === 1) {
    return [result] as I;
  }

  throw STP_ERRORS.INVALID_INPUT_PLUGIN_RESULT({
    inputArity: previousInput.length,
    received: result,
    stepId: args.stepId,
    pluginId: args.pluginId,
  });
};

const createStepProxy = <
  Fn extends (...args: never[]) => unknown,
  Instance extends object,
  Callable,
>(
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
  stepId: string,
): Plugin[] =>
  [...plugins, ...executionPlugins].filter((plugin) => plugin.targets(stepId));

/**
 * Runtime representation of a step.
 *
 * A `StepEngine` stores step metadata such as `id`, the wrapped callable, and
 * its plugins, then uses a `Proxy` to expose the callable behavior alongside
 * engine methods like `run()`, `use()`, and `remove()`.
 */
export class StepEngine<
  Fn extends AnyStepFn,
  E extends Error = Error,
  Id extends string = string,
> {
  private readonly _id: StepIdentity<Id>["id"];
  private readonly _stepFn: Fn;
  private _plugins: StepPlugin<Fn, E>[];

  /** Creates a step runtime from a callable and optional metadata. */
  private constructor(fn: Fn, options?: StepOptions<Fn, E> & { id?: Id }) {
    this._id = (options?.id ?? crypto.randomUUID()) as StepIdentity<Id>["id"];
    this._stepFn = fn;
    this._plugins = [...(options?.plugins ?? [])];
  }

  /** Creates a proxy-backed callable step instance. */
  static create<
    Fn extends AnyStepFn,
    E extends Error = Error,
    Id extends string = string,
  >(
    fn: Fn,
    options?: StepOptions<Fn, E> & { id?: Id },
  ): StepRuntime<Fn, E, Id> {
    const stepInstance = new StepEngine<Fn, E, Id>(fn, options);
    const callable = (...args: Parameters<Fn>) =>
      StepEngine.prototype.run.apply(stepInstance, args);

    return createStepProxy<Fn, StepEngine<Fn, E, Id>, StepRuntime<Fn, E, Id>>(
      callable as StepRuntime<Fn, E, Id>,
      stepInstance,
    );
  }

  /** The unique step identifier. */
  get id(): StepIdentity<Id>["id"] {
    return this._id;
  }

  /** Whether this step is synchronous. */
  get isSync(): false {
    return false;
  }

  /** The plugins currently attached to the step. */
  get plugins(): readonly StepPlugin<Fn, E>[] {
    return this._plugins;
  }

  /** Attaches a plugin to the step. */
  use(plugin: StepPlugin<Fn, E>): this {
    this._plugins.push(plugin);
    return this;
  }

  /** Removes a plugin from the step by plugin id. */
  remove(pluginId: string): this {
    this._plugins = this._plugins.filter((plugin) => plugin.id !== pluginId);
    return this;
  }

  /** Runs the step through input, output, and error plugin lifecycles. */
  run(...args: Parameters<Fn>): Promise<Awaited<ReturnType<Fn>>> {
    return this.runWith({}, ...args);
  }

  /**
   * Runs the step with advanced execution options.
   *
   * This advanced path keeps one-off execution behavior, such as single-use
   * plugins, out of the common invocation flow.
   */
  async runWith(
    options: StepRunOptions<Fn, E>,
    ...args: Parameters<Fn>
  ): Promise<Awaited<ReturnType<Fn>>> {
    const context = createRunContext(options.context);
    const contextController = RunContextController.from(context);
    const executionPlugins = options.plugins ?? [];
    contextController.enterStep(this._id, args);

    try {
      const input = await this.runInputPlugins(
        args,
        executionPlugins,
        contextController,
        context,
      );
      contextController.updateCurrentStepInput(input);

      try {
        const output = await Reflect.apply(
          this._stepFn as AnyStepFn,
          createExecutionThis(context),
          input,
        );
        contextController.updateCurrentStepOutput(output);

        return await this.runOutputPlugins(
          output as Awaited<ReturnType<Fn>>,
          input,
          executionPlugins,
          contextController,
          context,
        );
      } catch (error) {
        const normalizedError = toError(error, this._id) as E;
        contextController.updateCurrentStepError(normalizedError);

        const recoveredOutput = await this.runErrorPlugins(
          normalizedError,
          input,
          executionPlugins,
          contextController,
          context,
        );
        contextController.updateCurrentStepOutput(recoveredOutput);

        return await this.runOutputPlugins(
          recoveredOutput,
          input,
          executionPlugins,
          contextController,
          context,
        );
      }
    } finally {
      contextController.leaveStep();
    }
  }

  private async runInputPlugins(
    input: Parameters<Fn>,
    executionPlugins: readonly StepPlugin<Fn, E>[],
    contextController: RunContextController<ExtractStepContext<Fn>>,
    context: RunContext<ExtractStepContext<Fn>>,
  ): Promise<Parameters<Fn>> {
    let currentInput = input;

    for (const plugin of getActivePlugins(
      this._plugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasInput(plugin)) continue;
      contextController.enterPlugin(plugin.id, plugin.target);

      try {
        currentInput = normalizeInputResult(
          currentInput,
          (await Reflect.apply(
            plugin.input as (
              ...args: Parameters<Fn>
            ) => PluginInputResult<Parameters<Fn>>,
            createExecutionThis(context),
            currentInput,
          )) as PluginInputResult<Parameters<Fn>>,
          {
            stepId: this._id,
            pluginId: plugin.id,
          },
        ) as Parameters<Fn>;
        contextController.updateCurrentStepInput(currentInput);
      } finally {
        contextController.leavePlugin();
      }
    }

    return currentInput;
  }

  private async runOutputPlugins(
    output: Awaited<ReturnType<Fn>>,
    _input: Parameters<Fn>,
    executionPlugins: readonly StepPlugin<Fn, E>[],
    contextController: RunContextController<ExtractStepContext<Fn>>,
    context: RunContext<ExtractStepContext<Fn>>,
  ): Promise<Awaited<ReturnType<Fn>>> {
    let currentOutput = output;

    for (const plugin of getActivePlugins(
      this._plugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasOutput(plugin)) continue;
      contextController.enterPlugin(plugin.id, plugin.target);

      try {
        currentOutput = (await Reflect.apply(
          plugin.output,
          createExecutionThis(context),
          [currentOutput],
        )) as Awaited<ReturnType<Fn>>;
        contextController.updateCurrentStepOutput(currentOutput);
      } finally {
        contextController.leavePlugin();
      }
    }

    return currentOutput;
  }

  private async runErrorPlugins(
    error: E,
    input: Parameters<Fn>,
    executionPlugins: readonly StepPlugin<Fn, E>[],
    contextController: RunContextController<ExtractStepContext<Fn>>,
    context: RunContext<ExtractStepContext<Fn>>,
  ): Promise<Awaited<ReturnType<Fn>>> {
    let currentError = error;

    for (const plugin of getActivePlugins(
      this._plugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasError(plugin)) continue;
      contextController.enterPlugin(plugin.id, plugin.target);

      const result = await (async () => {
        try {
          return await Reflect.apply(
            plugin.error,
            createExecutionThis(context),
            [currentError, input],
          );
        } finally {
          contextController.leavePlugin();
        }
      })();

      if (result instanceof Error) {
        currentError = result as E;
        contextController.updateCurrentStepError(currentError);
        continue;
      }

      return result as Awaited<ReturnType<Fn>>;
    }

    throw currentError;
  }
}

/**
 * Runtime representation of a synchronous step.
 *
 * A `SyncStepEngine` mirrors `StepEngine`, but only accepts synchronous step
 * functions and synchronous plugins, and it returns plain values instead of
 * `Promise` instances.
 */
export class SyncStepEngine<
  Fn extends AnySyncStepFn,
  E extends Error = Error,
  Id extends string = string,
> {
  private readonly _id: StepIdentity<Id>["id"];
  private readonly _stepFn: Fn;
  private _plugins: SyncStepPlugin<Fn, E>[];

  /** Creates a synchronous step runtime from a callable and optional metadata. */
  private constructor(fn: Fn, options?: SyncStepOptions<Fn, E> & { id?: Id }) {
    this._id = (options?.id ?? crypto.randomUUID()) as StepIdentity<Id>["id"];
    this._stepFn = fn;
    this._plugins = [...(options?.plugins ?? [])];
  }

  /** Creates a proxy-backed synchronous step instance. */
  static create<
    Fn extends AnySyncStepFn,
    E extends Error = Error,
    Id extends string = string,
  >(
    fn: Fn,
    options?: SyncStepOptions<Fn, E> & { id?: Id },
  ): SyncStepRuntime<Fn, E, Id> {
    const stepInstance = new SyncStepEngine<Fn, E, Id>(fn, options);
    const callable = (...args: Parameters<Fn>) =>
      SyncStepEngine.prototype.run.apply(stepInstance, args);

    return createStepProxy<
      Fn,
      SyncStepEngine<Fn, E, Id>,
      SyncStepRuntime<Fn, E, Id>
    >(callable as SyncStepRuntime<Fn, E, Id>, stepInstance);
  }

  /** The unique step identifier. */
  get id(): StepIdentity<Id>["id"] {
    return this._id;
  }

  /** Whether this step is synchronous. */
  get isSync(): true {
    return true;
  }

  /** The plugins currently attached to the step. */
  get plugins(): readonly SyncStepPlugin<Fn, E>[] {
    return this._plugins;
  }

  /** Attaches a plugin to the step. */
  use(plugin: SyncStepPlugin<Fn, E>): this {
    this._plugins.push(plugin);
    return this;
  }

  /** Removes a plugin from the step by plugin id. */
  remove(pluginId: string): this {
    this._plugins = this._plugins.filter((plugin) => plugin.id !== pluginId);
    return this;
  }

  /** Runs the step through synchronous input, output, and error hooks. */
  run(...args: Parameters<Fn>): ReturnType<Fn> {
    return this.runWith({}, ...args);
  }

  /**
   * Runs the synchronous step with advanced execution options.
   *
   * This advanced path keeps one-off execution behavior, such as single-use
   * plugins, out of the common invocation flow.
   */
  runWith(
    options: SyncStepRunOptions<Fn, E>,
    ...args: Parameters<Fn>
  ): ReturnType<Fn> {
    const context = createRunContext(options.context);
    const contextController = RunContextController.from(context);
    const executionPlugins = options.plugins ?? [];
    contextController.enterStep(this._id, args);

    try {
      const input = this.runInputPlugins(
        args,
        executionPlugins,
        contextController,
        context,
      );
      contextController.updateCurrentStepInput(input);

      try {
        const output = Reflect.apply(
          this._stepFn as AnySyncStepFn,
          createExecutionThis(context),
          input,
        ) as ReturnType<Fn>;
        contextController.updateCurrentStepOutput(output);

        return this.runOutputPlugins(
          output,
          input,
          executionPlugins,
          contextController,
          context,
        );
      } catch (error) {
        const normalizedError = toError(error, this._id) as E;
        contextController.updateCurrentStepError(normalizedError);

        const recoveredOutput = this.runErrorPlugins(
          normalizedError,
          input,
          executionPlugins,
          contextController,
          context,
        );
        contextController.updateCurrentStepOutput(recoveredOutput);

        return this.runOutputPlugins(
          recoveredOutput,
          input,
          executionPlugins,
          contextController,
          context,
        );
      }
    } finally {
      contextController.leaveStep();
    }
  }

  private runInputPlugins(
    input: Parameters<Fn>,
    executionPlugins: readonly SyncStepPlugin<Fn, E>[],
    contextController: RunContextController<ExtractStepContext<Fn>>,
    context: RunContext<ExtractStepContext<Fn>>,
  ): Parameters<Fn> {
    let currentInput = input;

    for (const plugin of getActivePlugins(
      this._plugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasInput(plugin)) continue;
      contextController.enterPlugin(plugin.id, plugin.target);

      try {
        currentInput = normalizeInputResult(
          currentInput,
          Reflect.apply(
            plugin.input as (
              ...args: Parameters<Fn>
            ) => PluginInputResult<Parameters<Fn>>,
            createExecutionThis(context),
            currentInput,
          ) as PluginInputResult<Parameters<Fn>>,
          {
            stepId: this._id,
            pluginId: plugin.id,
          },
        ) as Parameters<Fn>;
        contextController.updateCurrentStepInput(currentInput);
      } finally {
        contextController.leavePlugin();
      }
    }

    return currentInput;
  }

  private runOutputPlugins(
    output: ReturnType<Fn>,
    _input: Parameters<Fn>,
    executionPlugins: readonly SyncStepPlugin<Fn, E>[],
    contextController: RunContextController<ExtractStepContext<Fn>>,
    context: RunContext<ExtractStepContext<Fn>>,
  ): ReturnType<Fn> {
    let currentOutput = output;

    for (const plugin of getActivePlugins(
      this._plugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasOutput(plugin)) continue;
      contextController.enterPlugin(plugin.id, plugin.target);

      try {
        currentOutput = Reflect.apply(
          plugin.output,
          createExecutionThis(context),
          [currentOutput],
        ) as ReturnType<Fn>;
        contextController.updateCurrentStepOutput(currentOutput);
      } finally {
        contextController.leavePlugin();
      }
    }

    return currentOutput;
  }

  private runErrorPlugins(
    error: E,
    input: Parameters<Fn>,
    executionPlugins: readonly SyncStepPlugin<Fn, E>[],
    contextController: RunContextController<ExtractStepContext<Fn>>,
    context: RunContext<ExtractStepContext<Fn>>,
  ): ReturnType<Fn> {
    let currentError = error;

    for (const plugin of getActivePlugins(
      this._plugins,
      executionPlugins,
      this._id,
    )) {
      if (!hasError(plugin)) continue;
      contextController.enterPlugin(plugin.id, plugin.target);

      const result = (() => {
        try {
          return Reflect.apply(plugin.error, createExecutionThis(context), [
            currentError,
            input,
          ]);
        } finally {
          contextController.leavePlugin();
        }
      })();

      if (result instanceof Error) {
        currentError = result as E;
        contextController.updateCurrentStepError(currentError);
        continue;
      }

      return result as ReturnType<Fn>;
    }

    throw currentError;
  }
}
