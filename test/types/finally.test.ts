import { hasFinally, pipe, plugin, type PluginThis, step } from "@convee";

export function finalizationContracts(): void {
  const cleanup = plugin({ id: "cleanup", target: "child" }).onFinally(
    () => {},
  );
  const id: "cleanup" = cleanup.id;
  const target: "child" = cleanup.target;
  void id;
  void target;
  const send = pipe([step((input: number) => `${input}`, { id: "child" })]);
  const result: Promise<string> = send.use(cleanup)(1);
  void result;
  step((input: string) => input.length).use(plugin().onFinally(() => {}));
  // @ts-expect-error a finalizer cannot be registered twice
  cleanup.onFinally(() => {});
  const namedCleanup = (): void => {};
  step.sync(() => 1).use(plugin.sync().onFinally(namedCleanup));
  step.sync(() => 1).use(
    plugin.sync.for<[], number>()({ finally: namedCleanup }),
  );
  pipe.sync([() => 1]).use(plugin.sync().onFinally(() => {}));
  // @ts-expect-error async cleanup is not accepted by the sync builder
  plugin.sync().onFinally(async () => {});
  // @ts-expect-error sync steps cannot accept async cleanup
  step.sync(() => 1).use(plugin().onFinally(async () => {}));
  // @ts-expect-error sync typed definitions cannot accept async cleanup
  plugin.sync.for<[number], number>()({ finally: async () => {} });
  step((input: number) => input).use(
    // @ts-expect-error the finally branch must not bypass input compatibility
    plugin().onInput((input: string) => input).onFinally(() => {}),
  );
  const beforeInput = plugin().onFinally(() => {}).onInput((input: number) =>
    input
  );
  step((input: number) => input).use(beforeInput);
  const typed = plugin.for<[number], string>()({ finally() {} });
  step((input: number) => `${input}`).use(typed);
  const syncTyped = plugin.sync.for<[number], string>()({ finally() {} });
  step.sync((input: number) => `${input}`).use(syncTyped);
  plugin.withContext<{ count: number }>()().onFinally(function () {
    this.context().state.set("count", 1);
    // @ts-expect-error finalizer context retains its declared types
    this.context().state.set("count", "wrong");
  });
  plugin.sync.withContext<{ count: number }>()().onFinally(function (
    this: PluginThis<{ count: number }>,
  ) {
    this.context().state.set("count", 1);
  });
  const value: unknown = typed;
  if (hasFinally(value)) value.finally();
  plugin.hasFinally(value);
  plugin.sync.hasFinally(value);
}
