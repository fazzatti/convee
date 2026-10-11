/** Shared values carried across steps and plugins during a run. */
export type ContextValues = Record<string, unknown>;

/** Controls how much step state is captured in the run context snapshots. */
export type RunContextCapture = "none" | "outputs" | "all";

/** Mutable key-value store exposed on the run, step, and plugin context APIs. */
export interface ContextStore<Shape extends ContextValues = ContextValues> {
  /**
   * Read a shared-state entry without changing its identity.
   *
   * @param key - Key in the declared store shape; runtime keys are converted to strings.
   * @returns The stored value, or undefined if absent; use has to distinguish stored undefined.
   * @remarks Stored objects are not copied. Valid typed keys do not intentionally throw.
   */
  get<K extends keyof Shape>(key: K): Shape[K] | undefined;
  /**
   * Set or replace a shared-state entry, retaining the supplied value by reference.
   *
   * @param key - Key in the declared store shape; runtime keys are converted to strings.
   * @param value - Value to store, including undefined.
   * @returns Nothing; subsequent reads through this shared store observe the value.
   * @remarks This does not clone or validate values and does not intentionally throw for typed keys.
   */
  set<K extends keyof Shape>(key: K, value: Shape[K]): void;
  /**
   * Check membership independently of the stored value.
   *
   * @param key - Key in the declared store shape.
   * @returns True if the key exists, including entries explicitly set to undefined.
   * @remarks This does not change state or intentionally throw for typed keys.
   */
  has<K extends keyof Shape>(key: K): boolean;
  /**
   * Remove one entry from the shared store.
   *
   * @param key - Key whose value should be removed.
   * @returns True if an entry existed and was removed; false otherwise.
   * @remarks Other entries are unchanged. Valid typed keys do not intentionally throw.
   */
  delete<K extends keyof Shape>(key: K): boolean;
  /**
   * Remove every entry from this store.
   *
   * @returns Nothing; all views sharing this store subsequently see it empty.
   * @remarks This does not clear other context stores or snapshots and does not intentionally throw.
   */
  clear(): void;
  /**
   * Copy the store's entries for inspection without exposing its backing Map.
   *
   * @returns A new Map containing the current keys and values; payload objects retain identity.
   * @remarks Mutating the returned container does not change this store. No errors are intentionally thrown.
   */
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
  /**
   * Read the step snapshot scoped to the active invocation.
   *
   * @returns A fresh snapshot container sharing its identity's state store; live input, output and error are available regardless of capture policy.
   * @throws Error when this view is used outside the corresponding step execution scope.
   */
  current(): StepSnapshot;
  /**
   * Look up the shared run's snapshot for one step identity.
   *
   * @param stepId - Stable ID of the step whose snapshot is requested.
   * @returns A defensive snapshot container, or undefined if the identity is unknown.
   * State and payload objects remain shared references; retained execution fields follow the capture policy.
   * @remarks This does not require an active invocation and does not intentionally throw.
   */
  get(stepId: string): StepSnapshot | undefined;
  /**
   * Read the most recently completed invocation in the shared run.
   *
   * @returns A defensive snapshot container, or undefined before any execution completes.
   * Captured fields follow the run's policy; state and payload objects remain shared.
   * @remarks Completion order, including nested or concurrent runs, determines this value.
   * Reading it does not change history or intentionally throw.
   */
  previous(): StepSnapshot | undefined;
  /**
   * Inspect every known step identity in the shared run.
   *
   * @returns A new array of defensive snapshot containers, retaining shared state and payload references.
   * @remarks The array is a view of known identities, not a history of every invocation.
   * This method does not intentionally throw.
   */
  all(): readonly StepSnapshot[];
}

/** Invocation-local access and per-identity plugin state. */
export interface PluginContextApi {
  /**
   * Read the plugin snapshot scoped to the active invocation.
   *
   * @returns A fresh snapshot container sharing its identity's state store, with its ID and optional routing target.
   * @throws Error when this view is used outside the corresponding plugin execution scope.
   */
  current(): PluginSnapshot;
  /**
   * Look up the shared run's snapshot for one plugin identity.
   *
   * @param pluginId - Stable ID of the plugin whose snapshot is requested.
   * @returns A defensive snapshot container, or undefined if the identity is unknown.
   * State and payload objects remain shared references.
   * @remarks This does not require an active invocation and does not intentionally throw.
   */
  get(pluginId: string): PluginSnapshot | undefined;
  /**
   * Inspect every known plugin identity in the shared run.
   *
   * @returns A new array of defensive snapshot containers, retaining shared state and payload references.
   * @remarks The array is a view of known identities, not a history of every invocation.
   * This method does not intentionally throw.
   */
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
  /**
   * Access the context view associated with this invocation.
   *
   * @returns The invocation-scoped RunContext, sharing state and completed snapshots with its parent.
   * @remarks This accessor does not intentionally throw. The context's current() methods
   * require their corresponding active step or plugin scope; retaining a view does not keep that scope active.
   */
  context(): RunContext<Shared>;
}

/** `this` context available inside plugin hooks. */
export interface PluginThis<Shared extends ContextValues = ContextValues> {
  /**
   * Access the context view associated with this invocation.
   *
   * @returns The invocation-scoped RunContext, sharing state and completed snapshots with its parent.
   * @remarks This accessor does not intentionally throw. The context's current() methods
   * require their corresponding active step or plugin scope; retaining a view does not keep that scope active.
   */
  context(): RunContext<Shared>;
}
