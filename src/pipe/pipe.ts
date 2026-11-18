import { retain } from "@/core/selection.ts";
import {
  copyArguments,
  registrationsForRun,
  singleArgument,
} from "@/core/sequences.ts";
import { childConflicts, includesRegistration } from "@/pipe/routing.ts";
import type {
  ContextValues,
  RunContext,
  RunContextOptions,
} from "@/context/types.ts";
import { callableFacade } from "@/runtime/callable.ts";
import {
  capturePlugin,
  execute,
  executeSync,
  type RuntimePlugin,
  settleEffects,
  settleEffectsSync,
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
      const childId = child.id;
      const previous = identities.get(childId);
      if (
        childConflicts(
          this.id,
          childId,
          previous !== undefined,
          previous === child,
        )
      ) {
        throw new TypeError(
          `Conflicting step identity "${childId}" in pipe "${this.id}".`,
        );
      }
      identities.set(childId, child);
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
    this.registered = retain(this.registered, (plugin) => plugin.id !== id);
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
    const plan = registrationsForRun(this.registered, options.plugins ?? [])
      .map(
        capturePlugin,
      );
    for (const plugin of plan) this.validate(plugin);
    const pluginsFor = (id: string, owner: boolean) =>
      retain(plan, (plugin) => includesRegistration(plugin.target, id, owner));
    const pipelinePlugins = pluginsFor(this.id, true);
    const childOptions = (child: AnyPipeStep, context: RunContext) => {
      const plugins = pluginsFor(child.id, false);
      return {
        context: { parent: context },
        ...(plugins.length ? { plugins } : {}),
      };
    };
    const children = this.children;
    function* runChildren(
      input: unknown[],
      context: RunContext,
    ): Generator<unknown, unknown, unknown> {
      let currentArgs = input;
      let result: unknown;
      for (const child of children) {
        result = yield Reflect.apply(child.runWith, child, [
          childOptions(child, context),
          ...currentArgs,
        ]);
        currentArgs = Array.isArray(result)
          ? copyArguments(result)
          : singleArgument(result);
      }
      return result;
    }
    const settle = this.isSync ? settleEffectsSync : settleEffects;
    return (this.isSync ? executeSync : execute)({
      id: this.id,
      kind: "pipe",
      plugins: pipelinePlugins,
      context: options.context,
      body: (input, context) => settle(runChildren(input, context)),
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
