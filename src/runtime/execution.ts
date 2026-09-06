import { createRunContext, RunContextController } from "@/context/runtime.ts";
import type { RunContext, RunContextOptions } from "@/context/types.ts";
import type { ConveeErrorTrace, ConveeTracePhase } from "@/error/types.ts";

export type Hook = (
  this: { context(): RunContext },
  ...args: unknown[]
) => unknown;

export interface RuntimePlugin {
  readonly id: string;
  readonly target?: string;
  input?: Hook;
  output?: Hook;
  error?: Hook;
  targets(id: string): boolean;
}

export interface Execution {
  id: string;
  kind: "step" | "pipe";
  plugins: readonly RuntimePlugin[];
  context?: RunContextOptions;
  body(input: unknown[], context: RunContext): unknown;
  normalize(error: unknown, trace: ConveeErrorTrace): Error;
  invalidInput(inputArity: number, received: unknown, pluginId: string): Error;
}

export function assertSynchronous<Value>(value: Value): Value {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "then") === "function"
  ) {
    if (value instanceof Promise) {
      try {
        Promise.prototype.then.call(value, undefined, () => undefined);
      } catch {
        throw new TypeError("Synchronous execution cannot return a thenable.");
      }
    }
    throw new TypeError("Synchronous execution cannot return a thenable.");
  }
  return value;
}

function* lifecycle(
  execution: Execution,
  args: unknown[],
): Generator<unknown, unknown, unknown> {
  const controller = RunContextController.from(
    createRunContext(execution.context),
  ).fork();
  const context = controller.context;
  const receiver = { context: () => context };
  let phase: ConveeTracePhase = "input";
  let pluginId: string | undefined;
  const trace = (): ConveeErrorTrace => ({
    runId: context.runId,
    rootRunId: context.rootRunId,
    frames: [
      { kind: execution.kind, id: execution.id, phase },
      ...(pluginId === undefined
        ? []
        : [{ kind: "plugin" as const, id: pluginId, phase }]),
    ],
  });
  function* invoke(
    plugin: RuntimePlugin,
    hook: Hook,
    input: unknown[],
  ): Generator<unknown, unknown, unknown> {
    pluginId = plugin.id;
    controller.enterPlugin(plugin.id, plugin.target);
    try {
      return yield Reflect.apply(hook, receiver, input);
    } finally {
      controller.leavePlugin();
    }
  }
  controller.enterStep(execution.id, args);
  let input = args;
  try {
    for (const plugin of execution.plugins) {
      if (!plugin.input) continue;
      const result = yield* invoke(plugin, plugin.input, input);
      if (Array.isArray(result)) input = [...result];
      else if (input.length === 1) input = [result];
      else throw execution.invalidInput(input.length, result, plugin.id);
      controller.updateCurrentStepInput(input);
    }
    phase = "run";
    pluginId = undefined;
    let output: unknown;
    try {
      output = yield execution.body(input, context);
    } catch (failure) {
      let error = execution.normalize(failure, trace());
      controller.updateCurrentStepError(error);
      phase = "error";
      let recovered = false;
      for (const plugin of execution.plugins) {
        if (!plugin.error) continue;
        const result = yield* invoke(plugin, plugin.error, [error, [...input]]);
        if (result instanceof Error) {
          error = result;
          controller.updateCurrentStepError(error);
        } else {
          output = result;
          recovered = true;
          break;
        }
      }
      if (!recovered) throw error;
    }
    controller.updateCurrentStepOutput(output);
    phase = "output";
    for (const plugin of execution.plugins) {
      if (!plugin.output) continue;
      output = yield* invoke(plugin, plugin.output, [output]);
      controller.updateCurrentStepOutput(output);
    }
    return output;
  } catch (failure) {
    const error = execution.normalize(failure, trace());
    controller.updateCurrentStepError(error);
    throw error;
  } finally {
    controller.leaveStep();
  }
}

export async function execute(
  execution: Execution,
  args: unknown[],
): Promise<unknown> {
  const iterator = lifecycle(execution, args);
  let cursor = iterator.next();
  while (!cursor.done) {
    let value: unknown;
    try {
      value = await cursor.value;
    } catch (error) {
      cursor = iterator.throw(error);
      continue;
    }
    cursor = iterator.next(value);
  }
  return cursor.value;
}

export function executeSync(execution: Execution, args: unknown[]): unknown {
  const iterator = lifecycle(execution, args);
  let cursor = iterator.next();
  while (!cursor.done) {
    let value: unknown;
    try {
      value = assertSynchronous(cursor.value);
    } catch (error) {
      cursor = iterator.throw(error);
      continue;
    }
    cursor = iterator.next(value);
  }
  return cursor.value;
}

export function activePlugins(
  persistent: readonly RuntimePlugin[],
  temporary: readonly RuntimePlugin[],
  id: string,
): RuntimePlugin[] {
  return [...persistent, ...temporary].filter((plugin) => plugin.targets(id))
    .map(capturePlugin);
}

export function capturePlugin(plugin: RuntimePlugin): RuntimePlugin {
  const { id, target, input, output, error } = plugin;
  return {
    id,
    target,
    input,
    output,
    error,
    targets: (stepId) => target === undefined || target === stepId,
  };
}
