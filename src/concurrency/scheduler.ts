import {
  dispatchCounts,
  occupancy,
  settleCounts,
} from "@/concurrency/accounting.ts";
import { admittedOccupancy, fitsCapacity } from "@/core/capacity.ts";
import { firstEligible } from "@/core/eligibility.ts";
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

  constructor(private readonly config: Setup) {}

  async submit(
    jobs: readonly PreparedJob[],
    signal: AbortSignal,
    context: RunContext,
  ): Promise<ConcurrentOutcome<unknown>[]> {
    signal.throwIfAborted();
    const next = admittedOccupancy(
      occupancy(this.queue.length, this.running),
      jobs.length,
      this.config.maxPending,
    );
    if (next < 0) {
      throw new ConcurrencyError(
        "CNC_CAPACITY",
        "The batch exceeds the available admission capacity.",
      );
    }
    const cancel = () => {
      this.queue = this.queue.filter((entry) => {
        if (entry.signal !== signal) return true;
        entry.resolve({ status: "rejected", error: signal.reason });
        return false;
      });
    };
    signal.addEventListener("abort", cancel, { once: true });
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
    while (fitsCapacity(this.running, 1, this.config.concurrency)) {
      const index = firstEligible(
        this.queue,
        0,
        ({ task }) =>
          fitsCapacity(this.active.get(task) ?? 0, 1, task.concurrency),
      );
      if (index < 0) return;
      const entry = this.queue[index];
      const counts = dispatchCounts(
        this.queue.length,
        this.running,
        this.active.get(entry.task) ?? 0,
      );
      this.queue.splice(index, 1);
      this.running = counts.running;
      this.active.set(entry.task, counts.task);
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
    const counts = settleCounts(this.running, this.active.get(entry.task)!);
    this.running = counts.running;
    this.active.set(entry.task, counts.task);
    entry.resolve(outcome);
    this.pump();
  }
}
