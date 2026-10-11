import { plugin } from "@/plugin/factory.ts";
import { step } from "@/step/factory.ts";
import type { StepPlugin, StepRunOptions } from "@/step/types.ts";
import { callableFacade } from "@/runtime/callable.ts";
import { type Setup, setup } from "@/workers/config.ts";
import { WorkerError } from "@/workers/error.ts";
import { builders, prepare, reshape } from "@/workers/jobs.ts";
import { Lifetime } from "@/workers/lifecycle.ts";
import { Generation } from "@/workers/pool.ts";
import type {
  ParallelOptions,
  ParallelStep,
  PersistentOptions,
  PersistentParallel,
  WorkerBuilders,
  WorkerCallable,
  WorkerGroups,
  WorkerJobTree,
  WorkerOutcome,
} from "@/workers/types.ts";

interface Options extends PersistentOptions {
  readonly id?: string;
  readonly plugins?: StepPlugin<LocalFn>[];
  readonly mode?: "all" | "collect";
  readonly split: (
    builders: WorkerBuilders<WorkerGroups>,
    ...input: unknown[]
  ) => unknown;
  readonly join: (results: unknown) => unknown;
}
type LocalFn = (...input: unknown[]) => unknown;

class ParallelExecution {
  readonly id: string;
  readonly isSync = false;
  private registered: StepPlugin<LocalFn>[];
  private readonly token = {};
  private readonly builders: WorkerBuilders<WorkerGroups>;
  constructor(
    private readonly options: Options,
    private readonly config: Setup,
    private readonly lifetime?: Lifetime,
  ) {
    this.id = options.id ?? crypto.randomUUID();
    this.registered = [...(options.plugins ?? [])];
    this.builders = builders(config.groups, this.token) as WorkerBuilders<
      WorkerGroups
    >;
  }
  get plugins(): readonly StepPlugin<LocalFn>[] {
    return [...this.registered];
  }
  use(plugin: StepPlugin<LocalFn>): this {
    this.registered.push(plugin);
    return this;
  }
  remove(id: string): this {
    this.registered = this.registered.filter((plugin) => plugin.id !== id);
    return this;
  }
  run(...input: unknown[]): Promise<unknown> {
    return this.runWith({}, ...input);
  }
  async runWith(
    options: StepRunOptions<LocalFn>,
    ...input: unknown[]
  ): Promise<unknown> {
    let generation: Generation | undefined;
    let admissionError: unknown;
    try {
      generation = this.lifetime
        ? this.lifetime.enter()
        : new Generation(this.config);
    } catch (error) {
      admissionError = error;
    }
    try {
      const local = step(async (...args: unknown[]) => {
        if (!generation) throw admissionError;
        return await this.execute(generation, args);
      }, { id: this.id, plugins: this.registered });
      const temporary = [...(options.plugins ?? [])];
      if (!this.lifetime) {
        temporary.push(
          plugin().onFinally(async () => {
            await generation!.close();
          }),
        );
      }
      return await local.runWith({ ...options, plugins: temporary }, ...input);
    } finally {
      if (generation && this.lifetime) this.lifetime.leave();
    }
  }
  private async execute(
    generation: Generation,
    input: unknown[],
  ): Promise<unknown> {
    const tree = await this.options.split(this.builders, ...input);
    const batch = prepare(tree, this.token);
    // Snapshot getters may submit another batch or close the owner. Recheck here.
    generation.reserve(batch.jobs);
    const outcomes: WorkerOutcome<unknown>[] = await Promise.all(
      batch.jobs.map(async (job) => {
        try {
          const group = generation.groups.get(job.group)!;
          const remote = step((...args: unknown[]) => group.run(job, args), {
            id: `@worker/${job.group}`,
            plugins: group.setup.plugins as StepPlugin<
              WorkerCallable
            >[] as StepPlugin<LocalFn>[],
          });
          const value = await remote.runWith(
            { context: { capture: "none" } },
            ...job.args,
          );
          return { status: "fulfilled" as const, value };
        } catch (error) {
          return {
            status: "rejected" as const,
            error: error instanceof Error
              ? error
              : new Error("Caller job setup failed.", { cause: error }),
          };
        } finally {
          generation.release();
        }
      }),
    );
    if (this.options.mode === "collect") {
      return await this.options.join(reshape(batch.shape, outcomes));
    }
    const errors = outcomes.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.error] : []
    );
    if (errors.length) {
      throw new WorkerError("WRK_BATCH", "One or more parallel jobs failed.", {
        failures: errors,
      }, new AggregateError(errors));
    }
    const values = outcomes.map((outcome) =>
      (outcome as { value: unknown }).value
    );
    return await this.options.join(reshape(batch.shape, values));
  }
}
function facade(
  options: Options,
  config: Setup,
  lifetime?: Lifetime,
): ParallelStep<unknown[], unknown> {
  return callableFacade(
    new ParallelExecution({ ...options }, config, lifetime),
    ["id", "isSync", "plugins", "run", "runWith", "use", "remove"],
  );
}
/**
 * Create a native async step owning fresh worker resources for each invocation.
 *
 * Split and join execute in the caller. Named groups schedule independently;
 * counts are capacities, and nested arrays/readonly tuples retain association.
 * Every admitted job completes its caller hooks before its slot is released.
 * Workers are cleaned up before the invocation settles, on success or failure.
 *
 * @typeParam Groups - Inferred worker definitions and their exact callable contracts.
 * @typeParam Input - Input tuple inferred from split, after its builders parameter.
 * @typeParam Jobs - Nested job shape inferred from split; as const preserves tuples.
 * @typeParam Output - Awaited join output returned by the native Step.
 * @typeParam Mode - All-success aggregation or explicit collect outcomes.
 * @param options - Groups, split, join, mode, admission bound and native outer plugins.
 * @returns A reusable native Step; concurrent calls own independent workers/budgets.
 * @throws WRK_CONFIG at construction for invalid options. Invocation errors use
 * native Step recovery/finalization. Admission rejects atomically; all mode throws
 * WRK_BATCH after unrecovered job failures, while collect supplies ordered outcomes.
 * Cleanup failures are reported after every owned transport is asked to stop.
 */
