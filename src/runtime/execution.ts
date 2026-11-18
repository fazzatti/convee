import {
  copyArguments,
  registrationsForRun,
  singleArgument,
} from "@/core/sequences.ts";
import {
  afterPhase,
  completionDisposition,
  inputAction,
} from "@/runtime/outcome.ts";
import { firstEligible } from "@/core/eligibility.ts";
import { retain } from "@/core/selection.ts";
import { matchesPluginTarget } from "@/core/plugin-target.ts";
import { createRunContext, RunContextController } from "@/context/runtime.ts";
import type { RunContext, RunContextOptions } from "@/context/types.ts";
import type { ConveeErrorTrace, ConveeTracePhase } from "@/error/types.ts";
import { type FinalizationFailure, RT_ERRORS } from "@/runtime/error.ts";

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
  finally?: Hook;
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

/** Walk the captured hooks lazily so recovery can stop at its first successful hook. */
function* hooksFor<P extends "input" | "error" | "output" | "finally">(
  plugins: readonly RuntimePlugin[],
  phase: P,
): Generator<RuntimePlugin & Required<Pick<RuntimePlugin, P>>> {
  const present = (plugin: RuntimePlugin) => !!plugin[phase];
  for (
    let index = firstEligible(plugins, 0, present);
    index >= 0;
    index = firstEligible(plugins, index + 1, present)
  ) {
    yield plugins[index] as RuntimePlugin & Required<Pick<RuntimePlugin, P>>;
  }
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
  function* applyInputs(): Generator<unknown, void, unknown> {
    for (const plugin of hooksFor(execution.plugins, "input")) {
      const result = yield* invoke(plugin, plugin.input, input);
      const action = inputAction(Array.isArray(result), input.length);
      if (action === "spread") input = copyArguments(result as unknown[]);
      else if (action === "wrap") input = singleArgument(result);
      else throw execution.invalidInput(input.length, result, plugin.id);
      controller.updateCurrentStepInput(input);
    }
  }
  function* recover(error: Error): Generator<unknown, unknown, unknown> {
    for (const plugin of hooksFor(execution.plugins, "error")) {
      const result = yield* invoke(plugin, plugin.error, [error, [...input]]);
      if (!(result instanceof Error)) return result;
      error = result;
      controller.updateCurrentStepError(error);
    }
    throw error;
  }
  function* runPhases(): Generator<unknown, unknown, unknown> {
    let bodyError!: Error;
    let output: unknown;
    let current: ConveeTracePhase = "input";
    while (current !== "finally") {
      phase = current;
      try {
        switch (current) {
          case "input":
            yield* applyInputs();
            break;
          case "run":
            pluginId = undefined;
            output = yield execution.body(input, context);
            break;
          case "error":
            output = yield* recover(bodyError);
            break;
          case "output":
            controller.updateCurrentStepOutput(output);
            for (const plugin of hooksFor(execution.plugins, "output")) {
              output = yield* invoke(plugin, plugin.output, [output]);
              controller.updateCurrentStepOutput(output);
            }
            break;
        }
      } catch (failure) {
        const next = afterPhase(current, true);
        if (next !== "error") throw failure;
        bodyError = execution.normalize(failure, trace());
        controller.updateCurrentStepError(bodyError);
        current = next;
        continue;
      }
      current = afterPhase(current, false);
    }
    return output;
  }
  let output: unknown;
  let executionError: Error | undefined;
  try {
    try {
      output = yield* runPhases();
    } catch (failure) {
      executionError = execution.normalize(failure, trace());
      controller.updateCurrentStepError(executionError);
    }

    // Cleanup is outside recovery and output processing. A failing finalizer
    // must not prevent the remaining plugins from releasing their resources.
    phase = "finally";
    const failures: FinalizationFailure[] = [];
    for (const plugin of hooksFor(execution.plugins, "finally")) {
      try {
        yield* invoke(plugin, plugin.finally, []);
      } catch (failure) {
        const failureTrace = trace();
        failures.push({
          error: execution.normalize(failure, failureTrace),
          trace: failureTrace,
        });
      }
    }
    const disposition = completionDisposition(
      executionError !== undefined,
      failures.length,
    );
    if (disposition === "throw-finalization") {
      pluginId = undefined;
      const error = RT_ERRORS.FINALIZATION_FAILED({
        executionId: execution.id,
        executionError,
        failures,
        trace: trace(),
      });
      controller.updateCurrentStepError(error);
      throw error;
    }
    if (disposition === "throw-execution") throw executionError;
    return output;
  } finally {
    controller.leaveStep();
  }
}

export async function settleEffects(
  iterator: Generator<unknown, unknown, unknown>,
): Promise<unknown> {
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

export function settleEffectsSync(
  iterator: Generator<unknown, unknown, unknown>,
): unknown {
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

export function execute(
  execution: Execution,
  args: unknown[],
): Promise<unknown> {
  return settleEffects(lifecycle(execution, args));
}

export function executeSync(execution: Execution, args: unknown[]): unknown {
  return settleEffectsSync(lifecycle(execution, args));
}

export function activePlugins(
  persistent: readonly RuntimePlugin[],
  temporary: readonly RuntimePlugin[],
  id: string,
): RuntimePlugin[] {
  const registrations = registrationsForRun(persistent, temporary);
  return retain(registrations, (plugin) => plugin.targets(id)).map(
    capturePlugin,
  );
}

export function capturePlugin(plugin: RuntimePlugin): RuntimePlugin {
  const { id, target, input, output, error, finally: finalizer } = plugin;
  return {
    id,
    target,
    input,
    output,
    error,
    finally: finalizer,
    targets: (stepId) => matchesPluginTarget(target, stepId),
  };
}
