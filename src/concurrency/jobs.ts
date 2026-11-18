import { appendedIndex, branchAllowed, type Shape } from "@/core/job-tree.ts";
import { ConcurrencyError } from "@/concurrency/error.ts";
import type { TaskSetup } from "@/concurrency/config.ts";
import type { ConcurrentJob } from "@/concurrency/types.ts";

interface Descriptor {
  owner: object;
  task: TaskSetup;
  args: unknown[];
}
const descriptors = new WeakMap<object, Descriptor>();
export type PreparedJob = Omit<Descriptor, "owner">;

export function builders(
  tasks: readonly TaskSetup[],
  owner: object,
  signal: AbortSignal,
): object {
  return Object.freeze(
    Object.fromEntries(tasks.map((task) => [
      task.name,
      Object.freeze({
        signal,
        job(...args: unknown[]): ConcurrentJob {
          const job = Object.freeze({});
          descriptors.set(job, { owner, task, args });
          return job as ConcurrentJob;
        },
      }),
    ])),
  );
}

export function prepare(
  tree: unknown,
  owner: object,
  maximum: number,
): { jobs: PreparedJob[]; shape: Shape[] } {
  const jobs: PreparedJob[] = [];
  const ancestors = new Set<unknown>();
  function visit(value: unknown, depth: number): Shape {
    if (Array.isArray(value)) {
      if (!branchAllowed(ancestors.has(value), depth)) {
        throw new ConcurrencyError(
          "CNC_CONFIG",
          "Job trees must be acyclic and at most 256 levels deep.",
        );
      }
      ancestors.add(value);
      const shape: Shape[] = [];
      const length = value.length;
      for (let index = 0; index < length; index++) {
        shape.push(
          visit(
            Object.hasOwn(value, index) ? value[index] : undefined,
            depth + 1,
          ),
        );
      }
      ancestors.delete(value);
      return shape;
    }
    const descriptor = value && typeof value === "object"
      ? descriptors.get(value)
      : undefined;
    if (!descriptor || descriptor.owner !== owner) {
      throw new ConcurrencyError(
        "CNC_CONFIG",
        "Split must return only jobs built for this invocation.",
      );
    }
    if (jobs.length >= maximum) {
      throw new ConcurrencyError(
        "CNC_CAPACITY",
        "The batch exceeds maxPending.",
      );
    }
    jobs.push({ task: descriptor.task, args: [...descriptor.args] });
    return appendedIndex(jobs.length);
  }
  if (!Array.isArray(tree)) {
    throw new ConcurrencyError(
      "CNC_CONFIG",
      "Split must return a nested array of jobs.",
    );
  }
  const shape = visit(tree, 0) as Shape[];
  return { jobs, shape };
}
