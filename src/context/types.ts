/** Shared values carried across steps and plugins during a run. */
export type ContextValues = Record<string, unknown>;

/** Controls how much step state is captured in the run context snapshots. */
export type RunContextCapture = "none" | "outputs" | "all";

/** Mutable key-value store exposed on the run, step, and plugin context APIs. */
export interface ContextStore<Shape extends ContextValues = ContextValues> {
  get<K extends keyof Shape>(key: K): Shape[K] | undefined;
  set<K extends keyof Shape>(key: K, value: Shape[K]): void;
  has<K extends keyof Shape>(key: K): boolean;
  delete<K extends keyof Shape>(key: K): boolean;
  clear(): void;
  entries(): ReadonlyMap<string, unknown>;
}

/** Captured snapshot for a step that ran within the current execution context. */
export interface StepSnapshot {
  readonly id: string;
  readonly state: ContextStore;
  readonly input?: readonly unknown[];
  readonly output?: unknown;
  readonly error?: Error;
}

/** Captured snapshot for a plugin that ran within the current execution context. */
export interface PluginSnapshot {
  readonly id: string;
  readonly target?: string;
  readonly state: ContextStore;
}

export interface StepContextApi {
  current(): StepSnapshot;
  get(stepId: string): StepSnapshot | undefined;
  previous(): StepSnapshot | undefined;
  all(): readonly StepSnapshot[];
}

export interface PluginContextApi {
  current(): PluginSnapshot;
  get(pluginId: string): PluginSnapshot | undefined;
  all(): readonly PluginSnapshot[];
}

/** Shared execution context exposed to steps and plugins during a run. */
export interface RunContext<Shared extends ContextValues = ContextValues> {
  readonly runId: string;
  readonly rootRunId: string;
  readonly capture: RunContextCapture;
  readonly state: ContextStore<Shared>;
  readonly step: StepContextApi;
  readonly plugin: PluginContextApi;
}

/** Options used to create a new run context or to reuse an existing parent run. */
export interface RunContextOptions<
  Shared extends ContextValues = ContextValues,
> {
  parent?: RunContext<Shared>;
  seed?: Partial<Shared>;
  capture?: RunContextCapture;
}

/** `this` context available inside step functions. */
export interface StepThis<Shared extends ContextValues = ContextValues> {
  context(): RunContext<Shared>;
}

/** `this` context available inside plugin hooks. */
export interface PluginThis<Shared extends ContextValues = ContextValues> {
  context(): RunContext<Shared>;
}
