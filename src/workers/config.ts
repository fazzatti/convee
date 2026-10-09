import { WorkerError } from "@/workers/error.ts";
import type { WorkerSlot, WorkerTransport } from "@/workers/types.ts";

export interface PluginSpec {
  name: string;
  options?: unknown;
}
export interface NodeSpec {
  task: string;
  id?: string;
  plugins: PluginSpec[];
}
export interface RecipeSpec {
  steps: NodeSpec[];
  plugins: PluginSpec[];
}
export interface RoleSpec {
  name: string;
  size: number;
  tasks?: string[];
  plugins: Record<string, PluginSpec[]>;
}
export interface PoolSetup {
  module: string;
  pipelines: Record<string, RecipeSpec>;
  roles: RoleSpec[];
  explicitRoles: boolean;
  size: number;
  maxPending: number;
  startupTimeoutMs: number;
  timeoutMs: number;
  createWorker: (entry: URL, slot: WorkerSlot) => WorkerTransport;
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkerError("WRK_CONFIG", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
export function name(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorkerError("WRK_CONFIG", `${label} must be a nonempty string.`);
  }
  return value;
}
export function positive(
  value: unknown,
  fallback: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (
    typeof result !== "number" || !Number.isSafeInteger(result) ||
    result <= 0 || result > 2_147_483_647
  ) {
    throw new WorkerError(
      "WRK_CONFIG",
      `${label} must be a positive integer at most 2147483647.`,
    );
  }
  return result;
}
export function clone<Value>(value: Value): Value {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw new WorkerError(
      "WRK_CLONE",
      "Worker configuration and payloads must support structured cloning.",
      {},
      cause,
    );
  }
}
export function plugins(value: unknown = []): PluginSpec[] {
  if (!Array.isArray(value)) {
    throw new WorkerError("WRK_CONFIG", "plugins must be an array.");
  }
  return value.map((item) => {
    const spec = record(item, "plugin reference");
    return { name: name(spec.name, "plugin name"), options: spec.options };
  });
}
function recipe(value: unknown): RecipeSpec {
  const input = record(value, "pipeline");
  if (!Array.isArray(input.steps) || !input.steps.length) {
    throw new WorkerError(
      "WRK_CONFIG",
      "A worker pipeline needs at least one step.",
    );
  }
  const ids = new Set<string>();
  const steps = input.steps.map((value): NodeSpec => {
    const node = typeof value === "string"
      ? { task: value }
      : record(value, "pipeline node");
    const task = name(node.task, "task name");
    const id = node.id === undefined ? task : name(node.id, "node id");
    if (ids.has(id)) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Recipe node IDs must be unique; give repeated tasks explicit IDs.",
        { id },
      );
    }
    ids.add(id);
    return { task, id, plugins: plugins(node.plugins) };
  });
  return { steps, plugins: plugins(input.plugins) };
}
export function recipes(value: unknown = {}): Record<string, RecipeSpec> {
  return Object.fromEntries(
    Object.entries(record(value, "pipelines")).map((
      [key, value],
    ) => [name(key, "pipeline name"), recipe(value)]),
  );
}
function role(roleName: string, value: unknown): RoleSpec {
  const input = record(value, "role");
  let tasks: string[] | undefined;
  if (input.tasks !== undefined) {
    if (!Array.isArray(input.tasks) || !input.tasks.length) {
      throw new WorkerError(
        "WRK_CONFIG",
        "A role's task selection must be a nonempty array.",
      );
    }
    tasks = input.tasks.map((item) => name(item, "role task"));
    if (new Set(tasks).size !== tasks.length) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Role task selections must be unique.",
      );
    }
  }
  return {
    name: name(roleName, "role name"),
    size: positive(input.size, 0, "role size"),
    tasks,
    plugins: Object.fromEntries(
      Object.entries(record(input.plugins ?? {}, "role plugins")).map((
        [key, value],
      ) => [key, plugins(value)]),
    ),
  };
}
/** Normalize and snapshot configuration before any worker starts. */
export function poolSetup(value: unknown): PoolSetup {
  const input = record(value, "pool options");
  if (!(input.module instanceof URL)) {
    throw new WorkerError("WRK_CONFIG", "module must be an absolute URL.");
  }
  if ((input.roles === undefined) === (input.size === undefined)) {
    throw new WorkerError("WRK_CONFIG", "Supply exactly one of size or roles.");
  }
  if (
    input.createWorker !== undefined && typeof input.createWorker !== "function"
  ) throw new WorkerError("WRK_CONFIG", "createWorker must be a function.");
  const roles = input.roles === undefined
    ? [role("default", { size: input.size })]
    : Object.entries(record(clone(input.roles), "roles")).map(([key, value]) =>
      role(key, value)
    );
  if (!roles.length) {
    throw new WorkerError("WRK_CONFIG", "A pool needs at least one role.");
  }
  const size = positive(
    roles.reduce((sum, role) => sum + role.size, 0),
    0,
    "total size",
  );
  return {
    module: input.module.href,
    pipelines: recipes(clone(input.pipelines)),
    roles,
    size,
    explicitRoles: input.roles !== undefined &&
      !(roles.length === 1 && roles[0].name === "default"),
    maxPending: positive(input.maxPending, 1024, "maxPending"),
    startupTimeoutMs: positive(
      input.startupTimeoutMs,
      10000,
      "startupTimeoutMs",
    ),
    timeoutMs: positive(input.timeoutMs, 30000, "timeoutMs"),
    createWorker: input.createWorker as PoolSetup["createWorker"] ??
      ((entry, slot) =>
        new Worker(entry.href, { type: "module", name: slot.id })),
  };
}
