import type { RunContext } from "@/context/types.ts";
import { callableFacade } from "@/runtime/callable.ts";
import { step } from "@/step/factory.ts";
import type { StepPlugin } from "@/step/types.ts";
import { configure, type Setup, timeout } from "@/concurrency/config.ts";
import { ConcurrencyError } from "@/concurrency/error.ts";
import { builders, prepare, reshape } from "@/concurrency/jobs.ts";
import { Scheduler } from "@/concurrency/scheduler.ts";
import type {
  ConcurrentBuilders,
  ConcurrentJobTree,
  ConcurrentOptions,
  ConcurrentRunOptions,
  ConcurrentStep,
  ConcurrentTasks,
} from "@/concurrency/types.ts";

type Fn = (...input: unknown[]) => unknown;
type Options = ConcurrentOptions<
  ConcurrentTasks,
  unknown[],
  ConcurrentJobTree,
  unknown,
  "all" | "collect"
>;

class ConcurrentExecution {
  readonly id: string;
  readonly isSync = false;
  private registered: StepPlugin<Fn>[];
  private readonly sharedScheduler?: Scheduler;

  constructor(
    private readonly options: Options,
    private readonly config: Setup,
  ) {
    this.id = options.id ?? crypto.randomUUID();
    this.registered = [...(options.plugins ?? [])];
    this.sharedScheduler = config.capacityScope === "shared"
      ? new Scheduler(config)
      : undefined;
  }
  get plugins(): readonly StepPlugin<Fn>[] {
    return [...this.registered];
  }
  use(plugin: StepPlugin<Fn>): this {
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
    options: ConcurrentRunOptions<Fn>,
    ...input: unknown[]
  ): Promise<unknown> {
    const { signal, timeoutMs, ...native } = options;
    const execute = this.execute.bind(this, { signal, timeoutMs });
    const local = step(
      async function (this: { context(): RunContext }, ...args: unknown[]) {
        return await execute(this.context(), args);
      },
      { id: this.id, plugins: this.registered },
    );
    return await local.runWith(native, ...input);
  }

  private async execute(
    options: { signal?: AbortSignal; timeoutMs?: number },
    context: RunContext,
    input: unknown[],
  ): Promise<unknown> {
    const { signal } = options;
    if (signal !== undefined) {
      try {
        // Validate the native brand, including signals from another browser realm.
        Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!
          .call(signal);
      } catch (cause) {
        throw new ConcurrencyError(
          "CNC_CONFIG",
          "signal must be an AbortSignal.",
          {},
          cause,
        );
      }
    }
    const milliseconds = timeout(
      options.timeoutMs === undefined
        ? this.options.timeoutMs
        : options.timeoutMs,
    );
    const controller = new AbortController();
    const forward = () =>
      controller.abort(
        new ConcurrencyError(
          "CNC_ABORTED",
          "Concurrent invocation aborted.",
          {},
          signal!.reason,
        ),
      );
    signal?.addEventListener("abort", forward, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (signal?.aborted) forward();
      if (milliseconds !== undefined) {
        timer = setTimeout(() =>
          controller.abort(
            new ConcurrencyError(
              "CNC_TIMEOUT",
              "Concurrent invocation deadline elapsed.",
            ),
          ), milliseconds);
      }
      controller.signal.throwIfAborted();
      const token = {};
      const scope = builders(
        this.config.tasks,
        token,
        controller.signal,
      ) as ConcurrentBuilders<ConcurrentTasks>;
      const tree = await this.options.split(scope, ...input);
      controller.signal.throwIfAborted();
      const batch = prepare(tree, token, this.config.maxPending);
      const scheduler = this.sharedScheduler ?? new Scheduler(this.config);
      const outcomes = await scheduler.submit(
        batch.jobs,
        controller.signal,
        context,
      );
      controller.signal.throwIfAborted();
      if (this.options.mode !== "collect") {
        const errors = outcomes.flatMap((outcome) =>
          outcome.status === "rejected" ? [outcome.error] : []
        );
        if (errors.length) {
          throw new ConcurrencyError(
            "CNC_BATCH",
            "One or more concurrent jobs failed.",
            { failures: errors },
            new AggregateError(errors),
          );
        }
      }
      const values = this.options.mode === "collect"
        ? outcomes
        : outcomes.map((outcome) => (outcome as { value: unknown }).value);
      const result = await this.options.join(
        reshape(batch.shape, values) as readonly unknown[],
      );
      controller.signal.throwIfAborted();
      return result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  }
}

/**
 * Compose local tasks into a native step with bounded async concurrency.
 *
 * Functions, steps and pipelines run in this runtime without cloning or worker
 * modules. Each invocation owns its global/per-task limits by default; an explicit
 * shared capacity scope applies one budget across calls on this definition.
 * Split creates inert jobs; admission is atomic, and join sees input-ordered
 * results after every task and its hooks finish. No retries or implicit close.
 *
 * @typeParam Tasks - Named callables and their exact argument/result contracts.
 * @typeParam Input - Input tuple inferred from split after its scope argument.
 * @typeParam Jobs - Nested descriptor shape; use as const for heterogeneous tuples.
 * @typeParam Output - Awaited join output returned by the callable native step.
 * @typeParam Mode - All-success values or explicit collected outcomes.
 * @param options - Tasks, split/join, capacity scope/limits, optional deadline and native plugins.
 * @returns A reusable callable step; use runWith for a per-run signal or deadline.
 * @throws CNC_CONFIG synchronously for invalid configuration. Executions reject
 * with CNC_CAPACITY, CNC_ABORTED, CNC_TIMEOUT, CNC_BATCH or native outer hook errors.
 * All mode drains then aggregates every original task error in input order; collect
 * joins outcomes. Cancellation skips join if not yet started and waits for
 * already-running work and its actual cleanup.
 * @remarks Limits cover task hooks, not outer hooks or join. Pass each builder's signal
 * explicitly to cooperative I/O. A non-cooperative operation can delay cancellation
 * indefinitely. Shared references remain mutable; this does not provide isolation,
 * CPU parallelism or exclusive ownership of application resources. Do not await
 * recursively submitted work on the same exhausted scheduler.
 */
export function concurrent<
  Tasks extends ConcurrentTasks,
  Input extends unknown[],
  const Jobs extends ConcurrentJobTree,
  Output,
  Mode extends "all" | "collect" = "all",
>(
  options: ConcurrentOptions<Tasks, Input, Jobs, Output, Mode>,
): ConcurrentStep<Input, Output> {
  const snapshot = { ...options };
  const config = configure(snapshot);
  return callableFacade(
    new ConcurrentExecution(snapshot as unknown as Options, config),
    ["id", "isSync", "plugins", "run", "runWith", "use", "remove"],
  );
}
