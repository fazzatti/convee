import {
  pipe,
  plugin,
  type PluginThis,
  type RunContextOptions,
  step,
} from "../../src/index.ts";

export type Body = (this: PluginThis, ...args: unknown[]) => unknown;
export type Hooks = Partial<
  Record<"input" | "output" | "error" | "finally", Body>
>;
export interface TestPlugin extends Hooks {
  readonly id: string;
  readonly target?: string;
  supports(capability: string): boolean;
  targets(id: string): boolean;
}
export interface Unit {
  (...args: unknown[]): unknown;
  readonly id: string;
  readonly isSync: boolean;
  readonly plugins: readonly TestPlugin[];
  readonly steps?: readonly Unit[];
  use(plugin: TestPlugin): Unit;
  remove(id: string): Unit;
  run(...args: unknown[]): unknown;
  runWith(
    options: { plugins?: TestPlugin[]; context?: RunContextOptions },
    ...args: unknown[]
  ): unknown;
}
export const modes = ["step", "sync-step", "pipe", "sync-pipe"] as const;
export type Mode = typeof modes[number];

export function makePlugin(
  hooks: Hooks,
  id = "plugin",
  target?: string,
): TestPlugin {
  return Reflect.apply(plugin.for<unknown[], unknown>(), undefined, [hooks, {
    id,
    target,
  }]);
}

export function makeUnit(
  mode: Mode,
  body: Body,
  plugins: TestPlugin[] = [],
): Unit {
  const factory = mode.startsWith("sync") ? step.sync : step;
  const inner = Reflect.apply(factory, undefined, [body, {
    id: mode.includes("pipe") ? "body" : "unit",
    plugins: mode.includes("pipe") ? [] : plugins,
  }]);
  return mode.includes("pipe")
    ? Reflect.apply(mode.startsWith("sync") ? pipe.sync : pipe, undefined, [[
      inner,
    ], { id: "unit", plugins }])
    : inner;
}

export function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}
