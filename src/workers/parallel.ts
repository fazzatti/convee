import { step } from "@/step/factory.ts";
import { WorkerError } from "@/workers/error.ts";
import type {
  ParallelOptions,
  ParallelStep,
  WorkerJob,
  WorkerTaskMap,
} from "@/workers/types.ts";

/** Fan out to workers and join ordered successful results inside an ordinary async Step. */
export function parallel<
  Tasks extends WorkerTaskMap,
  Role extends string,
  Input extends unknown[],
  const Jobs extends readonly WorkerJob<Tasks, Role>[],
  Output,
>(
  options: ParallelOptions<Tasks, Role, Input, Jobs, Output, "all">,
): ParallelStep<Input, Output>;
/** Collect individual failures and let join explicitly choose the combined result. */
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
