import type { ContextValues, RunContextOptions } from "@/context/types.ts";
import { callableFacade } from "@/runtime/callable.ts";
import {
  activePlugins,
  execute,
  executeSync,
  type RuntimePlugin,
} from "@/runtime/execution.ts";
import { STP_ERRORS } from "@/step/error.ts";
import type {
  AnyStepFn,
  AnySyncStepFn,
  StepOptions,
  StepRuntime,
  SyncStepOptions,
  SyncStepRuntime,
} from "@/step/types.ts";

class StepExecution {
  readonly id: string;
  private registered: RuntimePlugin[];
  constructor(
    private readonly fn: AnyStepFn,
    readonly isSync: boolean,
    options?: { id?: string; plugins?: readonly unknown[] },
  ) {
    if (typeof fn !== "function") {
      throw new TypeError("A step requires a callable function.");
    }
    this.id = options?.id ?? crypto.randomUUID();
    this.registered = [...(options?.plugins ?? [])] as RuntimePlugin[];
  }
  get plugins(): readonly RuntimePlugin[] {
    return [...this.registered];
  }
  use(plugin: RuntimePlugin): this {
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
    options: {
      plugins?: RuntimePlugin[];
      context?: RunContextOptions<ContextValues>;
    },
    ...args: unknown[]
  ): unknown {
    const executor = this.isSync ? executeSync : execute;
    return executor({
      id: this.id,
      kind: "step",
      plugins: activePlugins(this.registered, options.plugins ?? [], this.id),
      context: options.context,
      body: (input, context) =>
        Reflect.apply(this.fn, { context: () => context }, input),
      normalize: (error, trace) =>
        error instanceof Error
          ? error
          : typeof error === "string"
          ? new Error(error)
          : STP_ERRORS.UNKNOWN_THROWN({ cause: error, stepId: this.id, trace }),
      invalidInput: (inputArity, received, pluginId) =>
        STP_ERRORS.INVALID_INPUT_PLUGIN_RESULT({
          stepId: this.id,
          inputArity,
          received,
          pluginId,
        }),
    }, args);
  }
}

const members = ["id", "isSync", "plugins", "run", "runWith", "use", "remove"];

/** Factory for asynchronous callable steps. */
export class StepEngine {
  /** Wrap a callback without exposing its internal engine. */
  static create<
    Fn extends AnyStepFn,
    E extends Error = Error,
    Id extends string = string,
  >(
    fn: Fn,
    options?: StepOptions<Fn, E> & { id?: Id },
  ): StepRuntime<Fn, E, Id> {
    return callableFacade(new StepExecution(fn, false, options), members);
  }
}

/** Factory for synchronous callable steps. */
export class SyncStepEngine {
  /** Wrap a callback with runtime thenable rejection. */
  static create<
    Fn extends AnySyncStepFn,
    E extends Error = Error,
    Id extends string = string,
  >(
    fn: Fn,
    options?: SyncStepOptions<Fn, E> & { id?: Id },
  ): SyncStepRuntime<Fn, E, Id> {
    return callableFacade(new StepExecution(fn, true, options), members);
  }
}
