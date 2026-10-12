import { WasmError } from "@/wasm/error.ts";
import { SessionGeneration } from "@/wasm/session.ts";
import type { PersistentWasmOptions, WasmBindings } from "@/wasm/types.ts";

function integer(
  value: number | undefined,
  fallback: number,
  min: number,
): number {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < min || result > 2147483647) {
    throw new WasmError("WASM_CONFIG", "WASM limits must be bounded integers.");
  }
  return result;
}
/** Admission covers the full native lifecycle; only guest access is serialized. */
export class WasmLifetime {
  private phase: "open" | "closing" | "dormant" | "closed" = "open";
  private active = 0;
  private invoking = false;
  private terminal = false;
  private failed?: unknown;
  private generation?: SessionGeneration;
  private timer?: ReturnType<typeof setTimeout>;
  private drained?: () => void;
  private closing?: Promise<void>;
  private readonly maxPending: number;
  private readonly maxRestarts: number;
  private readonly idle?: number;
  private readonly reopen: boolean;
  readonly bindings: WasmBindings<object>;
  constructor(
    options: PersistentWasmOptions<object>,
    readonly persistent: boolean,
  ) {
    if (
      !options || typeof options.bindings?.preload !== "function" ||
      typeof options.bindings.create !== "function" ||
      (options.loading !== undefined && options.loading !== "lazy" &&
        options.loading !== "eager") ||
      (options.reopenOnUse !== undefined &&
        typeof options.reopenOnUse !== "boolean")
    ) {
      throw new WasmError(
        "WASM_CONFIG",
        "Invalid WASM options or binding factory.",
      );
    }
    this.bindings = options.bindings;
    this.maxPending = integer(options.maxPending, 1024, 1);
    this.maxRestarts = integer(options.maxRestarts, 2, 0);
    this.idle = options.idleTimeoutMs === undefined
      ? undefined
      : integer(options.idleTimeoutMs, 0, 1);
    this.reopen = options.reopenOnUse === true;
    if (options.loading === "eager") void this.preload().catch(() => {});
  }
  private available(): void {
    if (this.failed) throw this.failed;
    if (this.terminal || this.phase === "closing" || this.phase === "closed") {
      throw new WasmError(
        "WASM_CLOSED",
        "WASM owner is not accepting executions.",
      );
    }
    if (this.invoking) {
      throw new WasmError(
        "WASM_REENTRANT",
        "Guest imports cannot reacquire the same WASM owner.",
      );
    }
  }
  enter(): SessionGeneration {
    this.available();
    if (this.active >= this.maxPending) {
      throw new WasmError(
        "WASM_CAPACITY",
        "WASM admission capacity exhausted.",
      );
    }
    clearTimeout(this.timer);
    this.phase = "open";
    this.active++;
    const create = () =>
      new SessionGeneration(this.bindings, this.maxRestarts, (value) => {
        this.invoking = value;
      });
    return this.persistent ? this.generation ??= create() : create();
  }
  leave(): void {
    this.active--;
    if (this.active) return;
    this.drained?.();
    if (this.persistent && this.phase === "open" && this.idle !== undefined) {
      this.timer = setTimeout(() => {
        void this.close().catch((error) => {
          this.failed = error;
        });
      }, this.idle);
    }
  }
  async preload(): Promise<void> {
    this.available();
    await this.bindings.preload();
  }
  async ready(): Promise<void> {
    const generation = this.enter();
    try {
      await generation.run();
    } finally {
      this.leave();
    }
  }
  close(terminal = false): Promise<void> {
    this.terminal ||= terminal;
    clearTimeout(this.timer);
    if (this.phase === "closing" || this.phase === "closed") {
      return this.closing!;
    }
    this.phase = "closing";
    this.closing = (async () => {
      try {
        if (this.active) {
          await new Promise<void>((resolve) => {
            this.drained = resolve;
          });
        }
        await this.generation?.close();
      } catch (error) {
        this.failed = error;
        this.terminal = true;
        throw error;
      } finally {
        this.generation = undefined;
        this.drained = undefined;
        this.phase = this.terminal || !this.reopen ? "closed" : "dormant";
      }
    })();
    return this.closing;
  }
}
