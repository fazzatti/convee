import {
  clone,
  name,
  type PoolSetup,
  poolSetup,
  record,
  type RoleSpec,
} from "@/workers/config.ts";
import { WorkerError } from "@/workers/error.ts";
import {
  contextValid,
  isReply,
  PROTOCOL,
  type Reply,
  type RunMessage,
} from "@/workers/protocol.ts";
import type {
  TypedWorkerPoolFactory,
  WorkerContext,
  WorkerOutcome,
  WorkerPoolFactory,
  WorkerRegistry,
  WorkerTransport,
} from "@/workers/types.ts";

interface Job {
  task: string;
  args: unknown[];
  role?: string;
  context?: WorkerContext;
}
interface Pending {
  request: RunMessage;
  role: string;
  resolve(outcome: WorkerOutcome<unknown>): void;
}
interface Slot {
  id: string;
  role: RoleSpec;
  transport: WorkerTransport;
  ready: boolean;
  current?: Pending;
  timer?: ReturnType<typeof setTimeout>;
  listeners: [string, EventListener][];
}

class Pool {
  readonly size: number;
  private state: "new" | "starting" | "ready" | "closing" | "closed" = "new";
  private readonly queue: Pending[] = [];
  private readonly slots: Slot[] = [];
  private readonly taskNames = new Map<string, Set<string>>();
  private readonly setup: PoolSetup;
  private pending = 0;
  private pumping = false;
  private failure?: WorkerError;
  private readonly startup: Promise<void>;
  private started!: () => void;
  private startFailed!: (error: WorkerError) => void;
  private readonly drained: Promise<void>;
  private didDrain!: () => void;
  private drainFailed!: (error: WorkerError) => void;

  constructor(options: unknown) {
    this.setup = poolSetup(options);
    this.size = this.setup.size;
    this.startup = new Promise((resolve, reject) => {
      this.started = resolve;
      this.startFailed = reject;
    });
    // Lazy callers can close/terminate without ever observing readiness.
    void this.startup.catch(() => {});
    this.drained = new Promise((resolve, reject) => {
      this.didDrain = resolve;
      this.drainFailed = reject;
    });
    void this.drained.catch(() => {});
  }
  job(
    task: string,
    args: unknown[],
    options: Omit<Job, "task" | "args"> = {},
  ): Job {
    return { ...options, task, args };
  }
  ready(): Promise<void> {
    if (this.state === "closed") {
      return Promise.reject(
        this.failure ?? new WorkerError("WRK_CLOSED", "Worker pool is closed."),
      );
    }
    if (this.state === "new") this.start();
    return this.startup;
  }
  async run(job: Job): Promise<unknown> {
    const [outcome] = await this.settle([job]);
    if (outcome.status === "rejected") throw outcome.error;
    return outcome.value;
  }
  async settle(jobs: readonly Job[]): Promise<WorkerOutcome<unknown>[]> {
    if (!Array.isArray(jobs)) {
      throw new WorkerError("WRK_CONFIG", "Jobs must be an array.");
    }
    this.checkAdmission(jobs.length);
    const prepared = Array.from(jobs, (job) => this.prepare(job));
    // Reading/cloning user data may run getters that submit work or close the pool.
    this.checkAdmission(prepared.length);
    const promises = prepared.map(({ request, role }) =>
      new Promise<WorkerOutcome<unknown>>((resolve) => {
        this.queue.push({ request, role, resolve });
        this.pending++;
      })
    );
    if (prepared.length) {
      void this.ready().catch(() => {});
      this.dispatch();
    }
    return await Promise.all(promises);
  }
  close(): Promise<void> {
    if (this.state === "closed") return this.drained;
    if (this.state === "new") {
      this.started();
      this.shutdown();
    } else {
      this.state = "closing";
      this.dispatch();
      this.finishDrain();
    }
    return this.drained;
  }
  terminate(): void {
    if (this.state !== "closed") {
      this.fail(
        new WorkerError(
          "WRK_CLOSED",
          "Worker pool was terminated; worker-local cleanup is not guaranteed.",
        ),
      );
    }
  }

