import type {
  ContextStore,
  ContextValues,
  PluginSnapshot,
  RunContext,
  RunContextCapture,
  RunContextOptions,
  StepSnapshot,
} from "@/context/types.ts";

const controllerSymbol = Symbol("convee.v1.runContextController");

type MutableStepSnapshot = {
  id: string;
  state: MemoryContextStore;
  input?: readonly unknown[];
  output?: unknown;
  error?: Error;
};

type MutablePluginSnapshot = {
  id: string;
  target?: string;
  state: MemoryContextStore;
};

type StepFrame = {
  snapshot: MutableStepSnapshot;
  input: readonly unknown[];
  output?: unknown;
  error?: Error;
};

class MemoryContextStore<
  Shape extends ContextValues = ContextValues,
> implements ContextStore<Shape> {
  private readonly values = new Map<string, unknown>();

  constructor(seed?: Partial<Shape>) {
    if (!seed) return;

    for (const [key, value] of Object.entries(seed)) {
      this.values.set(key, value);
    }
  }

  get<K extends keyof Shape>(key: K): Shape[K] | undefined {
    return this.values.get(String(key)) as Shape[K] | undefined;
  }

  set<K extends keyof Shape>(key: K, value: Shape[K]): void {
    this.values.set(String(key), value);
  }

  has<K extends keyof Shape>(key: K): boolean {
    return this.values.has(String(key));
  }

  delete<K extends keyof Shape>(key: K): boolean {
    return this.values.delete(String(key));
  }

  clear(): void {
    this.values.clear();
  }

  entries(): ReadonlyMap<string, unknown> {
    return new Map(this.values);
  }
}

const cloneArray = (value: readonly unknown[]): readonly unknown[] => [
  ...value,
];

export class RunContextController<
  Shared extends ContextValues = ContextValues,
