import type { Setup } from "@/workers/config.ts";
import { WorkerError } from "@/workers/error.ts";
import { Generation } from "@/workers/pool.ts";

/** Own complete caller lifecycles, not merely remote dispatch time. */
export class Lifetime {
  private phase: "open" | "closing" | "dormant" | "closed" = "open";
  private terminal = false;
  private active = 0;
  private generation?: Generation;
  private timer?: ReturnType<typeof setTimeout>;
  private drained?: () => void;
  private closing?: Promise<void>;
  private stopping?: Promise<void>;
  private failure?: unknown;
  constructor(private readonly setup: Setup) {}
  enter(): Generation {
    if (this.failure) throw this.failure;
    if (this.terminal || this.phase === "closing" || this.phase === "closed") {
      throw new WorkerError(
        "WRK_CLOSED",
        "Persistent parallel is not accepting new executions.",
      );
    }
    clearTimeout(this.timer);
    this.phase = "open";
    this.active++;
    return this.generation ??= new Generation(this.setup);
  }
  leave(): void {
    this.active--;
    if (this.active !== 0) return;
    this.drained?.();
    if (this.phase === "open" && this.setup.idleTimeoutMs !== undefined) {
      this.timer = setTimeout(() => {
        void this.close().catch((error) => {
          this.failure = error;
        });
      }, this.setup.idleTimeoutMs);
    }
  }
  async ready(): Promise<void> {
    const generation = this.enter();
    try {
      await generation.ready();
    } finally {
      this.leave();
    }
  }
  close(terminal = false): Promise<void> {
    this.terminal ||= terminal;
    clearTimeout(this.timer);
    if (this.phase === "closing" || this.phase === "closed") {
      // Both phases have an existing close or termination promise.
      return this.stopping ?? this.closing!;
    }
    this.phase = "closing";
    this.generation?.stopAdmission();
    this.closing = (async () => {
      try {
        if (this.active) {
          await new Promise<void>((resolve) => {
            this.drained = resolve;
          });
        }
        await this.generation?.close();
      } catch (error) {
        this.failure = error;
        this.terminal = true;
        throw error;
      } finally {
        this.generation = undefined;
        this.drained = undefined;
        this.phase = this.terminal || !this.setup.reopenOnUse
          ? "closed"
          : "dormant";
      }
    })();
    return this.closing;
  }
  terminate(): Promise<void> {
    this.terminal = true;
    if (this.phase !== "closing") this.phase = "closed";
    clearTimeout(this.timer);
    if (!this.stopping) {
      this.stopping = this.generation?.close() ?? Promise.resolve();
    }
    return this.stopping;
  }
}
