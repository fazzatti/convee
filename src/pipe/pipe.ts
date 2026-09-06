import type {
  ContextValues,
  RunContext,
  RunContextOptions,
} from "@/context/types.ts";
import { callableFacade } from "@/runtime/callable.ts";
import {
  assertSynchronous,
  capturePlugin,
  execute,
  executeSync,
  type RuntimePlugin,
} from "@/runtime/execution.ts";
import { PIP_ERRORS } from "@/pipe/error.ts";
import type {
  AnyPipeStep,
  AnySyncPipeStep,
  Pipe,
  PipeOptions,
  SyncPipe,
  SyncPipeOptions,
} from "@/pipe/types.ts";

class PipeExecution {
  readonly id: string;
  private readonly children: readonly AnyPipeStep[];
  private registered: RuntimePlugin[] = [];
  constructor(
    steps: readonly AnyPipeStep[],
    readonly isSync: boolean,
    options?: { id?: string; plugins?: readonly unknown[] },
  ) {
    this.id = options?.id ?? crypto.randomUUID();
    if (steps.length === 0) {
      throw new TypeError("A pipe requires at least one step.");
    }
    if (isSync && steps.some((child) => child.isSync !== true)) {
      throw PIP_ERRORS.NON_SYNC_STEP({
        pipeId: this.id,
        stepIds: steps.map((child) => child.id),
      });
    }
    const identities = new Map<string, AnyPipeStep>();
    for (const child of steps) {
      if (
        child.id === this.id ||
        (identities.has(child.id) && identities.get(child.id) !== child)
      ) {
        throw new TypeError(
          `Conflicting step identity "${child.id}" in pipe "${this.id}".`,
        );
      }
      identities.set(child.id, child);
    }
    this.children = [...steps];
    for (const plugin of options?.plugins ?? []) {
      this.use(plugin as RuntimePlugin);
    }
  }
  get steps(): readonly AnyPipeStep[] {
    return [...this.children];
  }
  get plugins(): readonly RuntimePlugin[] {
    return [...this.registered];
  }
  private validate(plugin: RuntimePlugin): void {
    if (
      plugin.target !== undefined && plugin.target !== this.id &&
      !this.children.some((child) => child.id === plugin.target)
    ) {
      throw PIP_ERRORS.UNKNOWN_PLUGIN_TARGET({
        pipeId: this.id,
        pluginId: plugin.id,
        target: plugin.target,
        allowedTargets: [this.id, ...this.children.map((child) => child.id)],
      });
    }
  }
  use(plugin: RuntimePlugin): this {
    this.validate(plugin);
    this.registered.push(plugin);
    return this;
  }
  remove(id: string): this {
    this.registered = this.registered.filter((plugin) => plugin.id !== id);
    return this;
  }
  run(...args: unknown[]): unknown {
    return this.runWith({}, ...args);
  }
  runWith(
    options: { plugins?: RuntimePlugin[]; context?: RunContextOptions },
    ...args: unknown[]
  ): unknown {
    try {
      return this.executeWith(options, args);
    } catch (error) {
      if (this.isSync) throw error;
      return Promise.reject(error);
    }
  }
  private executeWith(
    options: { plugins?: RuntimePlugin[]; context?: RunContextOptions },
    args: unknown[],
  ): unknown {
    const plan = [...this.registered, ...(options.plugins ?? [])].map(
      capturePlugin,
    );
    for (const plugin of plan) this.validate(plugin);
    const pipelinePlugins = plan.filter((plugin) =>
      plugin.target === undefined || plugin.target === this.id
    );
    const childOptions = (child: AnyPipeStep, context: RunContext) => {
      const plugins = plan.filter((plugin) =>
        plugin.target === child.id && plugin.target !== undefined
      );
      return {
        context: { parent: context },
        ...(plugins.length ? { plugins } : {}),
      };
    };
    const runSync = (input: unknown[], context: RunContext): unknown => {
      let currentArgs = input;
      let result: unknown;
      for (const child of this.children) {
        result = assertSynchronous(
          Reflect.apply(child.runWith, child, [
            childOptions(child, context),
            ...currentArgs,
          ]),
        );
        currentArgs = Array.isArray(result) ? [...result] : [result];
      }
      return result;
    };
    const runAsync = async (
      input: unknown[],
      context: RunContext,
    ): Promise<unknown> => {
      let currentArgs = input;
      let result: unknown;
      for (const child of this.children) {
        result = await Reflect.apply(child.runWith, child, [
          childOptions(child, context),
          ...currentArgs,
        ]);
        currentArgs = Array.isArray(result) ? [...result] : [result];
      }
      return result;
    };
    return (this.isSync ? executeSync : execute)({
      id: this.id,
      kind: "pipe",
      plugins: pipelinePlugins,
      context: options.context,
      body: this.isSync ? runSync : runAsync,
      normalize: (error, trace) =>
        error instanceof Error
          ? error
          : typeof error === "string"
          ? new Error(error)
          : PIP_ERRORS.UNKNOWN_THROWN({ cause: error, pipeId: this.id, trace }),
      invalidInput: (inputArity, received, pluginId) =>
        PIP_ERRORS.INVALID_INPUT_PLUGIN_RESULT({
          pipeId: this.id,
          inputArity,
          received,
          pluginId,
        }),
    }, args);
  }
}

const members = [
  "id",
  "isSync",
  "steps",
  "plugins",
  "run",
  "runWith",
  "use",
  "remove",
];

/** Factory for asynchronous callable pipelines. */
export class PipeEngine {
  /** Construct an ordered pipeline and validate its routing namespace. */
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
    return callableFacade(new PipeExecution(steps, false, options), members);
  }
}

/** Factory for synchronous callable pipelines. */
export class SyncPipeEngine {
  /** Construct a pipeline that rejects asynchronous children and thenables. */
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
    return callableFacade(new PipeExecution(steps, true, options), members);
  }
}
