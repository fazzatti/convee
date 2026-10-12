import { WasmError } from "@/wasm/error.ts";
import type { WasmBindings, WasmSession } from "@/wasm/types.ts";

function owned(output: unknown): unknown {
  const copy = structuredClone(output);
  const queue = [copy], seen = new Set<object>();
  for (const value of queue) {
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (
      typeof SharedArrayBuffer !== "undefined" &&
      value instanceof SharedArrayBuffer
    ) {
      throw new WasmError(
        "WASM_BINDING",
        "Shared guest memory cannot become an owned output.",
      );
    }
    if (ArrayBuffer.isView(value)) queue.push(value.buffer);
    else if (value instanceof Map) {
      for (const [key, item] of value) queue.push(key, item);
    } else if (value instanceof Set) {
      for (const item of value) queue.push(item);
    } else {
      for (const item of Object.values(value)) queue.push(item);
    }
  }
  return copy;
}

/** One serialized session generation and its finite replacement budget. */
export class SessionGeneration {
  private session?: WasmSession<object>;
  private started = false;
  private restarts = 0;
  private failure?: WasmError;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly bindings: WasmBindings<object>,
    private readonly maxRestarts: number,
    private readonly guard: (active: boolean) => void,
  ) {}
  run(name?: string, args: unknown[] = []): Promise<unknown> {
    const result = this.tail.then(async () => {
      const session = await this.get();
      if (name === undefined) return;
      return await this.invoke(session, name, args);
    });
    this.tail = result.then(() => {}, () => {});
    return result;
  }
  private async get(): Promise<WasmSession<object>> {
    if (this.failure) throw this.failure;
    if (this.session) return this.session;
    if (!this.started) {
      this.started = true;
      try {
        return this.session = await this.bindings.create();
      } catch (cause) {
        if (cause instanceof WasmError && cause.code === "WASM_CLEANUP") {
          throw this.failure = cause;
        }
        throw this.failure = new WasmError(
          "WASM_UNAVAILABLE",
          "Initial WASM session failed.",
          cause,
        );
      }
    }
    let cause: unknown;
    while (this.restarts < this.maxRestarts) {
      this.restarts++;
      try {
        return this.session = await this.bindings.create();
      } catch (error) {
        if (error instanceof WasmError && error.code === "WASM_CLEANUP") {
          throw this.failure = error;
        }
        cause = error;
      }
    }
    throw this.failure = new WasmError(
      "WASM_UNAVAILABLE",
      "WASM replacement budget exhausted.",
      cause,
    );
  }
  private async invoke(
    session: WasmSession<object>,
    name: string,
    args: unknown[],
  ): Promise<unknown> {
    try {
      this.guard(true);
      const fn = Reflect.get(session.exports, name);
      if (typeof fn !== "function") {
        throw new WasmError(
          "WASM_BINDING",
          "The requested WASM export is not callable.",
        );
      }
      const output: unknown = Reflect.apply(fn, session.exports, args);
      if (output && typeof Reflect.get(Object(output), "then") === "function") {
        void Promise.resolve(output).catch(() => {});
        throw new WasmError(
          "WASM_BINDING",
          "This adapter requires synchronous guest exports.",
        );
      }
      return owned(output);
    } catch (caught) {
      let error = caught;
      let application = false;
      try {
        application = !(error instanceof WebAssembly.RuntimeError) &&
          session.isApplicationError?.(error) === true;
      } catch (classification) {
        error = new AggregateError(
          [error, classification],
          "WASM error classification failed.",
        );
      }
      if (application) {
        throw new WasmError(
          "WASM_APPLICATION",
          "WASM application failed.",
          error,
        );
      }
      this.guard(false);
      try {
        await this.release();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "WASM execution and cleanup failed.",
        );
      }
      throw error;
    } finally {
      this.guard(false);
    }
  }
  private async release(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    try {
      await session?.dispose?.();
    } catch (cause) {
      throw this.failure = new WasmError(
        "WASM_CLEANUP",
        "WASM cleanup could not be confirmed.",
        cause,
      );
    }
  }
  async close(): Promise<void> {
    await this.tail;
    await this.release();
    if (this.failure?.code === "WASM_CLEANUP") throw this.failure;
  }
}
