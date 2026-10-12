import {
  type ConcurrencyErrorMeta,
  concurrent,
  type ConcurrentJob,
  type ConcurrentOutcome,
  pipe,
  plugin,
  type Step,
  step,
} from "@convee";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

export function concurrentContracts(): void {
  // @ts-expect-error Plain objects are not valid scheduled descriptors.
  const forged: ConcurrentJob = {};
  concurrent({
    tasks: {},
    // @ts-expect-error Split cannot schedule arbitrary objects.
    split: () => [{}],
    join: () => 0,
  });
  const unit = concurrent({
    capacityScope: "invocation",
    tasks: {
      count: { run: (text: string) => text.length, concurrency: 3 },
      label: step((text: string, prefix: string) => prefix + text),
      pipeline: pipe([
        (value: number) => value + 1,
        (value: number) => value.toString(),
      ]),
    },
    split: (tasks, text: string, prefix: string = "title:") => {
      const signal = tasks.count.signal;
      const abort: AbortSignal = signal;
      void abort;
      // @ts-expect-error Builders are direct; there is no extra tasks wrapper.
      tasks.tasks.count.job(text);
      // @ts-expect-error Invocation signals cannot be replaced by a consumer.
      tasks.count.signal = new AbortController().signal;
      // @ts-expect-error Task names are checked and available to IntelliSense.
      tasks.missing.job(text);
      // @ts-expect-error Job arguments follow the exact underlying callable.
      tasks.count.job(12);
      // @ts-expect-error Required callable arguments cannot be omitted.
      tasks.label.job(text);
      // @ts-expect-error No extra callable arguments are accepted.
      tasks.count.job(text, prefix);
      return [tasks.count.job(text), [
        tasks.label.job(text, prefix),
        tasks.pipeline.job(1),
      ]] as const;
    },
    join: ([count, [label, nested]]) => {
      type Count = Expect<Equal<typeof count, number>>;
      type Label = Expect<Equal<typeof label, string>>;
      type Nested = Expect<Equal<typeof nested, string>>;
      const checked: [Count, Label, Nested] = [true, true, true];
      void checked;
      // @ts-expect-error The first output remains a number.
      count.toUpperCase();
      // @ts-expect-error The second output remains a string.
      label.toFixed();
      return { count, label, nested };
    },
  });
  type Result = Expect<
    Equal<
      Awaited<ReturnType<typeof unit>>,
      { count: number; label: string; nested: string }
    >
  >;
  const exact: Result = true;
  const output: Promise<{ count: number; label: string; nested: string }> =
    unit("abc");
  const compatible: Step<
    [string, string?],
    { count: number; label: string; nested: string }
  > = unit;
  const joined = pipe([
    unit,
    (value: { count: number; label: string; nested: string }) => value.count,
  ]);
  const final: Promise<number> = joined("abc", "prefix:");
  unit.runWith({ signal: new AbortController().signal, timeoutMs: 10 }, "abc");
  // @ts-expect-error An invocation still requires the original input.
  unit();
  // @ts-expect-error Wrong invocation input is rejected.
  unit(3);
  // @ts-expect-error Cancellation requires an AbortSignal.
  unit.runWith({ signal: "abort" }, "abc");
  // @ts-expect-error A native outer plugin cannot change the output contract.
  unit.use(plugin().onOutput((n: number) => n + 1));
  const collected = concurrent({
    tasks: { count: (s: string) => s.length },
    mode: "collect",
    split: (tasks, text: string) => [tasks.count.job(text)] as const,
    join: ([result]): ConcurrentOutcome<number> => {
      if (result.status === "fulfilled") {
        result.value.toFixed();
        // @ts-expect-error Fulfilled outcomes do not contain an error.
        result.error;
      } else {
        const error: Error = result.error;
        void error;
        // @ts-expect-error Failed outcomes do not contain a value.
        result.value;
      }
      return result;
    },
  });
  const outcomes: Promise<ConcurrentOutcome<number>> = collected("abc");
  const mapped = concurrent({
    tasks: { length: (text: string) => Promise.resolve(text.length) },
    split: (tasks, texts: string[]) =>
      texts.map((text) => tasks.length.job(text)),
    join: (numbers) => numbers.map((n) => n.toFixed()),
  });
  const strings: Promise<string[]> = mapped(["abc"]);
  concurrent({
    tasks: {},
    // @ts-expect-error Capacity ownership accepts only explicit supported scopes.
    capacityScope: "global",
    split: () => [],
    join: () => 0,
  });
  const named = concurrent({
    capacityScope: "shared",
    tasks: { signal: (signal: AbortSignal) => signal, tasks: () => "ok" },
    split: ({ signal, tasks }) =>
      [signal.job(signal.signal), tasks.job()] as const,
    join: ([signal, text]) => {
      const exact: [AbortSignal, string] = [signal, text];
      return exact;
    },
  });
  const meta: ConcurrencyErrorMeta = { failures: [new Error("task")] };
  const failures: readonly Error[] | undefined = meta.failures;
  // @ts-expect-error Failure diagnostics cannot be changed through the public type.
  meta.failures?.push(new Error("extra"));
  concurrent({
    tasks: {},
    split: () => [] as const,
    join: (empty) => {
      const exact: readonly [] = empty;
      return exact;
    },
  });
  concurrent({
    tasks: {
      optional: (prefix: string, count: number = 1, ...values: number[]) =>
        [prefix, count, values] as const,
    },
    split: (tasks) =>
      [tasks.optional.job("a"), tasks.optional.job("b", 2, 3, 4)] as const,
    join: ([first, second]) => {
      const n: number = first[1];
      const s: string = second[0];
      return [n, s] as const;
    },
  });
  void [
    forged,
    exact,
    output,
    compatible,
    final,
    outcomes,
    strings,
    named,
    failures,
  ];
}
