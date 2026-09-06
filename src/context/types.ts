/** Shared values carried across steps and plugins during a run. */
export type ContextValues = Record<string, unknown>;

/** Controls how much step state is captured in the run context snapshots. */
export type RunContextCapture = "none" | "outputs" | "all";

/** Mutable key-value store exposed on the run, step, and plugin context APIs. */
export interface ContextStore<Shape extends ContextValues = ContextValues> {
  /** Returns the value or snapshot for a key or identity, or undefined when absent. */
  get<K extends keyof Shape>(key: K): Shape[K] | undefined;
  /** Writes a value to this shared store. */
  set<K extends keyof Shape>(key: K, value: Shape[K]): void;
  /** Reports whether the store contains the key, including values explicitly set to undefined. */
  has<K extends keyof Shape>(key: K): boolean;
  /** Removes a key and reports whether it was present. */
  delete<K extends keyof Shape>(key: K): boolean;
  /** Removes all entries from this store. */
  clear(): void;
  /** Returns a defensive Map copy; stored payload objects keep their identities. */
  entries(): ReadonlyMap<string, unknown>;
}

/** Captured snapshot for a step that ran within the current execution context. */
export interface StepSnapshot {
  /** Stable identity used for routing and per-identity state. */
  readonly id: string;
  /** Mutable scoped state shared by executions using this identity or run. */
  readonly state: ContextStore;
  /** Captured argument tuple, available according to the capture policy. */
  readonly input?: readonly unknown[];
  /** Most recent captured result, available according to the capture policy. */
  readonly output?: unknown;
  /** Captured failure when capture is all; successful recovery retains the diagnostic. */
  readonly error?: Error;
}

/** Captured snapshot for a plugin that ran within the current execution context. */
export interface PluginSnapshot {
  /** Stable identity used for routing and per-identity state. */
  readonly id: string;
  /** Optional routing identity; an absent target applies at the enclosing runtime. */
  readonly target?: string;
  /** Mutable scoped state shared by executions using this identity or run. */
  readonly state: ContextStore;
}

/** Invocation-local access and last-completed snapshots for steps. */
export interface StepContextApi {
  /** Returns this invocation's live snapshot; throws outside the corresponding execution scope. */
  current(): StepSnapshot;
  /** Returns the value or snapshot for a key or identity, or undefined when absent. */
  get(stepId: string): StepSnapshot | undefined;
  /** Returns the most recently completed invocation in the shared run, not the last invocation entered. */
  previous(): StepSnapshot | undefined;
  /** Returns defensive snapshot containers for the known identities in this run. */
  all(): readonly StepSnapshot[];
}

/** Invocation-local access and per-identity plugin state. */
export interface PluginContextApi {
  /** Returns this invocation's live snapshot; throws outside the corresponding execution scope. */
  current(): PluginSnapshot;
  /** Returns the value or snapshot for a key or identity, or undefined when absent. */
  get(pluginId: string): PluginSnapshot | undefined;
  /** Returns defensive snapshot containers for the known identities in this run. */
  all(): readonly PluginSnapshot[];
}

/** Shared execution context exposed to steps and plugins during a run. */
export interface RunContext<Shared extends ContextValues = ContextValues> {
  /** Identifier shared by executions participating in this run context. */
  readonly runId: string;
  /** Identifier of the root run whose state this context shares. */
  readonly rootRunId: string;
  /** Completed snapshot retention policy; live invocation data remains available in all modes. */
  readonly capture: RunContextCapture;
  /** Mutable scoped state shared by executions using this identity or run. */
  readonly state: ContextStore<Shared>;
  /** Invocation-local step context and completed per-identity snapshots. */
  readonly step: StepContextApi;
  /** Invocation-local plugin context and shared per-plugin state. */
  readonly plugin: PluginContextApi;
}

/** Options used to create a new run context or to reuse an existing parent run. */
export interface RunContextOptions<
  Shared extends ContextValues = ContextValues,
> {
  /** Existing Convee context whose state and completed snapshots are reused. */
  parent?: RunContext<Shared>;
  /** Initial shared values; when a parent is supplied these merge into its store. */
  seed?: Partial<Shared>;
  /** Completed snapshot retention policy; live invocation data remains available in all modes. */
  capture?: RunContextCapture;
}

/** `this` context available inside step functions. */
export interface StepThis<Shared extends ContextValues = ContextValues> {
  /** Returns this invocation's scoped view of the shared run. */
  context(): RunContext<Shared>;
}

/** `this` context available inside plugin hooks. */
export interface PluginThis<Shared extends ContextValues = ContextValues> {
  /** Returns this invocation's scoped view of the shared run. */
  context(): RunContext<Shared>;
}
