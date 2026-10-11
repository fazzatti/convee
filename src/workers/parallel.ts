import { step } from "@/step/factory.ts";
import { WorkerError } from "@/workers/error.ts";
import type {
  ParallelOptions,
  ParallelStep,
  WorkerJob,
  WorkerTaskMap,
} from "@/workers/types.ts";

/**
 * Wrap worker fan-out and an ordered successful-result join in an async Convee step.
 *
 * Each invocation runs split in the caller, submits its batch to the shared pool,
 * waits for every admitted job, and runs join in the caller only if all succeeded.
 * An empty batch still calls join. Outer plugins wrap the entire split/run/join
 * lifecycle, and the returned step can be reused or composed in a normal pipeline.
 *
 * @param options - Worker pool, input-to-jobs split function, values-to-output join
 * function, optional `all` mode, step ID and outer plugins.
 *
 * @returns A Step accepting split's input tuple and resolving to join's awaited output.
 * The pool remains caller-owned and is not closed after an invocation.
 * @throws WorkerError with `WRK_CONFIG` synchronously for invalid factory options.
 * The returned step rejects with `WRK_BATCH` after any admitted job fails, retaining
 * every failure, unless an outer error hook recovers. Split, join, admission and
 * cleanup failures follow normal step error/finalization handling.
 */
export function parallel<
  Tasks extends WorkerTaskMap,
  Role extends string,
  Input extends unknown[],
  const Jobs extends readonly WorkerJob<Tasks, Role>[],
  Output,
>(
  options: ParallelOptions<Tasks, Role, Input, Jobs, Output, "all">,
): ParallelStep<Input, Output>;
/**
 * Wrap worker fan-out and an ordered success/failure join in an async Convee step.
 *
 * Collect mode waits for every admitted job and passes each explicit outcome to
 * join, including failures. Split and join execute in the caller. Empty batches
 * still call join, and outer plugins wrap the complete invocation lifecycle.
 *
 * @param options - Worker pool, split function, outcome-aware join function,
 * required `collect` mode, optional step ID and outer plugins.
 *
 * @returns A reusable Step resolving to join's awaited output; pool ownership stays
 * with the caller. Individual rejected outcomes do not automatically fail the step.
 * @throws WorkerError with `WRK_CONFIG` synchronously for invalid factory options.
 * Batch admission, split or join failures reject the returned step unless recovered
 * by an outer error hook; finalizer failures use normal step cleanup handling.
 */
export function parallel<
  Tasks extends WorkerTaskMap,
  Role extends string,
  Input extends unknown[],
  const Jobs extends readonly WorkerJob<Tasks, Role>[],
  Output,
>(
  options: ParallelOptions<Tasks, Role, Input, Jobs, Output, "collect"> & {
    mode: "collect";
  },
): ParallelStep<Input, Output>;
/**
 * Construct a worker-backed async step with all-success or explicit-outcome joining.
 *
 * @param options - Shared pool, split and join callbacks, mode, optional ID and plugins.
 *
 * @returns A normal reusable Step: split and join run locally, admitted jobs run remotely,
 * and the pool remains owned by the caller. The overloads describe each join contract.
 * @throws `WRK_CONFIG` for invalid construction options. Invocations use normal step
 * error/finalization handling; all mode aggregates failed jobs as `WRK_BATCH`, while
 * collect mode passes those failures to join as ordered outcome values.
 */
export function parallel<
  Tasks extends WorkerTaskMap,
  Role extends string,
  Input extends unknown[],
  const Jobs extends readonly WorkerJob<Tasks, Role>[],
  Output,
>(
  options: ParallelOptions<Tasks, Role, Input, Jobs, Output, "all" | "collect">,
): ParallelStep<Input, Output> {
  if (
    !options || typeof options.split !== "function" ||
    typeof options.join !== "function" ||
    typeof options.workers?.settle !== "function" ||
    (options.mode !== undefined && options.mode !== "all" &&
      options.mode !== "collect")
  ) {
    throw new WorkerError(
      "WRK_CONFIG",
      "parallel requires a worker pool, split, join and a valid mode.",
    );
  }
  const { workers, split, join, mode, id, plugins } = options;
  return step<Input, Output>(async (...input: Input): Promise<Output> => {
    const jobs = await split(...input);
    const outcomes = await workers.settle(jobs);
    if (mode === "collect") return await join(outcomes);
    const errors = outcomes.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.error] : []
    );
    if (errors.length) {
      throw new WorkerError("WRK_BATCH", "One or more parallel jobs failed.", {
        failures: errors,
      }, new AggregateError(errors));
    }
    // Every failure was rejected above, so only fulfilled outcomes remain.
    const results = outcomes.map((outcome) =>
      (outcome as { readonly value: unknown }).value
    );
    return await join(results as Parameters<typeof join>[0]);
  }, { id, plugins });
}
