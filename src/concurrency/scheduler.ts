import type { RunContext } from "@/context/types.ts";
import { ConcurrencyError } from "@/concurrency/error.ts";
import type { Setup, TaskSetup } from "@/concurrency/config.ts";
import type { PreparedJob } from "@/concurrency/jobs.ts";
import type { ConcurrentOutcome } from "@/concurrency/types.ts";

interface Entry extends PreparedJob {
  context: RunContext;
  signal: AbortSignal;
  resolve(outcome: ConcurrentOutcome<unknown>): void;
}

/** Shared admission and FIFO-among-eligible-task scheduling; no worker resources. */
export class Scheduler {
  private queue: Entry[] = [];
  private readonly active = new Map<TaskSetup, number>();
  private running = 0;
  private pending = 0;

  constructor(private readonly config: Setup) {}

  async submit(
    jobs: readonly PreparedJob[],
    signal: AbortSignal,
    context: RunContext,
  ): Promise<ConcurrentOutcome<unknown>[]> {
    signal.throwIfAborted();
    if (jobs.length > this.config.maxPending - this.pending) {
      throw new ConcurrencyError(
        "CNC_CAPACITY",
        "The batch exceeds the available admission capacity.",
      );
    }
    const cancel = () => {
      this.queue = this.queue.filter((entry) => {
        if (entry.signal !== signal) return true;
        this.pending--;
        entry.resolve({ status: "rejected", error: signal.reason });
        return false;
      });
    };
    signal.addEventListener("abort", cancel, { once: true });
    this.pending += jobs.length;
    const promises = jobs.map((job) =>
      new Promise<ConcurrentOutcome<unknown>>((resolve) => {
        this.queue.push({ ...job, context, signal, resolve });
      })
    );
    try {
      this.pump();
      return await Promise.all(promises);
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }

  private pump(): void {
    while (this.running < this.config.concurrency) {
      const index = this.queue.findIndex(({ task }) =>
        (this.active.get(task) ?? 0) < task.concurrency
      );
      if (index < 0) return;
      const [entry] = this.queue.splice(index, 1);
      this.running++;
      this.active.set(entry.task, (this.active.get(entry.task) ?? 0) + 1);
      void this.execute(entry);
    }
  }

  private async execute(entry: Entry): Promise<void> {
    let outcome: ConcurrentOutcome<unknown>;
    try {
      entry.signal.throwIfAborted();
      const value = await entry.task.executable.runWith(
        { context: { parent: entry.context } },
        ...entry.args,
      );
      outcome = { status: "fulfilled", value };
    } catch (error) {
      outcome = {
        status: "rejected",
        error: error instanceof Error
          ? error
          : new Error("Concurrent task failed.", { cause: error }),
      };
    }
    this.running--;
    this.pending--;
    this.active.set(entry.task, this.active.get(entry.task)! - 1);
    entry.resolve(outcome);
    this.pump();
  }
}
