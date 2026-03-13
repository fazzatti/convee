export type ContextValues = Record<string, unknown>;
export type RunContextCapture = "none" | "outputs" | "all";

export interface ContextStore<Shape extends ContextValues = ContextValues> {
  get<K extends keyof Shape>(key: K): Shape[K] | undefined;
  set<K extends keyof Shape>(key: K, value: Shape[K]): void;
  has<K extends keyof Shape>(key: K): boolean;
  delete<K extends keyof Shape>(key: K): boolean;
  clear(): void;
  entries(): ReadonlyMap<string, unknown>;
}

export interface StepSnapshot {
  readonly id: string;
  readonly state: ContextStore;
  readonly input?: readonly unknown[];
  readonly output?: unknown;
  readonly error?: Error;
}

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

export interface RunContext<Shared extends ContextValues = ContextValues> {
  readonly runId: string;
  readonly rootRunId: string;
  readonly capture: RunContextCapture;
  readonly state: ContextStore<Shared>;
  readonly step: StepContextApi;
  readonly plugin: PluginContextApi;
}

export interface RunContextOptions<
  Shared extends ContextValues = ContextValues,
> {
  parent?: RunContext<Shared>;
  seed?: Partial<Shared>;
  capture?: RunContextCapture;
}

export interface StepThis<Shared extends ContextValues = ContextValues> {
  context(): RunContext<Shared>;
}

export interface PluginThis<Shared extends ContextValues = ContextValues> {
  context(): RunContext<Shared>;
}