  private checkAdmission(count: number): void {
    if (this.state === "closed" || this.state === "closing") {
      throw this.failure ??
        new WorkerError("WRK_CLOSED", "Worker pool is not accepting work.");
    }
    if (this.pending + count > this.setup.maxPending) {
      throw new WorkerError(
        "WRK_CAPACITY",
        "Worker pool admission limit exceeded; no jobs in this batch were admitted.",
        { maxPending: this.setup.maxPending },
      );
    }
  }
  private prepare(value: unknown): { request: RunMessage; role: string } {
    const job = record(value, "job");
    const task = name(job.task, "job task");
    const roleName = this.setup.explicitRoles
      ? name(job.role, "job role")
      : name(job.role ?? "default", "job role");
    const role = this.setup.roles.find((role) => role.name === roleName);
    if (!role) {
      throw new WorkerError("WRK_CONFIG", "Unknown worker role.", {
        role: roleName,
      });
    }
    if (role.tasks && !role.tasks.includes(task)) {
      throw new WorkerError(
        "WRK_CONFIG",
        "Task is not available in the requested role.",
        { task, role: roleName },
      );
    }
    if (!Array.isArray(job.args) || !contextValid(job.context)) {
      throw new WorkerError(
        "WRK_CONFIG",
        "A job needs an argument array and valid context data.",
      );
    }
    const request: RunMessage = clone({
      protocol: PROTOCOL,
      kind: "run",
      id: crypto.randomUUID(),
      task,
      args: job.args,
      context: job.context,
    });
    return { request, role: roleName };
  }
  private start(): void {
    this.state = "starting";
    try {
      for (const role of this.setup.roles) {
        for (let index = 0; index < role.size; index++) {
          if (this.failure || this.isClosed()) return;
          this.spawn(role, index);
        }
      }
    } catch (cause) {
      this.fail(
        new WorkerError(
          "WRK_STARTUP",
          "Could not start the worker pool.",
          {},
          cause,
        ),
      );
    }
  }
  private isClosed(): boolean {
    return this.state === "closed";
  }
  private spawn(role: RoleSpec, index: number): void {
    const id = `convee:${role.name}:${index}`;
    const transport = this.setup.createWorker(
      new URL("./entry.ts", import.meta.url),
      { id, role: role.name },
    );
    if (this.state === "closed") {
      transport.terminate();
      return;
    }
    const slot: Slot = { id, role, transport, ready: false, listeners: [] };
    this.slots.push(slot);
    const message: EventListener = (event) =>
      this.receive(slot, (event as MessageEvent<unknown>).data);
    const failure: EventListener = (event) => {
      event.preventDefault();
      this.fail(
        new WorkerError(
          "WRK_CRASH",
          "Worker transport failed; outstanding jobs were stopped without retry.",
          { workerId: id, role: role.name },
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
    slot.timer = setTimeout(
      () =>
        this.fail(
          new WorkerError("WRK_STARTUP", "Worker initialization timed out.", {
            workerId: id,
            role: role.name,
          }),
        ),
      this.setup.startupTimeoutMs,
    );
    transport.postMessage({
      protocol: PROTOCOL,
      kind: "init",
      module: this.setup.module,
      pipelines: this.setup.pipelines,
      role,
    });
  }
  private receive(slot: Slot, value: unknown): void {
    if (this.state === "closed") return;
    if (!isReply(value)) {
      this.fail(
        new WorkerError("WRK_PROTOCOL", "Malformed worker reply.", {
          workerId: slot.id,
        }),
      );
      return;
    }
    if (value.kind === "fatal") {
      this.fail(
        new WorkerError(
          slot.ready ? "WRK_PROTOCOL" : "WRK_STARTUP",
          value.error.message,
          { workerId: slot.id, remote: value.error },
        ),
      );
    } else if (value.kind === "ready") this.acceptReady(slot, value.tasks);
    else this.acceptResult(slot, value);
  }
  private acceptReady(slot: Slot, names: string[]): void {
    const previous = this.taskNames.get(slot.role.name);
    if (
      slot.ready ||
      (previous &&
        (previous.size !== names.length ||
          names.some((name) => !previous.has(name))))
    ) {
      this.fail(
        new WorkerError("WRK_PROTOCOL", "Inconsistent worker readiness.", {
          workerId: slot.id,
        }),
      );
      return;
    }
    clearTimeout(slot.timer);
    slot.ready = true;
    this.taskNames.set(slot.role.name, new Set(names));
    if (
      this.slots.length === this.size &&
      this.slots.every((entry) => entry.ready)
    ) {
      if (this.state !== "closing") this.state = "ready";
      this.started();
      this.dispatch();
      this.finishDrain();
    }
  }
  private acceptResult(
    slot: Slot,
    value: Extract<Reply, { kind: "result" }>,
  ): void {
    const job = slot.current;
    if (!slot.ready || !job || value.id !== job.request.id) {
      this.fail(
        new WorkerError(
          "WRK_PROTOCOL",
          "Worker reply does not match its active job.",
          { workerId: slot.id },
        ),
      );
      return;
    }
    clearTimeout(slot.timer);
    slot.current = undefined;
    const result: WorkerOutcome<unknown> = value.ok
      ? { status: "fulfilled", value: value.value }
      : {
        status: "rejected",
        error: new WorkerError(
          value.error.code === "WRK_CLONE" ? "WRK_CLONE" : "WRK_TASK",
          value.error.message,
          {
            jobId: job.request.id,
            task: job.request.task,
            role: slot.role.name,
            workerId: slot.id,
            remote: value.error,
          },
        ),
      };
    this.complete(job, result);
    this.dispatch();
  }
  private dispatch(): void {
    if (
      this.pumping || !["ready", "closing"].includes(this.state) ||
      this.slots.some((slot) => !slot.ready)
    ) return;
    this.pumping = true;
    try {
      for (const slot of this.slots) this.pumpSlot(slot);
    } finally {
      this.pumping = false;
    }
    this.finishDrain();
  }
  private pumpSlot(slot: Slot): void {
    while (!slot.current && this.state !== "closed") {
      const index = this.queue.findIndex((job) => job.role === slot.role.name);
      if (index < 0) return;
      const [job] = this.queue.splice(index, 1);
      if (!this.taskNames.get(slot.role.name)?.has(job.request.task)) {
        this.complete(
          job,
          this.rejected(
            job,
            new WorkerError("WRK_CONFIG", "Unknown task in worker registry.", {
              workerId: slot.id,
            }),
          ),
        );
        continue;
      }
      slot.current = job;
      slot.timer = setTimeout(
        () =>
          this.fail(
            new WorkerError(
              "WRK_TIMEOUT",
              "Worker job timed out; the pool was terminated without retry.",
              {
                workerId: slot.id,
                jobId: job.request.id,
                task: job.request.task,
              },
            ),
          ),
        this.setup.timeoutMs,
      );
      try {
        slot.transport.postMessage(job.request);
      } catch (cause) {
        this.fail(
          new WorkerError("WRK_CRASH", "Could not dispatch a worker job.", {
            workerId: slot.id,
          }, cause),
        );
      }
    }
  }
  private complete(job: Pending, result: WorkerOutcome<unknown>): void {
    this.pending--;
    job.resolve(result);
  }
  private rejected(job: Pending, error: WorkerError): WorkerOutcome<never> {
    return {
      status: "rejected",
      error: new WorkerError(error.code, error.message, {
        ...error.meta,
        jobId: job.request.id,
        task: job.request.task,
        role: job.role,
      }, error),
    };
  }
  private fail(error: WorkerError): void {
    if (this.state === "closed") return;
    this.failure = error;
    this.startFailed(error);
    const abandoned = this.queue.splice(0);
    for (const slot of this.slots) {
      if (slot.current) {
        abandoned.push(slot.current);
        slot.current = undefined;
      }
    }
    for (const job of abandoned) this.complete(job, this.rejected(job, error));
    this.shutdown();
  }
  private finishDrain(): void {
    if (this.state === "closing" && this.pending === 0) {
      if (
        this.slots.length < this.size || this.slots.some((slot) => !slot.ready)
      ) {
        this.startFailed(
          new WorkerError(
            "WRK_CLOSED",
            "Worker pool closed during initialization.",
          ),
        );
      } else this.started();
      this.shutdown();
    }
  }
  private shutdown(): void {
    this.state = "closed";
    const failures: unknown[] = [];
    const cleanup = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        failures.push(error);
      }
    };
    for (const slot of this.slots) {
      clearTimeout(slot.timer);
      for (const [type, listener] of slot.listeners) {
        cleanup(() => slot.transport.removeEventListener(type, listener));
      }
      cleanup(() => slot.transport.terminate());
    }
    this.slots.length = 0;
    this.taskNames.clear();
    if (failures.length) {
      this.drainFailed(
        new WorkerError(
          "WRK_CRASH",
          "Worker transport cleanup failed; all workers were asked to stop.",
          {},
          new AggregateError(failures),
        ),
      );
    } else this.didDrain();
  }
}

/** Create a typed reusable pool through workerPool.for<typeof registry>()(options). */
export const workerPool: WorkerPoolFactory = {
  for<R extends WorkerRegistry>(): TypedWorkerPoolFactory<R> {
    return ((options: unknown) =>
      new Pool(options)) as unknown as TypedWorkerPoolFactory<R>;
  },
};
