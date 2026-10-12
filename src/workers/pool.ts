import { clone, type GroupSetup, type Setup } from "@/workers/config.ts";
import { moduleUrl } from "@/workers/module-url.ts";
import { WorkerError, type WorkerErrorCode } from "@/workers/error.ts";
import { type PreparedJob } from "@/workers/jobs.ts";
import {
  isReply,
  PROTOCOL,
  type Reply,
  type RunMessage,
} from "@/workers/protocol.ts";
import type { CreateWorker, WorkerTransport } from "@/workers/types.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
interface Pending {
  job: PreparedJob;
  request: RunMessage;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}
interface Slot {
  id: string;
  index: number;
  restart: number;
  ready: boolean;
  dead: boolean;
  expired: boolean;
  abort: AbortController;
  expiration: { promise: Promise<void>; reject(error: unknown): void };
  transport?: WorkerTransport;
  constructing?: Promise<void>;
  stopping?: Promise<void>;
  current?: Pending;
  timer?: ReturnType<typeof setTimeout>;
  listeners: [string, EventListener][];
}
/** One independent queue and bounded replacement budget for one generation. */
export class Group {
  private state: "new" | "active" | "failed" | "closed" = "new";
  private readonly queue: Pending[] = [];
  private readonly slots = new Set<Slot>();
  private readonly startup = deferred<void>();
  private readonly stops: Promise<void>[] = [];
  private pumping = false;
  private restarts = 0;
  private failure?: WorkerError;
  private shutdown?: Promise<void>;
  constructor(
    readonly setup: GroupSetup,
    private readonly createWorker: CreateWorker,
  ) {}
  available(): void {
    if (this.state === "closed") {
      throw new WorkerError("WRK_CLOSED", "Worker group is closed.", {
        group: this.setup.name,
      });
    }
    if (this.failure) throw this.unavailable();
  }
  ready(): Promise<void> {
    this.available();
    if (this.state === "new") {
      this.state = "active";
      for (let index = 0; index < this.setup.count; index++) {
        this.spawn(index, 0);
      }
    }
    return this.startup.promise;
  }
  run(job: PreparedJob, args: unknown[]): Promise<unknown> {
    this.available();
    const request: RunMessage = clone({
      protocol: PROTOCOL,
      kind: "run",
      id: job.id,
      args,
      context: job.context,
    });
    const result = new Promise((resolve, reject) => {
      this.queue.push({ job, request, resolve, reject });
    });
    void this.ready().catch(() => {});
    this.dispatch();
    return result;
  }
  private error(
    code: WorkerErrorCode,
    message: string,
    slot: Slot,
    cause?: unknown,
  ): WorkerError {
    return new WorkerError(code, message, {
      group: this.setup.name,
      workerId: slot.id,
      ...(slot.current
        ? { jobId: slot.current.job.id, path: slot.current.job.path }
        : {}),
    }, cause);
  }
  private unavailable(): WorkerError {
    return new WorkerError(
      "WRK_UNAVAILABLE",
      "Worker group is unavailable for this generation.",
      { group: this.setup.name },
      this.failure,
    );
  }
  private spawn(index: number, restart: number): void {
    const slot: Slot = {
      id: `convee:${this.setup.name}:${index}:${crypto.randomUUID()}`,
      index,
      restart,
      ready: false,
      dead: false,
      expired: false,
      abort: new AbortController(),
      expiration: deferred<void>(),
      listeners: [],
    };
    this.slots.add(slot);
    slot.timer = setTimeout(() => {
      const error = this.error(
        "WRK_STARTUP",
        "Worker initialization timed out.",
        slot,
      );
      if (!slot.transport) {
        slot.expired = true;
        slot.expiration.reject(
          new WorkerError(
            "WRK_STARTUP",
            "Worker constructor did not settle before its deadline; cleanup cannot be confirmed.",
            { group: this.setup.name, workerId: slot.id },
            error,
          ),
        );
      }
      this.fault(slot, error);
    }, this.setup.startupTimeoutMs);
    slot.constructing = Promise.resolve().then(async () => {
      if (slot.dead) return;
      try {
        const transport = await this.createWorker(
          new URL(
            this.setup.entry ?? moduleUrl("entry", import.meta.url),
            import.meta.url,
          ),
          {
            id: slot.id,
            group: this.setup.name,
            index,
            restart,
            module: this.setup.module,
            signal: slot.abort.signal,
          },
        );
        slot.transport = transport;
        if (slot.dead) {
          if (slot.expired) {
            await transport.terminate();
            slot.transport = undefined;
          }
          return;
        }
        const message: EventListener = (event) => {
          if (slot.dead) return;
          try {
            this.receive(slot, (event as MessageEvent<unknown>).data);
          } catch (cause) {
            this.fault(
              slot,
              this.error(
                "WRK_PROTOCOL",
                "Could not inspect worker reply.",
                slot,
                cause,
              ),
            );
          }
        };
        const failure: EventListener = (event) => {
          if (slot.dead) return;
          event.preventDefault();
          this.fault(
            slot,
            this.error(
              slot.ready ? "WRK_CRASH" : "WRK_STARTUP",
              "Worker transport failed.",
              slot,
              (event as ErrorEvent).error,
            ),
          );
        };
        slot.listeners = [["message", message], ["error", failure], [
          "messageerror",
          failure,
        ]];
        for (const [type, listener] of slot.listeners) {
          transport.addEventListener(type, listener);
        }
        transport.postMessage({
          protocol: PROTOCOL,
          kind: "init",
          module: this.setup.module,
        });
      } catch (cause) {
        this.fault(
          slot,
          this.error("WRK_STARTUP", "Could not start worker.", slot, cause),
        );
      }
    });
  }
  private receive(slot: Slot, value: unknown): void {
    if (!isReply(value)) {
      this.fault(
        slot,
        this.error("WRK_PROTOCOL", "Malformed worker reply.", slot),
      );
      return;
    }
    if (value.kind === "fatal") {
      const error = this.error(
        slot.ready ? "WRK_PROTOCOL" : "WRK_STARTUP",
        value.error.message,
        slot,
      );
      error.meta!.remote = value.error;
      this.fault(slot, error);
    } else if (value.kind === "ready") {
      if (slot.ready) {
        this.fault(
          slot,
          this.error("WRK_PROTOCOL", "Duplicate readiness reply.", slot),
        );
        return;
      }
      clearTimeout(slot.timer);
      slot.ready = true;
      if (
        [...this.slots].filter((item) => !item.dead && item.ready).length ===
          this.setup.count
      ) this.startup.resolve();
      this.dispatch();
    } else this.result(slot, value);
  }
  private result(slot: Slot, value: Extract<Reply, { kind: "result" }>): void {
    const current = slot.current;
    if (!slot.ready || !current || value.id !== current.job.id) {
      this.fault(
        slot,
        this.error(
          "WRK_PROTOCOL",
          "Worker reply does not match its active job.",
          slot,
        ),
      );
      return;
    }
    clearTimeout(slot.timer);
    if (value.ok) current.resolve(value.value);
    else {
      const error = this.error(
        value.error.code === "WRK_CLONE" ? "WRK_CLONE" : "WRK_TASK",
        value.error.message,
        slot,
      );
      error.meta!.remote = value.error;
      current.reject(error);
    }
    slot.current = undefined;
    this.dispatch();
  }
  private dispatch(): void {
    if (this.pumping || this.state !== "active") return;
    this.pumping = true;
    try {
      for (const slot of this.slots) {
        while (!slot.dead && slot.ready && !slot.current && this.queue.length) {
          const current = this.queue.shift()!;
          slot.current = current;
          slot.timer = setTimeout(
            () =>
              this.fault(
                slot,
                this.error(
                  "WRK_TIMEOUT",
                  "Worker job timed out; the job will not be retried.",
                  slot,
                ),
              ),
            this.setup.timeoutMs,
          );
          try {
            slot.transport!.postMessage(current.request);
          } catch (cause) {
            this.fault(
              slot,
              this.error(
                "WRK_CRASH",
                "Could not dispatch worker job.",
                slot,
                cause,
              ),
            );
          }
        }
      }
    } finally {
      this.pumping = false;
    }
  }
  private fault(slot: Slot, error: WorkerError): void {
    if (slot.dead) return;
    slot.current?.reject(error);
    slot.current = undefined;
    const wasReady = slot.ready;
    const stopped = this.stop(slot);
    if (!wasReady && slot.restart === 0) {
      this.fail(error);
      return;
    }
    void stopped.then(() => {
      if (this.state !== "active") return;
      if (this.restarts >= this.setup.maxRestarts) {
        this.fail(error);
        return;
      }
      this.spawn(slot.index, ++this.restarts);
    }, (cause) => {
      if (this.state === "active") {
        this.fail(
          this.error(
            "WRK_CRASH",
            "Worker cleanup failed during replacement.",
            slot,
            cause,
          ),
        );
      }
    });
  }
  private fail(error: WorkerError): void {
    if (this.state === "failed" || this.state === "closed") return;
    this.failure = error;
    this.state = "failed";
    this.startup.reject(error);
    const abandoned = this.queue.splice(0);
    for (const slot of this.slots) {
      if (slot.current) {
        abandoned.push(slot.current);
        slot.current = undefined;
      }
      this.stop(slot);
    }
    for (const pending of abandoned) {
      pending.reject(
        error.code === "WRK_STARTUP" && this.restarts === 0
          ? error
          : this.unavailable(),
      );
    }
  }
  private stop(slot: Slot): Promise<void> {
    if (slot.stopping) return slot.stopping;
    slot.dead = true;
    slot.abort.abort();
    if (slot.transport) clearTimeout(slot.timer);
    slot.stopping = Promise.resolve().then(async () => {
      try {
        await Promise.race([slot.constructing, slot.expiration.promise]);
      } finally {
        clearTimeout(slot.timer);
      }
      if (!slot.transport) return;
      const errors: unknown[] = [];
      for (const [type, listener] of slot.listeners) {
        try {
          slot.transport.removeEventListener(type, listener);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await slot.transport.terminate();
      } catch (error) {
        errors.push(error);
      }
      slot.listeners = [];
      slot.transport = undefined;
      this.slots.delete(slot);
      if (errors.length) {
        throw new WorkerError("WRK_CRASH", "Worker transport cleanup failed.", {
          group: this.setup.name,
          workerId: slot.id,
        }, new AggregateError(errors));
      }
    });
    void slot.stopping.catch(() => {});
    this.stops.push(slot.stopping);
    return slot.stopping;
  }
  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    const error = new WorkerError(
      "WRK_CLOSED",
      "Worker generation was closed.",
      { group: this.setup.name },
    );
    this.fail(error);
    this.state = "closed";
    this.shutdown = Promise.allSettled(this.stops).then((outcomes) => {
      const errors = outcomes.flatMap((outcome) =>
        outcome.status === "rejected" ? [outcome.reason] : []
      );
      if (errors.length) {
        throw new WorkerError("WRK_CRASH", "Worker group cleanup failed.", {
          group: this.setup.name,
        }, new AggregateError(errors));
      }
    });
    return this.shutdown;
  }
}
/** Shared admission accounting, with independent schedulers for each definition. */
export class Generation {
  readonly groups: Map<string, Group>;
  private pending = 0;
  private closed = false;
  constructor(private readonly setup: Setup) {
    this.groups = new Map(
      setup.groups.map((
        group,
      ) => [group.name, new Group(group, setup.createWorker)]),
    );
  }
  check(jobs: readonly PreparedJob[]): void {
    if (this.closed) {
      throw new WorkerError("WRK_CLOSED", "Worker generation is closed.");
    }
    if (this.pending + jobs.length > this.setup.maxPending) {
      throw new WorkerError(
        "WRK_CAPACITY",
        "No jobs were admitted: the complete batch exceeds available capacity.",
        { maxPending: this.setup.maxPending },
      );
    }
    for (const job of jobs) this.groups.get(job.group)!.available();
  }
  reserve(jobs: readonly PreparedJob[]): void {
    this.check(jobs);
    this.pending += jobs.length;
  }
  release(): void {
    this.pending--;
  }
  stopAdmission(): void {
    this.closed = true;
  }
  async ready(): Promise<void> {
    await Promise.all([...this.groups.values()].map((group) => group.ready()));
  }
  async close(): Promise<void> {
    this.closed = true;
    const outcomes = await Promise.allSettled(
      [...this.groups.values()].map((group) => group.close()),
    );
    const errors = outcomes.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.reason] : []
    );
    if (errors.length) {
      throw new WorkerError(
        "WRK_CRASH",
        "Generation cleanup failed; all groups were asked to stop.",
        {},
        new AggregateError(errors),
      );
    }
  }
}
