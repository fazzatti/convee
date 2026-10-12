import type { WorkerCallable, WorkerDefinition } from "@/workers/types.ts";
import type { StepPlugin } from "@/step/types.ts";
import { WorkerError } from "@/workers/error.ts";

const BRAND = Symbol.for("convee/worker-definition");
export interface DefinitionData {
  readonly entry?: string;
  readonly callable: WorkerCallable;
  readonly plugins: readonly StepPlugin<WorkerCallable>[];
}
export function definitionData(value: unknown): DefinitionData {
  if (!value || typeof value !== "object") {
    throw new WorkerError("WRK_CONFIG", "Expected a Convee worker definition.");
  }
  const data = Reflect.get(value, BRAND) as DefinitionData | undefined;
  if (
    !data || typeof data.callable !== "function" || !Array.isArray(data.plugins)
  ) {
    throw new WorkerError("WRK_CONFIG", "Expected a Convee worker definition.");
  }
  return data;
}
function define<Fn extends WorkerCallable>(
  callable: Fn,
  module: string,
  plugins: readonly StepPlugin<Fn>[],
  entry?: string,
): WorkerDefinition<Fn> {
  return Object.freeze({
    module,
    [BRAND]: Object.freeze({
      callable,
      entry,
      plugins: Object.freeze([...plugins]),
    }),
    use<Plugin extends StepPlugin<Fn>>(plugin: Plugin): WorkerDefinition<Fn> {
      return define(callable, module, [...plugins, plugin], entry);
    },
  });
}
/**
 * Describe one function, native step or pipeline as an import-safe worker.
 *
 * Export the result as the module's default. Importing it in the caller infers
 * its input/output types without starting workers or executing its callable.
 * The module and dependencies are evaluated in both caller and workers; keep
 * module initialization safe in both environments. Inner plugins stay remote.
 *
 * @typeParam Fn - Exact callable input and output contract.
 * @param callable - Single executable contract; closures are created by module loading.
 * @param options - Absolute definition URL, normally `{ module: import.meta.url }`.
 * @returns An immutable definition; use() returns a separate caller-hook configuration.
 * @throws WRK_CONFIG synchronously for a non-callable or invalid absolute URL.
 * Execution, loading and transport errors occur later through a parallel Step.
 */
export function worker<Fn extends WorkerCallable>(
  callable: Fn,
  options: { readonly module: string | URL },
): WorkerDefinition<Fn> {
  if (typeof callable !== "function") {
    throw new WorkerError("WRK_CONFIG", "A worker requires one callable.");
  }
  let module: string;
  try {
    if (
      typeof options?.module !== "string" && !(options?.module instanceof URL)
    ) throw new TypeError();
    module = new URL(options.module).href;
  } catch (cause) {
    throw new WorkerError(
      "WRK_CONFIG",
      "A worker requires an absolute module URL.",
      {},
      cause,
    );
  }
  const emitted: unknown = Reflect.get(options, "entry");
  const entry = emitted === undefined
    ? undefined
    : new URL(String(emitted), module).href;
  return define(callable, module, [], entry);
}