> {
  readonly runId: string;
  readonly rootRunId: string;
  readonly capture: RunContextCapture;
  readonly state: ContextStore<Shared>;
  readonly context: RunContext<Shared>;

  private readonly stepSnapshots = new Map<string, MutableStepSnapshot>();
  private readonly pluginSnapshots = new Map<string, MutablePluginSnapshot>();
  private readonly stepVisits: StepFrame[] = [];
  private readonly stepStack: StepFrame[] = [];
  private readonly pluginStack: MutablePluginSnapshot[] = [];

  private constructor(options?: {
    runId?: string;
    rootRunId?: string;
    seed?: Partial<Shared>;
    capture?: RunContextCapture;
  }) {
    this.runId = options?.runId ?? crypto.randomUUID();
    this.rootRunId = options?.rootRunId ?? this.runId;
    this.capture = options?.capture ?? "outputs";
    this.state = new MemoryContextStore<Shared>(options?.seed);
    this.context = {
      runId: this.runId,
      rootRunId: this.rootRunId,
      capture: this.capture,
      state: this.state,
      step: {
        current: () => this.getCurrentStepSnapshot(),
        get: (stepId: string) => this.getStepSnapshot(stepId),
        previous: () => this.getPreviousStepSnapshot(),
        all: () => this.getAllStepSnapshots(),
      },
      plugin: {
        current: () => this.getCurrentPluginSnapshot(),
        get: (pluginId: string) => this.getPluginSnapshot(pluginId),
        all: () => this.getAllPluginSnapshots(),
      },
      [controllerSymbol]: this,
    } as RunContext<Shared>;
  }

  static create<Shared extends ContextValues = ContextValues>(
    options?: RunContextOptions<Shared>,
  ): RunContext<Shared> {
    if (options?.parent) {
      const parentController = RunContextController.from(options.parent);

      if (options.seed) {
        for (const [key, value] of Object.entries(options.seed)) {
          parentController.state.set(
            key as keyof Shared,
            value as Shared[keyof Shared],
          );
        }
      }

      return parentController.context as RunContext<Shared>;
    }

    return new RunContextController<Shared>(options).context;
  }

  static from<Shared extends ContextValues = ContextValues>(
    context: RunContext<Shared>,
  ): RunContextController<Shared> {
    const controller = (
      context as RunContext<Shared> & {
        [controllerSymbol]?: RunContextController<Shared>;
      }
    )[controllerSymbol];

    if (!controller) {
      throw new TypeError("Invalid run context.");
    }

    return controller;
  }

  enterStep(stepId: string, input: readonly unknown[]): void {
    const snapshot = this.ensureStepSnapshot(stepId);
    const frame: StepFrame = {
      snapshot,
      input: cloneArray(input),
    };

    this.stepStack.push(frame);
    this.stepVisits.push(frame);
  }

  updateCurrentStepInput(input: readonly unknown[]): void {
    const frame = this.requireCurrentStepFrame();
    frame.input = cloneArray(input);
  }

  updateCurrentStepOutput(output: unknown): void {
    const frame = this.requireCurrentStepFrame();
    frame.output = output;
  }

  updateCurrentStepError(error: Error): void {
    const frame = this.requireCurrentStepFrame();
    frame.error = error;
  }

  leaveStep(): void {
    const frame = this.stepStack.pop();

    if (!frame) {
      throw new Error("Cannot leave a step outside of step execution.");
    }

    const { snapshot } = frame;

    if (this.capture === "all") {
      snapshot.input = cloneArray(frame.input);
      snapshot.output = frame.output;
      snapshot.error = frame.error;
      return;
    }

    if (this.capture === "outputs") {
      snapshot.input = undefined;
      snapshot.output = frame.output;
      snapshot.error = undefined;
      return;
    }

    snapshot.input = undefined;
    snapshot.output = undefined;
    snapshot.error = undefined;
  }

  enterPlugin(pluginId: string, target?: string): void {
    const snapshot = this.ensurePluginSnapshot(pluginId, target);
    this.pluginStack.push(snapshot);
  }

  leavePlugin(): void {
    const snapshot = this.pluginStack.pop();

    if (!snapshot) {
      throw new Error("Cannot leave a plugin outside of plugin execution.");
    }
  }

  private ensureStepSnapshot(stepId: string): MutableStepSnapshot {
    const existing = this.stepSnapshots.get(stepId);

    if (existing) {
      return existing;
    }

    const snapshot: MutableStepSnapshot = {
      id: stepId,
      state: new MemoryContextStore(),
    };

    this.stepSnapshots.set(stepId, snapshot);
    return snapshot;
  }

  private ensurePluginSnapshot(
    pluginId: string,
    target?: string,
  ): MutablePluginSnapshot {
    const existing = this.pluginSnapshots.get(pluginId);

    if (existing) {
      return existing;
    }

    const snapshot: MutablePluginSnapshot = {
      id: pluginId,
      target,
      state: new MemoryContextStore(),
    };

    this.pluginSnapshots.set(pluginId, snapshot);
    return snapshot;
  }

  private requireCurrentStepFrame(): StepFrame {
    const frame = this.stepStack.at(-1);

    if (!frame) {
      throw new Error("Step context is only available during step execution.");
    }

    return frame;
  }

  private getCurrentStepSnapshot(): StepSnapshot {
    const frame = this.requireCurrentStepFrame();

    return {
      id: frame.snapshot.id,
      state: frame.snapshot.state,
      input: cloneArray(frame.input),
      output: frame.output,
      error: frame.error,
    };
  }

  private getStepSnapshot(stepId: string): StepSnapshot | undefined {
    const snapshot = this.stepSnapshots.get(stepId);

    if (!snapshot) {
      return undefined;
    }

    return {
      id: snapshot.id,
      state: snapshot.state,
      input: snapshot.input,
      output: snapshot.output,
      error: snapshot.error,
    };
  }

  private getPreviousStepSnapshot(): StepSnapshot | undefined {
    if (this.stepVisits.length < 2) {
      return undefined;
    }

    const frame = this.stepVisits.at(-2);

    if (!frame) {
      return undefined;
    }

    return {
      id: frame.snapshot.id,
      state: frame.snapshot.state,
      input: cloneArray(frame.input),
      output: frame.output,
      error: frame.error,
    };
  }

  private getAllStepSnapshots(): readonly StepSnapshot[] {
    return Array.from(this.stepSnapshots.values(), (snapshot) => ({
      id: snapshot.id,
      state: snapshot.state,
      input: snapshot.input,
      output: snapshot.output,
      error: snapshot.error,
    }));
  }

  private getCurrentPluginSnapshot(): PluginSnapshot {
    const snapshot = this.pluginStack.at(-1);

    if (!snapshot) {
      throw new Error(
        "Plugin context is only available during plugin execution.",
      );
    }

    return {
      id: snapshot.id,
      target: snapshot.target,
      state: snapshot.state,
    };
  }

  private getPluginSnapshot(pluginId: string): PluginSnapshot | undefined {
    const snapshot = this.pluginSnapshots.get(pluginId);

    if (!snapshot) {
      return undefined;
    }

    return {
      id: snapshot.id,
      target: snapshot.target,
      state: snapshot.state,
    };
  }

  private getAllPluginSnapshots(): readonly PluginSnapshot[] {
    return Array.from(this.pluginSnapshots.values(), (snapshot) => ({
      id: snapshot.id,
      target: snapshot.target,
      state: snapshot.state,
    }));
  }
}

export const createRunContext = RunContextController.create;
