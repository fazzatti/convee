import { pipe, plugin, step } from "../../src/index.ts";

export function invalidSyncContracts(): void {
  // @ts-expect-error no-argument output hooks must still reject async results
  plugin.sync().onOutput(async () => await 1);
  // @ts-expect-error no-argument input hooks must still reject async results
  plugin.sync().onInput(async () => await []);
  // @ts-expect-error no-argument recovery hooks must still reject async results
  plugin.sync().onError(async () => await 1);
  // @ts-expect-error asynchronous callbacks are not synchronous steps
  step.sync(async () => await 1);
  // @ts-expect-error a possible Promise is enough to make a callback asynchronous
  step.sync(() => Math.random() > 0.5 ? 1 : Promise.resolve(1));
  const named = plugin.sync({ id: "named", target: "child" }).onOutput((
    value: number,
  ) => value);
  const id: "named" = named.id;
  const target: "child" = named.target;
  void id;
  void target;
  const child = step.sync((value: number) => value, { id: "child" });
  pipe.sync([child]).use(named);
  const dynamic = pipe.sync([(value: number) => value]);
  dynamic.use(
    plugin.sync({ target: dynamic.steps[0].id }).onOutput((value: number) =>
      value
    ),
  );
}

export function inferredAsyncOutput(): void {
  const hook = plugin().onOutput(async () => await 1);
  const unit = step(() => 1).use(hook);
  const output: Promise<number> = unit();
  void output;
}
