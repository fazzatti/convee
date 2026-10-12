import { step } from "@/step/factory.ts";
import { plugin } from "@/plugin/factory.ts";
import type { StepOptions, StepPlugin, StepRunOptions } from "@/step/types.ts";
import { callableFacade } from "@/runtime/callable.ts";
import { WasmError } from "@/wasm/error.ts";
import { WasmLifetime } from "@/wasm/lifecycle.ts";
import type { SessionGeneration } from "@/wasm/session.ts";
import type {
  PersistentWasm,
  PersistentWasmOptions,
  WasmOptions,
  WasmResource,
} from "@/wasm/types.ts";

type Fn = (...args: unknown[]) => unknown;
class WasmStep {
  readonly id: string;
  readonly isSync = false;
  private registered: StepPlugin<Fn>[];
  constructor(
    private readonly lifetime: WasmLifetime,
    private readonly name: string,
    options: StepOptions<Fn>,
  ) {
    this.id = options.id ?? crypto.randomUUID();
    this.registered = [...(options.plugins ?? [])];
  }
  get plugins(): readonly StepPlugin<Fn>[] {
    return [...this.registered];
  }
  use(plugin: StepPlugin<Fn>): this {
    this.registered.push(plugin);
    return this;
  }
  remove(id: string): this {
    this.registered = this.registered.filter((value) => value.id !== id);
    return this;
  }
  run(...input: unknown[]): Promise<unknown> {
    return this.runWith({}, ...input);
  }
  async runWith(
    options: StepRunOptions<Fn>,
    ...input: unknown[]
  ): Promise<unknown> {
    let generation: SessionGeneration | undefined;
    let failure: unknown;
    try {
      generation = this.lifetime.enter();
    } catch (error) {
      failure = error;
    }
    try {
      const local = step(async (...args: unknown[]) => {
        if (!generation) throw failure;
        return await generation.run(this.name, args);
      }, { id: this.id, plugins: this.registered });
      const temporary = [...(options.plugins ?? [])];
      if (!this.lifetime.persistent && generation) {
        temporary.push(plugin().onFinally(() => generation!.close()));
      }
      return await local.runWith({ ...options, plugins: temporary }, ...input);
    } finally {
      if (generation) this.lifetime.leave();
    }
  }
}
function resource<Exports extends object>(
  lifetime: WasmLifetime,
): WasmResource<Exports> {
  return {
    preload: () => lifetime.preload(),
    step(name, options = {}) {
      if (typeof name !== "string" || !name.trim()) {
        throw new WasmError("WASM_CONFIG", "A WASM step needs an export name.");
      }
      return callableFacade(
        new WasmStep(lifetime, name, options as StepOptions<Fn>),
        ["id", "isSync", "plugins", "run", "runWith", "use", "remove"],
      );
    },
  };
}
/**
 * Create ordinary steps with a fresh owned WASM session for every invocation.
 * Shared bindings reuse compiled code; outputs are owned copies before plugins see them.
 * Cleanup runs after user finalizers and before the invocation settles.
 * @typeParam Exports - Inferred generated export contract; no duplicate interface required.
 * @param options - Bindings, optional eager preparation and bounded admission.
 * @returns An import-safe resource exposing typed step selection and preload.
 * @throws WASM_CONFIG for invalid setup. Calls reject on overload, initialization,
 * guest or cleanup failure under native Step error/finalization semantics.
 */
export function wasm<Exports extends object>(
  options: WasmOptions<Exports>,
): WasmResource<Exports> {
  return Object.freeze(resource<Exports>(new WasmLifetime(options, false)));
}
/**
 * Retain one exclusive guest session across typed ordinary Convee steps.
 * Calls share a bounded budget through finalizers. Unsafe guest failures retire
 * the session; only queued/future work may use bounded replacement, never replay.
 * @typeParam Exports - Generated callable contracts preserved by the binding adapter.
 * @param options - Bindings, preparation, capacity, replacement and lifecycle policies.
 * @returns An owner with preload, ready, steps, close and terminal async disposal.
 * @throws WASM_CONFIG for invalid setup. Calls reject on admission/lifecycle errors;
 * startup failure ends its generation, and unconfirmed cleanup prevents reopening.
 * Synchronous WASM cannot be preempted here; use a worker for hard interruption.
 */
export function persistentWasm<Exports extends object>(
  options: PersistentWasmOptions<Exports>,
): PersistentWasm<Exports> {
  const lifetime = new WasmLifetime(options, true);
  return Object.freeze({
    ...resource<Exports>(lifetime),
    ready: () => lifetime.ready(),
    close: () => lifetime.close(),
    dispose: () => lifetime.close(true),
    [Symbol.asyncDispose]: () => lifetime.close(true),
  });
}
