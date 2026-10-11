import { pipe, plugin, type PluginThis, step } from "../../src/index.ts";

type IsExact<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
function assertType<Value extends true>(_value: Value): void {}

export function typeContracts(): void {
  const array = step((values: number[]) => values.length);
  assertType<IsExact<Parameters<typeof array>, [values: number[]]>>(true);
  assertType<IsExact<ReturnType<typeof array>, Promise<number>>>(true);
  array([1, 2]);
  // @ts-expect-error one array is not two scalar arguments
  array(1, 2);
  // @ts-expect-error array transport requires an outer argument tuple
  pipe([() => [1, 2], array]);
  pipe([() => [[1, 2]] as [number[]], array]);
  const optional = step((value?: number) => value);
  optional();
  optional(undefined);
  optional(1);
  const rest = step((...values: number[]) => values.length);
  rest();
  rest(1, 2, 3);
  const voidArg = step((_value: undefined) => 1);
  voidArg(undefined);
  // @ts-expect-error undefined-valued argument is not a nullary callback
  voidArg();
  const union = step((value: number[] | string) => value.length);
  union([1]);
  union("x");
  const thenable = {
    then(resolve: (value: number) => void) {
      resolve(1);
    },
  };
  // @ts-expect-error async raw functions are not sync steps
  pipe.sync([async (value: number) => await value + 1]);
  // @ts-expect-error async middle graph member cannot slip through normalization
  pipe.sync([
    (value: number) => value,
    async (value: number) => await value,
    (value: number) => value,
  ]);
  // @ts-expect-error async step wrappers are not sync graph members
  pipe.sync([step((value: number) => value)]);
  // @ts-expect-error promises are not synchronous outputs
  step.sync(() => Promise.resolve(1));
  const promiseLike: PromiseLike<number> = Promise.resolve(1);
  // @ts-expect-error PromiseLike is not a synchronous output
  step.sync(() => promiseLike);
  // @ts-expect-error conditional async returns are not synchronous
  step.sync((flag: boolean) => flag ? 1 : Promise.resolve(1));
  // @ts-expect-error sync input hooks cannot be async
  plugin.sync().onInput(async (value: number) => await value);
  // @ts-expect-error sync output hooks cannot be async
  plugin.sync().onOutput(async (value: number) => await value);
  // @ts-expect-error sync error hooks cannot be async
  plugin.sync().onError(async (_error: Error) => await 1);
  const hooked = plugin.sync().onError((_error: Error, input: [number]) =>
    input[0]
  ).onOutput((value: number) => value * 2).onInput((value: number) =>
    value + 1
  );
  assertType<IsExact<ReturnType<typeof hooked.output>, number>>(true);
  step.sync((value: number) => value, { plugins: [hooked] });
  // @ts-expect-error the input contract cannot change when adding an input hook
  plugin().onError((_error: Error, input: [number]) => input[0]).onInput((
    value: string,
  ) => value);
  // @ts-expect-error the output contract cannot change after error recovery inference
  plugin().onError((_error: Error) => 1).onOutput((value: string) => value);
  // @ts-expect-error duplicate hooks are unavailable
  hooked.onInput((value: number) => value);
  plugin.hasInput(hooked);
  plugin.sync.hasOutput(hooked);
  plugin.withContext<{ name: string }>().hasError(hooked);
  const contextual = plugin.withContext<{ name: string }>()().onOutput(
    function (this: PluginThis<{ name: string }>, value: number) {
      this.context().state.set("name", "known");
      // @ts-expect-error context values retain their declared types
      this.context().state.set("name", 2);
      return value;
    },
  );
  void contextual;
  void thenable;
  const sync = pipe.sync([
    (value: number) => value + 1,
    (value: number) => `${value}`,
  ]);
  assertType<IsExact<ReturnType<typeof sync>, string>>(true);
  // @ts-expect-error incompatible graph link
  pipe([(value: number) => value, (value: string) => value]);
  // @ts-expect-error empty pipelines have no input/output contract
  pipe([]);
}