export function parallel<
  Groups extends WorkerGroups,
  Input extends unknown[],
  const Jobs extends WorkerJobTree,
  Output,
  Mode extends "all" | "collect" = "all",
>(
  options: ParallelOptions<Groups, Input, Jobs, Output, Mode>,
): ParallelStep<Input, Output> {
  const config = setup(options);
  return facade(options as unknown as Options, config) as ParallelStep<
    Input,
    Output
  >;
}
/**
 * Create an explicit owner whose ordinary step shares fixed worker capacities.
 *
 * Workers start lazily; ready() optionally warms them. close() drains complete
 * caller invocations, including hooks and join. Default close is terminal;
 * reopenOnUse enables a fresh generation only after close completes. Optional
 * idleTimeoutMs applies the same close policy when no invocation remains active.
 * dispose()/await using and terminate() are always terminal. Garbage collection
 * does not provide reliable worker cleanup: use a scope or explicit ownership.
 *
 * @typeParam Groups - Inferred worker definitions and exact callable contracts.
 * @typeParam Input - Input tuple inferred from split.
 * @typeParam Jobs - Nested split shape, preserving readonly tuples.
 * @typeParam Output - Awaited join result.
 * @typeParam Mode - All-success aggregation or explicit collect outcomes.
 * @param options - Parallel configuration plus optional idle and reopen policies.
 * @returns An owner with a native step, warmup, graceful close and terminal disposal.
 * Shared worker-local state persists across calls; per-job contexts remain fresh.
 * @throws WRK_CONFIG synchronously for invalid setup. Executions follow parallel's
 * errors and shared admission limit. Calls during draining or after terminal
 * shutdown fail WRK_CLOSED; failures alone never reset a group's restart budget.
 */
export function persistentParallel<
  Groups extends WorkerGroups,
  Input extends unknown[],
  const Jobs extends WorkerJobTree,
  Output,
  Mode extends "all" | "collect" = "all",
>(
  options:
    & ParallelOptions<Groups, Input, Jobs, Output, Mode>
    & PersistentOptions,
): PersistentParallel<Input, Output> {
  const config = setup(options);
  const lifetime = new Lifetime(config);
  return Object.freeze({
    step: facade(
      options as unknown as Options,
      config,
      lifetime,
    ) as ParallelStep<Input, Output>,
    ready: () => lifetime.ready(),
    close: () => lifetime.close(),
    terminate: () => lifetime.terminate(),
    dispose: () => lifetime.close(true),
    [Symbol.asyncDispose]: () => lifetime.close(true),
  });
}
