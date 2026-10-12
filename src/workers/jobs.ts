import { clone, type GroupSetup } from "@/workers/config.ts";
import { WorkerError } from "@/workers/error.ts";
import { contextValid } from "@/workers/protocol.ts";
import type { WorkerContext, WorkerJob } from "@/workers/types.ts";

interface Descriptor {
  owner: object;
  group: string;
  args: unknown[];
  context?: WorkerContext;
}
const descriptors = new WeakMap<object, Descriptor>();
export interface PreparedJob extends Omit<Descriptor, "owner"> {
  id: string;
  path: number[];
}
export type Shape = number | Shape[];
function descriptor(data: Descriptor): WorkerJob {
  const job = Object.freeze({
    withContext(context: WorkerContext): WorkerJob {
      if (!contextValid(context)) {
        throw new WorkerError("WRK_CONFIG", "Invalid worker context.");
      }
      return descriptor({ ...data, context });
    },
  });
  descriptors.set(job, data);
  return job;
}
export function builders(groups: GroupSetup[], owner: object): object {
  return Object.freeze(
    Object.fromEntries(groups.map((group) => [
      group.name,
      Object.freeze({
        job(...args: unknown[]): WorkerJob {
          return descriptor({ owner, group: group.name, args });
        },
      }),
    ])),
  );
}
/** Snapshot an entire dense, acyclic job tree before any admission side effect. */
export function prepare(
  tree: unknown,
  owner: object,
): { jobs: PreparedJob[]; shape: Shape[] } {
  const jobs: PreparedJob[] = [];
  const ancestors = new Set<unknown>();
  function visit(value: unknown, path: number[]): Shape {
    if (Array.isArray(value)) {
      if (ancestors.has(value) || path.length > 256) {
        throw new WorkerError(
          "WRK_CONFIG",
          "Job trees must be acyclic and at most 256 levels deep.",
        );
      }
      ancestors.add(value);
      const result: Shape[] = [];
      const length = value.length;
      for (let index = 0; index < length; index++) {
        result.push(visit(value[index], [...path, index]));
      }
      ancestors.delete(value);
      return result;
    }
    const data = value && typeof value === "object"
      ? descriptors.get(value)
      : undefined;
    if (!data || data.owner !== owner) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Split must return only jobs built for this parallel definition.",
      );
    }
    const snapshot = clone({ args: data.args, context: data.context });
    if (!contextValid(snapshot.context)) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Worker context changed to an invalid shape before admission.",
      );
    }
    jobs.push({
      ...snapshot,
      group: data.group,
      id: crypto.randomUUID(),
      path,
    });
    return jobs.length - 1;
  }
  if (!Array.isArray(tree)) {
    throw new WorkerError(
      "WRK_CONFIG",
      "Split must return a nested array of jobs.",
    );
  }
  const shape = visit(tree, []) as Shape[];
  return { jobs, shape };
}
export function reshape(shape: Shape, values: readonly unknown[]): unknown {
  return typeof shape === "number"
    ? values[shape]
    : shape.map((child) => reshape(child, values));
}
